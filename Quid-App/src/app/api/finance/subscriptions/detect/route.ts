import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import {
  detectSubscriptions,
  normalizeMerchant,
} from "@/lib/finance/subscription-detector";

/** Cuánto historial se mira. Con 12 meses entran las suscripciones anuales. */
const WINDOW_MONTHS = 12;

/**
 * GET /api/finance/subscriptions/detect
 *
 * F-23 · Sugerencias de suscripción a partir del historial de gastos.
 *
 * No crea nada y no propone lo que el usuario ya descartó (el descarte vive en
 * la base, así que vale en todos sus equipos) ni lo que ya existe como pago
 * recurrente.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const since = new Date();
    since.setMonth(since.getMonth() - WINDOW_MONTHS);

    const [transactions, dismissals, recurring] = await Promise.all([
      db.transaction.findMany({
        where: {
          userId,
          type: "expense",
          date: { gte: since },
          relatedTransactionId: null,
          sourceModule: { not: "finance_transfer" },
        },
        select: {
          id: true,
          date: true,
          amount: true,
          description: true,
          category: true,
          type: true,
        },
        orderBy: { date: "asc" },
      }),
      db.subscriptionSuggestionDismissal.findMany({
        where: { userId },
        select: { merchantKey: true },
      }),
      db.recurringPayment.findMany({
        where: { userId, status: { not: "cancelled" } },
        select: { description: true },
      }),
    ]);

    const dismissed = new Set(dismissals.map((entry) => entry.merchantKey));
    const existing = new Set(
      recurring
        .map((payment) => normalizeMerchant(payment.description))
        .filter(Boolean)
    );

    const candidates = detectSubscriptions(
      transactions.map((transaction) => ({
        id: transaction.id,
        date: transaction.date.toISOString(),
        amount: toNumber(transaction.amount),
        description: transaction.description,
        category: transaction.category,
        type: transaction.type,
      }))
    ).filter(
      (candidate) =>
        !dismissed.has(candidate.merchantKey) && !existing.has(candidate.merchantKey)
    );

    return NextResponse.json({
      candidates,
      windowMonths: WINDOW_MONTHS,
      scanned: transactions.length,
    });
  } catch (error) {
    console.error("Subscription detection error:", error);
    return NextResponse.json(
      { error: "No se pudieron detectar suscripciones" },
      { status: 500 }
    );
  }
}
