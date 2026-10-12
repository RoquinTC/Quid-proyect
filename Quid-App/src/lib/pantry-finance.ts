/**
 * Pantry → Finance Integration Helper
 *
 * Mirrors the transport `createFinanceEntry` pattern so the market purchase
 * flows into finance exactly like fuel/maintenance: account → expense
 * transaction, credit card → installment, or scenario C (no payment method).
 *
 * Confirming a market purchase is an ATOMIC action handled by the API route:
 *  1. Upsert PantryItem (adds quantity, converts to canonical unit)
 *  2. Create PantryMovement (type: "in")
 *  3. Record PriceHistory
 *  4. Call createFinanceEntry (this file) → Transaction / Installment
 * All wrapped in a single db.$transaction so a failure rolls everything back.
 */

import { db } from "@/lib/db";
import { adjustBudgetSpent, applyCreditInstallmentBudgetImpact } from "@/lib/budget-impact";
import { getCreditCardNextPaymentDate } from "@/lib/credit-card-cycle";

// ─── Types ───

export type PantryPaymentType = "account" | "credit_card";

export interface PantryFinanceParams {
  userId: string;
  amount: number;
  description: string;
  category?: string;       // e.g. "Despensa" (default)
  subCategory?: string;    // e.g. "Mercado", "Mercado online"
  date: Date;
  sourceId: string;        // ShoppingList.id
  paymentType: PantryPaymentType;
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  installmentCount?: number | null;
  notes?: string | null;
}

export interface PantryFinanceResult {
  transactionId?: string;
  installmentId?: string;
  budgetUpdated: boolean;
  balanceUpdated: boolean;
  debtUpdated: boolean;
  updatedBalances?: Array<{ id: string; name: string; balance: number; isSubAccount: boolean }>;
  updatedDebts?: Array<{ id: string; currentBalance: number }>;
}

// ─── Main integration function ───

export async function createPantryFinanceEntry(
  params: PantryFinanceParams
): Promise<PantryFinanceResult> {
  const result: PantryFinanceResult = {
    budgetUpdated: false,
    balanceUpdated: false,
    debtUpdated: false,
    updatedBalances: [],
    updatedDebts: [],
  };

  const {
    userId, amount, description, date, sourceId,
    accountId, subAccountId, debtId, installmentCount,
    notes,
  } = params;
  const category = params.category || "Despensa";
  const subCategory = params.subCategory || "Mercado";
  const sourceModule = "pantry" as const;

  if (accountId) {
    const account = await db.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
    if (!account) throw new Error("Cuenta de pago no encontrada o sin permiso");
  }

  if (subAccountId) {
    const subAccount = await db.subAccount.findFirst({
      where: { id: subAccountId, account: { userId } },
      select: { id: true, accountId: true },
    });
    if (!subAccount) throw new Error("Subcuenta de pago no encontrada o sin permiso");
    if (accountId && subAccount.accountId !== accountId) {
      throw new Error("La subcuenta no pertenece a la cuenta seleccionada");
    }
  }

  if (debtId) {
    const debt = await db.debt.findFirst({ where: { id: debtId, userId }, select: { id: true } });
    if (!debt) throw new Error("Deuda no encontrada o sin permiso");
  }

  if (paymentTypeIsAccount(params) && accountId) {
    // ── ESCENARIO A: Pago con Cuenta/Bolsillo ──

    const transaction = await db.transaction.create({
      data: {
        userId,
        type: "expense",
        amount,
        description,
        category,
        subCategory,
        date,
        sourceModule,
        sourceId,
        accountId,
        subAccountId: subAccountId || null,
        notes: notes || `Despensa: ${description}`,
      },
    });
    result.transactionId = transaction.id;

    const balanceChange = -amount;
    if (subAccountId) {
      await db.subAccount.update({
        where: { id: subAccountId },
        data: { balance: { increment: balanceChange } },
      });
      const updatedSub = await db.subAccount.findUnique({
        where: { id: subAccountId },
        select: { id: true, name: true, balance: true, account: { select: { name: true } } },
      });
      if (updatedSub) {
        result.updatedBalances!.push({
          id: updatedSub.id,
          name: `${updatedSub.account.name} → ${updatedSub.name}`,
          balance: Number(updatedSub.balance),
          isSubAccount: true,
        });
      }
    } else {
      await db.account.update({
        where: { id: accountId },
        data: { balance: { increment: balanceChange } },
      });
      const updatedAccount = await db.account.findUnique({
        where: { id: accountId },
        select: { id: true, name: true, balance: true },
      });
      if (updatedAccount) {
        result.updatedBalances!.push({
          id: updatedAccount.id,
          name: updatedAccount.name,
          balance: Number(updatedAccount.balance),
          isSubAccount: false,
        });
      }
    }
    result.balanceUpdated = true;

    result.budgetUpdated = await adjustBudgetSpent({
      userId,
      category,
      subCategory,
      type: "expense",
      amount,
    });

  } else if (paymentTypeIsCreditCard(params) && debtId) {
    // ── ESCENARIO B: Pago con Tarjeta de Crédito ──

    const totalInstallments = installmentCount && installmentCount > 1 ? installmentCount : 1;
    const installmentAmount = Math.round((amount / totalInstallments) * 100) / 100;

    const debt = await db.debt.findUnique({ where: { id: debtId } });
    const nextPaymentDate = getCreditCardNextPaymentDate({
      purchaseDate: date,
      cutoffDate: debt?.cutoffDate,
      paymentDate: debt?.paymentDate,
    });

    const installment = await db.installment.create({
      data: {
        debtId,
        description,
        totalAmount: amount,
        totalInstallments,
        currentInstallment: 1,
        installmentAmount,
        paidAmount: 0,
        remainingBalance: amount,
        purchaseDate: date,
        nextPaymentDate,
        isPaid: false,
        accountId: accountId || null,
        subAccountId: subAccountId || null,
        category,
        subCategory,
        sourceModule,
        sourceId,
      },
    });
    result.installmentId = installment.id;

    await db.debt.update({
      where: { id: debtId },
      data: { currentBalance: { increment: amount } },
    });
    const updatedDebt = await db.debt.findUnique({
      where: { id: debtId },
      select: { id: true, currentBalance: true },
    });
    if (updatedDebt) {
      result.updatedDebts!.push({
        id: updatedDebt.id,
        currentBalance: Number(updatedDebt.currentBalance),
      });
    }
    result.debtUpdated = true;

    result.budgetUpdated = await applyCreditInstallmentBudgetImpact({
      userId,
      debtType: debt?.type,
      category,
      subCategory,
      installmentAmount,
      nextPaymentDate,
    });

  } else {
    // ── ESCENARIO C: Sin método de pago (histórico / sin cuenta) ──

    const transaction = await db.transaction.create({
      data: {
        userId,
        type: "expense",
        amount,
        description,
        category,
        subCategory,
        date,
        sourceModule,
        sourceId,
        accountId: null,
        subAccountId: null,
        notes: notes || `Despensa: ${description}`,
        excludeFromBudget: true, // Historical data doesn't affect current budget
      },
    });
    result.transactionId = transaction.id;
  }

  return result;
}

export function paymentTypeIsAccount(params: PantryFinanceParams): boolean {
  return params.paymentType === "account";
}

export function paymentTypeIsCreditCard(params: PantryFinanceParams): boolean {
  return params.paymentType === "credit_card" && !!params.debtId;
}

// ─── Reverse a finance entry (for delete/update of a shopping list) ───

export async function reversePantryFinanceEntry(
  sourceId: string,
  userId: string
): Promise<number> {
  let reversedInstallments = 0;

  const transaction = await db.transaction.findFirst({
    where: { userId, sourceModule: "pantry", sourceId },
  });

  if (transaction) {
    if (transaction.accountId) {
      const balanceChange = transaction.type === "expense" ? transaction.amount : -transaction.amount;
      if (transaction.subAccountId) {
        await db.subAccount.update({
          where: { id: transaction.subAccountId },
          data: { balance: { increment: balanceChange } },
        });
      } else {
        await db.account.update({
          where: { id: transaction.accountId },
          data: { balance: { increment: balanceChange } },
        });
      }

      if (!transaction.excludeFromBudget && transaction.category) {
        await adjustBudgetSpent({
          userId,
          category: transaction.category,
          subCategory: transaction.subCategory,
          type: transaction.type as "income" | "expense",
          amount: -Number(transaction.amount),
        });
      }
    }

    await db.transaction.delete({ where: { id: transaction.id } });
  }

  const installments = await db.installment.findMany({
    where: {
      sourceModule: "pantry",
      sourceId,
      isPaid: false,
      debt: { userId },
    },
    include: { debt: true },
  });

  for (const installment of installments) {
    await applyCreditInstallmentBudgetImpact({
      userId,
      debtType: installment.debt.type,
      category: installment.category,
      subCategory: installment.subCategory,
      installmentAmount: Number(installment.installmentAmount),
      nextPaymentDate: installment.nextPaymentDate,
      direction: -1,
    });

    await db.debt.update({
      where: { id: installment.debtId },
      data: { currentBalance: { decrement: installment.totalAmount } },
    });

    await db.installment.delete({ where: { id: installment.id } });
    reversedInstallments += 1;
  }

  return reversedInstallments;
}

// ─── Helper: Auto-description for pantry purchases ───

export function getPantryDescription(
  storeName?: string,
  itemCount?: number
): string {
  if (storeName) {
    return itemCount && itemCount > 0
      ? `Mercado ${storeName} (${itemCount} ítems)`
      : `Mercado ${storeName}`;
  }
  return itemCount && itemCount > 0
    ? `Mercado (${itemCount} ítems)`
    : "Mercado";
}