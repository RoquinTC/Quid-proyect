import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, medicalOrderUpdateSchema } from "@/lib/validations";

function inferStatus(items?: { prescribedQty: number; deliveredQty: number }[]) {
  if (!items?.length) return "pending";
  const delivered = items.reduce((sum, item) => sum + item.deliveredQty, 0);
  const pending = items.some((item) => item.deliveredQty < item.prescribedQty);
  if (!pending) return "completed";
  return delivered > 0 ? "partial" : "pending";
}

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
    const existing = await db.medicalOrder.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const body = await validateBody(req, medicalOrderUpdateSchema);
    const order = await db.$transaction(async (tx) => {
      const updated = await tx.medicalOrder.update({
        where: { id },
        data: {
          ...(body.appointmentId !== undefined && { appointmentId: body.appointmentId || null }),
          ...(body.orderNumber !== undefined && { orderNumber: body.orderNumber || null }),
          ...(body.title !== undefined && { title: body.title }),
          ...(body.status !== undefined && { status: body.status }),
          ...(body.issueDate !== undefined && { issueDate: createColombiaDate(body.issueDate.split("T")[0]) }),
          ...(body.nextClaimDate !== undefined && { nextClaimDate: body.nextClaimDate ? createColombiaDate(body.nextClaimDate.split("T")[0]) : null }),
          ...(body.notes !== undefined && { notes: body.notes || null }),
        },
      });

      if (body.items) {
        await tx.medicalOrderItem.deleteMany({ where: { orderId: id } });
        await tx.medicalOrderItem.createMany({
          data: body.items.map((item) => ({
            orderId: id,
            medicationId: item.medicationId || null,
            name: item.name,
            prescribedQty: item.prescribedQty,
            deliveredQty: item.deliveredQty,
            unit: item.unit || "unit",
            monthlyDose: item.monthlyDose ?? null,
            pendingQty: Math.max(0, item.prescribedQty - item.deliveredQty),
            notes: item.notes || null,
          })),
        });
        if (body.status === undefined) {
          await tx.medicalOrder.update({
            where: { id },
            data: { status: inferStatus(body.items) },
          });
        }
      }

      return tx.medicalOrder.findUnique({
        where: { id: updated.id },
        include: { items: true, appointment: true },
      });
    });

    return NextResponse.json(order);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update medical order error:", error);
    return NextResponse.json({ error: "Error al actualizar orden médica" }, { status: 500 });
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
    const existing = await db.medicalOrder.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    await db.medicalOrder.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete medical order error:", error);
    return NextResponse.json({ error: "Error al eliminar orden médica" }, { status: 500 });
  }
}
