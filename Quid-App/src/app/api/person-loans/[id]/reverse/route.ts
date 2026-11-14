import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { applyBalanceDelta } from "@/lib/finance-ledger";

export const dynamic = "force-dynamic";

/**
 * F-25b · Revertir el pago de una cuota: borra el movimiento, devuelve el
 * saldo a la cuenta y deja la cuota pendiente otra vez.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { installmentId?: string } | null;
  if (!body?.installmentId) {
    return NextResponse.json({ error: "Falta la cuota" }, { status: 400 });
  }

  const loan = await db.personLoan.findFirst({
    where: { id, userId: session.user.id },
    include: { installments: true },
  });
  if (!loan) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const installment = loan.installments.find((row) => row.id === body.installmentId);
  if (!installment) return NextResponse.json({ error: "Cuota no encontrada" }, { status: 404 });
  if (!installment.paymentTransactionId) {
    return NextResponse.json({ error: "Esa cuota no tiene un pago para revertir" }, { status: 400 });
  }

  const transaction = await db.transaction.findFirst({
    where: { id: installment.paymentTransactionId, userId: session.user.id },
  });
  if (!transaction) {
    return NextResponse.json({ error: "El movimiento ya no existe" }, { status: 400 });
  }

  const amount = toNumber(transaction.amount);
  const isIncoming = transaction.type === "income";

  await db.$transaction(async (tx) => {
    await applyBalanceDelta(tx, {
      accountId: transaction.accountId,
      subAccountId: transaction.subAccountId ?? null,
      amount: isIncoming ? -amount : amount,
    });

    await tx.transaction.delete({ where: { id: transaction.id } });

    await tx.personLoanInstallment.update({
      where: { id: installment.id },
      data: {
        paidAmount: 0,
        isPaid: false,
        paidAt: null,
        paymentTransactionId: null,
      },
    });

    await tx.personLoan.update({
      where: { id: loan.id },
      data: {
        paidAmount: Math.max(0, toNumber(loan.paidAmount) - amount),
        status: "open",
      },
    });
  });

  return NextResponse.json({ ok: true });
}
