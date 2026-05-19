import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { getCurrentBudgetPeriod } from "@/lib/holidays";
import { toNumber } from "@/lib/decimal-serializer";

/**
 * GET /api/budgets/unbudgeted
 *
 * Returns spending by category that has NO matching budget.
 * Only considers transactions within the user's current budget period.
 * Also includes CC installments for expense categories.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's budget period
    const settings = await db.userSettings.findUnique({ where: { userId } });
    const cutoffDay = settings?.budgetCutoffDay || 1;
    const respectHolidays = settings?.respectHolidays ?? true;

    const { start: periodStart, end: periodEnd } = getCurrentBudgetPeriod(
      cutoffDay,
      respectHolidays,
      getColombiaNow()
    );

    const periodEndPlus = new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000);

    // Get all existing budget category+subCategory pairs
    const budgets = await db.budget.findMany({
      where: { userId },
      select: { category: true, subCategory: true, type: true },
    });

    // Build a set of budgeted keys: "type:category" or "type:category:subCategory"
    const budgetedKeys = new Set<string>();
    for (const b of budgets) {
      budgetedKeys.add(`${b.type}:${b.category}`);
      if (b.subCategory) {
        budgetedKeys.add(`${b.type}:${b.category}:${b.subCategory}`);
      }
    }

    // Get all transactions in the current period (exclude transfers and excluded-from-budget)
    //
    // IMPORTANT: We use AND with OR sub-conditions instead of top-level
    // `sourceModule: { not: "finance_transfer" }` because Prisma's `{ not: }`
    // generates SQL `<>` which EXCLUDES NULL rows (NULL <> value → NULL → falsy).
    // Manual transactions have sourceModule=NULL, so they would be silently dropped.
    const transactions = await db.transaction.findMany({
      where: {
        userId,
        date: { gte: periodStart, lt: periodEndPlus },
        type: { in: ["income", "expense"] },
        category: { not: null },
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
      },
      select: {
        category: true,
        subCategory: true,
        type: true,
        amount: true,
      },
    });

    // Get CC installments in the current period (same logic as recalculate)
    const installments = await db.installment.findMany({
      where: {
        purchaseDate: { gte: periodStart, lte: periodEnd },
        debt: { type: { not: "loan" }, userId },
      },
      select: {
        category: true,
        subCategory: true,
        installmentAmount: true,
      },
    });

    // Aggregate spending by category+subCategory+type
    const spendingMap: Record<
      string,
      {
        category: string;
        subCategory: string | null;
        type: string;
        totalSpent: number;
        transactionCount: number;
      }
    > = {};

    for (const tx of transactions) {
      if (!tx.category) continue;
      const key = `${tx.type}:${tx.category}:${tx.subCategory || ""}`;
      if (!spendingMap[key]) {
        spendingMap[key] = {
          category: tx.category,
          subCategory: tx.subCategory,
          type: tx.type,
          totalSpent: 0,
          transactionCount: 0,
        };
      }
      spendingMap[key].totalSpent += toNumber(tx.amount);
      spendingMap[key].transactionCount++;
    }

    // Add CC installments
    for (const inst of installments) {
      if (!inst.category) continue;
      const key = `expense:${inst.category}:${inst.subCategory || ""}`;
      if (!spendingMap[key]) {
        spendingMap[key] = {
          category: inst.category,
          subCategory: inst.subCategory,
          type: "expense",
          totalSpent: 0,
          transactionCount: 0,
        };
      }
      spendingMap[key].totalSpent += toNumber(inst.installmentAmount);
      // Don't count installment as a transaction (it's derived)
    }

    // Filter to only unbudgeted categories
    // A category is "unbudgeted" if there's no budget matching it at either the
    // category level or the subcategory level
    const unbudgeted = Object.values(spendingMap).filter((item) => {
      const categoryKey = `${item.type}:${item.category}`;
      const specificKey = item.subCategory
        ? `${item.type}:${item.category}:${item.subCategory}`
        : null;

      // If there's a parent budget (category-only), the spending IS budgeted
      if (budgetedKeys.has(categoryKey)) return false;
      // If there's a specific budget (category+subCategory), the spending IS budgeted
      if (specificKey && budgetedKeys.has(specificKey)) return false;

      return true;
    });

    // Sort by totalSpent descending
    unbudgeted.sort((a, b) => b.totalSpent - a.totalSpent);

    // Group by category for easier display
    const grouped: Record<
      string,
      {
        category: string;
        type: string;
        totalSpent: number;
        transactionCount: number;
        subcategories: Array<{
          subCategory: string | null;
          totalSpent: number;
          transactionCount: number;
        }>;
      }
    > = {};

    for (const item of unbudgeted) {
      const catKey = `${item.type}:${item.category}`;
      if (!grouped[catKey]) {
        grouped[catKey] = {
          category: item.category,
          type: item.type,
          totalSpent: 0,
          transactionCount: 0,
          subcategories: [],
        };
      }
      grouped[catKey].totalSpent += item.totalSpent;
      grouped[catKey].transactionCount += item.transactionCount;
      if (item.subCategory) {
        grouped[catKey].subcategories.push({
          subCategory: item.subCategory,
          totalSpent: item.totalSpent,
          transactionCount: item.transactionCount,
        });
      }
    }

    const result = Object.values(grouped).sort(
      (a, b) => b.totalSpent - a.totalSpent
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Get unbudgeted spending error:", error);
    return NextResponse.json(
      { error: "Error al obtener gastos sin presupuesto" },
      { status: 500 }
    );
  }
}
