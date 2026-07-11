import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";

export type FinanceLedgerClient = Prisma.TransactionClient | typeof db;
export type TransactionType = "income" | "expense" | "transfer";
export type BudgetType = "income" | "expense";

export type BalanceSnapshot = {
  id: string;
  name: string;
  balance: number;
  isSubAccount: boolean;
};

export function getTransactionBalanceDelta(type: TransactionType, amount: number) {
  if (type === "income") return amount;
  if (type === "expense" || type === "transfer") return -amount;
  return 0;
}

export async function assertSubAccountBelongsToAccount(
  client: FinanceLedgerClient,
  subAccountId: string | null,
  accountId: string | null | undefined,
  message: string
) {
  if (!subAccountId) return;

  const subAccount = await client.subAccount.findFirst({
    where: { id: subAccountId, accountId: accountId || "" },
    select: { id: true },
  });

  if (!subAccount) {
    throw new Error(message);
  }
}

export async function applyBalanceDelta(
  client: FinanceLedgerClient,
  params: {
    accountId?: string | null;
    subAccountId?: string | null;
    amount: number;
  }
) {
  const { accountId, subAccountId, amount } = params;
  if (!amount) return;

  if (subAccountId) {
    await client.subAccount.update({
      where: { id: subAccountId },
      data: { balance: { increment: amount } },
    });
    return;
  }

  if (accountId) {
    await client.account.update({
      where: { id: accountId },
      data: { balance: { increment: amount } },
    });
  }
}

export async function findMatchingBudget(
  client: FinanceLedgerClient,
  params: {
    userId: string;
    category: string;
    subCategory?: string | null;
    type: BudgetType;
  }
) {
  const { userId, category, subCategory = null, type } = params;

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

export async function applyBudgetDelta(
  client: FinanceLedgerClient,
  params: {
    userId: string;
    category?: string | null;
    subCategory?: string | null;
    type: BudgetType;
    amount: number;
    excludeFromBudget?: boolean | null;
  }
) {
  const { userId, category, subCategory = null, type, amount, excludeFromBudget } = params;
  if (!category || !amount || excludeFromBudget) return false;

  const budget = await findMatchingBudget(client, {
    userId,
    category,
    subCategory,
    type,
  });

  if (!budget) return false;

  await client.budget.update({
    where: { id: budget.id },
    data: { spent: { increment: amount } },
  });

  return true;
}

export async function getBalanceSnapshot(
  client: FinanceLedgerClient,
  params: {
    accountId?: string | null;
    subAccountId?: string | null;
  }
): Promise<BalanceSnapshot | null> {
  const { accountId, subAccountId } = params;

  if (subAccountId) {
    const subAccount = await client.subAccount.findUnique({
      where: { id: subAccountId },
      select: { balance: true, name: true, account: { select: { name: true } } },
    });

    if (!subAccount) return null;

    return {
      id: subAccountId,
      name: `${subAccount.account.name} → ${subAccount.name}`,
      balance: toNumber(subAccount.balance),
      isSubAccount: true,
    };
  }

  if (accountId) {
    const account = await client.account.findUnique({
      where: { id: accountId },
      select: { balance: true, name: true },
    });

    if (!account) return null;

    return {
      id: accountId,
      name: account.name,
      balance: toNumber(account.balance),
      isSubAccount: false,
    };
  }

  return null;
}

export async function getUniqueBalanceSnapshots(
  client: FinanceLedgerClient,
  refs: Array<{ accountId?: string | null; subAccountId?: string | null }>
) {
  const seen = new Set<string>();
  const snapshots: BalanceSnapshot[] = [];

  for (const ref of refs) {
    const key = ref.subAccountId ? `sub:${ref.subAccountId}` : ref.accountId ? `acc:${ref.accountId}` : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const snapshot = await getBalanceSnapshot(client, ref);
    if (snapshot) snapshots.push(snapshot);
  }

  return snapshots;
}
