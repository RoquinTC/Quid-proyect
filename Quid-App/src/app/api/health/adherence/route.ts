import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { closeExpiredOccurrences, ensureOccurrences } from "@/lib/health/dose-actions";
import { getAdherenceSummary } from "@/lib/health/adherence";

/**
 * GET /api/health/adherence?days=7
 *
 * Adherencia del periodo: tomadas / evaluables, más omisión vs olvido, retraso
 * medio y racha actual. Antes de calcular, cierra las tomas vencidas.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;

    await ensureOccurrences(userId);
    await closeExpiredOccurrences(userId);

    const daysParam = Number(req.nextUrl.searchParams.get("days") ?? "7");
    const days = Number.isFinite(daysParam) ? daysParam : 7;

    const summary = await getAdherenceSummary(userId, { days });
    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Adherence error:", error);
    return NextResponse.json({ error: "Error calculando la adherencia" }, { status: 500 });
  }
}
