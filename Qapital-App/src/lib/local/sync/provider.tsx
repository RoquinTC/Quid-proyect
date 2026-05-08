/**
 * SyncProvider — Orchestrates local-first synchronization
 *
 * This component wraps the app and handles:
 *   1. Initial data population from server → IndexedDB
 *   2. Background periodic sync (server → IndexedDB)
 *   3. Offline/online detection
 *   4. Drain sync queue when coming back online
 *   5. Pending operations count
 *
 * Place this inside the SessionProvider so it has access to the user session.
 */

"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import {
  localDB,
  API_TABLE_MAP,
  TABLE_API_MAP,
  getAllFromTable,
  replaceAllInTable,
  isInitialSyncDone,
  setInitialSyncDone,
  getPendingSyncItems,
  removeSyncItem,
  incrementRetry,
  getPendingSyncCount,
  clearLocalData,
} from "../index";
import { apiFetch } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { isBrowserOnline, MAX_RETRY_COUNT, getRetryDelay, sleep } from "./utils";

// ============================================
// SYNC CONFIGURATION
// ============================================

/** How often to do a full background sync (ms) */
const BACKGROUND_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** How often to drain the sync queue (ms) */
const QUEUE_DRAIN_INTERVAL = 30 * 1000; // 30 seconds

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
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? "";
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
          if (!tableName) return;

          try {
            const data = await apiFetch<any[]>(endpoint);
            if (Array.isArray(data)) {
              await replaceAllInTable(tableName, userId, data);
            } else {
              // Single object (e.g. /api/settings)
              await localDB[tableName]?.put({ ...(data as Record<string, unknown>), userId });
            }
          } catch (err) {
            console.warn(`[Sync] Failed to sync ${endpoint}:`, err);
          }
        })
      );

      // Mark initial sync as done
      await setInitialSyncDone(userId);
      setInitialSyncComplete(true);

      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      console.log(`[Sync] Initial sync complete: ${succeeded}/${SYNC_ENDPOINTS.length} endpoints synced`);
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
            if (Array.isArray(data)) {
              await replaceAllInTable(tableName, userId, data);
            } else {
              await localDB[tableName]?.put({ ...(data as Record<string, unknown>), userId });
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
  // QUEUE DRAIN — Push pending operations to server
  // ============================================

  const drainSyncQueue = useCallback(async () => {
    if (!userId || !isBrowserOnline() || isDrainingRef.current) return;

    isDrainingRef.current = true;

    try {
      const pending = await getPendingSyncItems();

      for (const item of pending) {
        // Skip items that have exceeded max retries
        if (item.retryCount >= MAX_RETRY_COUNT) {
          console.warn(`[Sync] Dropping item ${item.id} after ${MAX_RETRY_COUNT} retries`);
          await removeSyncItem(item.id!);
          continue;
        }

        try {
          const fetchOptions: RequestInit = {
            method: item.method,
            headers: { "Content-Type": "application/json" },
          };

          if (item.body) {
            fetchOptions.body = item.body;
          }

          const response = await fetch(item.serverUrl, fetchOptions);

          if (response.ok) {
            // Success — remove from queue
            await removeSyncItem(item.id!);

            // If this was a create with a tempId, update IndexedDB with server response
            if (item.tempId && item.operation === "create") {
              try {
                const serverData = await response.json();
                const table = (localDB as any)[item.table];
                if (table && serverData?.id) {
                  await table.delete(item.tempId);
                  await table.put({ ...serverData, userId });
                }
              } catch {
                // If we can't parse the response, the record still exists with tempId
                // It'll get replaced on next background sync
              }
            }
          } else {
            // Server rejected — increment retry
            await incrementRetry(item.id!, `HTTP ${response.status}`);
          }
        } catch (err: any) {
          // Network error — increment retry
          await incrementRetry(item.id!, err.message);
        }
      }

      // Update pending count
      const count = await getPendingSyncCount();
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
      drainSyncQueue();
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
  }, [setOnline, drainSyncQueue]);

  // ============================================
  // LIFECYCLE — Start/stop sync based on session
  // ============================================

  useEffect(() => {
    // Only start sync when user is authenticated
    if (status !== "authenticated" || !userId) {
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

    // Initial sync
    performInitialSync();

    // Background sync interval
    backgroundSyncRef.current = setInterval(() => {
      performBackgroundSync();
    }, BACKGROUND_SYNC_INTERVAL);

    // Queue drain interval
    queueDrainRef.current = setInterval(() => {
      drainSyncQueue();
    }, QUEUE_DRAIN_INTERVAL);

    // Initial pending count
    getPendingSyncCount().then(setPendingCount);

    return () => {
      if (backgroundSyncRef.current) {
        clearInterval(backgroundSyncRef.current);
        backgroundSyncRef.current = null;
      }
      if (queueDrainRef.current) {
        clearInterval(queueDrainRef.current);
        queueDrainRef.current = null;
      }
    };
  }, [userId, status, performInitialSync, performBackgroundSync, drainSyncQueue, setPendingCount]);

  // Clear local data on logout
  useEffect(() => {
    if (status === "unauthenticated") {
      clearLocalData("");
      setInitialSyncComplete(false);
    }
  }, [status]);

  // ============================================
  // RENDER
  // ============================================

  return <>{children}</>;
}
