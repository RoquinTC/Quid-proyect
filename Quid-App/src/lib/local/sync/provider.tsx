/**
 * SyncProvider — Orchestrates local-first synchronization
 *
 * This component wraps the app and handles:
 *   1. Initial data population from server → IndexedDB
 *   2. Background periodic sync (server → IndexedDB)
 *   3. Offline/online detection
 *   4. Drain mutation queue when coming back online
 *   5. Pending operations count
 *
 * Place this inside the SessionProvider so it has access to the user session.
 *
 * [7B] Unified to use single Dexie DB (quid-db / db.ts).
 * Previously used the old quid_local DB (index.ts) with syncQueue.
 * Now uses mutationQueue from db.ts — same DB as hooks, engine, and api.ts.
 */

"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAppUserId } from "@/lib/use-app-session";
import {
  localDB,
  API_TABLE_MAP,
  TABLE_API_MAP,
  API_RESPONSE_EXTRACTOR,
  getAllFromTable,
  replaceAllInTable,
  isInitialSyncDone,
  setInitialSyncDone,
  getPendingMutationCount,
  clearLocalDB,
} from "../db";
import type { MutationQueueEntry } from "../db";
import { generateTempId } from "./utils";
import { apiFetch } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { isBrowserOnline, MAX_RETRY_COUNT, sleep, getNextRetryAt, isReadyForRetry, getRetryDelay } from "./utils";
import { reconcileCreatedRecord } from "./reconcile";

// ============================================
// SYNC CONFIGURATION
// ============================================

/** How often to do a full background sync (ms) */
const BACKGROUND_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** How often to drain the mutation queue (ms) */
const QUEUE_DRAIN_INTERVAL = 30 * 1000; // 30 seconds

/** Stale in-progress queue items are returned to pending after app restarts/crashes. */
const IN_PROGRESS_STALE_MS = 2 * 60 * 1000;

/** API endpoints to sync during initial load and background refresh */
const SYNC_ENDPOINTS = [
  "/api/accounts",
  "/api/transactions",
  "/api/budgets",
  "/api/debts",
  "/api/savings",
  "/api/cdts",
  "/api/recurring",
  "/api/payroll",
  "/api/vehicles",
  "/api/medications",
  "/api/appointments",
  "/api/health/authorizations",
  "/api/pantry",
  "/api/shopping-lists",
  "/api/health-profiles",
  "/api/fuel-prices",
  "/api/settings",
] as const;

// ============================================
// SYNC PROVIDER COMPONENT
// ============================================

interface SyncProviderProps {
  children: ReactNode;
}

export function SyncProvider({ children }: SyncProviderProps) {
  const userId = useAppUserId();
  const {
    setSyncStatus,
    setOnline,
    setPendingCount,
    isOnline,
    pendingCount,
  } = useAppStore();

  const [initialSyncComplete, setInitialSyncComplete] = useState(false);
  const backgroundSyncRef = useRef<NodeJS.Timeout | null>(null);
  const queueDrainRef = useRef<NodeJS.Timeout | null>(null);
  const isDrainingRef = useRef(false);
  const isSyncingRef = useRef(false);

  // ============================================
  // INITIAL SYNC — First load populates IndexedDB
  // ============================================

  const performInitialSync = useCallback(async () => {
    if (!userId || isSyncingRef.current) return;

    // Check if we already have data for this user
    const alreadySynced = await isInitialSyncDone(userId);
    if (alreadySynced) {
      setInitialSyncComplete(true);
      return;
    }

    isSyncingRef.current = true;
    setSyncStatus(true);

    console.log(`[Sync] Starting initial sync for user ${userId}...`);

    try {
      // Fetch all endpoints in parallel
      const results = await Promise.allSettled(
        SYNC_ENDPOINTS.map(async (endpoint) => {
          const tableName = API_TABLE_MAP[endpoint];
          if (!tableName) return false;

          try {
            const data = await apiFetch<any[]>(endpoint);
            // Some endpoints return wrapped objects (e.g. { transactions: [...] })
            // Use API_RESPONSE_EXTRACTOR to unwrap them into plain arrays
            const extractor = API_RESPONSE_EXTRACTOR[endpoint];
            const extracted = extractor ? extractor(data) : null;
            const records = extracted ?? data;

            if (Array.isArray(records)) {
              await replaceAllInTable(tableName, userId, records);
              return true;
            } else if (records && typeof records === "object" && !Array.isArray(records)) {
              // Single object (e.g. /api/settings) — must have an id for key path
              const obj = records as Record<string, unknown>;
              if (obj.id) {
                const table = (localDB as any)[tableName];
                if (table) {
                  await table.put({
                    ...obj,
                    userId,
                    _syncStatus: "synced",
                    _version: 1,
                    _lastModified: Date.now(),
                  });
                  return true;
                }
              } else {
                console.warn(`[Sync] Skipping ${endpoint}: response is not an array and has no 'id' field`);
              }
            }
            return false;
          } catch (err) {
            console.warn(`[Sync] Failed to sync ${endpoint}:`, err);
            return false;
          }
        })
      );

      const settledValues = results.map((result) =>
        result.status === "fulfilled" ? result.value : false
      );
      const succeeded = settledValues.filter(Boolean).length;
      const failed = SYNC_ENDPOINTS.length - succeeded;
      
      if (succeeded === SYNC_ENDPOINTS.length) {
        await setInitialSyncDone(userId);
        setInitialSyncComplete(true);
        console.log(`[Sync] Initial sync complete: ${succeeded}/${SYNC_ENDPOINTS.length} endpoints synced`);
      } else if (failed === SYNC_ENDPOINTS.length) {
        // All endpoints failed — likely offline, don't mark as synced
        console.warn("[Sync] Initial sync failed entirely — will retry on next load");
      } else {
        // Partial success: let the app continue, but do not mark this local
        // sync version as complete. The next launch will retry missing tables.
        setInitialSyncComplete(true);
        console.warn(`[Sync] Initial sync partial: ${succeeded}/${SYNC_ENDPOINTS.length} endpoints synced — will retry next launch`);
      }
    } catch (err) {
      console.error("[Sync] Initial sync failed:", err);
    } finally {
      isSyncingRef.current = false;
      setSyncStatus(false);
    }
  }, [userId, setSyncStatus]);

  // ============================================
  // BACKGROUND SYNC — Periodic server refresh
  // ============================================

  const performBackgroundSync = useCallback(async () => {
    if (!userId || !isBrowserOnline() || isSyncingRef.current) return;

    isSyncingRef.current = true;
    setSyncStatus(true);

    try {
      await Promise.allSettled(
        SYNC_ENDPOINTS.map(async (endpoint) => {
          const tableName = API_TABLE_MAP[endpoint];
          if (!tableName) return;

          try {
            const data = await apiFetch<any[]>(endpoint);
            // Some endpoints return wrapped objects (e.g. { transactions: [...] })
            const extractor = API_RESPONSE_EXTRACTOR[endpoint];
            const extracted = extractor ? extractor(data) : null;
            const records = extracted ?? data;

            if (Array.isArray(records)) {
              await replaceAllInTable(tableName, userId, records);
            } else if (records && typeof records === "object" && !Array.isArray(records)) {
              const obj = records as Record<string, unknown>;
              if (obj.id) {
                const table = (localDB as any)[tableName];
                if (table) {
                  await table.put({
                    ...obj,
                    userId,
                    _syncStatus: "synced",
                    _version: 1,
                    _lastModified: Date.now(),
                  });
                }
              }
            }
          } catch {
            // Silently fail — local data is still available
          }
        })
      );
    } finally {
      isSyncingRef.current = false;
      setSyncStatus(false);
    }
  }, [userId, setSyncStatus]);

  // ============================================
  // QUEUE DRAIN — Push pending mutations to server
  // ============================================
  // [7B] Now uses mutationQueue (from db.ts) instead of the old syncQueue.
  // The mutationQueue uses string IDs and has fields: operation, tableName,
  // recordId, payload, apiRoute, apiMethod, status, retryCount, etc.

  const drainMutationQueue = useCallback(async () => {
    if (!userId || !isBrowserOnline() || isDrainingRef.current) return;

    isDrainingRef.current = true;

    try {
      await localDB.mutationQueue
        .where("status")
        .equals("in_progress")
        .filter((mutation) => Date.now() - mutation.updatedAt > IN_PROGRESS_STALE_MS)
        .modify({
          status: "pending",
          updatedAt: Date.now(),
        });

      // Get all pending mutations sorted by sequence
      const pending = await localDB.mutationQueue
        .where("status")
        .equals("pending")
        .sortBy("sequence");

      for (const mutation of pending) {
        // Skip items that have exceeded max retries
        if (mutation.retryCount >= MAX_RETRY_COUNT) {
          console.warn(`[Sync] Dropping mutation ${mutation.id} after ${MAX_RETRY_COUNT} retries`);
          await localDB.mutationQueue.delete(mutation.id);
          continue;
        }

        // [11] Skip items that are in their backoff period
        if (!isReadyForRetry(mutation)) {
          continue;
        }

        try {
          // Mark as in progress
          await localDB.mutationQueue.update(mutation.id, {
            status: "in_progress",
            updatedAt: Date.now(),
          });

          if (mutation.operation === "complex") {
            // Complex: replay the full API call as specified
            const response = await fetch(mutation.apiRoute!, {
              method: mutation.apiMethod || "POST",
              headers: { "Content-Type": "application/json" },
              body: mutation.payload,
            });

            // Handle 429 (rate limited) — apply extra backoff
            if (response.status === 429) {
              const retryAfter = response.headers.get("Retry-After");
              const extraDelay = retryAfter ? parseInt(retryAfter) * 1000 : getRetryDelay(mutation.retryCount + 1);
              await localDB.mutationQueue.update(mutation.id, {
                status: "pending",
                retryCount: mutation.retryCount + 1,
                nextRetryAt: Date.now() + extraDelay,
                error: "Rate limited (429)",
                updatedAt: Date.now(),
              });
              console.warn(`[Sync] Rate limited on mutation ${mutation.id}, retry after ${extraDelay}ms`);
              // Stop draining — server is busy
              break;
            }

            if (!response.ok) {
              throw new Error(`Server returned ${response.status}`);
            }

            // Mark as completed
            await localDB.mutationQueue.update(mutation.id, {
              status: "completed",
              updatedAt: Date.now(),
            });
          } else {
            // Simple CRUD operation
            const payload = JSON.parse(mutation.payload);
            const method =
              mutation.operation === "create" ? "POST" :
              mutation.operation === "update" ? "PUT" :
              "DELETE";

            // Determine the URL: use apiRoute if available, otherwise construct
            const route = mutation.apiRoute || `/api/${mutation.tableName}${mutation.operation !== "create" ? `/${mutation.recordId}` : ""}`;

            const fetchOptions: RequestInit = {
              method,
              headers: { "Content-Type": "application/json" },
            };

            if (method !== "DELETE") {
              fetchOptions.body = JSON.stringify(payload);
            }

            const response = await fetch(route, fetchOptions);

            // Handle 429 (rate limited)
            if (response.status === 429) {
              const retryAfter = response.headers.get("Retry-After");
              const extraDelay = retryAfter ? parseInt(retryAfter) * 1000 : getRetryDelay(mutation.retryCount + 1);
              await localDB.mutationQueue.update(mutation.id, {
                status: "pending",
                retryCount: mutation.retryCount + 1,
                nextRetryAt: Date.now() + extraDelay,
                error: "Rate limited (429)",
                updatedAt: Date.now(),
              });
              console.warn(`[Sync] Rate limited on mutation ${mutation.id}, retry after ${extraDelay}ms`);
              break;
            }

            if (method === "DELETE" && (response.status === 404 || response.status === 410)) {
              const table = (localDB as any)[mutation.tableName];
              if (table) await table.delete(mutation.recordId);
              await localDB.mutationQueue.update(mutation.id, {
                status: "completed",
                error: undefined,
                updatedAt: Date.now(),
              });
              continue;
            }

            if (!response.ok) {
              throw new Error(`Server returned ${response.status}`);
            }

            // Update local record with server response
            if (method !== "DELETE") {
              try {
                const serverData = await response.json();
                const table = (localDB as any)[mutation.tableName];
                if (table && serverData?.id) {
                  if (mutation.operation === "create") {
                    await reconcileCreatedRecord(mutation.tableName, mutation.recordId, serverData);
                  } else {
                    await table.put({
                      ...serverData,
                      _syncStatus: "synced",
                      _version: 1,
                      _lastModified: Date.now(),
                    });
                  }
                }
              } catch {
                // Can't parse response — record still exists with pending status
              }
            } else {
              // For deletes, remove from local DB
              const table = (localDB as any)[mutation.tableName];
              if (table) await table.delete(mutation.recordId);
            }

            // Mark as completed
            await localDB.mutationQueue.update(mutation.id, {
              status: "completed",
              updatedAt: Date.now(),
            });
          }
        } catch (err: any) {
          // [11] Failed — apply exponential backoff + jitter before next retry
          const nextRetry = getNextRetryAt(mutation.retryCount + 1);
          await localDB.mutationQueue.update(mutation.id, {
            status: "pending",
            retryCount: mutation.retryCount + 1,
            nextRetryAt: nextRetry,
            error: err.message,
            updatedAt: Date.now(),
          });

          console.warn(`[Sync] Mutation ${mutation.id} failed (retry ${mutation.retryCount + 1}/${MAX_RETRY_COUNT}), next retry at ${new Date(nextRetry).toISOString()}`);

          // Stop processing group on failure (preserve ordering)
          if (mutation.groupId) break;
        }
      }

      // Clean up old completed mutations (keep last 100)
      const completed = await localDB.mutationQueue
        .where("status")
        .equals("completed")
        .reverse()
        .sortBy("createdAt");

      if (completed.length > 100) {
        const toDelete = completed.slice(100).map((m) => m.id);
        await localDB.mutationQueue.bulkDelete(toDelete);
      }

      // Update pending count
      const count = await getPendingMutationCount();
      setPendingCount(count);
    } finally {
      isDrainingRef.current = false;
    }
  }, [userId, setPendingCount]);

  // ============================================
  // ONLINE/OFFLINE DETECTION
  // ============================================

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      // When coming back online, drain the queue
      drainMutationQueue();
    };

    const handleOffline = () => {
      setOnline(false);
    };

    // Initial state
    setOnline(isBrowserOnline());

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [setOnline, drainMutationQueue]);

  // ============================================
  // LIFECYCLE — Start/stop sync based on session
  // ============================================

  useEffect(() => {
    // Only start sync when user is authenticated (has a userId)
    if (!userId) {
      // Clear intervals if user logs out
      if (backgroundSyncRef.current) {
        clearInterval(backgroundSyncRef.current);
        backgroundSyncRef.current = null;
      }
      if (queueDrainRef.current) {
        clearInterval(queueDrainRef.current);
        queueDrainRef.current = null;
      }
      return;
    }

    let cancelled = false;

    // Initial sync
    performInitialSync();

    // Background sync interval
    backgroundSyncRef.current = setInterval(() => {
      performBackgroundSync();
    }, BACKGROUND_SYNC_INTERVAL);

    // Queue drain interval
    queueDrainRef.current = setInterval(() => {
      drainMutationQueue();
    }, QUEUE_DRAIN_INTERVAL);

    // Initial pending count
    getPendingMutationCount().then((count) => {
      if (!cancelled) setPendingCount(count);
    });

    return () => {
      cancelled = true;
      isSyncingRef.current = false;
      if (backgroundSyncRef.current) {
        clearInterval(backgroundSyncRef.current);
        backgroundSyncRef.current = null;
      }
      if (queueDrainRef.current) {
        clearInterval(queueDrainRef.current);
        queueDrainRef.current = null;
      }
    };
  }, [userId, performInitialSync, performBackgroundSync, drainMutationQueue, setPendingCount]);

  // Clear local data when user logs out (no userId means logged out)
  const lastHadUserId = useRef(!!userId);
  useEffect(() => {
    if (!userId && lastHadUserId.current) {
      clearLocalDB();
      setInitialSyncComplete(false);
    }
    lastHadUserId.current = !!userId;
  }, [userId]);

  // ============================================
  // RENDER
  // ============================================

  return <>{children}</>;
}
