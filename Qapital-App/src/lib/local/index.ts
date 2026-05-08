// Database
export { localDB, isLocalDBPopulated, getSyncMeta, setSyncMeta, clearLocalDB } from './db';
export type { SyncStatus, SyncMeta, MutationQueueEntry, MutationOperation } from './db';

// Sync
export { performInitialSync, performPull, performPush, syncNow } from './sync/engine';
export { SyncProvider, useSync } from './sync/provider';

// Query hooks
export {
  useLocalAccounts,
  useLocalTransactions,
  useLocalBudgets,
  useLocalDebts,
  useLocalRecurringPayments,
  useLocalSavingsGoals,
  useLocalVehicles,
  useLocalUserSettings,
} from './hooks/queries';

// Mutation helpers
export {
  localCreate,
  localUpdate,
  localDelete,
  localComplexOperation,
  enqueueMutation,
} from './hooks/mutations';
