'use client';

import { localDB } from '../db';
import type { MutationOperation } from '../db';

let sequenceCounter = 0;

// Initialize sequence counter from existing queue
if (typeof window !== 'undefined') {
  localDB.mutationQueue
    .orderBy('sequence')
    .reverse()
    .first()
    .then((last) => {
      if (last) sequenceCounter = last.sequence;
    })
    .catch(() => {
      // DB not ready yet
    });
}

/**
 * Enqueue a mutation for later sync to the server.
 * The mutation is stored in IndexedDB and processed when online.
 */
export async function enqueueMutation(
  operation: MutationOperation,
  tableName: string,
  recordId: string,
  payload: Record<string, unknown>,
  options?: {
    snapshot?: Record<string, unknown>;
    apiRoute?: string;
    apiMethod?: string;
    groupId?: string;
  }
): Promise<void> {
  const entry = {
    id: crypto.randomUUID(),
    operation,
    tableName,
    recordId,
    payload: JSON.stringify(payload),
    apiRoute: options?.apiRoute,
    apiMethod: options?.apiMethod,
    snapshot: options?.snapshot ? JSON.stringify(options.snapshot) : undefined,
    sequence: ++sequenceCounter,
    status: 'pending' as const,
    retryCount: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    groupId: options?.groupId,
  };

  await localDB.mutationQueue.add(entry);
}

/**
 * Write to IndexedDB optimistically AND enqueue the mutation for server sync.
 * This is the primary way to create records in local-first mode.
 */
export async function localCreate<T extends Record<string, unknown>>(
  tableName: string,
  data: T & { id: string }
): Promise<void> {
  const now = Date.now();

  // 1. Write to IndexedDB optimistically
  await localDB.table(tableName).put({
    ...data,
    _syncStatus: 'pending_create',
    _version: 1,
    _lastModified: now,
  });

  // 2. Enqueue mutation for server sync
  await enqueueMutation('create', tableName, data.id, data);
}

/**
 * Update a record in IndexedDB optimistically AND enqueue the mutation.
 */
export async function localUpdate<T extends Record<string, unknown>>(
  tableName: string,
  id: string,
  changes: Partial<T>
): Promise<void> {
  const now = Date.now();

  // Get current state for snapshot (for rollback)
  const existing = await localDB.table(tableName).get(id);
  const snapshot = existing ? { ...existing } : undefined;

  // 1. Update IndexedDB optimistically
  await localDB.table(tableName).update(id, {
    ...changes,
    _syncStatus: existing?._syncStatus === 'synced' ? 'pending_update' : existing?._syncStatus,
    _lastModified: now,
  });

  // 2. Enqueue mutation for server sync
  await enqueueMutation('update', tableName, id, changes, { snapshot });
}

/**
 * Delete a record from IndexedDB optimistically AND enqueue the mutation.
 */
export async function localDelete(
  tableName: string,
  id: string
): Promise<void> {
  // Get current state for snapshot
  const existing = await localDB.table(tableName).get(id);
  const snapshot = existing ? { ...existing } : undefined;

  // 1. Mark as pending_delete in IndexedDB (don't remove yet — need for rollback)
  await localDB.table(tableName).update(id, {
    _syncStatus: 'pending_delete',
    _lastModified: Date.now(),
  });

  // 2. Enqueue mutation for server sync
  await enqueueMutation('delete', tableName, id, {}, { snapshot });
}

/**
 * Enqueue a complex operation (e.g., debt payment) that needs a specific API route.
 * The local optimistic update should be done BEFORE calling this.
 */
export async function localComplexOperation(
  apiRoute: string,
  apiMethod: string,
  payload: Record<string, unknown>,
  affectedRecords: Array<{ tableName: string; id: string }>,
  groupId?: string
): Promise<void> {
  const gId = groupId || crypto.randomUUID();

  // Enqueue the complex operation
  await enqueueMutation('complex', affectedRecords[0]?.tableName || '', affectedRecords[0]?.id || '', payload, {
    apiRoute,
    apiMethod,
    groupId: gId,
  });
}
