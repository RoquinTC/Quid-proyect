import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { getCurrentBudgetPeriod } from "@/lib/holidays";
import { syncSavingsBudget } from "@/lib/savings-budget-sync";

/**
 * Helper: find the best matching budget for a given category/subCategory/type.
 * 1. First try: category + subCategory + type (specific)
 * 2. Fallback: category + subCategory=null + type (parent)
 */
async function findMatchingBudget(
  userId: string,
  category: string,
  subCategory: string | null,
  type: string
) {
  if (subCategory) {
    const specific = await db.budget.findFirst({
      where: { userId, category, subCategory, type },
    });
    if (specific) return specific;
  }
  return db.budget.findFirst({
    where: { userId, category, subCategory: null, type },
  });
}

/**
 * POST /api/budgets/recalculate
 *
 * Recalculates budget spent amounts from the ground truth:
 * - For "Ahorros" category: syncs from savings goals (linked accounts + CDTs)
 * - For other categories: sums TWO sources:
 *   1. Direct expense/income transactions from accounts (within budget period)
 *   2. Credit card installments with purchases in the current billing cycle
 *      (these represent committed spending even if the CC hasn't been paid yet)
 *
 * Uses the user's budgetCutoffDay setting to determine the period boundaries.
 * Excludes "transfer" type transactions (CC payments are transfers, not new expenses).
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's budget cutoff day setting
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });
    const cutoffDay = settings?.budgetCutoffDay || 1;
    const respectHolidays = settings?.respectHolidays ?? true;

    // Calculate current budget period using the user's cutoff day
    const { start: periodStart, end: periodEnd } = getCurrentBudgetPeriod(
      cutoffDay,
      respectHolidays,
      getColombiaNow()
    );

    console.log(`[Recalculate] Period: ${periodStart.toISOString()} to ${periodEnd.toISOString()} (cutoff day: ${cutoffDay})`);

    // Get all budgets
    const budgets = await db.budget.findMany({
      where: { userId },
    });

    // Separate Ahorros budgets from regular budgets
    const regularBudgets = budgets.filter((b) => b.category !== "Ahorros");

    // 1. Recalculate Ahorros from savings goals
    await syncSavingsBudget(userId);

    // 2. Recalculate regular budgets
    for (const budget of regularBudgets) {
      let totalSpent = 0;

      // Source A: Direct transactions (expense or income) from accounts
      // Exclude "transfer" type — CC payments are transfers, not new expenses
      const txWhereClause: Record<string, unknown> = {
        userId,
        date: { gte: periodStart, lte: periodEnd },
        type: budget.type, // "expense" or "income"
        category: budget.category,
        // Exclude transfer-type transactions (CC payments)
        sourceModule: { not: "finance_transfer" },
      };

      if (budget.subCategory) {
        txWhereClause.subCategory = budget.subCategory;
      }
      // For parent budgets (no subCategory): sum ALL transactions in that category

      const transactions = await db.transaction.findMany({
        where: txWhereClause,
        select: { amount: true, type: true },
      });

      // Only count non-transfer transactions
      for (const tx of transactions) {
        if (tx.type !== "transfer") {
          totalSpent += tx.amount;
        }
      }

      // Source B: Credit card installments with purchaseDate in the current period
      // These represent spending committed via TC — the money is already "spent" at
      // purchase time regardless of whether the CC bill has been paid.
      // We include BOTH paid and unpaid CC installments because:
      //   - CC payments create "transfer" transactions (not expenses), so Source A
      //     never counts CC purchases — Source B is the only source for CC spending.
      //   - Loans are excluded because their payment creates "expense" transactions
      //     that are already counted by Source A.
      if (budget.type === "expense") {
        const installmentWhereClause: Record<string, unknown> = {
          purchaseDate: { gte: periodStart, lte: periodEnd },
          category: budget.category,
          // Include BOTH paid and unpaid CC installments
          // Exclude loan installments (their expense transactions are counted in Source A)
          debt: { type: { not: "loan" } },
        };

        if (budget.subCategory) {
          installmentWhereClause.subCategory = budget.subCategory;
        }

        const installments = await db.installment.findMany({
          where: installmentWhereClause,
          select: { installmentAmount: true },
        });

        for (const inst of installments) {
          totalSpent += inst.installmentAmount;
        }
      }

      await db.budget.update({
        where: { id: budget.id },
        data: { spent: totalSpent },
      });

      console.log(`[Recalculate] ${budget.category}${budget.subCategory ? `/${budget.subCategory}` : ""}: ${budget.spent} → ${totalSpent}`);
    }

    // Return updated budgets
    const updatedBudgets = await db.budget.findMany({
      where: { userId },
      orderBy: [{ type: "asc" }, { category: "asc" }],
    });

    return NextResponse.json(updatedBudgets);
  } catch (error) {
    console.error("Recalculate budgets error:", error);
    return NextResponse.json({ error: "Error al recalcular presupuestos" }, { status: 500 });
  }
}
