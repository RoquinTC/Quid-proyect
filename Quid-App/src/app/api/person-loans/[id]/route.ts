import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  payment: z.number().positive().optional(),
});

/** F-25 · Registrar un abono o marcar como saldado. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const loan = await db.personLoan.findFirst({ where: { id, userId: session.user.id } });
  if (!loan) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const amount = toNumber(loan.amount);
  const paid = toNumber(loan.paidAmount);
  const nextPaid = Math.min(amount, paid + (parsed.data.payment ?? 0));
  const settled = nextPaid >= amount - 0.005;

  const updated = await db.personLoan.update({
    where: { id: loan.id },
    data: { paidAmount: nextPaid, status: settled ? "settled" : "open" },
  });

  return NextResponse.json({
    id: updated.id,
    paidAmount: toNumber(updated.paidAmount),
    balance: Math.max(0, Math.round((amount - nextPaid) * 100) / 100),
    status: updated.status,
  });
}

/** F-25 · Borrar un préstamo registrado por error. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await params;
  const deleted = await db.personLoan.deleteMany({ where: { id, userId: session.user.id } });
  if (deleted.count === 0) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
