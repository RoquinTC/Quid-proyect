import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { buildProjection, toDateKey, type ProjectionEvent } from "@/lib/finance/projection";

/**
 * F-41 · Proyección del saldo día a día.
 *
 * Parte de lo que hay disponible HOY (cuentas, sin tarjetas de crédito ni las
 * marcadas como excluidas) y aplica los pagos programados que ya existen.
 * No inventa ingresos futuros: si la nómina está registrada como recurrente,
 * entra; si no, no aparece.
 *
 * Es una proyección, no una promesa: se recalcula con cada consulta.
 */

const DEFAULT_DAYS = 60;
const MAX_DAYS = 120;

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requested = Number(searchParams.get("days")) || DEFAULT_DAYS;
    const days = Math.max(1, Math.min(requested, MAX_DAYS));

    // Saldo disponible hoy: todo menos tarjetas de crédito (son deuda, no
    // dinero) y lo que el usuario excluyó a propósito.
    const accounts = await db.account.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, type: true, balance: true, excludeFromAvailable: true },
    });

    const startBalance = accounts
      .filter((account) => account.type !== "credit_card" && !account.excludeFromAvailable)
      .reduce((sum, account) => sum + toNumber(account.balance), 0);

    const today = new Date();
    const from = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const to = new Date(from.getTime());
    to.setDate(to.getDate() + days);

    // Pagos programados dentro de la ventana.
    const payments = await db.recurringPayment.findMany({
      where: {
        userId: session.user.id,
        status: "pending",
        scheduledDate: { gte: from, lte: to },
      },
      select: {
        id: true,
        description: true,
        amount: true,
        type: true,
        scheduledDate: true,
      },
      orderBy: { scheduledDate: "asc" },
    });

    const events: ProjectionEvent[] = payments.map((payment) => ({
      date: toDateKey(payment.scheduledDate),
      amount: toNumber(payment.amount),
      type: payment.type,
      description: payment.description,
    }));

    const projection = buildProjection(startBalance, events, from, days);

    return NextResponse.json({
      startBalance: projection.startBalance,
      endBalance: projection.endBalance,
      lowest: projection.lowest,
      daysInRed: projection.daysInRed,
      totalIn: projection.totalIn,
      totalOut: projection.totalOut,
      days: projection.days,
      accountsConsidered: accounts.filter(
        (account) => account.type !== "credit_card" && !account.excludeFromAvailable
      ).length,
      paymentsInWindow: payments.length,
    });
  } catch (error) {
    console.error("Projection error:", error);
    return NextResponse.json({ error: "Error al proyectar" }, { status: 500 });
  }
}
