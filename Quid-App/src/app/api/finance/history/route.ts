import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { getCurrentBudgetPeriod } from "@/lib/holidays";
import { toNumber } from "@/lib/decimal-serializer";

const SPANISH_MONTHS = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

/**
 * GET /api/finance/history
 *
 * Returns historical financial data for the last 6 months,
 * based on the user's configured budget cutoff day.
 *
 * Response:
 *   {
 *     monthlyData: { period, periodStart, periodEnd, income, expense, savings }[],
 *     currentNetWorth: number,
 *     previousNetWorth: number,
 *     yieldHistory: { month, projected, actual }[]
 *   }
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // ── Get user settings ──
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });
    const cutoffDay = settings?.budgetCutoffDay || 1;
    const respectHolidays = settings?.respectHolidays ?? true;

    // ── Calculate 6 budget periods (current + 5 previous) ──
    const now = getColombiaNow();
    const periods: { start: Date; end: Date }[] = [];

    for (let i = -5; i <= 0; i++) {
      const refDate = new Date(now);
      refDate.setMonth(refDate.getMonth() + i);
      // Normalize to avoid month overflow edge cases (e.g., Jan 31 → Feb 28)
      const period = getCurrentBudgetPeriod(cutoffDay, respectHolidays, refDate);
      periods.push(period);
    }

    // ── Build monthly data ──
    const monthlyData: { period: string; periodStart: string; periodEnd: string; income: number; expense: number; savings: number }[] = [];

    for (let i = 0; i < periods.length; i++) {
      const { start: periodStart, end: periodEnd } = periods[i];

      // 1) Income: transactions of type "income" in the period
      //    Exclude finance_transfer and transfer counterpart incomes (relatedTransactionId)
      const incomeTransactions = await db.transaction.findMany({
        where: {
          userId,
          date: { gte: periodStart, lt: new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000) },
          type: "income",
          sourceModule: { not: "finance_transfer" },
          relatedTransactionId: null,
        },
        select: { amount: true },
      });
      const income = incomeTransactions.reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      // 2) Expenses: transactions of type "expense" + CC installments (excluding loans)
      //    Skip finance_transfer transactions
      const expenseTransactions = await db.transaction.findMany({
        where: {
          userId,
          date: { gte: periodStart, lt: new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000) },
          type: "expense",
          sourceModule: { not: "finance_transfer" },
        },
        select: { amount: true, sourceModule: true },
      });
      let expense = expenseTransactions.reduce((sum, tx) => sum + toNumber(tx.amount), 0);

      // Add credit card installments with purchaseDate in the period (excluding loans)
      const ccInstallments = await db.installment.findMany({
        where: {
          purchaseDate: { gte: periodStart, lt: new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000) },
          debt: {
            userId,
            type: { not: "loan" },
          },
        },
        select: { installmentAmount: true },
      });
      expense += ccInstallments.reduce((sum, inst) => sum + toNumber(inst.installmentAmount), 0);

      // 3) Savings contributions in the period
      const savingsContributions = await db.savingsContribution.findMany({
        where: {
          date: { gte: periodStart, lt: new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000) },
          goal: { userId },
        },
        select: { amount: true },
      });
      const savings = savingsContributions.reduce((sum, c) => sum + toNumber(c.amount), 0);

      // Period label: use the month of the period start
      const periodMonth = periodStart.getMonth();
      const periodYear = periodStart.getFullYear();
      const periodLabel = `${SPANISH_MONTHS[periodMonth]} ${periodYear}`;

      monthlyData.push({
        period: periodLabel,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        income: Math.round(income),
        expense: Math.round(expense),
        savings: Math.round(savings),
      });
    }

    // ── Calculate current net worth ──
    // Sum of all account balances + subaccount balances - debt currentBalances
    const accounts = await db.account.findMany({
      where: { userId },
      select: {
        balance: true,
        subAccounts: {
          select: { balance: true },
        },
      },
    });

    const totalAccountBalance = accounts.reduce((sum, acc) => {
      const subTotal = acc.subAccounts.reduce((s, sub) => s + toNumber(sub.balance), 0);
      return sum + toNumber(acc.balance) + subTotal;
    }, 0);

    const debts = await db.debt.findMany({
      where: { userId },
      select: { currentBalance: true },
    });
    const totalDebtBalance = debts.reduce((sum, d) => sum + toNumber(d.currentBalance), 0);

    const currentNetWorth = Math.round(totalAccountBalance - totalDebtBalance);

    // ── Approximate previous net worth ──
    // Previous net worth ≈ current net worth - (current period income - current period expenses)
    // because income adds to accounts and expenses remove from accounts
    // Use the last period in monthlyData (which is the current period)
    const currentPeriodData = monthlyData[monthlyData.length - 1];
    const previousNetWorth = Math.round(
      currentNetWorth - currentPeriodData.income + currentPeriodData.expense
    );

    // ── Yield history (last 6 months) ──
    // Get YieldRecords for the last 6 months
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    sixMonthsAgo.setDate(1);
    sixMonthsAgo.setHours(0, 0, 0, 0);

    const yieldRecords = await db.yieldRecord.findMany({
      where: {
        month: { gte: sixMonthsAgo },
        account: { userId },
      },
      select: {
        month: true,
        projectedYield: true,
        actualYield: true,
      },
      orderBy: { month: "asc" },
    });

    // Group yield records by month
    const yieldByMonth = new Map<string, { projected: number; actual: number | null }>();
    for (const yr of yieldRecords) {
      const monthDate = new Date(yr.month);
      const key = `${SPANISH_MONTHS[monthDate.getMonth()]} ${monthDate.getFullYear()}`;
      const existing = yieldByMonth.get(key);
      if (existing) {
        existing.projected += toNumber(yr.projectedYield);
        if (yr.actualYield !== null && existing.actual !== null) {
          existing.actual += toNumber(yr.actualYield);
        } else if (yr.actualYield !== null && existing.actual === null) {
          existing.actual = toNumber(yr.actualYield);
        }
      } else {
        yieldByMonth.set(key, {
          projected: toNumber(yr.projectedYield),
          actual: yr.actualYield !== null ? toNumber(yr.actualYield) : null,
        });
      }
    }

    const yieldHistory = Array.from(yieldByMonth.entries())
      .map(([month, data]) => ({
        month,
        projected: Math.round(data.projected),
        actual: data.actual !== null ? Math.round(data.actual) : null,
      }))
      .slice(-6);

    return NextResponse.json({
      monthlyData,
      currentNetWorth,
      previousNetWorth,
      yieldHistory,
    });
  } catch (error) {
    console.error("Finance history error:", error);
    return NextResponse.json(
      { error: "Error al obtener historial financiero" },
      { status: 500 }
    );
  }
}
