import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { getCurrentBudgetPeriod } from "@/lib/holidays";
import { syncSavingsBudget } from "@/lib/savings-budget-sync";
import { toNumber } from "@/lib/decimal-serializer";
import { createAndPushNotification } from "@/lib/push";

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

    // Consistent date range: same end boundary for both transactions and installments
    const periodEndPlus = new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000);

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

      // ── Source A: Direct transactions (expense or income) from accounts ──
      // Exclude "transfer" type — CC payments are transfers, not new expenses
      //
      // IMPORTANT: We use AND with OR sub-conditions instead of top-level
      // `sourceModule: { not: "finance_transfer" }` because Prisma's `{ not: }`
      // generates SQL `<>` which EXCLUDES NULL rows (NULL <> value → NULL → falsy).
      // Manual transactions have sourceModule=NULL, so they would be silently dropped.
      const txWhereClause: Record<string, unknown> = {
        userId,
        date: { gte: periodStart, lt: periodEndPlus },
        type: budget.type, // "expense" or "income"
        relatedTransactionId: null, // Exclude transfer counterpart incomes (not real income)
        AND: [
          // Include sourceModule=NULL (manual) and anything that isn't "finance_transfer"
          {
            OR: [
              { sourceModule: null },
              { sourceModule: { not: "finance_transfer" } },
            ],
          },
          // Include excludeFromBudget=false or NULL (exclude only explicitly-true)
          {
            OR: [
              { excludeFromBudget: false },
              { excludeFromBudget: { equals: null } },
            ],
          },
        ],
      };

      if (budget.subCategory) {
        // Match transactions that have the exact subCategory OR have no subCategory
        // (parent-level transactions belong to all sub-budgets of that category)
        (txWhereClause.AND as unknown[]).push({
          OR: [
            { category: budget.category, subCategory: budget.subCategory },
            { category: budget.category, subCategory: null },
          ],
        });
      } else {
        // For parent budgets (no subCategory): sum ALL transactions in that category
        // regardless of their subCategory
        txWhereClause.category = budget.category;
      }

      const transactions = await db.transaction.findMany({
        where: txWhereClause,
        select: { amount: true, type: true, id: true, description: true, category: true, subCategory: true, date: true },
      });

      // Only count non-transfer transactions
      for (const tx of transactions) {
        if (tx.type !== "transfer") {
          totalSpent += toNumber(tx.amount);
        }
      }

      console.log(`[Recalculate] ${budget.type}:${budget.category}${budget.subCategory ? `/${budget.subCategory}` : ""} — Source A (transactions): ${transactions.length} txs, total: ${transactions.reduce((s, t) => s + (t.type !== "transfer" ? toNumber(t.amount) : 0), 0)}`);

      // ── Source B: Credit card installments with purchaseDate in the current period ──
      // These represent spending committed via TC — the money is already "spent" at
      // purchase time regardless of whether the CC bill has been paid.
      // We include BOTH paid and unpaid CC installments because:
      //   - CC payments create "transfer" transactions (not expenses), so Source A
      //     never counts CC purchases — Source B is the only source for CC spending.
      //   - Loans are excluded because their payment creates "expense" transactions
      //     that are already counted by Source A.
      //   - CRITICAL: Must filter by userId via the debt relation to only count
      //     this user's CC installments.
      if (budget.type === "expense") {
        const installmentWhereClause: Record<string, unknown> = {
          purchaseDate: { gte: periodStart, lte: periodEnd },
          // Include BOTH paid and unpaid CC installments
          // Exclude loan installments (their expense transactions are counted in Source A)
          // CRITICAL FIX: Include userId in debt filter to scope to this user only
          debt: { type: { not: "loan" }, userId },
        };

        if (budget.subCategory) {
          // Match installments that have the exact subCategory OR have no subCategory
          installmentWhereClause.OR = [
            { category: budget.category, subCategory: budget.subCategory },
            { category: budget.category, subCategory: null },
          ];
        } else {
          // For parent budgets (no subCategory): match installments with this category
          // regardless of subCategory, PLUS installments with no subCategory
          installmentWhereClause.OR = [
            { category: budget.category },
            { category: budget.category, subCategory: null },
          ];
        }

        const installments = await db.installment.findMany({
          where: installmentWhereClause,
          select: { installmentAmount: true, id: true, description: true, category: true, subCategory: true, purchaseDate: true },
        });

        for (const inst of installments) {
          totalSpent += toNumber(inst.installmentAmount);
        }

        console.log(`[Recalculate] ${budget.type}:${budget.category}${budget.subCategory ? `/${budget.subCategory}` : ""} — Source B (installments): ${installments.length} installments, total: ${installments.reduce((s, i) => s + toNumber(i.installmentAmount), 0)}`);
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

    // ── Push Notifications: Budget at 90%+ ──
    // Check if any expense budget crossed the 90% threshold after recalculation
    try {
      const nearLimitBudgets = updatedBudgets.filter(
        (b) =>
          b.type === "expense" &&
          toNumber(b.amount) > 0 &&
          toNumber(b.spent) / toNumber(b.amount) >= 0.9
      );

      if (nearLimitBudgets.length > 0) {
        // Only notify if there isn't already an unread notification for this
        const existingNotifs = await db.appNotification.findMany({
          where: {
            userId,
            type: "budget_limit",
            read: false,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24h
          },
        });

        if (existingNotifs.length === 0) {
          const names = nearLimitBudgets
            .slice(0, 2)
            .map((b) => b.category)
            .join(", ");
          await createAndPushNotification({
            userId,
            type: "budget_limit",
            title: "Presupuesto al límite",
            message: `Presupuesto al 90%+: ${names}${nearLimitBudgets.length > 2 ? ` +${nearLimitBudgets.length - 2} más` : ""}`,
            pushBody: `Presupuesto al límite: ${names}`,
            url: "/?tab=finance&sub=budgets",
          });
        }
      }
    } catch (notifError) {
      console.error("[Recalculate] Failed to send budget notification:", notifError);
    }

    return NextResponse.json(updatedBudgets);
  } catch (error) {
    console.error("Recalculate budgets error:", error);
    return NextResponse.json({ error: "Error al recalcular presupuestos" }, { status: 500 });
  }
}
