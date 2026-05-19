// ─── Sync Infrastructure Types ───

export type SyncStatus = 'synced' | 'pending_create' | 'pending_update' | 'pending_delete' | 'conflict';

export interface SyncMeta {
  _syncStatus: SyncStatus;
  _version: number;
  _lastModified: number;
}

export type MutationOperation = 'create' | 'update' | 'delete' | 'complex';

export interface MutationQueueEntry {
  id: string;
  operation: MutationOperation;
  tableName: string;
  recordId: string;
  payload: string;
  apiRoute?: string;
  apiMethod?: string;
  snapshot?: string;
  sequence: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  retryCount: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  groupId?: string;
  /** Timestamp (ms) after which this mutation should be retried. Set on failure. */
  nextRetryAt?: number;
}

export interface SyncMetaRecord {
  key: string;
  value: string;
  updatedAt: number;
}
