import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { recordAsNeededDose, takeDose } from "@/lib/health/dose-actions";
import { findActionableOccurrence } from "@/lib/health/dose-queries";
import { validateBody, medicationTakeSchema } from "@/lib/validations";

/**
 * POST /api/medications/[id]/take
 *
 * Se mantiene por compatibilidad con la UI existente, pero ahora **registra la
 * toma** (antes solo descontaba stock, y ese descuento se perdía del historial).
 *
 * Orden de resolución:
 *   1. `occurrenceId` explícito → confirma esa toma.
 *   2. Toma abierta del día para ese medicamento → la confirma.
 *   3. Ninguna → registra una toma a demanda (PRN).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;
    const body = await validateBody(req, medicationTakeSchema);

    const medication = await db.medication.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!medication) {
      return NextResponse.json({ error: "Medicamento no encontrado" }, { status: 404 });
    }

    const at = body.takenAt ? new Date(body.takenAt) : new Date();
    const occurrenceId = body.occurrenceId ?? (await findActionableOccurrence(userId, id, { now: at }))?.id;

    const dose = occurrenceId
      ? await takeDose({ userId, occurrenceId, dose: body.quantity, at })
      : await recordAsNeededDose({ userId, medicationId: id, dose: body.quantity, at });

    const updated = await db.medication.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        stockQuantity: true,
        stockUnit: true,
        lowStockThreshold: true,
      },
    });

    return NextResponse.json({
      success: true,
      medication: updated,
      dose,
      lowStock: dose.lowStock,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Take medication error:", error);
    return NextResponse.json({ error: "Error registrando toma" }, { status: 500 });
  }
}
