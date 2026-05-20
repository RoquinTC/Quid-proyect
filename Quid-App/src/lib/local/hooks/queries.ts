/**
 * Local-First Query Hooks
 *
 * React hooks for reading data with IndexedDB as the primary source.
 *
 * Flow:
 *   1. Read from IndexedDB immediately (instant, offline-capable)
 *   2. If data exists → show it, then background-fetch from server
 *   3. If no data → fetch from server (first load / new device)
 *   4. Server response updates IndexedDB for next time
 *
 * These hooks are designed as drop-in replacements for the
 * `useState + useEffect + apiFetch` pattern used throughout the app.
 */

"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  localDB,
  API_TABLE_MAP,
  getAllFromTable,
  replaceAllInTable,
  isInitialSyncDone,
} from "../db";
import { apiFetch } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useAppUserId } from "@/lib/use-app-session";

// ============================================
// useLocalQuery — Read a collection from local-first
// ============================================

interface UseLocalQueryResult<T> {
  data: T[];
  loading: boolean;
  syncing: boolean; // True when background server fetch is in progress
  error: string | null;
  refetch: () => Promise<void>; // Force server refresh
}

/**
 * Hook to read a collection of data with local-first strategy.
 *
 * @param apiPath - The API endpoint, e.g. "/api/accounts"
 * @param options.staleTime - How long before background refresh (ms). Default: 60_000 (1 min)
 *
 * @example
 * ```tsx
 * // Before:
 * const [accounts, setAccounts] = useState<Account[]>([]);
 * const [loading, setLoading] = useState(true);
 * useEffect(() => { apiFetch("/api/accounts").then(setAccounts).finally(() => setLoading(false)); }, []);
 *
 * // After:
 * const { data: accounts, loading, syncing } = useLocalQuery<Account>("/api/accounts");
 * ```
 */
export function useLocalQuery<T extends { id: string }>(
  apiPath: string,
  options?: { staleTime?: number }
): UseLocalQueryResult<T> {
  const userId = useAppUserId();
  const tableName = API_TABLE_MAP[apiPath];
  const staleTime = options?.staleTime ?? 60_000;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const dataLengthRef = useRef(0);

  // Keep dataLengthRef in sync so fetchFromServer can read the latest value
  // without needing it in its dependency array (which caused stale closures)
  useEffect(() => {
    dataLengthRef.current = data.length;
  }, [data.length]);

  const { setSyncStatus } = useAppStore();

  // Load from IndexedDB (instant)
  const loadFromLocal = useCallback(async () => {
    if (!userId || !tableName) return;
    try {
      const localData = await getAllFromTable<T>(tableName, userId);
      if (mountedRef.current) {
        setData(localData);
        setLoading(false); // We have local data, no need to show loading
      }
    } catch (err) {
      console.warn(`[LocalDB] Error reading ${tableName}:`, err);
    }
  }, [userId, tableName]);

  // Fetch from server and update IndexedDB
  // NOTE: data.length is NOT in the dependency array — we use dataLengthRef instead
  // to avoid stale-closure issues when refetch is called from form callbacks.
  const fetchFromServer = useCallback(async (force = false) => {
    if (!userId || !apiPath) return;

    const now = Date.now();
    if (!force && now - lastFetchRef.current < staleTime) return;
    lastFetchRef.current = now;

    setSyncing(true);
    setSyncStatus(true);

    try {
      const serverData = await apiFetch<T[]>(apiPath);

      // Persist to IndexedDB FIRST, then update React state.
      // This order prevents a race condition where the liveQuery
      // reads stale (empty) IndexedDB data between setData() and
      // replaceAllInTable(), which would overwrite server data with []
      if (tableName) {
        await replaceAllInTable(tableName, userId, serverData);
      }

      if (mountedRef.current) {
        setData(serverData);
        setError(null);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        // If we already have local data, just mark sync error (don't overwrite)
        // If no local data, show the error
        if (dataLengthRef.current === 0) {
          setError(err.message || "Error de conexión");
        }
        // Don't clear existing data on fetch failure — keep showing stale local data
      }
    } finally {
      if (mountedRef.current) {
        setSyncing(false);
        setLoading(false);
        setSyncStatus(false);
      }
    }
  }, [userId, apiPath, tableName, staleTime, setSyncStatus]);

  // Initial load: IndexedDB first, then server
  useEffect(() => {
    mountedRef.current = true;

    if (!userId) {
      setLoading(false);
      return;
    }

    const initialLoad = async () => {
      // 1. Try IndexedDB first (instant)
      await loadFromLocal();

      // 2. Check if we've done initial sync for this user
      const hasSynced = await isInitialSyncDone(userId);

      // 3. Always fetch from server (background)
      //    But if we already have local data, it's non-blocking
      await fetchFromServer(!hasSynced); // Force if never synced
    };

    initialLoad();

    return () => {
      mountedRef.current = false;
    };
  }, [userId]); // Only re-run when user changes

  // Listen for Dexie live queries (reactive updates from mutations)
  // StrictMode-safe: uses a cancelled flag so async setup can bail out
  // if the effect was cleaned up before the subscription completes.
  useEffect(() => {
    if (!userId || !tableName) return;

    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    const setupLiveQuery = async () => {
      try {
        const { liveQuery } = await import("dexie");
        const table = (localDB as any)[tableName];
        if (!table || cancelled) return;

        const observable = liveQuery(() =>
          table.where("userId").equals(userId).toArray() as Promise<T[]>
        );

        const sub = observable.subscribe({
          next: (result: T[]) => {
            if (mountedRef.current) {
              setData(result);
              setLoading(false);
            }
          },
          error: (err: any) => {
            console.warn(`[LocalDB] LiveQuery error for ${tableName}:`, err);
          },
        });

        // Only keep subscription if effect hasn't been cleaned up
        if (!cancelled) {
          subscription = sub;
        } else {
          sub.unsubscribe(); // Effect already cleaned up — discard
        }
      } catch (err) {
        // liveQuery not available, fall back to manual refresh
        console.warn(`[LocalDB] LiveQuery setup failed for ${tableName}:`, err);
      }
    };

    setupLiveQuery();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [userId, tableName]);

  return {
    data,
    loading,
    syncing,
    error,
    refetch: () => fetchFromServer(true),
  };
}

// ============================================
// useLocalSingleQuery — Read a single record
// ============================================

interface UseLocalSingleQueryResult<T> {
  data: T | null;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to read a single record by ID with local-first strategy.
 *
 * @param apiPath - The API endpoint including ID, e.g. "/api/accounts/abc123"
 * @param id - The record ID
 * @param tableName - The IndexedDB table name
 *
 * @example
 * const { data: account } = useLocalSingleQuery<Account>("/api/accounts/abc123", "abc123", "accounts");
 */
export function useLocalSingleQuery<T extends { id: string }>(
  apiPath: string,
  id: string | null,
  tableName: string
): UseLocalSingleQueryResult<T> {
  const userId = useAppUserId();

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const loadFromLocal = useCallback(async () => {
    if (!id || !tableName) return;
    try {
      const table = (localDB as any)[tableName];
      if (!table) return;
      const record = (await table.get(id)) as T | undefined;
      if (mountedRef.current && record) {
        setData(record);
        setLoading(false);
      }
    } catch (err) {
      console.warn(`[LocalDB] Error reading ${tableName}/${id}:`, err);
    }
  }, [id, tableName]);

  const fetchFromServer = useCallback(async () => {
    if (!userId || !apiPath || !id) return;

    setSyncing(true);
    try {
      const serverData = await apiFetch<T>(apiPath);
      if (mountedRef.current) {
        setData(serverData);
        setError(null);

        // Persist to IndexedDB with sync metadata
        const table = (localDB as any)[tableName];
        if (table) {
          await table.put({
            ...serverData,
            _syncStatus: "synced",
            _version: 1,
            _lastModified: Date.now(),
          });
        }
      }
    } catch (err: any) {
      if (mountedRef.current) {
        if (!data) {
          setError(err.message || "Error de conexión");
        }
      }
    } finally {
      if (mountedRef.current) {
        setSyncing(false);
        setLoading(false);
      }
    }
  }, [userId, apiPath, id, tableName, data]);

  useEffect(() => {
    mountedRef.current = true;

    if (!userId || !id) {
      setLoading(false);
      return;
    }

    const initialLoad = async () => {
      await loadFromLocal();
      await fetchFromServer();
    };

    initialLoad();

    return () => {
      mountedRef.current = false;
    };
  }, [userId, id]);

  return {
    data,
    loading,
    syncing,
    error,
    refetch: fetchFromServer,
  };
}

// ============================================
// useMultiQuery — Fetch multiple endpoints at once
// ============================================

interface UseMultiQueryResult {
  data: Record<string, any[]>;
  loading: boolean;
  syncing: boolean;
  errors: Record<string, string | null>;
  refetch: () => Promise<void>;
}

/**
 * Hook to fetch multiple API endpoints with local-first strategy.
 * Drop-in replacement for the `Promise.allSettled([apiFetch(...), ...])` pattern.
 *
 * @param queries - Object mapping keys to API paths, e.g. { accounts: "/api/accounts", budgets: "/api/budgets" }
 *
 * @example
 * // Before:
 * const [accs, bdgs] = await Promise.allSettled([apiFetch("/api/accounts"), apiFetch("/api/budgets")]);
 *
 * // After:
 * const { data: { accounts, budgets }, loading, syncing } = useMultiQuery({
 *   accounts: "/api/accounts",
 *   budgets: "/api/budgets",
 * });
 */
export function useMultiQuery(
  queries: Record<string, string>,
  options?: { staleTime?: number }
): UseMultiQueryResult {
  const userId = useAppUserId();

  const [data, setData] = useState<Record<string, any[]>>(() =>
    Object.fromEntries(Object.keys(queries).map((key) => [key, []]))
  );
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(Object.keys(queries).map((key) => [key, null]))
  );
  const mountedRef = useRef(true);

  const loadAllFromLocal = useCallback(async () => {
    if (!userId) return;
    const localData: Record<string, any[]> = {};
    let hasAnyLocalData = false;

    for (const [key, apiPath] of Object.entries(queries)) {
      const tableName = API_TABLE_MAP[apiPath];
      if (tableName) {
        try {
          const items = await getAllFromTable(tableName, userId);
          localData[key] = items;
          if (items.length > 0) hasAnyLocalData = true;
        } catch {
          localData[key] = [];
        }
      } else {
        localData[key] = [];
      }
    }

    if (mountedRef.current) {
      setData(localData);
      setLoading(false);
    }
  }, [userId, JSON.stringify(queries)]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAllFromServer = useCallback(async () => {
    if (!userId) return;

    setSyncing(true);
    const results: Record<string, any[]> = { ...data };
    const newErrors: Record<string, string | null> = {};

    const promises = Object.entries(queries).map(async ([key, apiPath]) => {
      try {
        const serverData = await apiFetch<any[]>(apiPath);
        results[key] = serverData;

        // Persist to IndexedDB
        const tableName = API_TABLE_MAP[apiPath];
        if (tableName) {
          await replaceAllInTable(tableName, userId, serverData);
        }

        newErrors[key] = null;
      } catch (err: any) {
        // Keep existing local data on server error
        newErrors[key] = err.message || "Error de conexión";
      }
    });

    await Promise.allSettled(promises);

    if (mountedRef.current) {
      setData(results);
      setErrors(newErrors);
      setSyncing(false);
      setLoading(false);
    }
  }, [userId, data, JSON.stringify(queries)]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    mountedRef.current = true;
    if (!userId) {
      setLoading(false);
      return;
    }

    const initialLoad = async () => {
      await loadAllFromLocal();
      await fetchAllFromServer();
    };

    initialLoad();

    return () => {
      mountedRef.current = false;
    };
  }, [userId]); // Only re-run when user changes

  return {
    data,
    loading,
    syncing,
    errors,
    refetch: fetchAllFromServer,
  };
}
