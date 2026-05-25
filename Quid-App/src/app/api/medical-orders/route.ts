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

    const itemsData: any[] = [];
    if (body.items) {
      for (const item of body.items) {
        let medicationId = item.medicationId || null;

        if (!medicationId && item.name) {
          const trimmedName = item.name.trim();
          // Buscar si existe el medicamento por nombre (insensitivo a mayúsculas) para el usuario
          const existingMed = await db.medication.findFirst({
            where: {
              userId: session.user.id,
              name: {
                equals: trimmedName,
                mode: "insensitive",
              },
            },
          });

          if (existingMed) {
            medicationId = existingMed.id;
            if (item.deliveredQty > 0) {
              await db.medication.update({
                where: { id: medicationId },
                data: {
                  stockQuantity: { increment: item.deliveredQty },
                },
              });
            }
          } else {
            // Auto-crear el medicamento en el catálogo
            const newMed = await db.medication.create({
              data: {
                userId: session.user.id,
                name: trimmedName,
                stockQuantity: item.deliveredQty || 0,
                stockUnit: item.unit || "unit",
                dosage: "Por definir", // O alguna dosis por defecto para cumplir con el esquema si es requerida
              },
            });
            medicationId = newMed.id;
          }
        } else if (medicationId && item.deliveredQty > 0) {
          // Si el medicamento ya está asociado y hay cantidad entregada, sumar al stock
          await db.medication.update({
            where: { id: medicationId, userId: session.user.id },
            data: {
              stockQuantity: { increment: item.deliveredQty },
            },
          });
        }

        itemsData.push({
          medicationId,
          name: item.name.trim(),
          prescribedQty: item.prescribedQty,
          deliveredQty: item.deliveredQty || 0,
          unit: item.unit || "unit",
          monthlyDose: item.monthlyDose ?? null,
          pendingQty: Math.max(0, item.prescribedQty - (item.deliveredQty || 0)),
          notes: item.notes || null,
        });
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
        items: itemsData.length > 0
          ? {
              create: itemsData,
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
