/**
 * Local-First Mutation Hooks
 *
 * React hooks for writing data with offline-first support.
 *
 * Flow:
 *   1. Write to IndexedDB immediately (optimistic update)
 *   2. Add operation to mutation queue (MutationQueueEntry)
 *   3. Try to push to server
 *   4. On success → mark as completed, update IndexedDB with server response
 *   5. On failure → keep in queue for retry when back online
 *
 * The component sees the change instantly (IndexedDB read updates via liveQuery).
 * If the server push fails, the queue retries automatically via the sync engine.
 */

"use client";

import { useState, useCallback } from "react";
import { localDB, API_TABLE_MAP } from "../db";
import type { MutationQueueEntry, SyncStatus } from "../db";
import { apiFetch } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { useAppUserId } from "@/lib/use-app-session";
import { generateTempId } from "../sync/utils";

// ============================================
// useLocalMutation — Create / Update / Delete
// ============================================

interface UseLocalMutationResult<T> {
  mutate: (data: Partial<T>, id?: string) => Promise<T | null>;
  mutateAsync: (data: Partial<T>, id?: string) => Promise<T | null>;
  loading: boolean;
  error: string | null;
  reset: () => void;
}

type MutationMethod = "POST" | "PUT" | "DELETE";

/**
 * Hook for creating, updating, or deleting records with offline support.
 *
 * @param apiPath - Base API endpoint, e.g. "/api/accounts"
 * @param tableName - IndexedDB table name, e.g. "accounts"
 *
 * @example
 * // Create
 * const { mutate: createAccount } = useLocalMutation<Account>("/api/accounts", "accounts");
 * await createAccount({ name: "Ahorros", type: "savings", balance: 0 });
 *
 * // Update
 * await mutate({ name: "Nuevo Nombre" }, "account-id-123");
 *
 * // Delete (pass empty data + id)
 * await mutate({}, "account-id-123"); // with method override
 */
export function useLocalMutation<T extends { id: string; userId?: string }>(
  apiPath: string,
  tableName: string
): UseLocalMutationResult<T> {
  const userId = useAppUserId();
  const { setPendingCount, isOnline } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updatePendingCount = useCallback(async () => {
    try {
      const count = await localDB.mutationQueue
        .where("status")
        .equals("pending")
        .count();
      setPendingCount(count);
    } catch {
      // DB not ready
    }
  }, [setPendingCount]);

  const executeMutation = useCallback(
    async (payload: Partial<T>, id?: string): Promise<T | null> => {
      if (!userId) return null;
      setLoading(true);
      setError(null);

      // Determine operation type
      const isCreate = !id;
      const isDelete = id && Object.keys(payload).length === 0 && (payload as any)._delete === true;
      const isUpdate = id && !isDelete;

      const method: MutationMethod = isCreate ? "POST" : isDelete ? "DELETE" : "PUT";
      const url = id ? `${apiPath}/${id}` : apiPath;

      try {
        // 1. Optimistic local update
        if (isCreate) {
          // Generate a temp ID for the new record
          const tempId = generateTempId();
          const now = Date.now();
          const optimisticRecord = {
            ...payload,
            id: tempId,
            userId,
            _syncStatus: "pending_create" as SyncStatus,
            _version: 1,
            _lastModified: now,
          } as unknown as T;

          // Write to IndexedDB immediately
          const table = (localDB as any)[tableName];
          if (table) await table.put(optimisticRecord);

          // Queue mutation entry
          const mutationEntry: MutationQueueEntry = {
            id: generateTempId(),
            operation: "create",
            tableName,
            recordId: tempId,
            payload: JSON.stringify({ ...payload, _tempId: tempId }),
            apiRoute: apiPath,
            apiMethod: "POST",
            sequence: now,
            status: "pending",
            retryCount: 0,
            createdAt: now,
            updatedAt: now,
          };
          await localDB.mutationQueue.add(mutationEntry);

          // Try to push to server immediately if online
          if (isOnline) {
            try {
              const serverResponse = await apiFetch<T>(apiPath, {
                method: "POST",
                body: JSON.stringify(payload),
              });

              // Replace temp record with server record (has real ID)
              if (table) {
                await table.delete(tempId);
                await table.put({
                  ...serverResponse,
                  _syncStatus: "synced",
                  _version: 1,
                  _lastModified: Date.now(),
                });
              }

              // Mark mutation as completed
              await localDB.mutationQueue.update(mutationEntry.id, {
                status: "completed",
                updatedAt: Date.now(),
              });

              await updatePendingCount();

              setLoading(false);
              return serverResponse;
            } catch {
              // Server push failed — keep in queue for later retry
              await updatePendingCount();
            }
          }

          setLoading(false);
          return optimisticRecord;
        }

        if (isUpdate) {
          // Get current record for optimistic update
          const table = (localDB as any)[tableName];
          const currentRecord = table ? await table.get(id) : null;
          const now = Date.now();
          const optimisticRecord = {
            ...(currentRecord || {}),
            ...payload,
            id,
            userId,
            _syncStatus: "pending_update" as SyncStatus,
            _version: (currentRecord?._version ?? 0) + 1,
            _lastModified: now,
          } as unknown as T;

          // Write to IndexedDB immediately
          if (table) await table.put(optimisticRecord);

          // Queue mutation entry
          const mutationEntry: MutationQueueEntry = {
            id: generateTempId(),
            operation: "update",
            tableName,
            recordId: id,
            payload: JSON.stringify(payload),
            apiRoute: url,
            apiMethod: "PUT",
            sequence: now,
            status: "pending",
            retryCount: 0,
            createdAt: now,
            updatedAt: now,
          };
          await localDB.mutationQueue.add(mutationEntry);

          // Try to push to server immediately if online
          if (isOnline) {
            try {
              const serverResponse = await apiFetch<T>(url, {
                method: "PUT",
                body: JSON.stringify(payload),
              });

              // Update IndexedDB with server response
              if (table) {
                await table.put({
                  ...serverResponse,
                  _syncStatus: "synced",
                  _version: (currentRecord?._version ?? 0) + 1,
                  _lastModified: Date.now(),
                });
              }

              // Mark mutation as completed
              await localDB.mutationQueue.update(mutationEntry.id, {
                status: "completed",
                updatedAt: Date.now(),
              });

              await updatePendingCount();

              setLoading(false);
              return serverResponse;
            } catch {
              await updatePendingCount();
            }
          }

          setLoading(false);
          return optimisticRecord;
        }

        if (isDelete) {
          const table = (localDB as any)[tableName];
          const now = Date.now();

          // Mark record as pending_delete instead of removing immediately
          // This allows the UI to filter it out while still keeping it for sync
          if (table && id) {
            const existing = await table.get(id);
            if (existing) {
              await table.update(id, {
                _syncStatus: "pending_delete",
                _lastModified: now,
              });
            } else {
              // Record doesn't exist locally, just remove it
              await table.delete(id);
            }
          }

          // Queue mutation entry
          const mutationEntry: MutationQueueEntry = {
            id: generateTempId(),
            operation: "delete",
            tableName,
            recordId: id,
            payload: JSON.stringify({}),
            apiRoute: url,
            apiMethod: "DELETE",
            sequence: now,
            status: "pending",
            retryCount: 0,
            createdAt: now,
            updatedAt: now,
          };
          await localDB.mutationQueue.add(mutationEntry);

          // Try to push to server immediately if online
          if (isOnline) {
            try {
              await apiFetch(url, { method: "DELETE" });

              // Actually remove from IndexedDB now that server confirmed
              if (table) await table.delete(id);

              // Mark mutation as completed
              await localDB.mutationQueue.update(mutationEntry.id, {
                status: "completed",
                updatedAt: Date.now(),
              });

              await updatePendingCount();
            } catch {
              await updatePendingCount();
            }
          }

          setLoading(false);
          return null;
        }

        setLoading(false);
        return null;
      } catch (err: any) {
        setError(err.message || "Error en la operación");
        setLoading(false);
        return null;
      }
    },
    [userId, apiPath, tableName, isOnline, updatePendingCount]
  );

  const reset = useCallback(() => {
    setError(null);
    setLoading(false);
  }, []);

  return {
    mutate: executeMutation,
    mutateAsync: executeMutation,
    loading,
    error,
    reset,
  };
}

// ============================================
// useLocalDelete — Specialized delete hook
// ============================================

interface UseLocalDeleteResult {
  remove: (id: string) => Promise<boolean>;
  loading: boolean;
  error: string | null;
}

/**
 * Specialized hook for deleting records with offline support.
 *
 * @param apiPath - Base API endpoint, e.g. "/api/accounts"
 * @param tableName - IndexedDB table name
 *
 * @example
 * const { remove } = useLocalDelete("/api/accounts", "accounts");
 * await remove("account-id-123");
 */
export function useLocalDelete(
  apiPath: string,
  tableName: string
): UseLocalDeleteResult {
  const { mutate } = useLocalMutation(apiPath, tableName);

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await mutate({ _delete: true } as any, id);
      return result !== undefined; // Delete returns null on success
    },
    [mutate]
  );

  return {
    remove,
    loading: false, // Managed by parent mutation hook
    error: null,
  };
}

// ============================================
// useSyncQueue — Monitor pending sync items
// ============================================

/**
 * Hook that provides the current count of pending sync operations.
 * Useful for showing a badge or status indicator.
 */
export function useSyncQueue() {
  const { pendingCount, setPendingCount } = useAppStore();

  const refreshCount = useCallback(async () => {
    try {
      const count = await localDB.mutationQueue
        .where("status")
        .equals("pending")
        .count();
      setPendingCount(count);
    } catch {
      // DB not ready
    }
  }, [setPendingCount]);

  return {
    pendingCount,
    refreshCount,
  };
}
