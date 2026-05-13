import { localDB, isLocalDBPopulated, getSyncMeta, setSyncMeta } from '../db';
import type { SyncMeta } from '../db';
import { MAX_RETRY_COUNT, getNextRetryAt, isReadyForRetry, getRetryDelay } from './utils';

const SYNC_META_DEFAULTS: SyncMeta = {
  _syncStatus: 'synced',
  _version: 1,
  _lastModified: Date.now(),
};

/**
 * Perform initial sync: fetch all data from server and populate IndexedDB.
 * Called when the app detects IndexedDB is empty.
 */
export async function performInitialSync(): Promise<void> {
  console.log('[Sync] Starting initial sync...');

  const response = await fetch('/api/sync/initial');
  if (!response.ok) {
    throw new Error(`Initial sync failed: ${response.status}`);
  }

  const data = await response.json();

  // Bulk insert all data into IndexedDB in a single transaction
  await localDB.transaction('rw', localDB.tables, async () => {
    const tables = [
      'accounts', 'subAccounts', 'transactions', 'budgets', 'debts',
      'installments', 'abonos', 'abonoDetails', 'recurringPayments',
      'payrollGroups', 'savingsGoals', 'savingsGoalAccounts',
      'savingsContributions', 'cdts', 'yieldRecords', 'vehicles',
      'fuelLogs', 'maintenanceRecords', 'fuelPrices', 'medications',
      'appointments', 'pantryItems', 'shoppingLists', 'shoppingListItems',
      'healthProfiles', 'userSettings', 'sharedAccountUsers',
    ] as const;

    for (const tableName of tables) {
      const records = data[tableName];
      if (records && Array.isArray(records) && records.length > 0) {
        const table = localDB.table(tableName);
        const enriched = records.map((record: Record<string, unknown>) => ({
          ...record,
          ...SYNC_META_DEFAULTS,
          _lastModified: Date.now(),
        }));
        await table.bulkPut(enriched);
      }
    }
  });

  // Record the sync timestamp
  await setSyncMeta('lastPullTimestamp', String(data.timestamp));
  await setSyncMeta('initialSyncCompleted', 'true');

  console.log('[Sync] Initial sync completed successfully');
}

/**
 * Perform incremental pull: fetch changes from server since last pull.
 */
export async function performPull(): Promise<void> {
  const lastPull = await getSyncMeta('lastPullTimestamp');
  const lastPullMs = lastPull ? lastPull : '0';

  const response = await fetch(`/api/sync/pull?since=${lastPullMs}`);
  if (!response.ok) {
    throw new Error(`Pull failed: ${response.status}`);
  }

  const data = await response.json();

  // Apply changes to IndexedDB
  await localDB.transaction('rw', localDB.tables, async () => {
    for (const [tableName, records] of Object.entries(data.records || {})) {
      if (!Array.isArray(records) || records.length === 0) continue;
      const table = localDB.table(tableName);
      if (!table) continue;

      for (const record of records as Record<string, unknown>[]) {
        if (!record.id) continue;
        const existing = await table.get(record.id as string);

        if (!existing) {
          // New record from server
          await table.put({
            ...record,
            ...SYNC_META_DEFAULTS,
            _lastModified: Date.now(),
          });
        } else if (existing._syncStatus === 'synced') {
          // No local changes — accept server version (server wins)
          await table.put({
            ...record,
            _syncStatus: 'synced',
            _version: existing._version + 1,
            _lastModified: Date.now(),
          });
        } else if (existing._syncStatus.startsWith('pending_')) {
          // Conflict: server wins for financial data
          await table.put({
            ...record,
            _syncStatus: 'synced',
            _version: existing._version + 1,
            _lastModified: Date.now(),
          });
          console.warn(`[Sync] Conflict resolved (server wins) for ${tableName}/${record.id}`);
        }
      }
    }

    // Handle deletions
    for (const { tableName: delTable, id } of data.deletions || []) {
      const table = localDB.table(delTable);
      if (table) {
        const existing = await table.get(id);
        if (existing?._syncStatus === 'synced') {
          await table.delete(id);
        }
      }
    }
  });

  await setSyncMeta('lastPullTimestamp', String(data.timestamp));
  console.log('[Sync] Pull completed');
}

/**
 * Push pending mutations to the server.
 * Processes mutations in sequence order.
 */
export async function performPush(): Promise<void> {
  const pending = await localDB.mutationQueue
    .where('status')
    .equals('pending')
    .sortBy('sequence');

  if (pending.length === 0) return;

  for (const mutation of pending) {
    try {
      // [11] Skip items that are in their backoff period
      if (!isReadyForRetry(mutation)) continue;

      // Drop items that exceeded max retries
      if (mutation.retryCount >= MAX_RETRY_COUNT) {
        console.warn(`[Sync] Dropping mutation ${mutation.id} after ${MAX_RETRY_COUNT} retries`);
        await localDB.mutationQueue.delete(mutation.id);
        continue;
      }

      await localDB.mutationQueue.update(mutation.id, {
        status: 'in_progress',
        updatedAt: Date.now(),
      });

      if (mutation.operation === 'complex') {
        // Complex: replay the full API call
        const response = await fetch(mutation.apiRoute!, {
          method: mutation.apiMethod || 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: mutation.payload,
        });

        // Handle 429 (rate limited)
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const extraDelay = retryAfter ? parseInt(retryAfter) * 1000 : getRetryDelay(mutation.retryCount + 1);
          await localDB.mutationQueue.update(mutation.id, {
            status: 'pending',
            retryCount: mutation.retryCount + 1,
            nextRetryAt: Date.now() + extraDelay,
            error: 'Rate limited (429)',
            updatedAt: Date.now(),
          });
          break; // Stop pushing — server is busy
        }

        if (!response.ok) throw new Error(`Server returned ${response.status}`);
      } else {
        // Simple CRUD
        const payload = JSON.parse(mutation.payload);
        const route = `/api/${getRouteForTable(mutation.tableName, mutation.recordId, mutation.operation)}`;
        const method = mutation.operation === 'create' ? 'POST' : mutation.operation === 'update' ? 'PUT' : 'DELETE';

        const response = await fetch(route, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: method !== 'DELETE' ? JSON.stringify(payload) : undefined,
        });

        // Handle 429 (rate limited)
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const extraDelay = retryAfter ? parseInt(retryAfter) * 1000 : getRetryDelay(mutation.retryCount + 1);
          await localDB.mutationQueue.update(mutation.id, {
            status: 'pending',
            retryCount: mutation.retryCount + 1,
            nextRetryAt: Date.now() + extraDelay,
            error: 'Rate limited (429)',
            updatedAt: Date.now(),
          });
          break;
        }

        if (!response.ok) throw new Error(`Server returned ${response.status}`);

        // Update local record with server response
        if (method !== 'DELETE') {
          const serverData = await response.json();
          const table = localDB.table(mutation.tableName);
          if (table) {
            await table.update(mutation.recordId, {
              ...serverData,
              _syncStatus: 'synced',
              _lastModified: Date.now(),
            });
          }
        } else {
          // For deletes, remove from local DB
          const table = localDB.table(mutation.tableName);
          if (table) await table.delete(mutation.recordId);
        }
      }

      await localDB.mutationQueue.update(mutation.id, {
        status: 'completed',
        updatedAt: Date.now(),
      });
    } catch (error) {
      // [11] Apply exponential backoff + jitter
      const nextRetry = getNextRetryAt(mutation.retryCount + 1);
      await localDB.mutationQueue.update(mutation.id, {
        status: 'pending',
        retryCount: mutation.retryCount + 1,
        nextRetryAt: nextRetry,
        error: String(error),
        updatedAt: Date.now(),
      });

      console.warn(`[Sync] Mutation ${mutation.id} failed (retry ${mutation.retryCount + 1}/${MAX_RETRY_COUNT}), next retry at ${new Date(nextRetry).toISOString()}`);

      // Stop processing group on failure
      if (mutation.groupId) break;
    }
  }

  // Clean up old completed mutations
  const completed = await localDB.mutationQueue
    .where('status')
    .equals('completed')
    .reverse()
    .sortBy('createdAt');

  if (completed.length > 100) {
    const toDelete = completed.slice(100).map((m) => m.id);
    await localDB.mutationQueue.bulkDelete(toDelete);
  }
}

function getRouteForTable(tableName: string, recordId: string, operation: string): string {
  const routeMap: Record<string, string> = {
    accounts: `accounts${operation !== 'create' ? `/${recordId}` : ''}`,
    transactions: `transactions${operation !== 'create' ? `/${recordId}` : ''}`,
    budgets: `budgets${operation !== 'create' ? `/${recordId}` : ''}`,
    debts: `debts${operation !== 'create' ? `/${recordId}` : ''}`,
    recurringPayments: `recurring${operation !== 'create' ? `/${recordId}` : ''}`,
    payrollGroups: `payroll${operation !== 'create' ? `/${recordId}` : ''}`,
    savingsGoals: `savings${operation !== 'create' ? `/${recordId}` : ''}`,
    cdts: `cdts${operation !== 'create' ? `/${recordId}` : ''}`,
    vehicles: `vehicles${operation !== 'create' ? `/${recordId}` : ''}`,
    medications: `medications${operation !== 'create' ? `/${recordId}` : ''}`,
    appointments: `appointments${operation !== 'create' ? `/${recordId}` : ''}`,
    pantryItems: `pantry${operation !== 'create' ? `/${recordId}` : ''}`,
    shoppingLists: `shopping-lists${operation !== 'create' ? `/${recordId}` : ''}`,
    healthProfiles: `health-profiles${operation !== 'create' ? `/${recordId}` : ''}`,
    fuelPrices: `fuel-prices`,
    userSettings: `settings`,
    yieldRecords: `yield`,
  };
  return routeMap[tableName] || tableName;
}

/**
 * Full sync cycle: pull then push.
 */
export async function syncNow(): Promise<void> {
  try {
    // Check if initial sync is needed
    const populated = await isLocalDBPopulated();
    if (!populated) {
      await performInitialSync();
      return;
    }

    await performPull();
    await performPush();
  } catch (error) {
    console.error('[Sync] Sync failed:', error);
    throw error;
  }
}
