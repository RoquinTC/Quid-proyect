import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { addStock } from "@/lib/health/dose-actions";
import { validateBody, medicationStockSchema } from "@/lib/validations";

/**
 * POST /api/medications/[id]/stock — reponer o corregir existencias.
 * Deja asiento en `MedicationStockEntry` para poder auditar el inventario.
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

    const { id } = await params;
    const body = await validateBody(req, medicationStockSchema);

    const result = await addStock({
      userId: session.user.id,
      medicationId: id,
      amount: body.amount,
      reason: body.reason ?? "refill",
      note: body.note ?? null,
    });

    const medication = await db.medication.findFirst({
      where: { id, userId: session.user.id },
      select: {
        id: true,
        stockQuantity: true,
        stockUnit: true,
        lowStockThreshold: true,
      },
    });

    return NextResponse.json({ success: true, medication, ...result });
  } catch (error) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : "Error actualizando el stock";
    console.error("Medication stock error:", error);
    return NextResponse.json(
      { error: message },
      { status: /no encontrado|inválida/i.test(message) ? 404 : 500 },
    );
  }
}
