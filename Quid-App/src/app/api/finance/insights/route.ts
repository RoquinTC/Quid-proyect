import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { loadInsightSnapshot } from "@/lib/finance/insight-snapshot";
import { buildInsights } from "@/lib/finance/insights";

/**
 * GET /api/finance/insights
 *
 * F-10 · Devuelve los hallazgos del período actual (corte mensual o quincenal
 * según la configuración del usuario), calculados sobre las mismas cifras que
 * la pestaña Análisis.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const snapshot = await loadInsightSnapshot(session.user.id);
    const insights = buildInsights(snapshot);

    return NextResponse.json({
      period: {
        label: snapshot.periodLabel,
        start: snapshot.periodStart,
        end: snapshot.periodEnd,
        today: snapshot.today,
      },
      totals: {
        income: snapshot.current.income,
        expense: snapshot.current.expense,
        previousIncome: snapshot.previous.income,
        previousExpense: snapshot.previous.expense,
      },
      insights,
    });
  } catch (error) {
    console.error("Insights error:", error);
    return NextResponse.json(
      { error: "No se pudieron calcular los hallazgos" },
      { status: 500 }
    );
  }
}
