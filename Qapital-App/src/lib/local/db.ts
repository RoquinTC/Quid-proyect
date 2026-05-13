import Dexie, { type Table } from 'dexie';
import type { SyncStatus, SyncMeta, MutationOperation, MutationQueueEntry, SyncMetaRecord } from '@/lib/types/sync';

// Re-export for backward compatibility (other files import from here)
export type { SyncStatus, SyncMeta, MutationOperation, MutationQueueEntry, SyncMetaRecord };

// ─── Local Record Types ───

export interface LocalAccount extends SyncMeta {
  id: string;
  userId: string;
  name: string;
  type: string;
  color: string;
  icon?: string | null;
  balance: number;
  isHighYield: boolean;
  yieldPercentage?: number | null;
  isShared: boolean;
  excludeFromAvailable: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSubAccount extends SyncMeta {
  id: string;
  accountId: string;
  name: string;
  type: string;
  balance: number;
  isHighYield: boolean;
  yieldPercentage?: number | null;
  icon?: string | null;
  color?: string | null;
  excludeFromAvailable: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalTransaction extends SyncMeta {
  id: string;
  userId: string;
  accountId?: string | null;
  subAccountId?: string | null;
  type: string;
  amount: number;
  description: string;
  category?: string | null;
  subCategory?: string | null;
  date: string;
  sourceModule?: string | null;
  sourceId?: string | null;
  isRecurring: boolean;
  notes?: string | null;
  relatedTransactionId?: string | null;
  createdAt: string;
  updatedAt: string;
  // Denormalized for display
  accountName?: string | null;
  accountColor?: string | null;
  accountType?: string | null;
  subAccountName?: string | null;
}

export interface LocalBudget extends SyncMeta {
  id: string;
  userId: string;
  type: string;
  category: string;
  subCategory?: string | null;
  amount: number;
  spent: number;
  period: string;
  lastResetDate?: string | null;
  icon?: string | null;
  color?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalDebt extends SyncMeta {
  id: string;
  userId: string;
  type: string;
  name: string;
  color: string;
  icon?: string | null;
  bank?: string | null;
  totalAmount: number;
  currentBalance: number;
  interestRate?: number | null;
  cutoffDate?: number | null;
  paymentDate?: number | null;
  monthlyPayment?: number | null;
  remainingPayments?: number | null;
  paymentType?: string | null;
  otherCharges?: number | null;
  category?: string | null;
  subCategory?: string | null;
  accountId?: string | null;
  subAccountId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalInstallment extends SyncMeta {
  id: string;
  debtId: string;
  description: string;
  totalAmount: number;
  totalInstallments: number;
  currentInstallment: number;
  installmentAmount: number;
  paidAmount: number;
  interestRate?: number | null;
  interestAmount?: number | null;
  remainingBalance?: number | null;
  purchaseDate: string;
  nextPaymentDate: string;
  isPaid: boolean;
  accountId?: string | null;
  subAccountId?: string | null;
  category?: string | null;
  subCategory?: string | null;
  recurringPaymentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAbono extends SyncMeta {
  id: string;
  userId: string;
  debtId: string;
  transactionId?: string | null;
  totalAmount: number;
  accountId: string;
  subAccountId?: string | null;
  date: string;
  isReversed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAbonoDetail extends SyncMeta {
  id: string;
  abonoId: string;
  installmentId: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
}

export interface LocalRecurringPayment extends SyncMeta {
  id: string;
  userId: string;
  description: string;
  amount: number;
  actualAmount?: number | null;
  type: string;
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  destinationAccountId?: string | null;
  destinationSubAccountId?: string | null;
  category?: string | null;
  subCategory?: string | null;
  scheduledDate: string;
  confirmedDate?: string | null;
  status: string;
  frequency: string;
  notes?: string | null;
  isRecurring: boolean;
  savingsGoalId?: string | null;
  customDays?: string | null;
  periodAmounts?: string | null;
  payrollGroupId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalPayrollGroup extends SyncMeta {
  id: string;
  userId: string;
  description: string;
  frequency: string;
  totalAmount: number;
  accountId: string;
  subAccountId?: string | null;
  category: string;
  subCategory?: string | null;
  adjustToBusinessDay: boolean;
  businessDayDirection: string;
  schedules: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSavingsGoal extends SyncMeta {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  targetAmount: number;
  currentAmount: number;
  deadline?: string | null;
  icon?: string | null;
  color: string;
  type: string;
  aiSuggestion?: string | null;
  isActive: boolean;
  frequency: string;
  monthlyDay?: number | null;
  biweeklyDays?: string | null;
  weeklyDay?: number | null;
  periodAmounts?: string | null;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSavingsGoalAccount extends SyncMeta {
  id: string;
  goalId: string;
  accountId: string;
  subAccountId?: string | null;
  createdAt: string;
}

export interface LocalSavingsContribution extends SyncMeta {
  id: string;
  goalId: string;
  amount: number;
  date: string;
  description?: string | null;
  transactionId?: string | null;
  accountId?: string | null;
  createdAt: string;
}

export interface LocalCDT extends SyncMeta {
  id: string;
  userId: string;
  bank: string;
  amount: number;
  effectiveRate: number;
  startDate: string;
  endDate: string;
  termDays: number;
  interestEarned: number;
  status: string;
  goalId?: string | null;
  accountId?: string | null;
  withdrawnAmount?: number | null;
  withdrawnDate?: string | null;
  notes?: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalYieldRecord extends SyncMeta {
  id: string;
  accountId?: string | null;
  subAccountId?: string | null;
  month: string;
  projectedYield: number;
  actualYield?: number | null;
  yieldPercentage: number;
  isConfirmed: boolean;
  transactionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalVehicle extends SyncMeta {
  id: string;
  userId: string;
  name: string;
  type: string;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  color?: string | null;
  tankCapacity?: number | null;
  fuelType?: string | null;
  currentKm: number;
  icon?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalFuelLog extends SyncMeta {
  id: string;
  vehicleId: string;
  date: string;
  km: number;
  amount: number;
  pricePerGallon: number;
  gallons: number;
  isFullTank: boolean;
  notes?: string | null;
  createdAt: string;
}

export interface LocalMaintenanceRecord extends SyncMeta {
  id: string;
  vehicleId: string;
  type: string;
  description: string;
  cost: number;
  km: number;
  date: string;
  nextDueKm?: number | null;
  nextDueDate?: string | null;
  reminderEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalFuelPrice extends SyncMeta {
  id: string;
  userId: string;
  fuelType: string;
  pricePerGallon: number;
  createdAt: string;
  updatedAt: string;
}

export interface LocalMedication extends SyncMeta {
  id: string;
  userId: string;
  name: string;
  dosage: string;
  frequency: string;
  customSchedule?: string | null;
  disease?: string | null;
  howToTake?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  reminderEnabled: boolean;
  reminderTimes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalAppointment extends SyncMeta {
  id: string;
  userId: string;
  doctorName?: string | null;
  specialty?: string | null;
  location?: string | null;
  date: string;
  notes?: string | null;
  reminderEnabled: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalPantryItem extends SyncMeta {
  id: string;
  userId: string;
  name: string;
  category?: string | null;
  quantity: number;
  unit: string;
  expirationDate?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  minStock?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalShoppingList extends SyncMeta {
  id: string;
  userId: string;
  name: string;
  status: string;
  profileId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalShoppingListItem extends SyncMeta {
  id: string;
  shoppingListId: string;
  name: string;
  quantity: number;
  unit: string;
  estimatedPrice?: number | null;
  actualPrice?: number | null;
  isPurchased: boolean;
  checked: boolean;
  pantryItemId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalHealthProfile extends SyncMeta {
  id: string;
  userId: string;
  name: string;
  type: string;
  diseases?: string | null;
  restrictions?: string | null;
  aiRestrictions?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LocalUserSettings extends SyncMeta {
  id: string;
  userId: string;
  theme: string;
  budgetCutoffDay: number;
  respectHolidays: boolean;
  countryCode: string;
  lastBudgetReset?: string | null;
  notificationsEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSharedAccountUser extends SyncMeta {
  id: string;
  accountId: string;
  userId: string;
  role: string;
  createdAt: string;
}

// MutationOperation, MutationQueueEntry, and SyncMetaRecord are now imported from @/lib/types/sync

// ─── Dexie Database Class ───

class QapitalDB extends Dexie {
  accounts!: Table<LocalAccount>;
  subAccounts!: Table<LocalSubAccount>;
  transactions!: Table<LocalTransaction>;
  budgets!: Table<LocalBudget>;
  debts!: Table<LocalDebt>;
  installments!: Table<LocalInstallment>;
  abonos!: Table<LocalAbono>;
  abonoDetails!: Table<LocalAbonoDetail>;
  recurringPayments!: Table<LocalRecurringPayment>;
  payrollGroups!: Table<LocalPayrollGroup>;
  savingsGoals!: Table<LocalSavingsGoal>;
  savingsGoalAccounts!: Table<LocalSavingsGoalAccount>;
  savingsContributions!: Table<LocalSavingsContribution>;
  cdts!: Table<LocalCDT>;
  yieldRecords!: Table<LocalYieldRecord>;
  vehicles!: Table<LocalVehicle>;
  fuelLogs!: Table<LocalFuelLog>;
  maintenanceRecords!: Table<LocalMaintenanceRecord>;
  fuelPrices!: Table<LocalFuelPrice>;
  medications!: Table<LocalMedication>;
  appointments!: Table<LocalAppointment>;
  pantryItems!: Table<LocalPantryItem>;
  shoppingLists!: Table<LocalShoppingList>;
  shoppingListItems!: Table<LocalShoppingListItem>;
  healthProfiles!: Table<LocalHealthProfile>;
  userSettings!: Table<LocalUserSettings>;
  sharedAccountUsers!: Table<LocalSharedAccountUser>;
  mutationQueue!: Table<MutationQueueEntry>;
  syncMeta!: Table<SyncMetaRecord>;

  constructor() {
    super('qapital-db');

    this.version(1).stores({
      accounts: 'id, userId, type, order, _syncStatus, _lastModified',
      subAccounts: 'id, accountId, order, _syncStatus, _lastModified',
      transactions: 'id, userId, accountId, subAccountId, type, category, date, sourceModule, _syncStatus, _lastModified',
      budgets: 'id, userId, type, category, subCategory, _syncStatus, _lastModified',
      debts: 'id, userId, type, _syncStatus, _lastModified',
      installments: 'id, debtId, isPaid, nextPaymentDate, _syncStatus, _lastModified',
      abonos: 'id, userId, debtId, date, _syncStatus, _lastModified',
      abonoDetails: 'id, abonoId, installmentId, _syncStatus',
      recurringPayments: 'id, userId, status, scheduledDate, debtId, savingsGoalId, payrollGroupId, _syncStatus, _lastModified',
      payrollGroups: 'id, userId, accountId, _syncStatus, _lastModified',
      savingsGoals: 'id, userId, isActive, status, _syncStatus, _lastModified',
      savingsGoalAccounts: 'id, goalId, accountId, _syncStatus',
      savingsContributions: 'id, goalId, date, _syncStatus, _lastModified',
      cdts: 'id, userId, status, goalId, _syncStatus, _lastModified',
      yieldRecords: 'id, accountId, subAccountId, month, _syncStatus, _lastModified',
      vehicles: 'id, userId, _syncStatus, _lastModified',
      fuelLogs: 'id, vehicleId, date, _syncStatus, _lastModified',
      maintenanceRecords: 'id, vehicleId, type, date, _syncStatus, _lastModified',
      fuelPrices: 'id, userId, fuelType, _syncStatus, _lastModified',
      medications: 'id, userId, isActive, _syncStatus, _lastModified',
      appointments: 'id, userId, date, status, _syncStatus, _lastModified',
      pantryItems: 'id, userId, category, _syncStatus, _lastModified',
      shoppingLists: 'id, userId, status, _syncStatus, _lastModified',
      shoppingListItems: 'id, shoppingListId, _syncStatus, _lastModified',
      healthProfiles: 'id, userId, type, _syncStatus, _lastModified',
      userSettings: 'id, userId, _syncStatus, _lastModified',
      sharedAccountUsers: 'id, accountId, userId, _syncStatus',
      mutationQueue: 'id, tableName, status, sequence, groupId, createdAt',
      syncMeta: 'key',
    });
  }
}

// Singleton — reused across the app
export const localDB = new QapitalDB();

// ─── API path → Table name mapping ───

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

// ─── Helper: Table name → API route mapping ───

export const TABLE_TO_ROUTE: Record<string, string> = {
  accounts: 'accounts',
  subAccounts: 'accounts', // Sub-accounts go through parent account route
  transactions: 'transactions',
  budgets: 'budgets',
  debts: 'debts',
  installments: 'installments',
  abonos: 'debts', // Abonos go through debt route
  abonoDetails: 'abonos',
  recurringPayments: 'recurring',
  payrollGroups: 'payroll',
  savingsGoals: 'savings',
  savingsGoalAccounts: 'savings',
  savingsContributions: 'savings',
  cdts: 'cdts',
  yieldRecords: 'yield',
  vehicles: 'vehicles',
  fuelLogs: 'vehicles', // Fuel logs go through vehicle route
  maintenanceRecords: 'vehicles', // Maintenance goes through vehicle route
  fuelPrices: 'fuel-prices',
  medications: 'medications',
  appointments: 'appointments',
  pantryItems: 'pantry',
  shoppingLists: 'shopping-lists',
  shoppingListItems: 'shopping-lists',
  healthProfiles: 'health-profiles',
  userSettings: 'settings',
  sharedAccountUsers: 'accounts',
};

// ─── Helper: Check if IndexedDB has been populated ───

export async function isLocalDBPopulated(): Promise<boolean> {
  const count = await localDB.accounts.count();
  return count > 0;
}

// ─── Helper: Get/set sync metadata ───

export async function getSyncMeta(key: string): Promise<string | null> {
  const record = await localDB.syncMeta.get(key);
  return record?.value ?? null;
}

export async function setSyncMeta(key: string, value: string): Promise<void> {
  await localDB.syncMeta.put({ key, value, updatedAt: Date.now() });
}

// ─── Helper: Reverse map (table name → API endpoint) ───

export const TABLE_API_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(API_TABLE_MAP).map(([api, table]) => [table, api])
);

// ─── Helper: Get all records from a table for a specific user ───

export async function getAllFromTable<T>(tableName: string, userId: string): Promise<T[]> {
  try {
    const table = (localDB as any)[tableName] as Table<any, string> | undefined;
    if (!table) return [];
    return (await table.where("userId").equals(userId).toArray()) as T[];
  } catch {
    return [];
  }
}

// ─── Helper: Replace all data in a table for a user (full refresh from server) ───

export async function replaceAllInTable<T extends { id: string }>(
  tableName: string,
  userId: string,
  data: T[]
): Promise<void> {
  const table = (localDB as any)[tableName] as Table<any, string> | undefined;
  if (!table) return;

  await localDB.transaction("rw", table, async () => {
    await table.where("userId").equals(userId).delete();
    if (data.length > 0) {
      const enriched = data.map((record) => ({
        ...record,
        _syncStatus: "synced" as const,
        _version: 1,
        _lastModified: Date.now(),
      }));
      await table.bulkPut(enriched);
    }
  });
}

// ─── Helper: Check if initial sync has been completed for a user ───

export async function isInitialSyncDone(userId: string): Promise<boolean> {
  const value = await getSyncMeta("initialSyncDone");
  return value === userId;
}

// ─── Helper: Mark initial sync as done for a user ───

export async function setInitialSyncDone(userId: string): Promise<void> {
  await localDB.syncMeta.put({
    key: "initialSyncDone",
    value: userId,
    updatedAt: Date.now(),
  });
}

// ─── Helper: Get pending mutation count ───

export async function getPendingMutationCount(): Promise<number> {
  return await localDB.mutationQueue
    .where("status")
    .equals("pending")
    .count();
}

// ─── Helper: Clear all local data (for logout) ───

export async function clearLocalDB(): Promise<void> {
  await localDB.transaction('rw', localDB.tables, async () => {
    for (const table of localDB.tables) {
      await table.clear();
    }
  });
}
