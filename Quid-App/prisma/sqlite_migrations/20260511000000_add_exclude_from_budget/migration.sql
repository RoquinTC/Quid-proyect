-- AlterTable
ALTER TABLE `transactions` ADD COLUMN `excludeFromBudget` BOOLEAN NOT NULL DEFAULT false;
