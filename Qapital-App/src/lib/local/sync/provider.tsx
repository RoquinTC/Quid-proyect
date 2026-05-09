/**
 * SyncProvider — Orchestrates local-first synchronization
 *
 * This component wraps the app and handles:
 *   1. Initial data population from server → IndexedDB (via syncNow)
 *   2. Background periodic sync (server ↔ IndexedDB via syncNow)
 *   3. Offline/online detection
 *   4. Drain mutation queue when coming back online
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
import { localDB, isLocalDBPopulated, getSyncMeta, clearLocalDB } from "../db";
import { syncNow } from "./engine";
import { useAppStore } from "@/lib/store";
import { isBrowserOnline } from "./utils";

// ============================================
// SYNC CONFIGURATION
// ============================================

/** How often to do a full background sync (ms) */
const BACKGROUND_SYNC_INTERVAL = 5 * 60 * 1000; // 5 minutes

/** How often to drain the sync queue (ms) */
const QUEUE_DRAIN_INTERVAL = 30 * 1000; // 30 seconds

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
  const isSyncingRef = useRef(false);

  // ============================================
  // INITIAL SYNC — First load populates IndexedDB via engine
  // ============================================

  const performInitialSync = useCallback(async () => {
    if (!userId || isSyncingRef.current) return;

    // Check if we already have data
    const populated = await isLocalDBPopulated();
    const initialSyncDone = await getSyncMeta("initialSyncCompleted");
    if (populated && initialSyncDone === "true") {
      setInitialSyncComplete(true);
      return;
    }

    isSyncingRef.current = true;
    setSyncStatus(true);

    console.log(`[Sync] Starting initial sync for user ${userId}...`);

    try {
      await syncNow();
      setInitialSyncComplete(true);
      console.log("[Sync] Initial sync complete");
    } catch (err) {
      console.error("[Sync] Initial sync failed:", err);
    } finally {
      isSyncingRef.current = false;
      setSyncStatus(false);
    }
  }, [userId, setSyncStatus]);

  // ============================================
  // BACKGROUND SYNC — Periodic server refresh via engine
  // ============================================

  const performBackgroundSync = useCallback(async () => {
    if (!userId || !isBrowserOnline() || isSyncingRef.current) return;

    isSyncingRef.current = true;
    setSyncStatus(true);

    try {
      await syncNow();
    } catch {
      // Silently fail — local data is still available
    } finally {
      isSyncingRef.current = false;
      setSyncStatus(false);
    }
  }, [userId, setSyncStatus]);

  // ============================================
  // QUEUE DRAIN — Push pending mutations to server via engine
  // ============================================

  const drainSyncQueue = useCallback(async () => {
    if (!userId || !isBrowserOnline() || isSyncingRef.current) return;

    isSyncingRef.current = true;

    try {
      await syncNow();

      // Update pending count
      const count = await localDB.mutationQueue
        .where("status")
        .equals("pending")
        .count();
      setPendingCount(count);
    } finally {
      isSyncingRef.current = false;
    }
  }, [userId, setPendingCount]);

  // ============================================
  // UPDATE PENDING COUNT
  // ============================================

  const updatePendingCount = useCallback(async () => {
    try {
      const count = await localDB.mutationQueue
        .where("status")
        .equals("pending")
        .count();
      setPendingCount(count);
    } catch {
      // DB not ready yet
    }
  }, [setPendingCount]);

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
    updatePendingCount();

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
  }, [userId, status, performInitialSync, performBackgroundSync, drainSyncQueue, updatePendingCount]);

  // Clear local data on logout
  useEffect(() => {
    if (status === "unauthenticated") {
      clearLocalDB();
      setInitialSyncComplete(false);
    }
  }, [status]);

  // ============================================
  // RENDER
  // ============================================

  return <>{children}</>;
}
