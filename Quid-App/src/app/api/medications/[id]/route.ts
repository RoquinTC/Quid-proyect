import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, medicationUpdateSchema } from "@/lib/validations";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    let body;
    try {
      body = await validateBody(req, medicationUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const existing = await db.medication.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Medicamento no encontrado" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.dosage !== undefined) updateData.dosage = body.dosage;
    if (body.frequency !== undefined) updateData.frequency = body.frequency;
    if (body.customSchedule !== undefined)
      updateData.customSchedule = body.customSchedule ? JSON.stringify(body.customSchedule) : null;
    if (body.disease !== undefined) updateData.disease = body.disease;
    if (body.howToTake !== undefined) updateData.howToTake = body.howToTake;
    if (body.startDate !== undefined)
      updateData.startDate = body.startDate ? createColombiaDate(body.startDate.split("T")[0]) : null;
    if (body.endDate !== undefined)
      updateData.endDate = body.endDate ? createColombiaDate(body.endDate.split("T")[0]) : null;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.reminderEnabled !== undefined) updateData.reminderEnabled = body.reminderEnabled;
    if (body.reminderTimes !== undefined)
      updateData.reminderTimes = body.reminderTimes ? JSON.stringify(body.reminderTimes) : null;

    const medication = await db.medication.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(medication);
  } catch (error) {
    console.error("Update medication error:", error);
    return NextResponse.json({ error: "Error al actualizar medicamento" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.medication.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Medicamento no encontrado" }, { status: 404 });
    }

    await db.medication.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete medication error:", error);
    return NextResponse.json({ error: "Error al eliminar medicamento" }, { status: 500 });
  }
}
