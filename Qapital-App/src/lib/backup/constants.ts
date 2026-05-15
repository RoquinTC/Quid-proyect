/**
 * Backup System Constants & Types
 *
 * The backup system allows users to export ALL their data as a single JSON file
 * and restore it later — even on a fresh database (e.g., deploying to Oracle Cloud).
 *
 * KEY DESIGN DECISIONS:
 * - Schema versioning: Each backup includes a version number so future schema
 *   changes can be handled by migration adapters.
 * - ID remapping: When restoring, ALL record IDs are regenerated (new CUIDs)
 *   and all foreign key references are updated accordingly. This prevents
 *   conflicts when restoring on a different database.
 * - Transfer pairs: The `relatedTransactionId` field linking transfer pairs
 *   is correctly mapped during restore.
 * - Full replace: Import does a complete replacement (delete all existing user
 *   data first, then create from backup). This guarantees data consistency.
 */

/** Current backup schema version — increment when Prisma schema changes */
export const BACKUP_SCHEMA_VERSION = 1;

/** Magic string to verify a file is a valid Quid backup */
export const BACKUP_MAGIC = "quid-backup";

/**
 * Complete backup data structure.
 * This is what gets exported/imported as a JSON file.
 */
export interface BackupData {
  /** Magic identifier to verify file type */
  magic: typeof BACKUP_MAGIC;
  /** Schema version for migration support */
  version: number;
  /** ISO timestamp of when the backup was created */
  exportDate: string;
  /** Email of the user who created the backup (for verification) */
  userEmail: string;
  /** Name of the user */
  userName: string;
  /** Currency preference */
  currency: string;

  // ── User Settings ──
  userSettings: BackupUserSettings | null;

  // ── Finance: Accounts ──
  accounts: BackupAccount[];
  subAccounts: BackupSubAccount[];
  sharedAccountUsers: BackupSharedAccountUser[];
  yieldRecords: BackupYieldRecord[];

  // ── Finance: Transactions ──
  transactions: BackupTransaction[];

  // ── Finance: Budgets ──
  budgets: BackupBudget[];
  categories: BackupCategory[];

  // ── Finance: Debts ──
  debts: BackupDebt[];
  installments: BackupInstallment[];
  abonos: BackupAbono[];
  abonoDetails: BackupAbonoDetail[];

  // ── Finance: Recurring ──
  recurringPayments: BackupRecurringPayment[];
  payrollGroups: BackupPayrollGroup[];

  // ── Finance: Savings ──
  savingsGoals: BackupSavingsGoal[];
  savingsGoalAccounts: BackupSavingsGoalAccount[];
  savingsContributions: BackupSavingsContribution[];

  // ── Finance: CDT ──
  cdts: BackupCDT[];

  // ── Transport ──
  vehicles: BackupVehicle[];
  fuelLogs: BackupFuelLog[];
  maintenanceRecords: BackupMaintenanceRecord[];
  fuelPrices: BackupFuelPrice[];

  // ── Health ──
  medications: BackupMedication[];
  appointments: BackupAppointment[];

  // ── Pantry ──
  pantryItems: BackupPantryItem[];
  shoppingLists: BackupShoppingList[];
  shoppingListItems: BackupShoppingListItem[];
  healthProfiles: BackupHealthProfile[];
}

// ── Type definitions for each backup model ──
// These mirror the Prisma models but with Decimal fields as numbers
// and Date fields as ISO strings (for JSON serialization).

export interface BackupUserSettings {
  theme: string;
  budgetCutoffDay: number;
  respectHolidays: boolean;
  countryCode: string;
  notificationsEnabled: boolean;
  lastBudgetReset: string | null;
}

export interface BackupAccount {
  id: string;
  name: string;
  type: string;
  color: string;
  icon: string | null;
  balance: number;
  isHighYield: boolean;
  yieldPercentage: number | null;
  isShared: boolean;
  excludeFromAvailable: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSubAccount {
  id: string;
  accountId: string;
  name: string;
  type: string;
  balance: number;
  isHighYield: boolean;
  yieldPercentage: number | null;
  icon: string | null;
  color: string | null;
  excludeFromAvailable: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSharedAccountUser {
  id: string;
  accountId: string;
  userId: string;
  role: string;
  createdAt: string;
}

export interface BackupYieldRecord {
  id: string;
  accountId: string | null;
  subAccountId: string | null;
  month: string;
  projectedYield: number;
  actualYield: number | null;
  yieldPercentage: number;
  isConfirmed: boolean;
  transactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupTransaction {
  id: string;
  accountId: string | null;
  subAccountId: string | null;
  type: string;
  amount: number;
  description: string;
  category: string | null;
  subCategory: string | null;
  date: string;
  sourceModule: string | null;
  sourceId: string | null;
  isRecurring: boolean;
  notes: string | null;
  relatedTransactionId: string | null;
  excludeFromBudget: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupBudget {
  id: string;
  type: string;
  category: string;
  subCategory: string | null;
  amount: number;
  spent: number;
  period: string;
  lastResetDate: string | null;
  icon: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupCategory {
  id: string;
  type: string;
  name: string;
  icon: string | null;
  color: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupDebt {
  id: string;
  type: string;
  name: string;
  color: string;
  icon: string | null;
  bank: string | null;
  totalAmount: number;
  currentBalance: number;
  interestRate: number | null;
  cutoffDate: number | null;
  paymentDate: number | null;
  monthlyPayment: number | null;
  remainingPayments: number | null;
  startDate: string | null;
  endDate: string | null;
  paymentType: string | null;
  otherCharges: number | null;
  category: string | null;
  subCategory: string | null;
  accountId: string | null;
  subAccountId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupInstallment {
  id: string;
  debtId: string;
  description: string;
  totalAmount: number;
  totalInstallments: number;
  currentInstallment: number;
  installmentAmount: number;
  paidAmount: number;
  interestRate: number | null;
  interestAmount: number | null;
  otherChargesAmount: number | null;
  remainingBalance: number | null;
  purchaseDate: string;
  nextPaymentDate: string;
  isPaid: boolean;
  accountId: string | null;
  subAccountId: string | null;
  category: string | null;
  subCategory: string | null;
  recurringPaymentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupAbono {
  id: string;
  debtId: string;
  transactionId: string | null;
  totalAmount: number;
  accountId: string;
  subAccountId: string | null;
  date: string;
  isReversed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupAbonoDetail {
  id: string;
  abonoId: string;
  installmentId: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
}

export interface BackupRecurringPayment {
  id: string;
  description: string;
  amount: number;
  actualAmount: number | null;
  type: string;
  accountId: string | null;
  subAccountId: string | null;
  debtId: string | null;
  destinationAccountId: string | null;
  destinationSubAccountId: string | null;
  category: string | null;
  subCategory: string | null;
  scheduledDate: string;
  confirmedDate: string | null;
  status: string;
  frequency: string;
  notes: string | null;
  isRecurring: boolean;
  savingsGoalId: string | null;
  customDays: string | null;
  periodAmounts: string | null;
  payrollGroupId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupPayrollGroup {
  id: string;
  description: string;
  frequency: string;
  totalAmount: number;
  accountId: string;
  subAccountId: string | null;
  category: string;
  subCategory: string | null;
  adjustToBusinessDay: boolean;
  businessDayDirection: string;
  schedules: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSavingsGoal {
  id: string;
  name: string;
  description: string | null;
  targetAmount: number;
  currentAmount: number;
  deadline: string | null;
  icon: string | null;
  color: string;
  type: string;
  aiSuggestion: string | null;
  isActive: boolean;
  frequency: string;
  monthlyDay: number | null;
  biweeklyDays: string | null;
  weeklyDay: number | null;
  periodAmounts: string | null;
  sourceAccountId: string | null;
  destinationAccountId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupSavingsGoalAccount {
  id: string;
  goalId: string;
  accountId: string;
  subAccountId: string | null;
  createdAt: string;
}

export interface BackupSavingsContribution {
  id: string;
  goalId: string;
  amount: number;
  date: string;
  description: string | null;
  transactionId: string | null;
  accountId: string | null;
  createdAt: string;
}

export interface BackupCDT {
  id: string;
  bank: string;
  amount: number;
  effectiveRate: number;
  startDate: string;
  endDate: string;
  termDays: number;
  interestEarned: number;
  status: string;
  goalId: string | null;
  accountId: string | null;
  withdrawnAmount: number | null;
  withdrawnDate: string | null;
  notes: string | null;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupVehicle {
  id: string;
  name: string;
  type: string;
  brand: string | null;
  model: string | null;
  year: number | null;
  color: string | null;
  tankCapacity: number | null;
  fuelType: string | null;
  currentKm: number;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupFuelLog {
  id: string;
  vehicleId: string;
  date: string;
  km: number;
  amount: number;
  pricePerGallon: number;
  gallons: number;
  isFullTank: boolean;
  notes: string | null;
  createdAt: string;
}

export interface BackupMaintenanceRecord {
  id: string;
  vehicleId: string;
  type: string;
  description: string;
  cost: number;
  km: number;
  date: string;
  nextDueKm: number | null;
  nextDueDate: string | null;
  reminderEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BackupFuelPrice {
  id: string;
  fuelType: string;
  pricePerGallon: number;
  createdAt: string;
  updatedAt: string;
}

export interface BackupMedication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  customSchedule: string | null;
  disease: string | null;
  howToTake: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  reminderEnabled: boolean;
  reminderTimes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupAppointment {
  id: string;
  doctorName: string | null;
  specialty: string | null;
  location: string | null;
  date: string;
  notes: string | null;
  reminderEnabled: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupPantryItem {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unit: string;
  expirationDate: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  minStock: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupShoppingList {
  id: string;
  name: string;
  status: string;
  profileId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupShoppingListItem {
  id: string;
  shoppingListId: string;
  name: string;
  quantity: number;
  unit: string;
  estimatedPrice: number | null;
  actualPrice: number | null;
  isPurchased: boolean;
  checked: boolean;
  pantryItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BackupHealthProfile {
  id: string;
  name: string;
  type: string;
  diseases: string | null;
  restrictions: string | null;
  aiRestrictions: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Result of a backup import operation.
 */
export interface ImportResult {
  success: boolean;
  error?: string;
  stats?: {
    accounts: number;
    subAccounts: number;
    transactions: number;
    budgets: number;
    categories: number;
    debts: number;
    installments: number;
    abonos: number;
    abonoDetails: number;
    recurringPayments: number;
    payrollGroups: number;
    savingsGoals: number;
    savingsGoalAccounts: number;
    savingsContributions: number;
    cdts: number;
    yieldRecords: number;
    sharedAccountUsers: number;
    vehicles: number;
    fuelLogs: number;
    maintenanceRecords: number;
    fuelPrices: number;
    medications: number;
    appointments: number;
    pantryItems: number;
    shoppingLists: number;
    shoppingListItems: number;
    healthProfiles: number;
    userSettings: number;
  };
}
