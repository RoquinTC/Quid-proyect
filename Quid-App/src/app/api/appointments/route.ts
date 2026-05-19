import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, appointmentCreateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const appointments = await db.medicalAppointment.findMany({
      where: { userId: session.user.id },
      orderBy: { date: "asc" },
    });

    return NextResponse.json(appointments);
  } catch (error) {
    console.error("Get appointments error:", error);
    return NextResponse.json({ error: "Error al obtener citas" }, { status: 500 });
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
      body = await validateBody(req, appointmentCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { doctorName, specialty, location, date, notes, reminderEnabled, status } = body;

    if (!date) {
      return NextResponse.json(
        { error: "La fecha es requerida" },
        { status: 400 }
      );
    }

    const appointment = await db.medicalAppointment.create({
      data: {
        userId: session.user.id,
        doctorName,
        specialty,
        location,
        date: createColombiaDate(date.split("T")[0]),
        notes,
        reminderEnabled: reminderEnabled !== undefined ? reminderEnabled : true,
        status: status || "scheduled",
      },
    });

    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    console.error("Create appointment error:", error);
    return NextResponse.json({ error: "Error al crear cita" }, { status: 500 });
  }
}
