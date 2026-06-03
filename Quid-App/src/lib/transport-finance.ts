/**
 * Transport → Finance Integration Helper
 *
 * Handles the bidirectional connection between transport records
 * and the finance module. Every expense in transport creates a
 * corresponding finance entry (Transaction or Installment) with
 * full detail: account/TC, category, budget impact.
 */

import { db } from "@/lib/db";
import { MAINTENANCE_SUBCATEGORY_MAP, DOCUMENT_SUBCATEGORY_MAP } from "@/lib/types/transport";
import { adjustBudgetSpent, applyCreditInstallmentBudgetImpact } from "@/lib/budget-impact";

// ─── Types ───

export type PaymentType = "account" | "credit_card";

export interface FinanceIntegrationParams {
  userId: string;
  amount: number;
  description: string;
  category: string;       // e.g. "Transporte"
  subCategory: string;    // e.g. "Combustible", "Mantenimiento", "SOAT"
  date: Date;
  sourceModule: "transport";
  sourceId: string;       // ID of the fuel log / maintenance / document
  paymentType: PaymentType;
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  installmentCount?: number | null;
  notes?: string | null;
  vehicleName?: string;
}

export interface FinanceIntegrationResult {
  transactionId?: string;
  installmentId?: string;
  budgetUpdated: boolean;
  balanceUpdated: boolean;
  debtUpdated: boolean;
  updatedBalances?: Array<{ id: string; name: string; balance: number; isSubAccount: boolean }>;
  updatedDebts?: Array<{ id: string; currentBalance: number }>;
}

// ─── Main integration function ───

export async function createFinanceEntry(
  params: FinanceIntegrationParams
): Promise<FinanceIntegrationResult> {
  const result: FinanceIntegrationResult = {
    budgetUpdated: false,
    balanceUpdated: false,
    debtUpdated: false,
    updatedBalances: [],
    updatedDebts: [],
  };

  const {
    userId, amount, description, category, subCategory, date,
    sourceModule, sourceId, paymentType,
    accountId, subAccountId, debtId, installmentCount,
    notes,
  } = params;

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

  if (paymentType === "account" && accountId) {
    // ── ESCENARIO A: Pago con Cuenta/Bolsillo ──

    // 1. Create expense transaction
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
        notes: notes || `Transporte: ${description}`,
      },
    });
    result.transactionId = transaction.id;

    // 2. Update account/subAccount balance (decrement)
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

    // 3. Update budget spent
    result.budgetUpdated = await adjustBudgetSpent({
      userId,
      category,
      subCategory,
      type: "expense",
      amount,
    });

  } else if (paymentType === "credit_card" && debtId) {
    // ── ESCENARIO B: Pago con Tarjeta de Crédito ──

    const totalInstallments = installmentCount && installmentCount > 1 ? installmentCount : 1;
    const installmentAmount = Math.round((amount / totalInstallments) * 100) / 100;

    // 1. Calculate nextPaymentDate based on CC billing cycle
    const debt = await db.debt.findUnique({ where: { id: debtId } });
    let nextPaymentDate = new Date(date);

    if (debt?.cutoffDate && debt?.paymentDate) {
      const purchaseDay = date.getDate();
      const cutoffDay = debt.cutoffDate;
      const paymentDay = debt.paymentDate;

      if (purchaseDay >= cutoffDay) {
        // Purchase after cutoff → next month's cycle → payment the month after
        nextPaymentDate = new Date(date.getFullYear(), date.getMonth() + 2, paymentDay);
      } else {
        // Purchase before cutoff → this month's cycle → payment next month (or same month)
        if (paymentDay > cutoffDay) {
          nextPaymentDate = new Date(date.getFullYear(), date.getMonth() + 1, paymentDay);
        } else {
          nextPaymentDate = new Date(date.getFullYear(), date.getMonth() + 2, paymentDay);
        }
      }
    } else {
      // No billing cycle → payment due in 30 days
      nextPaymentDate = new Date(date.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    // 2. Create installment on the CC
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

    // 3. Increase CC's currentBalance
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
    // ── ESCENARIO C: Sin método de pago (importación histórica, datos sin cuenta) ──

    // Create transaction WITHOUT account linkage — no balance impact
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
        notes: notes || `Transporte: ${description}`,
        excludeFromBudget: true, // Historical data doesn't affect current budget
      },
    });
    result.transactionId = transaction.id;
  }

  return result;
}

// ─── Reverse a finance entry (for delete/update) ───

export async function reverseFinanceEntry(
  sourceId: string,
  userId: string
): Promise<number> {
  let reversedInstallments = 0;

  // Find the linked finance transaction
  const transaction = await db.transaction.findFirst({
    where: {
      userId,
      sourceModule: "transport",
      sourceId,
    },
  });

  if (transaction) {
    // Reverse account balance if it was linked
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

      // Reverse budget spent
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

    // Delete the transaction
    await db.transaction.delete({ where: { id: transaction.id } });
  }

  const installments = await db.installment.findMany({
    where: {
      sourceModule: "transport",
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

export async function reverseUnpaidCreditInstallmentByAmount(params: {
  userId: string;
  debtId: string;
  totalAmount: number;
}): Promise<boolean> {
  const installment = await db.installment.findFirst({
    where: {
      debtId: params.debtId,
      isPaid: false,
      debt: { userId: params.userId },
    },
    include: { debt: true },
    orderBy: { createdAt: "desc" },
  });

  if (!installment || Number(installment.totalAmount) !== params.totalAmount) {
    return false;
  }

  await applyCreditInstallmentBudgetImpact({
    userId: params.userId,
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

  return true;
}

// ─── Helper: Get auto-description for transport entries ───

export function getTransportDescription(
  type: "fuel" | "maintenance" | "document",
  vehicleName: string,
  vehicleType?: string,
  detail?: string
): string {
  switch (type) {
    case "fuel":
      return `Combustible - ${vehicleName}`;
    case "maintenance": {
      const typeLabel = vehicleType === "motorcycle" ? "Moto" :
                        vehicleType === "car" ? "Carro" :
                        vehicleType === "truck" ? "Camión" : "Vehículo";
      return `Mantenimiento ${typeLabel} - ${vehicleName}`;
    }
    case "document":
      return detail ? `${detail} - ${vehicleName}` : `Documento - ${vehicleName}`;
    default:
      return `Transporte - ${vehicleName}`;
  }
}

// ─── Helper: Get subCategory for transport entries ───

export function getTransportSubCategory(
  type: "fuel" | "maintenance" | "document",
  subType?: string
): string {
  switch (type) {
    case "fuel":
      return "Combustible";
    case "maintenance":
      // Siempre agrupar financieramente bajo "Mantenimiento" en lugar de crear subcategorías por ítem
      return "Mantenimiento";
    case "document":
      return (subType && DOCUMENT_SUBCATEGORY_MAP[subType]) || "Otro";
    default:
      return "Transporte";
  }
}
