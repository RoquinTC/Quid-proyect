import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { getCurrentBudgetPeriod } from "@/lib/holidays";
import { toNumber } from "@/lib/decimal-serializer";

type BudgetType = "income" | "expense";

export async function findMatchingBudget(
  userId: string,
  category: string,
  subCategory: string | null,
  type: BudgetType
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

export async function adjustBudgetSpent(params: {
  userId: string;
  category: string | null;
  subCategory?: string | null;
  type: BudgetType;
  amount: number;
}) {
  const { userId, category, subCategory = null, type, amount } = params;
  if (!category || amount === 0) return false;

  const budget = await findMatchingBudget(userId, category, subCategory, type);
  if (!budget) return false;

  await db.budget.update({
    where: { id: budget.id },
    data: { spent: { increment: amount } },
  });

  return true;
}

export async function getUserCurrentBudgetPeriod(userId: string) {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { budgetCutoffDay: true, respectHolidays: true },
  });

  return getCurrentBudgetPeriod(
    settings?.budgetCutoffDay || 1,
    settings?.respectHolidays ?? true,
    getColombiaNow()
  );
}

export async function isDateInCurrentBudgetPeriod(userId: string, date: Date) {
  const { start, end } = await getUserCurrentBudgetPeriod(userId);
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
}) {
  const {
    userId,
    debtType,
    category,
    subCategory = null,
    installmentAmount,
    nextPaymentDate,
    direction = 1,
  } = params;

  if (debtType === "loan") return false;
  if (!category) return false;
  if (!(await isDateInCurrentBudgetPeriod(userId, nextPaymentDate))) return false;

  return adjustBudgetSpent({
    userId,
    category,
    subCategory,
    type: "expense",
    amount: toNumber(installmentAmount) * direction,
  });
}
