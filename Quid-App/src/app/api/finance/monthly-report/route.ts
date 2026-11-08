import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { colombiaTodayKey } from "@/lib/reminders/engine";
import { buildInsights, type InsightSnapshot } from "@/lib/finance/insights";
import { buildMonthlyReport } from "@/lib/finance/monthly-report";

const COLOMBIA_TIMEZONE = "America/Bogota";

function monthKeyOf(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
  }).format(date);
}

function monthDates(monthKey: string): { start: Date; endExclusive: Date; lastDayKey: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  return {
    start,
    endExclusive,
    lastDayKey: lastDay.toISOString().slice(0, 10),
  };
}

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function isValidMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

type Bucket = {
  income: number;
  expense: number;
  expenseByCategory: Map<string, number>;
  incomeByCategory: Map<string, number>;
  largest: Array<{ amount: number; category: string | null; description: string | null; date: string }>;
};

function emptyBucket(): Bucket {
  return {
    income: 0,
    expense: 0,
    expenseByCategory: new Map(),
    incomeByCategory: new Map(),
    largest: [],
  };
}

function addToMap(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

/**
 * GET /api/finance/monthly-report?month=YYYY-MM
 *
 * Reporte del mes elegido (por defecto, el actual en Colombia). Incluye la
 * evolución de los 6 meses que terminan en ese mes y los hallazgos de F-10.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const requested = req.nextUrl.searchParams.get("month") ?? "";
    const currentMonth = isValidMonthKey(requested) ? requested : colombiaTodayKey().slice(0, 7);
    const previousMonth = shiftMonth(currentMonth, -1);

    const months = Array.from({ length: 6 }, (_, index) => shiftMonth(currentMonth, index - 5));
    const rangeStart = monthDates(months[0]).start;
    const rangeEnd = monthDates(currentMonth).endExclusive;

    const [transactions, installments, budgets] = await Promise.all([
      db.transaction.findMany({
        where: {
          userId,
          date: { gte: rangeStart, lt: rangeEnd },
          type: { in: ["income", "expense"] },
          relatedTransactionId: null,
          sourceModule: { not: "finance_transfer" },
        },
        select: { type: true, amount: true, date: true, category: true, description: true },
        orderBy: { date: "asc" },
      }),
      db.installment.findMany({
        where: {
          purchaseDate: { gte: rangeStart, lt: rangeEnd },
          debt: { userId, type: { not: "loan" } },
        },
        select: { purchaseDate: true, installmentAmount: true, category: true, description: true },
      }),
      db.budget.findMany({
        where: { userId },
        select: { type: true, category: true, amount: true },
      }),
    ]);

    const buckets = new Map<string, Bucket>();
    for (const month of months) buckets.set(month, emptyBucket());

    const bucketFor = (date: Date): Bucket | null => {
      const key = monthKeyOf(date);
      return buckets.get(key) ?? null;
    };

    for (const tx of transactions) {
      const bucket = bucketFor(new Date(tx.date));
      if (!bucket) continue;

      const amount = toNumber(tx.amount);
      const category = tx.category || "Sin categoría";
      const dateKey = new Date(tx.date).toISOString().slice(0, 10);

      if (tx.type === "income") {
        bucket.income += amount;
        addToMap(bucket.incomeByCategory, category, amount);
        continue;
      }

      bucket.expense += amount;
      addToMap(bucket.expenseByCategory, category, amount);
      bucket.largest.push({
        amount,
        category: tx.category,
        description: tx.description,
        date: dateKey,
      });
    }

    for (const installment of installments) {
      const bucket = bucketFor(new Date(installment.purchaseDate));
      if (!bucket) continue;

      const amount = toNumber(installment.installmentAmount);
      const category = installment.category || "Sin categoría";
      bucket.expense += amount;
      addToMap(bucket.expenseByCategory, category, amount);
      bucket.largest.push({
        amount,
        category: installment.category,
        description: installment.description,
        date: new Date(installment.purchaseDate).toISOString().slice(0, 10),
      });
    }

    const current = buckets.get(currentMonth) ?? emptyBucket();
    const previous = buckets.get(previousMonth) ?? emptyBucket();

    const categoriesUnion = new Set([
      ...current.expenseByCategory.keys(),
      ...previous.expenseByCategory.keys(),
    ]);
    const expenseCategories = Array.from(categoriesUnion)
      .map((category) => ({
        category,
        amount: current.expenseByCategory.get(category) ?? 0,
        previous: previous.expenseByCategory.get(category) ?? 0,
      }))
      .filter((entry) => entry.amount > 0 || entry.previous > 0);

    const incomeUnion = new Set([
      ...current.incomeByCategory.keys(),
      ...previous.incomeByCategory.keys(),
    ]);
    const incomeCategories = Array.from(incomeUnion).map((category) => ({
      category,
      amount: current.incomeByCategory.get(category) ?? 0,
      previous: previous.incomeByCategory.get(category) ?? 0,
    }));

    const { lastDayKey } = monthDates(currentMonth);
    const rangeStartKey = monthDates(currentMonth).start.toISOString().slice(0, 10);
    const today = colombiaTodayKey();
    const periodToday = today > lastDayKey ? lastDayKey : today;

    const insightSnapshot: InsightSnapshot = {
      periodLabel: currentMonth,
      periodStart: rangeStartKey,
      periodEnd: lastDayKey,
      today: periodToday,
      current: {
        income: current.income,
        expense: current.expense,
        categories: Array.from(current.expenseByCategory.entries()).map(([category, amount]) => ({
          category,
          amount,
        })),
      },
      previous: {
        income: previous.income,
        expense: previous.expense,
        categories: Array.from(previous.expenseByCategory.entries()).map(([category, amount]) => ({
          category,
          amount,
        })),
      },
      budgets: budgets.map((budget) => ({
        type: budget.type,
        category: budget.category,
        amount: toNumber(budget.amount),
        // El ejecutado real lo calcula el reporte desde las transacciones.
        spent: 0,
      })),
      largestExpenses: current.largest.slice(0, 10),
      hasHistory: previous.income > 0 || previous.expense > 0 || previous.expenseByCategory.size > 0,
    };

    const report = buildMonthlyReport({
      month: currentMonth,
      previousMonth,
      current: { income: current.income, expense: current.expense },
      previous: { income: previous.income, expense: previous.expense },
      expenseCategories,
      incomeCategories,
      budgets: budgets.map((budget) => ({
        type: budget.type,
        category: budget.category,
        amount: toNumber(budget.amount),
      })),
      evolution: months.map((month) => {
        const bucket = buckets.get(month) ?? emptyBucket();
        return { month, income: bucket.income, expense: bucket.expense };
      }),
      insights: buildInsights(insightSnapshot),
    });

    return NextResponse.json(report);
  } catch (error) {
    console.error("Monthly report error:", error);
    return NextResponse.json(
      { error: "No se pudo generar el reporte" },
      { status: 500 }
    );
  }
}
