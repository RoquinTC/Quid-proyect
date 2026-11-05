import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { getBudgetPeriod } from "@/lib/holidays";
import { toNumber } from "@/lib/decimal-serializer";
import { computeSafeToSpend, isCommittedPayment } from "@/lib/finance/safe-to-spend";

/**
 * F-05 · GET /api/finance/safe-to-spend
 *
 * Devuelve cuánto se puede gastar por día sin romper el presupuesto del
 * período. El cálculo vive en `lib/finance/safe-to-spend.ts` (probado).
 *
 * El período sale de `getBudgetPeriod`, así que respeta el modo mensual o
 * quincenal configurado (F-42) — no asume un mes calendario.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const now = getColombiaNow();

    // 1) Período vigente según la configuración del usuario.
    const settings = await db.userSettings.findUnique({
      where: { userId: session.user.id },
    });
    const period = getBudgetPeriod(settings, now);

    // 2) Presupuestos de gasto (los de ingreso no aplican al disponible).
    const budgets = await db.budget.findMany({
      where: { userId: session.user.id, type: "expense" },
      select: { amount: true, spent: true },
    });

    // 3) Obligaciones pendientes: reducen lo que realmente está libre.
    const pendingPayments = await db.recurringPayment.findMany({
      where: { userId: session.user.id, status: "pending" },
      select: {
        id: true,
        description: true,
        amount: true,
        type: true,
        scheduledDate: true,
      },
    });

    const result = computeSafeToSpend({
      periodStart: period.start,
      periodEnd: period.end,
      today: now,
      budgets: budgets.map((b) => ({
        amount: toNumber(b.amount),
        spent: toNumber(b.spent),
      })),
      pendingPayments: pendingPayments.map((p) => ({
        amount: toNumber(p.amount),
        type: p.type,
        scheduledDate: p.scheduledDate,
        status: "pending",
      })),
    });

    // F-38 · Anatomía: los pagos que forman el "comprometido", para poder
    // auditar el número sin salir de la tarjeta. Se usa el MISMO predicado que
    // el cálculo, así la suma de la lista siempre coincide con el total.
    const committedPayments = pendingPayments
      .filter((p) =>
        isCommittedPayment(
          {
            amount: toNumber(p.amount),
            type: p.type,
            scheduledDate: p.scheduledDate,
            status: "pending",
          },
          period.end
        )
      )
      .map((p) => ({
        id: p.id,
        description: p.description,
        amount: toNumber(p.amount),
        type: p.type,
        scheduledDate: p.scheduledDate.toISOString(),
      }))
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate));

    return NextResponse.json({
      hasBudget: result.hasBudget,
      periodBudget: result.periodBudget,
      spent: result.spent,
      remaining: result.remaining,
      committed: result.committed,
      available: result.available,
      daysLeft: result.daysLeft,
      safePerDay: result.safePerDay,
      overBudget: result.overBudget,
      committedCount: committedPayments.length,
      committedPayments: committedPayments.slice(0, 8),
      period: {
        start: result.periodStart.toISOString(),
        end: result.periodEnd.toISOString(),
      },
    });
  } catch (error) {
    console.error("Safe to spend error:", error);
    return NextResponse.json(
      { error: "Error al calcular el disponible" },
      { status: 500 }
    );
  }
}
