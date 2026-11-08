import { db } from "@/lib/db";
import { getBudgetPeriod } from "@/lib/holidays";
import { toNumber } from "@/lib/decimal-serializer";
import { colombiaTodayKey, dateKeyOf, formatKeyEs } from "@/lib/reminders/engine";
import type {
  InsightBudget,
  InsightCategory,
  InsightExpense,
  InsightSnapshot,
} from "@/lib/finance/insights";

const DAY_MS = 24 * 60 * 60 * 1000;

type PeriodTotals = {
  income: number;
  expense: number;
  categories: InsightCategory[];
  largestExpenses: InsightExpense[];
};

function emptyTotals(): PeriodTotals {
  return { income: 0, expense: 0, categories: [], largestExpenses: [] };
}

/**
 * Arma el retrato del período actual y el anterior.
 *
 * Usa el mismo corte presupuestal que la pestaña Análisis (mensual o
 * quincenal), así que un insight nunca habla de un período distinto al que el
 * usuario está viendo.
 */
export async function loadInsightSnapshot(userId: string): Promise<InsightSnapshot> {
  const settings = await db.userSettings.findUnique({ where: { userId } });

  const now = new Date();
  const current = getBudgetPeriod(settings, now);

  // El período anterior es el que contiene el día antes de que empiece el actual:
  // así funciona igual con corte mensual y con quincenas.
  const previousReference = new Date(current.start.getTime() - DAY_MS);
  const previous = getBudgetPeriod(settings, previousReference);

  const rangeStart = previous.start;
  const rangeEnd = new Date(current.end.getTime() + DAY_MS);

  const [transactions, installments, budgets] = await Promise.all([
    db.transaction.findMany({
      where: {
        userId,
        date: { gte: rangeStart, lt: rangeEnd },
        type: { in: ["income", "expense"] },
        relatedTransactionId: null,
        sourceModule: { not: "finance_transfer" },
      },
      select: {
        type: true,
        amount: true,
        date: true,
        category: true,
        description: true,
      },
      orderBy: { date: "asc" },
    }),
    db.installment.findMany({
      where: {
        purchaseDate: { gte: rangeStart, lt: rangeEnd },
        debt: { userId, type: { not: "loan" } },
      },
      select: {
        purchaseDate: true,
        installmentAmount: true,
        category: true,
        description: true,
      },
    }),
    db.budget.findMany({
      where: { userId },
      select: { type: true, category: true, amount: true, spent: true },
    }),
  ]);

  const currentTotals = emptyTotals();
  const previousTotals = emptyTotals();
  const currentEndExclusive = new Date(current.end.getTime() + DAY_MS);

  const bucketFor = (date: Date): PeriodTotals =>
    date >= current.start && date < currentEndExclusive ? currentTotals : previousTotals;

  const addCategory = (totals: PeriodTotals, category: string | null, amount: number) => {
    const key = category || "Sin categoría";
    const existing = totals.categories.find((entry) => entry.category === key);
    if (existing) existing.amount += amount;
    else totals.categories.push({ category: key, amount });
  };

  for (const tx of transactions) {
    const totals = bucketFor(new Date(tx.date));
    const amount = toNumber(tx.amount);

    if (tx.type === "income") {
      totals.income += amount;
      continue;
    }

    totals.expense += amount;
    addCategory(totals, tx.category, amount);
    totals.largestExpenses.push({
      amount,
      category: tx.category,
      description: tx.description,
      date: dateKeyOf(tx.date) ?? "",
    });
  }

  // Las cuotas de tarjeta cuentan como gasto del período en que se compró,
  // igual que en la pestaña Análisis.
  for (const installment of installments) {
    const totals = bucketFor(new Date(installment.purchaseDate));
    const amount = toNumber(installment.installmentAmount);
    totals.expense += amount;
    addCategory(totals, installment.category, amount);
    totals.largestExpenses.push({
      amount,
      category: installment.category,
      description: installment.description,
      date: dateKeyOf(installment.purchaseDate) ?? "",
    });
  }

  const mappedBudgets: InsightBudget[] = budgets.map((budget) => ({
    type: budget.type,
    category: budget.category,
    amount: toNumber(budget.amount),
    spent: toNumber(budget.spent),
  }));

  const periodStartKey = dateKeyOf(current.start) ?? colombiaTodayKey(now);
  const periodEndKey = dateKeyOf(current.end) ?? periodStartKey;

  return {
    periodLabel: `${formatKeyEs(periodStartKey)} – ${formatKeyEs(periodEndKey)}`,
    periodStart: periodStartKey,
    periodEnd: periodEndKey,
    today: colombiaTodayKey(now),
    current: currentTotals,
    previous: previousTotals,
    budgets: mappedBudgets,
    largestExpenses: currentTotals.largestExpenses.slice(0, 10),
    hasHistory:
      previousTotals.income > 0 ||
      previousTotals.expense > 0 ||
      previousTotals.categories.length > 0,
  };
}
