import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const authorizations = await db.medicalAuthorization.findMany({
      where: { userId: session.user.id },
      include: {
        appointment: true,
        originAppointment: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(authorizations);
  } catch (error) {
    console.error("Get authorizations error:", error);
    return NextResponse.json({ error: "Error al obtener autorizaciones" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const {
      type,
      specialty,
      status,
      code,
      authorizationDate,
      daysOfValidity,
      notes,
      originAppointmentId,
      appointmentId,
    } = body;

    if (!specialty) {
      return NextResponse.json({ error: "La especialidad es requerida" }, { status: 400 });
    }

    // Calcular fecha de vencimiento si aplica
    let expirationDate: Date | null = null;
    if (authorizationDate && daysOfValidity) {
      const authDate = new Date(authorizationDate);
      expirationDate = new Date(authDate.getTime() + daysOfValidity * 24 * 60 * 60 * 1000);
    }

    const authorization = await db.medicalAuthorization.create({
      data: {
        userId: session.user.id,
        type: type || "specialist",
        specialty,
        status: status || "pending_authorization",
        code: code || null,
        authorizationDate: authorizationDate ? new Date(authorizationDate) : null,
        daysOfValidity: daysOfValidity ? Number(daysOfValidity) : 30,
        expirationDate,
        notes: notes || null,
        originAppointmentId: originAppointmentId || null,
        appointmentId: appointmentId || null,
        renewals: [],
      },
    });

    return NextResponse.json(authorization, { status: 201 });
  } catch (error) {
    console.error("Create authorization error:", error);
    return NextResponse.json({ error: "Error al crear autorización" }, { status: 500 });
  }
}
