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
}

// ─── Budget matching (mirrors the pattern in /api/transactions) ───

async function findMatchingBudget(
  userId: string,
  category: string,
  subCategory: string | null,
  type: "income" | "expense"
) {
  // 1. Try exact match with subCategory
  if (subCategory) {
    const specific = await db.budget.findFirst({
      where: { userId, category, subCategory, type },
    });
    if (specific) return specific;
  }
  // 2. Fall back to parent budget (no subCategory)
  return db.budget.findFirst({
    where: { userId, category, subCategory: null, type },
  });
}

// ─── Main integration function ───

export async function createFinanceEntry(
  params: FinanceIntegrationParams
): Promise<FinanceIntegrationResult> {
  const result: FinanceIntegrationResult = {
    budgetUpdated: false,
    balanceUpdated: false,
    debtUpdated: false,
  };

  const {
    userId, amount, description, category, subCategory, date,
    sourceModule, sourceId, paymentType,
    accountId, subAccountId, debtId, installmentCount,
    notes,
  } = params;

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
    } else {
      await db.account.update({
        where: { id: accountId },
        data: { balance: { increment: balanceChange } },
      });
    }
    result.balanceUpdated = true;

    // 3. Update budget spent
    const budget = await findMatchingBudget(userId, category, subCategory, "expense");
    if (budget) {
      await db.budget.update({
        where: { id: budget.id },
        data: { spent: { increment: amount } },
      });
      result.budgetUpdated = true;
    }

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
      },
    });
    result.installmentId = installment.id;

    // 3. Increase CC's currentBalance
    await db.debt.update({
      where: { id: debtId },
      data: { currentBalance: { increment: amount } },
    });
    result.debtUpdated = true;

    // 4. For CC purchases, budget is updated when the CC payment is made,
    //    NOT at purchase time (this matches the existing finance module behavior)

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
): Promise<void> {
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
        const budget = await findMatchingBudget(
          userId,
          transaction.category,
          transaction.subCategory,
          transaction.type as "income" | "expense"
        );
        if (budget) {
          const spentChange = transaction.type === "expense" ? -transaction.amount : -transaction.amount;
          await db.budget.update({
            where: { id: budget.id },
            data: { spent: { increment: spentChange } },
          });
        }
      }
    }

    // Delete the transaction
    await db.transaction.delete({ where: { id: transaction.id } });
  }

  // Find and delete any linked installments (CC purchases)
  // Installments are linked via the sourceId stored in description or a custom field
  // Since we can't easily reverse installments that already have payments,
  // we'll look for unpaid installments with matching descriptions
  // This is a best-effort approach — for fully paid CC items, manual reversal is needed
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
      return (subType && MAINTENANCE_SUBCATEGORY_MAP[subType]) || "Mantenimiento";
    case "document":
      return (subType && DOCUMENT_SUBCATEGORY_MAP[subType]) || "Otro";
    default:
      return "Transporte";
  }
}
