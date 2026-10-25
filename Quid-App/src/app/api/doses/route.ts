import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { closeExpiredOccurrences, ensureOccurrences, recordAsNeededDose } from "@/lib/health/dose-actions";
import { listDoses } from "@/lib/health/dose-queries";
import { validateBody, doseAsNeededSchema } from "@/lib/validations";

/**
 * GET /api/doses?from=YYYY-MM-DD&to=YYYY-MM-DD&status=pending,taken
 *
 * Devuelve las tomas del rango (por defecto hoy) y, antes de leer, genera las
 * ocurrencias que falten y cierra las vencidas. Es idempotente.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;

    const params = req.nextUrl.searchParams;
    const hasRange = params.has("from") || params.has("to");

    if (!hasRange) {
      await ensureOccurrences(userId);
      await closeExpiredOccurrences(userId);
    }

    const statusParam = params.get("status");
    const status = statusParam
      ? statusParam.split(",").map((value) => value.trim()).filter(Boolean)
      : undefined;

    const result = await listDoses(userId, {
      fromDay: params.get("from") ?? undefined,
      toDay: params.get("to") ?? undefined,
      status,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("List doses error:", error);
    return NextResponse.json({ error: "Error listando tomas" }, { status: 500 });
  }
}

/**
 * POST /api/doses — toma a demanda (PRN).
 * No genera ocurrencias programadas ni cuenta para la adherencia.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await validateBody(req, doseAsNeededSchema);
    const result = await recordAsNeededDose({
      userId: session.user.id,
      medicationId: body.medicationId,
      dose: body.dose,
      note: body.note ?? null,
      at: body.at ? new Date(body.at) : undefined,
    });

    return NextResponse.json({ success: true, dose: result });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("As-needed dose error:", error);
    return NextResponse.json({ error: "Error registrando la toma" }, { status: 500 });
  }
}
