import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, medicationTakeSchema } from "@/lib/validations";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, medicationTakeSchema);
    const medication = await db.medication.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!medication) {
      return NextResponse.json({ error: "Medicamento no encontrado" }, { status: 404 });
    }

    const dose = body.quantity ?? medication.doseQuantity ?? 1;
    const current = medication.stockQuantity ?? null;
    const updated = await db.medication.update({
      where: { id },
      data: current == null ? {} : { stockQuantity: Math.max(0, current - dose) },
    });

    return NextResponse.json({
      success: true,
      medication: updated,
      lowStock:
        updated.stockQuantity != null &&
        updated.lowStockThreshold != null &&
        updated.stockQuantity <= updated.lowStockThreshold,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Take medication error:", error);
    return NextResponse.json({ error: "Error registrando toma" }, { status: 500 });
  }
}
