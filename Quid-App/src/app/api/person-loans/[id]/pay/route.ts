import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { applyBalanceDelta } from "@/lib/finance-ledger";

export const dynamic = "force-dynamic";

const paySchema = z.object({
  installmentId: z.string().min(1),
  accountId: z.string().min(1),
  amount: z.number().positive().optional(),
  date: z.string().optional(),
});

/**
 * F-25b · Pagar una cuota de un préstamo entre personas.
 *
 * Genera un movimiento real en la cuenta elegida:
 * - "lent" (me deben): entra dinero a la cuenta → ingreso.
 * - "borrowed" (debo): sale dinero → gasto.
 * No toca presupuestos (`excludeFromBudget`), porque prestar o devolver no es
 * un gasto del mes; solo mueve saldos.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const raw = await req.json().catch(() => null);
  const parsed = paySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const loan = await db.personLoan.findFirst({
    where: { id, userId: session.user.id },
    include: { installments: true },
  });
  if (!loan) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const installment = loan.installments.find((row) => row.id === parsed.data.installmentId);
  if (!installment) return NextResponse.json({ error: "Cuota no encontrada" }, { status: 404 });
  if (installment.isPaid) {
    return NextResponse.json({ error: "Esa cuota ya está pagada" }, { status: 400 });
  }

  const account = await db.account.findFirst({
    where: { id: parsed.data.accountId, userId: session.user.id },
    select: { id: true },
  });
  if (!account) return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });

  const amount = parsed.data.amount ?? toNumber(installment.amount);
  const date = parsed.data.date ? new Date(`${parsed.data.date}T05:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const isIncoming = loan.direction === "lent";

  // Se puede abonar más que una cuota: el excedente baja a las siguientes.
  const outstanding = Math.max(0, toNumber(loan.amount) - toNumber(loan.paidAmount));
  const requested = amount;
  if (requested > outstanding + 0.005) {
    return NextResponse.json(
      { error: `Ese abono supera lo que falta del préstamo (${outstanding.toFixed(2)}).` },
      { status: 400 }
    );
  }

  const ordered = [...loan.installments].sort((a, b) => a.number - b.number);
  const startIndex = ordered.findIndex((row) => row.id === installment.id);
  let remaining = requested;
  const applied: Array<{ id: string; paid: number; isPaid: boolean }> = [];

  for (let index = startIndex; index < ordered.length && remaining > 0.005; index += 1) {
    const row = ordered[index];
    const due = toNumber(row.amount) - toNumber(row.paidAmount);
    if (due <= 0.005) continue;
    const take = Math.min(remaining, due);
    const paid = toNumber(row.paidAmount) + take;
    applied.push({ id: row.id, paid, isPaid: paid >= toNumber(row.amount) - 0.005 });
    remaining -= take;
  }

  const result = await db.$transaction(async (tx) => {
    const transaction = await tx.transaction.create({
      data: {
        userId: session.user.id,
        accountId: account.id,
        type: isIncoming ? "income" : "expense",
        amount: requested,
        description: isIncoming
          ? `Cobro de préstamo: ${loan.personName}`
          : `Pago de préstamo: ${loan.personName}`,
        category: isIncoming ? "Otros ingresos" : "Deudas",
        date,
        sourceModule: "person_loan",
        sourceId: loan.id,
        excludeFromBudget: true,
      },
    });

    await applyBalanceDelta(tx, {
      accountId: account.id,
      subAccountId: null,
      amount: isIncoming ? requested : -requested,
    });

    for (const entry of applied) {
      await tx.personLoanInstallment.update({
        where: { id: entry.id },
        data: {
          paidAmount: entry.paid,
          isPaid: entry.isPaid,
          paidAt: entry.isPaid ? date : null,
          accountId: account.id,
          paymentTransactionId: transaction.id,
        },
      });
    }

    const loanPaid = toNumber(loan.paidAmount) + requested;
    const loanSettled = loanPaid >= toNumber(loan.amount) - 0.005;
    await tx.personLoan.update({
      where: { id: loan.id },
      data: { paidAmount: loanPaid, status: loanSettled ? "settled" : "open" },
    });

    return {
      transactionId: transaction.id,
      installmentsTouched: applied.length,
      loanSettled,
    };
  });

  return NextResponse.json(result);
}
