/**
 * Savings Budget Sync Utility
 * 
 * Keeps the "Ahorros" budget category in sync with savings goals.
 * Whenever a savings goal is created, updated, deleted, contributed to,
 * or has accounts linked/unlinked, this function recalculates:
 * 
 * - Each goal's `currentAmount` = manual contributions + linked account/subaccount balances + CDT invested amounts
 * - Budget `amount` = sum of all active savings goals' targetAmount
 * - Budget `spent` = sum of all active savings goals' currentAmount
 * 
 * This ensures the budget progress bar accurately reflects savings progress.
 */

import { db } from "./db";
import { toNumber } from "./decimal-serializer";

export async function syncSavingsBudget(userId: string): Promise<void> {
  try {
    // First, recalculate currentAmount for each active goal based on linked accounts + CDTs + contributions
    const activeGoals = await db.savingsGoal.findMany({
      where: { userId, isActive: true },
      include: {
        linkedAccounts: {
          include: {
            account: { select: { balance: true } },
            subAccount: { select: { balance: true } },
          },
        },
        cdts: { select: { amount: true, status: true } },
        contributions: { select: { amount: true, description: true, accountId: true } },
      },
    });

    for (const goal of activeGoals) {
      // Calculate current from linked accounts (live balances)
      // Use toNumber() for safe Decimal→number conversion (avoids string concatenation)
      let linkedBalance = 0;
      for (const link of goal.linkedAccounts) {
        if (link.subAccount) {
          linkedBalance += toNumber(link.subAccount.balance);
        } else if (link.account) {
          linkedBalance += toNumber(link.account.balance);
        }
      }

      // Calculate current from CDTs (only active/matured - not withdrawn)
      let cdtBalance = 0;
      for (const cdt of goal.cdts) {
        if (cdt.status !== "withdrawn") {
          cdtBalance += toNumber(cdt.amount);
        }
      }

      // Calculate manual contributions (those NOT from account linking snapshots)
      // "Saldo cuenta vinculada" contributions are snapshot values from when accounts were linked.
      // We use live balances instead to always reflect the current state,
      // so we exclude these snapshot contributions to avoid double-counting.
      //
      // Also exclude contributions that have an accountId matching a linked account/subAccount,
      // because those are already reflected in the live linkedBalance (the account was debited,
      // so linkedBalance already decreased by that amount — counting them in manualContributions
      // would cancel out the linkedBalance change and show no progress).
      const linkedAccountIds = new Set(
        goal.linkedAccounts.map(l => l.accountId)
      );
      const linkedSubAccountIds = new Set(
        goal.linkedAccounts.filter(l => l.subAccountId).map(l => l.subAccountId!)
      );

      let manualContributions = 0;
      for (const contrib of goal.contributions) {
        // Skip snapshot contributions from when accounts were linked
        if (contrib.description === 'Saldo cuenta vinculada') continue;
        // Skip contributions that were debited from a linked account
        // (their effect is already in linkedBalance via the account's live balance)
        if (contrib.accountId && (
          linkedAccountIds.has(contrib.accountId) || linkedSubAccountIds.has(contrib.accountId)
        )) continue;
        manualContributions += toNumber(contrib.amount);
      }

      // Final calculation: manual contributions + live linked balances + CDT amounts
      // This avoids double-counting: we use live balances for linked accounts
      // (not snapshots) and only add manual contributions that aren't linked-account snapshots.
      const newCurrentAmount = manualContributions + linkedBalance + cdtBalance;

      // Only update if there's a meaningful difference to avoid unnecessary writes
      if (Math.abs(toNumber(goal.currentAmount) - newCurrentAmount) > 0.01) {
        await db.savingsGoal.update({
          where: { id: goal.id },
          data: { currentAmount: newCurrentAmount },
        });
        console.log(`[SavingsBudgetSync] Updated goal "${goal.name}": ${goal.currentAmount} → ${newCurrentAmount} (manual=${manualContributions}, linked=${linkedBalance}, cdt=${cdtBalance})`);
      }
    }

    // Calculate totals from all active savings goals (after updating currentAmount)
    const goals = await db.savingsGoal.findMany({
      where: { userId, isActive: true },
      select: { targetAmount: true, currentAmount: true },
    });

    const totalTarget = goals.reduce((sum, g) => sum + toNumber(g.targetAmount), 0);
    const totalCurrent = goals.reduce((sum, g) => sum + toNumber(g.currentAmount), 0);

    // Find or create the "Ahorros" parent budget category (expense type)
    let parentBudget = await db.budget.findFirst({
      where: {
        userId,
        category: "Ahorros",
        subCategory: null,
        type: "expense",
      },
    });

    if (parentBudget) {
      // Update existing parent budget — set to 0 since children hold the actual amounts.
      // The parent is just a grouping container; individual goals are subcategories.
      // This prevents double-counting when the display adds parent + children.
      await db.budget.update({
        where: { id: parentBudget.id },
        data: {
          amount: 0,
          spent: 0,
        },
      });
    } else if (goals.length > 0) {
      // Create parent budget only if there are active goals
      // Parent has 0 amounts — it's just a container for the subcategories
      await db.budget.create({
        data: {
          userId,
          category: "Ahorros",
          subCategory: null,
          type: "expense",
          amount: 0,
          spent: 0,
          period: "monthly",
        },
      });
    }

    // Also sync individual goal subcategories
    const updatedGoals = await db.savingsGoal.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, targetAmount: true, currentAmount: true },
    });

    for (const goal of updatedGoals) {
      const subCategory = goal.name;

      let subBudget = await db.budget.findFirst({
        where: {
          userId,
          category: "Ahorros",
          subCategory,
          type: "expense",
        },
      });

      if (subBudget) {
        await db.budget.update({
          where: { id: subBudget.id },
          data: {
            amount: toNumber(goal.targetAmount),
            spent: toNumber(goal.currentAmount),
          },
        });
      } else {
        await db.budget.create({
          data: {
            userId,
            category: "Ahorros",
            subCategory,
            type: "expense",
            amount: toNumber(goal.targetAmount),
            spent: toNumber(goal.currentAmount),
            period: "monthly",
          },
        });
      }
    }

    // Remove subcategory budgets for goals that no longer exist or are inactive
    const activeGoalNames = updatedGoals.map((g) => g.name);
    const orphanedBudgets = await db.budget.findMany({
      where: {
        userId,
        category: "Ahorros",
        subCategory: { not: null },
        type: "expense",
      },
    });

    for (const budget of orphanedBudgets) {
      if (!activeGoalNames.includes(budget.subCategory!)) {
        await db.budget.delete({ where: { id: budget.id } });
      }
    }

    console.log(`[SavingsBudgetSync] Synced for user ${userId}: ${goals.length} goals, totalTarget=${totalTarget}, totalCurrent=${totalCurrent}`);
  } catch (error) {
    console.error("[SavingsBudgetSync] Error syncing savings budget:", error);
    // Don't throw - we don't want budget sync failures to break savings operations
  }
}
