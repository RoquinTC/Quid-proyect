import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { getCurrentBudgetPeriod } from "@/lib/holidays";
import { toNumber } from "@/lib/decimal-serializer";

/**
 * GET /api/budgets/spending-income
 *
 * Returns daily spending vs income data for the current budget period,
 * based on the user's configured cutoff day.
 *
 * Query params:
 *   - periodOffset: number (0 = current period, -1 = previous, 1 = next)
 *
 * Response:
 *   {
 *     periodStart: string,
 *     periodEnd: string,
 *     totalIncome: number,
 *     totalExpense: number,
 *     dailyData: { date: string, income: number, expense: number }[],
 *     categoryBreakdown: { category: string, subCategory: string|null, amount: number, type: string }[]
 *   }
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(req.url);
    const periodOffset = parseInt(searchParams.get("periodOffset") || "0", 10);

    // Get user's budget cutoff day setting
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });
    const cutoffDay = settings?.budgetCutoffDay || 1;
    const respectHolidays = settings?.respectHolidays ?? true;

    // Calculate the budget period
    const referenceDate = getColombiaNow();
    // Apply offset by shifting the reference date
    if (periodOffset !== 0) {
      referenceDate.setMonth(referenceDate.getMonth() + periodOffset);
    }

    const { start: periodStart, end: periodEnd } = getCurrentBudgetPeriod(
      cutoffDay,
      respectHolidays,
      referenceDate
    );

    // ── Source 1: Transactions ──
    // Get all non-transfer transactions within the period
    const transactions = await db.transaction.findMany({
      where: {
        userId,
        date: { gte: periodStart, lt: new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000) },
        type: { in: ["income", "expense"] },
        relatedTransactionId: null, // Exclude transfer counterpart incomes (not real income)
      },
      select: {
        date: true,
        type: true,
        amount: true,
        category: true,
        subCategory: true,
        sourceModule: true,
      },
    });

    // ── Source 2: Credit card installments ──
    // Include CC installments (both paid and unpaid) with purchaseDate in the period
    // These represent spending committed via TC — the money is already "spent"
    const ccInstallments = await db.installment.findMany({
      where: {
        purchaseDate: { gte: periodStart, lte: periodEnd },
        debt: { userId, type: { not: "loan" } }, // Only CC installments for this user
      },
      select: {
        purchaseDate: true,
        installmentAmount: true,
        category: true,
        subCategory: true,
        isPaid: true,
      },
    });

    // ── Build daily data ──
    // Group by date string (YYYY-MM-DD)
    const dailyMap = new Map<string, { income: number; expense: number }>();

    // Initialize all dates in the period
    const current = new Date(periodStart);
    while (current <= periodEnd) {
      const dateStr = current.toISOString().split("T")[0];
      dailyMap.set(dateStr, { income: 0, expense: 0 });
      current.setDate(current.getDate() + 1);
    }

    // Aggregate transactions
    let totalIncome = 0;
    let totalExpense = 0;

    for (const tx of transactions) {
      // Skip CC payment transfer transactions (they're not new expenses)
      // Note: relatedTransactionId filter at query level already excludes transfer counterparts
      if (tx.sourceModule === "finance_transfer") continue;

      const dateStr = new Date(tx.date).toISOString().split("T")[0];
      const existing = dailyMap.get(dateStr);
      if (!existing) continue;

      if (tx.type === "income") {
        existing.income += toNumber(tx.amount);
        totalIncome += toNumber(tx.amount);
      } else if (tx.type === "expense") {
        existing.expense += toNumber(tx.amount);
        totalExpense += toNumber(tx.amount);
      }
    }

    // Aggregate CC installments (these are expenses at purchase time)
    for (const inst of ccInstallments) {
      const dateStr = new Date(inst.purchaseDate).toISOString().split("T")[0];
      const existing = dailyMap.get(dateStr);
      if (!existing) continue;

      existing.expense += toNumber(inst.installmentAmount);
      totalExpense += toNumber(inst.installmentAmount);
    }

    // Convert to array sorted by date
    const dailyData = Array.from(dailyMap.entries())
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ── Build category breakdown ──
    const categoryMap = new Map<string, { category: string; subCategory: string | null; amount: number; type: string }>();

    for (const tx of transactions) {
      // Skip CC payment transfer transactions (they're not new expenses)
      // Note: relatedTransactionId filter at query level already excludes transfer counterparts
      if (tx.sourceModule === "finance_transfer") continue;

      const cat = tx.category || "Sin categoría";
      const sub = tx.subCategory || null;
      const key = `${tx.type}::${cat}::${sub || ""}`;

      if (!categoryMap.has(key)) {
        categoryMap.set(key, { category: cat, subCategory: sub, amount: 0, type: tx.type });
      }
      categoryMap.get(key)!.amount += toNumber(tx.amount);
    }

    // Add CC installments to category breakdown
    for (const inst of ccInstallments) {
      const cat = inst.category || "Sin categoría";
      const sub = inst.subCategory || null;
      const key = `expense::${cat}::${sub || ""}`;

      if (!categoryMap.has(key)) {
        categoryMap.set(key, { category: cat, subCategory: sub, amount: 0, type: "expense" });
      }
      categoryMap.get(key)!.amount += toNumber(inst.installmentAmount);
    }

    const categoryBreakdown = Array.from(categoryMap.values())
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === "income" ? -1 : 1;
        return b.amount - a.amount;
      });

    return NextResponse.json({
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      totalIncome,
      totalExpense,
      dailyData,
      categoryBreakdown,
    });
  } catch (error) {
    console.error("Spending vs income error:", error);
    return NextResponse.json({ error: "Error al obtener datos de gastos e ingresos" }, { status: 500 });
  }
}
