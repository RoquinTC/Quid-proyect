-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "avatar" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'checking',
    "color" TEXT NOT NULL DEFAULT '#10B981',
    "icon" TEXT,
    "balance" REAL NOT NULL DEFAULT 0,
    "isHighYield" BOOLEAN NOT NULL DEFAULT false,
    "yieldPercentage" REAL,
    "isShared" BOOLEAN NOT NULL DEFAULT false,
    "excludeFromAvailable" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sub_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'pocket',
    "balance" REAL NOT NULL DEFAULT 0,
    "isHighYield" BOOLEAN NOT NULL DEFAULT false,
    "yieldPercentage" REAL,
    "icon" TEXT,
    "color" TEXT,
    "excludeFromAvailable" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "sub_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shared_account_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'editor',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "shared_account_users_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "shared_account_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "yield_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT,
    "subAccountId" TEXT,
    "month" DATETIME NOT NULL,
    "projectedYield" REAL NOT NULL,
    "actualYield" REAL,
    "yieldPercentage" REAL NOT NULL,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "yield_records_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "yield_records_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "sub_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "accountId" TEXT,
    "subAccountId" TEXT,
    "type" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "subCategory" TEXT,
    "date" DATETIME NOT NULL,
    "sourceModule" TEXT,
    "sourceId" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "relatedTransactionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "transactions_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "sub_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "subCategory" TEXT,
    "amount" REAL NOT NULL,
    "spent" REAL NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL DEFAULT 'monthly',
    "lastResetDate" DATETIME,
    "icon" TEXT,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "budgets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "debts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#EF4444',
    "icon" TEXT,
    "bank" TEXT,
    "totalAmount" REAL NOT NULL,
    "currentBalance" REAL NOT NULL,
    "interestRate" REAL,
    "cutoffDate" INTEGER,
    "paymentDate" INTEGER,
    "monthlyPayment" REAL,
    "remainingPayments" INTEGER,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "debts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "installments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "debtId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "totalInstallments" INTEGER NOT NULL,
    "currentInstallment" INTEGER NOT NULL DEFAULT 1,
    "installmentAmount" REAL NOT NULL,
    "paidAmount" REAL NOT NULL DEFAULT 0,
    "purchaseDate" DATETIME NOT NULL,
    "nextPaymentDate" DATETIME NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "accountId" TEXT,
    "subAccountId" TEXT,
    "category" TEXT,
    "subCategory" TEXT,
    "recurringPaymentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "installments_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "recurring_payments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "actualAmount" REAL,
    "type" TEXT NOT NULL DEFAULT 'expense',
    "accountId" TEXT,
    "subAccountId" TEXT,
    "debtId" TEXT,
    "destinationAccountId" TEXT,
    "destinationSubAccountId" TEXT,
    "category" TEXT,
    "subCategory" TEXT,
    "scheduledDate" DATETIME NOT NULL,
    "confirmedDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "notes" TEXT,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "savingsGoalId" TEXT,
    "customDays" TEXT,
    "periodAmounts" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "recurring_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recurring_payments_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recurring_payments_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "sub_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recurring_payments_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "debts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recurring_payments_destinationAccountId_fkey" FOREIGN KEY ("destinationAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "recurring_payments_savingsGoalId_fkey" FOREIGN KEY ("savingsGoalId") REFERENCES "savings_goals" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "savings_goals" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetAmount" REAL NOT NULL,
    "currentAmount" REAL NOT NULL DEFAULT 0,
    "deadline" DATETIME,
    "icon" TEXT,
    "color" TEXT NOT NULL DEFAULT '#8B5CF6',
    "type" TEXT NOT NULL DEFAULT 'general',
    "aiSuggestion" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT NOT NULL DEFAULT 'mensual',
    "monthlyDay" INTEGER,
    "biweeklyDays" TEXT,
    "weeklyDay" INTEGER,
    "periodAmounts" TEXT,
    "sourceAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'activa',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "savings_goals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "savings_goals_sourceAccountId_fkey" FOREIGN KEY ("sourceAccountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "savings_goal_accounts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "subAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "savings_goal_accounts_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "savings_goals" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "savings_goal_accounts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "savings_goal_accounts_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "sub_accounts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "savings_contributions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalId" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT,
    "transactionId" TEXT,
    "accountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "savings_contributions_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "savings_goals" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "cdts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "effectiveRate" REAL NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "termDays" INTEGER NOT NULL,
    "interestEarned" REAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "goalId" TEXT,
    "accountId" TEXT,
    "withdrawnAmount" REAL,
    "withdrawnDate" DATETIME,
    "notes" TEXT,
    "color" TEXT NOT NULL DEFAULT '#14B8A6',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "cdts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "cdts_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "savings_goals" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "cdts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'motorcycle',
    "brand" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "color" TEXT,
    "tankCapacity" REAL,
    "fuelType" TEXT,
    "currentKm" REAL NOT NULL DEFAULT 0,
    "icon" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "vehicles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fuel_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "km" REAL NOT NULL,
    "amount" REAL NOT NULL,
    "pricePerGallon" REAL NOT NULL,
    "gallons" REAL NOT NULL,
    "isFullTank" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fuel_logs_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vehicleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cost" REAL NOT NULL,
    "km" REAL NOT NULL,
    "date" DATETIME NOT NULL,
    "nextDueKm" REAL,
    "nextDueDate" DATETIME,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "maintenance_records_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "medications" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'daily',
    "customSchedule" TEXT,
    "disease" TEXT,
    "howToTake" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "reminderTimes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "medications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "medical_appointments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "doctorName" TEXT,
    "specialty" TEXT,
    "location" TEXT,
    "date" DATETIME NOT NULL,
    "notes" TEXT,
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "medical_appointments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "pantry_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "expirationDate" DATETIME,
    "purchaseDate" DATETIME,
    "purchasePrice" REAL,
    "minStock" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "pantry_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Lista de Mercado',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "shopping_lists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shoppingListId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unit',
    "estimatedPrice" REAL,
    "actualPrice" REAL,
    "isPurchased" BOOLEAN NOT NULL DEFAULT false,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "pantryItemId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "shopping_list_items_shoppingListId_fkey" FOREIGN KEY ("shoppingListId") REFERENCES "shopping_lists" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "health_profiles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'owner',
    "diseases" TEXT,
    "restrictions" TEXT,
    "aiRestrictions" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "health_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "fuel_prices" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL DEFAULT 'gasoline',
    "pricePerGallon" REAL NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "user_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "budgetCutoffDay" INTEGER NOT NULL DEFAULT 1,
    "respectHolidays" BOOLEAN NOT NULL DEFAULT true,
    "countryCode" TEXT NOT NULL DEFAULT 'CO',
    "lastBudgetReset" DATETIME,
    "notificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "user_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "shared_account_users_accountId_userId_key" ON "shared_account_users"("accountId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "savings_goal_accounts_goalId_accountId_subAccountId_key" ON "savings_goal_accounts"("goalId", "accountId", "subAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "user_settings_userId_key" ON "user_settings"("userId");
