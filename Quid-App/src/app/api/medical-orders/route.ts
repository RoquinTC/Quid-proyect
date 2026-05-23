import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, medicalOrderCreateSchema } from "@/lib/validations";

function serialize(order: any) {
  return order;
}

function inferStatus(items?: { prescribedQty: number; deliveredQty: number }[]) {
  if (!items?.length) return "pending";
  const delivered = items.reduce((sum, item) => sum + item.deliveredQty, 0);
  const pending = items.some((item) => item.deliveredQty < item.prescribedQty);
  if (!pending) return "completed";
  return delivered > 0 ? "partial" : "pending";
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const orders = await db.medicalOrder.findMany({
      where: { userId: session.user.id },
      include: { items: true, appointment: true },
      orderBy: [{ status: "asc" }, { nextClaimDate: "asc" }, { issueDate: "desc" }],
    });

    return NextResponse.json(orders.map(serialize));
  } catch (error) {
    console.error("Get medical orders error:", error);
    return NextResponse.json({ error: "Error al obtener órdenes médicas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await validateBody(req, medicalOrderCreateSchema);
    if (body.appointmentId) {
      const appointment = await db.medicalAppointment.findFirst({
        where: { id: body.appointmentId, userId: session.user.id },
      });
      if (!appointment) {
        return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
      }
    }

    const order = await db.medicalOrder.create({
      data: {
        userId: session.user.id,
        appointmentId: body.appointmentId || null,
        orderNumber: body.orderNumber || null,
        title: body.title,
        issueDate: body.issueDate ? createColombiaDate(body.issueDate.split("T")[0]) : new Date(),
        nextClaimDate: body.nextClaimDate ? createColombiaDate(body.nextClaimDate.split("T")[0]) : null,
        notes: body.notes || null,
        status: inferStatus(body.items),
        items: body.items
          ? {
              create: body.items.map((item) => ({
                medicationId: item.medicationId || null,
                name: item.name,
                prescribedQty: item.prescribedQty,
                deliveredQty: item.deliveredQty,
                unit: item.unit || "unit",
                monthlyDose: item.monthlyDose ?? null,
                pendingQty: Math.max(0, item.prescribedQty - item.deliveredQty),
                notes: item.notes || null,
              })),
            }
          : undefined,
      },
      include: { items: true, appointment: true },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create medical order error:", error);
    return NextResponse.json({ error: "Error al crear orden médica" }, { status: 500 });
  }
}
