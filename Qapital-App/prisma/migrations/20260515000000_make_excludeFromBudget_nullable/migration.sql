-- Make excludeFromBudget nullable to match actual data (SQLite migration may leave NULLs)
-- This changes the column from NOT NULL DEFAULT false to nullable with DEFAULT false
-- SQLite doesn't support ALTER COLUMN, so we recreate the table

-- Step 1: Create new table with nullable column
CREATE TABLE "transactions_new" (
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
    "excludeFromBudget" BOOLEAN DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    FOREIGN KEY ("subAccountId") REFERENCES "sub_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- Step 2: Copy data (NULL values stay NULL, false values stay false)
INSERT INTO "transactions_new" SELECT * FROM "transactions";

-- Step 3: Drop old table
DROP TABLE "transactions";

-- Step 4: Rename new table
ALTER TABLE "transactions_new" RENAME TO "transactions";

-- Step 5: Recreate indexes
CREATE INDEX "transactions_userId_idx" ON "transactions"("userId");
CREATE INDEX "transactions_accountId_idx" ON "transactions"("accountId");
CREATE INDEX "transactions_date_idx" ON "transactions"("date");
