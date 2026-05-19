-- CreateTable: payroll_groups (missing from original migration)
CREATE TABLE IF NOT EXISTS "payroll_groups" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT 'Sueldo',
    "frequency" TEXT NOT NULL,
    "totalAmount" REAL NOT NULL,
    "accountId" TEXT NOT NULL,
    "subAccountId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Sueldo',
    "subCategory" TEXT,
    "adjustToBusinessDay" BOOLEAN NOT NULL DEFAULT false,
    "businessDayDirection" TEXT NOT NULL DEFAULT 'before',
    "schedules" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "payroll_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "payroll_groups_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "payroll_groups_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "sub_accounts" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- AlterTable: recurring_payments — add payrollGroupId (missing from original migration)
-- SQLite doesn't support ADD COLUMN with FOREIGN KEY in ALTER TABLE,
-- so we add the column without the constraint and rely on Prisma's runtime validation.
ALTER TABLE "recurring_payments" ADD COLUMN "payrollGroupId" TEXT;

-- AlterTable: savings_goals — add destinationAccountId (missing from original migration)
ALTER TABLE "savings_goals" ADD COLUMN "destinationAccountId" TEXT;
