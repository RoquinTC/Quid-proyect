import type { Prisma } from "@prisma/client";
import { toNumber } from "@/lib/decimal-serializer";

/**
 * Recalcula los contadores que la tarjeta de deuda muestra, a partir de las
 * cuotas reales.
 *
 * Antes, `remainingPayments` y `monthlyPayment` se guardaban al crear la deuda
 * y **nunca se actualizaban** al pagar o reversar: la tarjeta decía "27 rest."
 * con 24 por pagar, y una deuda con cuota vacía mostraba "$0,00".
 */
export async function syncDebtState(
  client: Prisma.TransactionClient,
  debtId: string
): Promise<{ remaining: number; monthlyPayment: number | null }> {
  const installments = await client.installment.findMany({
    where: { debtId },
    select: {
      isPaid: true,
      currentInstallment: true,
      totalInstallments: true,
      installmentAmount: true,
      nextPaymentDate: true,
    },
    orderBy: { currentInstallment: "asc" },
  });

  const pending = installments
    .filter((installment) => !installment.isPaid)
    .sort((a, b) => a.nextPaymentDate.getTime() - b.nextPaymentDate.getTime());

  // El plan tiene N cuotas y solo se crea la siguiente al pagar: lo que falta es
  // total − pagadas, no la cantidad de filas pendientes (que siempre es 1).
  const totalPlan = installments.reduce(
    (max, installment) => Math.max(max, installment.totalInstallments),
    0
  );
  const paidCount = installments.filter((installment) => installment.isPaid).length;
  const remaining = Math.max(0, totalPlan - paidCount);
  const monthlyPayment = pending.length > 0 ? toNumber(pending[0].installmentAmount) : null;

  await client.debt.update({
    where: { id: debtId },
    data: {
      remainingPayments: remaining,
      ...(monthlyPayment !== null ? { monthlyPayment } : {}),
    },
  });

  return { remaining, monthlyPayment };
}
