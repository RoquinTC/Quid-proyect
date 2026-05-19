// ─── Central Type Exports ───
// Import from @/lib/types to use any shared type

// Finance
export type {
  Account,
  SubAccount,
  SharedAccountUser,
  Transaction,
  Budget,
  Debt,
  Installment,
  Abono,
  AbonoDetail,
  RecurringPayment,
  PayrollGroup,
  SavingsGoal,
  SavingsContribution,
  SavingsGoalAccount,
  CDTGoal,
  CDTAccount,
  CDT,
  YieldRecord,
  CategoryData,
  CategoriesByType,
  CustomCategory,
  MonthlyData,
  MonthlySummaryResponse,
  UserSettings,
  AuthCredentialInfo,
  SecurityStatus,
} from './finance';

// Transport
export type {
  Vehicle,
  FuelLog,
  MaintenanceRecord,
  FuelLevelData,
  FuelPrice,
} from './transport';

// Health
export type {
  Medication,
  MedicalAppointment,
  ScheduleItem,
} from './health';

// Pantry
export type {
  PantryItem,
  ShoppingList,
  ShoppingListItem,
  HealthProfile,
  Ingredient,
  Recipe,
  FoodRestriction,
} from './pantry';

// Sync
export type {
  SyncStatus,
  SyncMeta,
  MutationOperation,
  MutationQueueEntry,
  SyncMetaRecord,
} from './sync';
