import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, medicationCreateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const medications = await db.medication.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(medications);
  } catch (error) {
    console.error("Get medications error:", error);
    return NextResponse.json({ error: "Error al obtener medicamentos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, medicationCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const {
      name,
      dosage,
      frequency,
      customSchedule,
      disease,
      howToTake,
      startDate,
      endDate,
      isActive,
      reminderEnabled,
      reminderTimes,
    } = body;

    if (!name || !dosage) {
      return NextResponse.json(
        { error: "El nombre y la dosis son requeridos" },
        { status: 400 }
      );
    }

    const medication = await db.medication.create({
      data: {
        userId: session.user.id,
        name,
        dosage,
        frequency: frequency || "daily",
        customSchedule: customSchedule ? JSON.stringify(customSchedule) : null,
        disease,
        howToTake,
        startDate: startDate ? createColombiaDate(startDate.split("T")[0]) : null,
        endDate: endDate ? createColombiaDate(endDate.split("T")[0]) : null,
        isActive: isActive !== undefined ? isActive : true,
        reminderEnabled: reminderEnabled !== undefined ? reminderEnabled : true,
        reminderTimes: reminderTimes ? JSON.stringify(reminderTimes) : null,
      },
    });

    return NextResponse.json(medication, { status: 201 });
  } catch (error) {
    console.error("Create medication error:", error);
    return NextResponse.json({ error: "Error al crear medicamento" }, { status: 500 });
  }
}
