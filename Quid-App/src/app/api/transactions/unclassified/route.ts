import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { getBudgetPeriod } from "@/lib/holidays";
import { serializeDecimals } from "@/lib/decimal-serializer";

/**
 * GET /api/transactions/unclassified
 *
 * Returns all transactions in the current budget period that do not have
 * a valid category assigned (category is null, empty, or "Otros").
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Get user's budget period settings
    const settings = await db.userSettings.findUnique({ where: { userId } });
    const cutoffDay = settings?.budgetCutoffDay || 1;
    const respectHolidays = settings?.respectHolidays ?? true;

    // getBudgetPeriod respeta el modo de ciclo (mensual | quincenal)
    const { start: periodStart, end: periodEnd } = getBudgetPeriod(settings, getColombiaNow());


    const periodEndPlus = new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000);

    // Fetch unclassified transactions
    const transactions = await db.transaction.findMany({
      where: {
        userId,
        date: { gte: periodStart, lt: periodEndPlus },
        type: { in: ["income", "expense"] },
        relatedTransactionId: null,
        OR: [
          { category: null },
          { category: "" },
          { category: "Otros" },
        ],
        AND: [
          {
            OR: [
              { sourceModule: null },
              { sourceModule: { not: "finance_transfer" } },
            ],
          },
          {
            OR: [
              { excludeFromBudget: false },
              { excludeFromBudget: { equals: null } },
            ],
          },
        ],
      },
      include: {
        account: { select: { id: true, name: true, type: true, color: true } },
        subAccount: { select: { id: true, name: true, color: true } },
      },
      orderBy: { date: "desc" },
    });

    const serialized = serializeDecimals(transactions);
    return NextResponse.json(serialized);
  } catch (error) {
    console.error("Get unclassified transactions error:", error);
    return NextResponse.json(
      { error: "Error al obtener transacciones sin clasificar" },
      { status: 500 }
    );
  }
}
