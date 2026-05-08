/**
 * Local-First Mutation Hooks
 *
 * React hooks for writing data with offline-first support.
 *
 * Flow:
 *   1. Write to IndexedDB immediately (optimistic update)
 *   2. Add operation to sync queue
 *   3. Try to push to server
 *   4. On success → remove from queue, update IndexedDB with server response
 *   5. On failure → keep in queue for retry when back online
 *
 * The component sees the change instantly (IndexedDB read updates via liveQuery).
 * If the server push fails, the queue retries automatically.
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import {
  localDB,
  API_TABLE_MAP,
  upsertRecord,
  deleteRecord,
  enqueueSync,
  removeSyncItem,
  getPendingSyncCount,
} from "../index";
import { apiFetch } from "@/lib/api";
import { useAppStore } from "@/lib/store";
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
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const { setPendingCount, isOnline } = useAppStore();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          const optimisticRecord = {
            ...payload,
            id: tempId,
            userId,
          } as T;

          // Write to IndexedDB immediately
          await upsertRecord(tableName, optimisticRecord);

          // Queue for server sync
          await enqueueSync({
            table: tableName,
            operation: "create",
            serverUrl: apiPath,
            method: "POST",
            body: JSON.stringify({ ...payload, _tempId: tempId }),
            tempId,
          });

          // Try to push to server immediately if online
          if (isOnline) {
            try {
              const serverResponse = await apiFetch<T>(apiPath, {
                method: "POST",
                body: JSON.stringify(payload),
              });

              // Replace temp record with server record (has real ID)
              await localDB[tableName]?.delete(tempId);
              await upsertRecord(tableName, serverResponse);

              // Remove from sync queue
              const pending = await localDB.syncQueue
                .where("tempId")
                .equals(tempId)
                .toArray();
              for (const item of pending) {
                await removeSyncItem(item.id!);
              }

              // Update pending count
              const count = await getPendingSyncCount();
              setPendingCount(count);

              setLoading(false);
              return serverResponse;
            } catch {
              // Server push failed — keep in queue for later retry
              const count = await getPendingSyncCount();
              setPendingCount(count);
            }
          }

          setLoading(false);
          return optimisticRecord;
        }

        if (isUpdate) {
          // Get current record for optimistic update
          const currentRecord = await localDB[tableName]?.get(id);
          const optimisticRecord = {
            ...(currentRecord || {}),
            ...payload,
            id,
            userId,
          } as T;

          // Write to IndexedDB immediately
          await upsertRecord(tableName, optimisticRecord);

          // Queue for server sync
          await enqueueSync({
            table: tableName,
            operation: "update",
            serverUrl: url,
            method: "PUT",
            body: JSON.stringify(payload),
          });

          // Try to push to server immediately if online
          if (isOnline) {
            try {
              const serverResponse = await apiFetch<T>(url, {
                method: "PUT",
                body: JSON.stringify(payload),
              });

              // Update IndexedDB with server response
              await upsertRecord(tableName, serverResponse);

              // Remove from sync queue
              const pending = await localDB.syncQueue
                .where("table")
                .equals(tableName)
                .toArray();
              // Find the most recent update for this specific URL
              const matchingItems = pending.filter(
                (item: any) => item.serverUrl === url && item.operation === "update"
              );
              if (matchingItems.length > 0) {
                // Remove only the most recent one (last added)
                await removeSyncItem(matchingItems[matchingItems.length - 1].id!);
              }

              const count = await getPendingSyncCount();
              setPendingCount(count);

              setLoading(false);
              return serverResponse;
            } catch {
              const count = await getPendingSyncCount();
              setPendingCount(count);
            }
          }

          setLoading(false);
          return optimisticRecord;
        }

        if (isDelete) {
          // Remove from IndexedDB immediately
          await deleteRecord(tableName, id);

          // Queue for server sync
          await enqueueSync({
            table: tableName,
            operation: "delete",
            serverUrl: url,
            method: "DELETE",
          });

          // Try to push to server immediately if online
          if (isOnline) {
            try {
              await apiFetch(url, { method: "DELETE" });

              // Remove from sync queue
              const pending = await localDB.syncQueue
                .where("table")
                .equals(tableName)
                .toArray();
              const matchingItems = pending.filter(
                (item: any) => item.serverUrl === url && item.operation === "delete"
              );
              if (matchingItems.length > 0) {
                await removeSyncItem(matchingItems[matchingItems.length - 1].id!);
              }

              const count = await getPendingSyncCount();
              setPendingCount(count);
            } catch {
              const count = await getPendingSyncCount();
              setPendingCount(count);
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
    [userId, apiPath, tableName, isOnline, setPendingCount]
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
    const count = await getPendingSyncCount();
    setPendingCount(count);
  }, [setPendingCount]);

  return {
    pendingCount,
    refreshCount,
  };
}
