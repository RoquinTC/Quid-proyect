import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  direction: z.enum(["lent", "borrowed"]),
  personName: z.string().trim().min(1).max(80),
  amount: z.number().positive(),
  date: z.string().optional(),
  dueDate: z.string().optional().nullable(),
  description: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  /** Cuántas cuotas generar (1 = pago único). */
  installments: z.number().int().min(1).max(60).optional(),
  /** Cuenta con la que se cobra o se paga. */
  accountId: z.string().optional().nullable(),
  /** Primera fecha de cuota (AAAA-MM-DD). Si falta, se usa hoy + 1 mes. */
  firstDueDate: z.string().optional().nullable(),
});

/** F-25 · Préstamos entre personas: listar con totales. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const loans = await db.personLoan.findMany({
    where: { userId: session.user.id },
    orderBy: [{ status: "asc" }, { date: "desc" }],
  });

  const mapped = loans.map((loan) => {
    const amount = toNumber(loan.amount);
    const paid = toNumber(loan.paidAmount);
    return {
      id: loan.id,
      direction: loan.direction,
      personName: loan.personName,
      description: loan.description,
      amount,
      paidAmount: paid,
      balance: Math.max(0, Math.round((amount - paid) * 100) / 100),
      date: loan.date.toISOString(),
      dueDate: loan.dueDate ? loan.dueDate.toISOString() : null,
      status: loan.status,
    };
  });

  const lent = mapped
    .filter((loan) => loan.direction === "lent" && loan.status !== "settled")
    .reduce((sum, loan) => sum + loan.balance, 0);
  const borrowed = mapped
    .filter((loan) => loan.direction === "borrowed" && loan.status !== "settled")
    .reduce((sum, loan) => sum + loan.balance, 0);

  return NextResponse.json({
    loans: mapped,
    summary: {
      lent: Math.round(lent * 100) / 100,
      borrowed: Math.round(borrowed * 100) / 100,
      net: Math.round((lent - borrowed) * 100) / 100,
    },
  });
}

/** F-25 · Crear un préstamo entre personas. */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", details: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const date = data.date ? new Date(`${data.date}T05:00:00.000Z`) : new Date();
  if (Number.isNaN(date.getTime())) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const loan = await db.personLoan.create({
    data: {
      userId: session.user.id,
      direction: data.direction,
      personName: data.personName,
      description: data.description ?? null,
      amount: data.amount,
      date,
      dueDate: data.dueDate ? new Date(`${data.dueDate}T05:00:00.000Z`) : null,
      notes: data.notes ?? null,
      accountId: data.accountId ?? null,
    },
  });

  // Cuotas: se reparten parejo y la última ajusta el redondeo.
  const count = data.installments ?? 1;
  const base = Math.floor((data.amount / count) * 100) / 100;
  const firstDue = data.firstDueDate
    ? new Date(`${data.firstDueDate}T05:00:00.000Z`)
    : new Date(date.getTime());
  if (!data.firstDueDate) firstDue.setUTCMonth(firstDue.getUTCMonth() + 1);

  const rows = Array.from({ length: count }, (_, index) => {
    const dueDate = new Date(firstDue.getTime());
    dueDate.setUTCMonth(dueDate.getUTCMonth() + index);
    const amount = index === count - 1 ? Math.round((data.amount - base * (count - 1)) * 100) / 100 : base;
    return {
      loanId: loan.id,
      number: index + 1,
      amount,
      dueDate,
    };
  });
  await db.personLoanInstallment.createMany({ data: rows });

  return NextResponse.json({ id: loan.id, installments: rows.length }, { status: 201 });
}
