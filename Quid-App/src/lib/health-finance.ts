import { db } from "@/lib/db";
import { adjustBudgetSpent, applyCreditInstallmentBudgetImpact } from "@/lib/budget-impact";

export type PaymentType = "account" | "credit_card";

export async function createHealthFinanceEntry(params: {
  userId: string;
  appointmentId: string;
  amount: number;
  description: string;
  date: Date;
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
}) {
  const { userId, appointmentId, amount, description, date, accountId, subAccountId, debtId } = params;

  if (amount <= 0) return null;

  // Validaciones de seguridad
  if (accountId) {
    const account = await db.account.findFirst({ where: { id: accountId, userId } });
    if (!account) throw new Error("Cuenta no encontrada");
  }
  if (subAccountId) {
    const subAccount = await db.subAccount.findFirst({
      where: { id: subAccountId, account: { userId } },
    });
    if (!subAccount) throw new Error("Subcuenta no encontrada");
  }
  if (debtId) {
    const debt = await db.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) throw new Error("Tarjeta o deuda no encontrada");
  }

  const category = "Salud";
  const subCategory = "Copago Cita Medica";

  if (debtId) {
    // Compra con Tarjeta de Crédito
    const debt = await db.debt.findUnique({ where: { id: debtId } });
    let nextPaymentDate = new Date();
    if (debt?.cutoffDate && debt?.paymentDate) {
      const purchaseDay = nextPaymentDate.getDate();
      const cutoffDay = debt.cutoffDate;
      const paymentDay = debt.paymentDate;
      if (purchaseDay >= cutoffDay) {
        nextPaymentDate = new Date(nextPaymentDate.getFullYear(), nextPaymentDate.getMonth() + 2, paymentDay);
      } else {
        if (paymentDay > cutoffDay) {
          nextPaymentDate = new Date(nextPaymentDate.getFullYear(), nextPaymentDate.getMonth() + 1, paymentDay);
        } else {
          nextPaymentDate = new Date(nextPaymentDate.getFullYear(), nextPaymentDate.getMonth() + 2, paymentDay);
        }
      }
    } else {
      nextPaymentDate = new Date(nextPaymentDate.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    const installment = await db.installment.create({
      data: {
        debtId,
        description,
        totalAmount: amount,
        totalInstallments: 1,
        currentInstallment: 1,
        installmentAmount: amount,
        paidAmount: 0,
        remainingBalance: amount,
        purchaseDate: date,
        nextPaymentDate,
        isPaid: false,
        accountId: accountId || null,
        subAccountId: subAccountId || null,
        category,
        subCategory,
        sourceModule: "health",
        sourceId: appointmentId,
      },
    });

    await db.debt.update({
      where: { id: debtId },
      data: { currentBalance: { increment: amount } },
    });

    // Vincular la fuente al appointment
    await db.medicalAppointment.update({
      where: { id: appointmentId },
      data: { financeSourceId: installment.id },
    });

    await applyCreditInstallmentBudgetImpact({
      userId,
      debtType: debt?.type,
      category,
      subCategory,
      installmentAmount: amount,
      nextPaymentDate,
    });

    return { type: "credit_card", id: installment.id };
  } else if (accountId) {
    // Pago con Cuenta / Bolsillo (Digital Wallet)
    const transaction = await db.transaction.create({
      data: {
        userId,
        type: "expense",
        amount,
        description,
        category,
        subCategory,
        date,
        sourceModule: "health",
        sourceId: appointmentId,
        accountId,
        subAccountId: subAccountId || null,
        notes: `Registrado automáticamente desde cita médica.`,
      },
    });

    // Actualizar saldo de la cuenta/bolsillo
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

    // Actualizar presupuesto
    await adjustBudgetSpent({ userId, category, subCategory, type: "expense", amount });

    // Vincular la fuente al appointment
    await db.medicalAppointment.update({
      where: { id: appointmentId },
      data: { financeSourceId: transaction.id },
    });

    return { type: "account", id: transaction.id };
  }

  return null;
}

export async function reverseHealthFinanceEntry(appointmentId: string, userId: string): Promise<void> {
  const appointment = await db.medicalAppointment.findUnique({
    where: { id: appointmentId },
    select: { id: true, financeSourceId: true, copayAmount: true },
  });

  if (!appointment || !appointment.financeSourceId) return;

  const sourceId = appointment.financeSourceId;

  // 1. Buscar si es una Transacción normal
  const transaction = await db.transaction.findFirst({
    where: { id: sourceId, userId, sourceModule: "health" },
  });

  if (transaction) {
    // Revertir saldo de cuenta
    if (transaction.accountId) {
      const balanceChange = Number(transaction.amount); // Devolver el gasto
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

      // Revertir presupuesto gastado
      if (transaction.category) {
        await adjustBudgetSpent({
          userId,
          category: transaction.category,
          subCategory: transaction.subCategory,
          type: "expense",
          amount: -Number(transaction.amount),
        });
      }
    }

    // Eliminar transacción
    await db.transaction.delete({ where: { id: transaction.id } });
  } else {
    // 2. Buscar si es una cuota de TC
    const installment = await db.installment.findFirst({
      where: { id: sourceId, debt: { userId } },
      include: { debt: true },
    });

    if (installment) {
      // Revertir saldo de la tarjeta
      await db.debt.update({
        where: { id: installment.debtId },
        data: { currentBalance: { increment: -Number(installment.totalAmount) } },
      });

      await applyCreditInstallmentBudgetImpact({
        userId,
        debtType: installment.debt.type,
        category: installment.category,
        subCategory: installment.subCategory,
        installmentAmount: Number(installment.installmentAmount),
        nextPaymentDate: installment.nextPaymentDate,
        direction: -1,
      });

      // Eliminar cuota
      await db.installment.delete({ where: { id: installment.id } });
    }
  }

  // Limpiar financeSourceId de la cita médica
  await db.medicalAppointment.update({
    where: { id: appointmentId },
    data: { financeSourceId: null },
  });
}
