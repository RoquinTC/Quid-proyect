// ─── Finance Entity Types ───
// These types represent what the JSON API returns:
//   - Money fields are `number` (Prisma Decimal → number after JSON serialization)
//   - Date fields are `string` (Prisma DateTime → ISO string after JSON serialization)
//   - Relations are embedded objects/arrays where the API includes them

// ─── Shared Account Info ───

export interface SharedAccountUser {
  id: string;
  role: string;
  user: { id?: string; name: string; email: string };
}

// ─── SubAccount ───

export interface SubAccount {
  id: string;
  name: string;
  type: string;
  balance: number;
  isHighYield: boolean;
  yieldPercentage?: number | null;
  color?: string | null;
  icon?: string | null;
  excludeFromAvailable?: boolean;
  order?: number;
}

// ─── Account ───

export interface Account {
  id: string;
  name: string;
  type: string;
  color: string;
  icon?: string | null;
  balance: number;
  isHighYield: boolean;
  yieldPercentage?: number | null;
  isShared: boolean;
  excludeFromAvailable?: boolean;
  subAccounts: SubAccount[];
  sharedUsers: SharedAccountUser[];
  // Shared account fields
  isSharedWithMe?: boolean;
  myRole?: 'admin' | 'editor' | 'viewer';
  ownerName?: string | null;
  // Populated in some views (account-detail)
  transactions?: Transaction[];
  yieldHistory?: YieldRecord[];
  recurringPayments?: RecurringPayment[];
  order?: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Transaction ───

export interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  category?: string | null;
  subCategory?: string | null;
  date: string;
  accountId?: string | null;
  subAccountId?: string | null;
  notes?: string | null;
  isRecurring?: boolean;
  sourceModule?: string | null;
  sourceId?: string | null;
  relatedTransactionId?: string | null;
  excludeFromBudget?: boolean | null;
  // Denormalized relation objects from API
  account?: { id: string; name: string; color: string } | null;
  subAccount?: { id: string; name: string; color?: string | null } | null;
  transferToAccount?: { id: string; name: string; color: string } | null;
  transferFromAccount?: { id: string; name: string; color: string } | null;
  isTransferCounterpart?: boolean;
  // Creator info for shared accounts
  user?: { id: string; name: string } | null;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Budget ───

export interface Budget {
  id: string;
  type: string;
  category: string;
  subCategory?: string | null;
  amount: number;
  spent: number;
  period: string;
  lastResetDate?: string | null;
  icon?: string | null;
  color?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Debt ───

export interface Debt {
  id: string;
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
  // Embedded relations from API
  installments: Installment[];
  abonos?: Abono[];
  createdAt?: string;
  updatedAt?: string;
}

// ─── Installment ───

export interface Installment {
  id: string;
  description: string;
  totalAmount: number;
  totalInstallments: number;
  currentInstallment: number;
  installmentAmount: number;
  paidAmount: number;
  interestRate?: number | null;
  interestAmount?: number | null;
  otherChargesAmount?: number | null;
  remainingBalance?: number | null;
  purchaseDate: string;
  nextPaymentDate: string;
  isPaid: boolean;
  accountId?: string | null;
  subAccountId?: string | null;
  category?: string | null;
  subCategory?: string | null;
  recurringPaymentId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Abono ───

export interface AbonoDetail {
  id: string;
  installmentId: string;
  amount: number;
  previousBalance: number;
  newBalance: number;
}

export interface Abono {
  id: string;
  debtId: string;
  transactionId?: string | null;
  totalAmount: number;
  accountId: string;
  subAccountId?: string | null;
  date: string;
  isReversed: boolean;
  createdAt: string;
  details: AbonoDetail[];
}

// ─── RecurringPayment ───

export interface RecurringPayment {
  id: string;
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
  // Embedded relations from API
  account?: { id: string; name: string; color: string } | null;
  destinationAccount?: { id: string; name: string; color: string } | null;
  debt?: { id: string; name: string; type: string; color: string } | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─── PayrollGroup ───

export interface PayrollGroup {
  id: string;
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
  createdAt?: string;
  updatedAt?: string;
  // Nested relations (included when API expands them)
  account?: { id: string; name: string; color: string } | null;
  subAccount?: { id: string; name: string } | null;
  recurringPayments?: Array<{ id: string; scheduledDate: string; status: string }>;
}

// ─── SavingsGoal ───

export interface SavingsGoal {
  id: string;
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
  frequency?: string;
  monthlyDay?: number | null;
  biweeklyDays?: string | null;
  weeklyDay?: number | null;
  periodAmounts?: string | null;
  sourceAccountId?: string | null;
  destinationAccountId?: string | null;
  status?: string;
  // Embedded relations from API
  sourceAccount?: { id: string; name: string; type: string } | null;
  destinationAccount?: { id: string; name: string; type: string } | null;
  contributions?: SavingsContribution[];
  linkedAccounts?: SavingsGoalAccount[];
  cdts?: CDT[];
  createdAt?: string;
  updatedAt?: string;
}

// ─── SavingsContribution ───

export interface SavingsContribution {
  id: string;
  amount: number;
  date: string;
  description?: string | null;
  transactionId?: string | null;
  accountId?: string | null;
}

// ─── SavingsGoalAccount ───

export interface SavingsGoalAccount {
  id: string;
  goalId: string;
  accountId: string;
  subAccountId?: string | null;
  account: {
    id: string;
    name: string;
    type: string;
    color: string;
    balance: number;
    subAccounts: SubAccount[];
  };
  subAccount?: {
    id: string;
    name: string;
    balance: number;
    color: string;
  } | null;
}

// ─── CDT ───

export interface CDTGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
}

export interface CDTAccount {
  id: string;
  name: string;
  type: string;
  color: string;
  balance?: number;
  subAccounts?: SubAccount[];
}

export interface CDT {
  id: string;
  bank: string;
  amount: number;
  effectiveRate: number;
  startDate: string;
  endDate: string;
  termDays: number;
  interestEarned?: number;
  status: string;
  goalId?: string | null;
  accountId?: string | null;
  withdrawnAmount?: number | null;
  withdrawnDate?: string | null;
  notes?: string | null;
  color: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── YieldRecord ───

export interface YieldRecord {
  id: string;
  accountId?: string | null;
  subAccountId?: string | null;
  month: string;
  projectedYield: number;
  actualYield?: number | null;
  yieldPercentage: number;
  isConfirmed: boolean;
  transactionId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Category (for forms) ───

export interface CategoryData {
  name: string;
  subcategories: string[];
}

export interface CategoriesByType {
  income: CategoryData[];
  expense: CategoryData[];
}

// ─── Monthly Summary (API response) ───

export interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
  balance: number;
}

export interface MonthlySummaryResponse {
  historical: MonthlyData[];
  projection: MonthlyData[];
  averages: {
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlySavings: number;
  };
}

// ─── Custom Category ───

export interface CustomCategory {
  id: string;
  userId: string;
  type: string; // income, expense
  name: string;
  icon?: string | null;
  color?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─── User Settings ───

export interface UserSettings {
  id?: string;
  theme: string;
  budgetCutoffDay: number;
  respectHolidays: boolean;
  countryCode: string;
  lastBudgetReset?: string | null;
  notificationsEnabled: boolean;
  pinEnabled: boolean;
  pinHash?: string | null;
  biometricEnabled: boolean;
  lockOnResume: boolean;
}

// ─── Security Types ───

export interface AuthCredentialInfo {
  id: string;
  name?: string | null;
  deviceType?: string | null;
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface SecurityStatus {
  pinEnabled: boolean;
  biometricEnabled: boolean;
  lockOnResume: boolean;
  hasCredentials: boolean;
  credentials: AuthCredentialInfo[];
}
