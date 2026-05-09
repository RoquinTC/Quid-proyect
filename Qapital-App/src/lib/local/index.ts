/**
 * IndexedDB Local-First Layer — Core Database
 *
 * Uses Dexie.js to wrap IndexedDB with a clean API.
 * Each table mirrors a server API endpoint's data.
 * Data is stored per-user with a `userId` index for isolation.
 *
 * Architecture:
 *   1. First load → fetch from server → populate IndexedDB
 *   2. Subsequent loads → read from IndexedDB (instant) → background server refresh
 *   3. Writes → update IndexedDB immediately → queue for server sync
 *   4. Offline → all reads from IndexedDB, all writes queued
 */

import Dexie, { type Table } from "dexie";

// ============================================
// SYNC QUEUE TYPES
// ============================================

export type SyncOperation = "create" | "update" | "delete";

export interface SyncQueueItem {
  id?: number; // Auto-increment
  table: string; // Which IndexedDB table (e.g. "accounts")
  operation: SyncOperation;
  serverUrl: string; // e.g. "/api/accounts" or "/api/accounts/abc123"
  method: string; // "POST", "PUT", "DELETE"
  body?: string; // JSON stringified payload
  tempId?: string; // Client-generated ID for create operations
  createdAt: number; // Timestamp
  retryCount: number; // How many times we've tried to sync
  lastError?: string; // Last error message
}

export interface SyncMeta {
  key: string; // e.g. "accounts_lastSync"
  value: string; // ISO timestamp or other metadata
  userId: string;
}

// ============================================
// LOCAL DATABASE DEFINITION
// ============================================

/**
 * LocalDB — Dexie database for offline-first data storage.
 *
 * Tables are designed to mirror server API responses.
 * Each record stores its `id` as primary key and includes a `userId`
 * field for multi-user isolation on shared devices.
 *
 * For nested objects (e.g. Account with subAccounts), we store
 * the complete nested object as returned by the API. This keeps
 * the data shape identical to what components expect.
 */
class LocalDB extends Dexie {
  // Finance
  accounts!: Table<any, string>;
  transactions!: Table<any, string>;
  budgets!: Table<any, string>;
  debts!: Table<any, string>;
  installments!: Table<any, string>;
  savingsGoals!: Table<any, string>;
  savingsContributions!: Table<any, string>;
  cdts!: Table<any, string>;
  recurringPayments!: Table<any, string>;
  payrollGroups!: Table<any, string>;

  // Transport
  vehicles!: Table<any, string>;
  fuelLogs!: Table<any, string>;
  maintenanceRecords!: Table<any, string>;

  // Health
  medications!: Table<any, string>;
  appointments!: Table<any, string>;

  // Pantry
  pantryItems!: Table<any, string>;
  shoppingLists!: Table<any, string>;
  healthProfiles!: Table<any, string>;

  // Settings & Misc
  fuelPrices!: Table<any, string>;
  userSettings!: Table<any, string>;

  // Sync infrastructure
  syncQueue!: Table<SyncQueueItem, number>;
  syncMeta!: Table<SyncMeta, string>;

  constructor() {
    super("qapital_local");

    this.version(1).stores({
      // Finance — id is the server-assigned cuid
      accounts: "id, userId",
      transactions: "id, userId, date, type, category",
      budgets: "id, userId, type, category",
      debts: "id, userId",
      installments: "id, userId, debtId",
      savingsGoals: "id, userId",
      savingsContributions: "id, userId, savingsGoalId",
      cdts: "id, userId",
      recurringPayments: "id, userId, status, scheduledDate",
      payrollGroups: "id, userId",

      // Transport
      vehicles: "id, userId",
      fuelLogs: "id, userId, vehicleId",
      maintenanceRecords: "id, userId, vehicleId",

      // Health
      medications: "id, userId",
      appointments: "id, userId, status",

      // Pantry
      pantryItems: "id, userId",
      shoppingLists: "id, userId, status",
      healthProfiles: "id, userId",

      // Settings & Misc
      fuelPrices: "id, userId",
      userSettings: "userId",

      // Sync infrastructure
      syncQueue: "++id, table, createdAt, retryCount",
      syncMeta: "key, userId",
    });
  }
}

// Singleton instance
export const localDB = new LocalDB();

// ============================================
// TABLE NAME MAPPING
// ============================================

/**
 * Maps API endpoint paths to IndexedDB table names.
 * This is the central registry for all sync-able data.
 */
export const API_TABLE_MAP: Record<string, string> = {
  "/api/accounts": "accounts",
  "/api/transactions": "transactions",
  "/api/budgets": "budgets",
  "/api/debts": "debts",
  "/api/savings": "savingsGoals",
  "/api/cdts": "cdts",
  "/api/recurring": "recurringPayments",
  "/api/payroll": "payrollGroups",
  "/api/vehicles": "vehicles",
  "/api/medications": "medications",
  "/api/appointments": "appointments",
  "/api/pantry": "pantryItems",
  "/api/shopping-lists": "shoppingLists",
  "/api/health-profiles": "healthProfiles",
  "/api/fuel-prices": "fuelPrices",
  "/api/settings": "userSettings",
};

/**
 * Reverse map: table name → default API endpoint (for full collection fetch)
 */
export const TABLE_API_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(API_TABLE_MAP).map(([api, table]) => [table, api])
);

// ============================================
// SYNC META HELPERS
// ============================================

export async function getLastSync(table: string, userId: string): Promise<string | null> {
  const meta = await localDB.syncMeta.get(`${table}_lastSync`);
  return meta?.value ?? null;
}

export async function setLastSync(table: string, userId: string): Promise<void> {
  await localDB.syncMeta.put({
    key: `${table}_lastSync`,
    value: new Date().toISOString(),
    userId,
  });
}

export async function isInitialSyncDone(userId: string): Promise<boolean> {
  const meta = await localDB.syncMeta.get("initialSyncDone");
  return meta?.value === userId;
}

export async function setInitialSyncDone(userId: string): Promise<void> {
  await localDB.syncMeta.put({
    key: "initialSyncDone",
    value: userId,
    userId,
  });
}

// ============================================
// DATA ACCESS HELPERS
// ============================================

/**
 * Get all records from a table for a specific user.
 * Returns an empty array if the table doesn't exist or has no data.
 */
export async function getAllFromTable<T>(tableName: string, userId: string): Promise<T[]> {
  try {
    const table = (localDB as any)[tableName] as Table<any, string> | undefined;
    if (!table) return [];
    return await table.where("userId").equals(userId).toArray() as T[];
  } catch {
    return [];
  }
}

/**
 * Get a single record by ID.
 */
export async function getRecord<T>(tableName: string, id: string): Promise<T | undefined> {
  try {
    const table = (localDB as any)[tableName] as Table<any, string> | undefined;
    if (!table) return undefined;
    return await table.get(id) as T;
  } catch {
    return undefined;
  }
}

/**
 * Replace all data in a table for a user (full refresh from server).
 * Uses Dexie bulkPut for efficiency.
 */
export async function replaceAllInTable<T extends { id: string }>(
  tableName: string,
  userId: string,
  data: T[]
): Promise<void> {
  const table = (localDB as any)[tableName] as Table<any, string> | undefined;
  if (!table) return;

  await localDB.transaction("rw", table, async () => {
    // Delete existing user data in this table
    await table.where("userId").equals(userId).delete();
    // Insert new data
    if (data.length > 0) {
      await table.bulkPut(data);
    }
  });
}

/**
 * Upsert a single record into a table.
 */
export async function upsertRecord<T extends { id: string }>(
  tableName: string,
  record: T
): Promise<void> {
  const table = (localDB as any)[tableName] as Table<any, string> | undefined;
  if (!table) return;
  await table.put(record);
}

/**
 * Delete a single record from a table.
 */
export async function deleteRecord(
  tableName: string,
  id: string
): Promise<void> {
  const table = (localDB as any)[tableName] as Table<any, string> | undefined;
  if (!table) return;
  await table.delete(id);
}

// ============================================
// SYNC QUEUE HELPERS
// ============================================

/**
 * Add an operation to the sync queue.
 */
export async function enqueueSync(item: Omit<SyncQueueItem, "id" | "createdAt" | "retryCount">): Promise<void> {
  await localDB.syncQueue.add({
    ...item,
    createdAt: Date.now(),
    retryCount: 0,
  });
}

/**
 * Get all pending sync queue items, ordered by creation time.
 */
export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  return await localDB.syncQueue.orderBy("createdAt").toArray();
}

/**
 * Count pending sync items.
 */
export async function getPendingSyncCount(): Promise<number> {
  return await localDB.syncQueue.count();
}

/**
 * Remove a sync queue item after successful sync.
 */
export async function removeSyncItem(id: number): Promise<void> {
  await localDB.syncQueue.delete(id);
}

/**
 * Increment retry count for a sync queue item.
 */
export async function incrementRetry(id: number, error?: string): Promise<void> {
  await localDB.syncQueue.update(id, {
    retryCount: (await localDB.syncQueue.get(id))?.retryCount ?? 0 + 1,
    lastError: error,
  });
}

/**
 * Clear all sync queue items (e.g. after successful full sync).
 */
export async function clearSyncQueue(): Promise<void> {
  await localDB.syncQueue.clear();
}

/**
 * Clear all local data for a specific user (logout / reset).
 */
export async function clearLocalData(userId: string): Promise<void> {
  const tableNames = [
    "accounts", "transactions", "budgets", "debts", "installments",
    "savingsGoals", "savingsContributions", "cdts", "recurringPayments",
    "payrollGroups", "vehicles", "fuelLogs", "maintenanceRecords",
    "medications", "appointments", "pantryItems", "shoppingLists",
    "healthProfiles", "fuelPrices", "userSettings", "syncMeta",
  ];

  await localDB.transaction("rw", tableNames.map(n => (localDB as any)[n]), async () => {
    for (const name of tableNames) {
      const table = (localDB as any)[name] as Table<any, string>;
      if (name === "syncMeta") {
        await table.where("userId").equals(userId).delete();
      } else {
        await table.where("userId").equals(userId).delete();
      }
    }
  });

  // Always clear the full sync queue on logout
  await localDB.syncQueue.clear();
}
