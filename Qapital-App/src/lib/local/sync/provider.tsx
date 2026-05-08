'use client';

import { useEffect, useState, useCallback, createContext, useContext, type ReactNode } from 'react';
import { localDB, getSyncMeta, setSyncMeta, isLocalDBPopulated } from '../db';
import { performInitialSync, performPull, performPush, syncNow } from './engine';

// ─── Sync Status Types ───

export type SyncPhase = 'idle' | 'initializing' | 'pulling' | 'pushing' | 'error' | 'ready';

export interface SyncState {
  phase: SyncPhase;
  isOnline: boolean;
  lastSyncAt: number | null;
  pendingCount: number;
  error: string | null;
}

// ─── Context ───

const SyncContext = createContext<SyncState & {
  triggerSync: () => Promise<void>;
  retryFailed: () => Promise<void>;
}>({
  phase: 'idle',
  isOnline: true,
  lastSyncAt: null,
  pendingCount: 0,
  error: null,
  triggerSync: async () => {},
  retryFailed: async () => {},
});

export const useSync = () => useContext(SyncContext);

// ─── Provider ───

export function SyncProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Monitor online status
  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Count pending mutations periodically
  useEffect(() => {
    const countPending = async () => {
      try {
        const count = await localDB.mutationQueue
          .where('status')
          .equals('pending')
          .count();
        setPendingCount(count);
      } catch {
        // DB not initialized yet
      }
    };
    countPending();
    const interval = setInterval(countPending, 5000);
    return () => clearInterval(interval);
  }, []);

  // Load last sync timestamp
  useEffect(() => {
    getSyncMeta('lastPullTimestamp').then((ts) => {
      if (ts) setLastSyncAt(parseInt(ts));
    });
  }, []);

  const triggerSync = useCallback(async () => {
    if (phase === 'initializing' || phase === 'pulling' || phase === 'pushing') return;

    try {
      setError(null);

      // Check if initial sync needed
      const populated = await isLocalDBPopulated();
      if (!populated) {
        setPhase('initializing');
        await performInitialSync();
        setPhase('ready');
        setLastSyncAt(Date.now());
        return;
      }

      // Incremental sync
      setPhase('pulling');
      await performPull();

      setPhase('pushing');
      await performPush();

      setPhase('ready');
      setLastSyncAt(Date.now());
      await setSyncMeta('lastPullTimestamp', String(Date.now()));
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : 'Error de sincronización');
      console.error('[SyncProvider] Sync failed:', err);
    }
  }, [phase]);

  const retryFailed = useCallback(async () => {
    // Reset failed mutations to pending
    await localDB.mutationQueue
      .where('status')
      .equals('failed')
      .modify({ status: 'pending', retryCount: 0, error: null });

    await triggerSync();
  }, [triggerSync]);

  // Initial sync on mount
  useEffect(() => {
    if (navigator.onLine) {
      triggerSync();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-sync on back online
  useEffect(() => {
    const handleOnline = () => {
      console.log('[SyncProvider] Back online — triggering sync');
      triggerSync();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [triggerSync]);

  // Periodic sync while online (every 30s)
  useEffect(() => {
    if (!isOnline) return;
    const interval = setInterval(() => {
      triggerSync();
    }, 30_000);
    return () => clearInterval(interval);
  }, [isOnline, triggerSync]);

  return (
    <SyncContext.Provider
      value={{
        phase,
        isOnline,
        lastSyncAt,
        pendingCount,
        error,
        triggerSync,
        retryFailed,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}
