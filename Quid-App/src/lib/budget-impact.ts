import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { getCurrentBudgetPeriod } from "@/lib/holidays";
import { toNumber } from "@/lib/decimal-serializer";
import type { FinanceLedgerClient } from "@/lib/finance-ledger";

type BudgetType = "income" | "expense";

export async function findMatchingBudget(
  userId: string,
  category: string,
  subCategory: string | null,
  type: BudgetType,
  client: FinanceLedgerClient = db
) {
  if (subCategory) {
    const specific = await client.budget.findFirst({
      where: { userId, category, subCategory, type },
    });
    if (specific) return specific;
  }

  return client.budget.findFirst({
    where: { userId, category, subCategory: null, type },
  });
}

export async function adjustBudgetSpent(params: {
  userId: string;
  category: string | null;
  subCategory?: string | null;
  type: BudgetType;
  amount: number;
  client?: FinanceLedgerClient;
}) {
  const { userId, category, subCategory = null, type, amount, client = db } = params;
  if (!category || amount === 0) return false;

  const budget = await findMatchingBudget(userId, category, subCategory, type, client);
  if (!budget) return false;

  await client.budget.update({
    where: { id: budget.id },
    data: { spent: { increment: amount } },
  });

  return true;
}

export async function getUserCurrentBudgetPeriod(userId: string, client: FinanceLedgerClient = db) {
  const settings = await client.userSettings.findUnique({
    where: { userId },
    select: { budgetCutoffDay: true, respectHolidays: true },
  });

  return getCurrentBudgetPeriod(
    settings?.budgetCutoffDay || 1,
    settings?.respectHolidays ?? true,
    getColombiaNow()
  );
}

export async function isDateInCurrentBudgetPeriod(userId: string, date: Date, client: FinanceLedgerClient = db) {
  const { start, end } = await getUserCurrentBudgetPeriod(userId, client);
  const endPlus = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  return date >= start && date < endPlus;
}

export async function applyCreditInstallmentBudgetImpact(params: {
  userId: string;
  debtType: string | null | undefined;
  category: string | null;
  subCategory?: string | null;
  installmentAmount: number;
  nextPaymentDate: Date;
  direction?: 1 | -1;
  client?: FinanceLedgerClient;
}) {
  const {
    userId,
    debtType,
    category,
    subCategory = null,
    installmentAmount,
    nextPaymentDate,
    direction = 1,
    client = db,
  } = params;

  if (debtType === "loan") return false;
  if (!category) return false;
  if (!(await isDateInCurrentBudgetPeriod(userId, nextPaymentDate, client))) return false;

  return adjustBudgetSpent({
    userId,
    category,
    subCategory,
    type: "expense",
    amount: toNumber(installmentAmount) * direction,
    client,
  });
}
