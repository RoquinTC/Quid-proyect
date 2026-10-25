import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listOverrides, upsertOverride } from "@/lib/health/dose-overrides";
import { validateBody, doseOverrideSchema } from "@/lib/validations";

/**
 * GET /api/medications/[id]/overrides?from=YYYY-MM-DD&to=YYYY-MM-DD
 * POST /api/medications/[id]/overrides  — crea/reemplaza una excepción del día
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const { id } = await params;
    const search = req.nextUrl.searchParams;
    const today = new Date().toISOString().slice(0, 10);

    const overrides = await listOverrides(session.user.id, {
      fromDay: search.get("from") ?? today,
      toDay: search.get("to") ?? today,
      medicationId: id,
    });

    return NextResponse.json({ overrides });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("List overrides error:", error);
    return NextResponse.json({ error: "Error listando excepciones" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, doseOverrideSchema);

    const result = await upsertOverride(session.user.id, id, {
      day: body.day,
      type: body.type,
      times: body.times,
      dose: body.dose,
      note: body.note ?? null,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Error guardando la excepción";
    console.error("Upsert override error:", error);
    return NextResponse.json(
      { error: message },
      { status: /no encontrado/i.test(message) ? 404 : /inválid/i.test(message) ? 400 : 500 },
    );
  }
}
