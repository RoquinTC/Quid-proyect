import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { orderId, claims, receiptUrl, nextClaimDate } = body;

    if (!orderId || !claims || !Array.isArray(claims) || claims.length === 0) {
      return NextResponse.json(
        { error: "orderId y un arreglo de reclamos son requeridos" },
        { status: 400 }
      );
    }

    // 1. Obtener la orden médica con sus ítems para validar
    const order = await db.medicalOrder.findUnique({
      where: { id: orderId, userId: session.user.id },
      include: { items: true },
    });

    if (!order) {
      return NextResponse.json({ error: "Orden médica no encontrada" }, { status: 404 });
    }

    // Ejecutar la actualización en una transacción para garantizar atomicidad
    const result = await db.$transaction(async (tx) => {
      for (const claim of claims) {
        const { itemId, medicationId, quantityToClaim } = claim;
        const qty = Number(quantityToClaim);

        if (isNaN(qty) || qty <= 0) continue;

        // Buscar el ítem correspondiente en la orden
        const orderItem = order.items.find((item) => item.id === itemId);
        if (!orderItem) {
          throw new Error(`Ítem con ID ${itemId} no pertenece a esta orden`);
        }

        // Evitar sobre-reclamar
        const finalQtyToClaim = Math.min(qty, orderItem.pendingQty);
        if (finalQtyToClaim <= 0) continue;

        // Actualizar el ítem de la orden médica
        await tx.medicalOrderItem.update({
          where: { id: itemId },
          data: {
            deliveredQty: { increment: finalQtyToClaim },
            pendingQty: { decrement: finalQtyToClaim },
          },
        });

        // Si el medicamento ya está registrado en el catálogo, aumentar el stock en casa
        if (medicationId) {
          await tx.medication.update({
            where: { id: medicationId, userId: session.user.id },
            data: {
              stockQuantity: { increment: finalQtyToClaim },
            },
          });
        }
      }

      // 2. Volver a consultar la orden para evaluar el estado final global de pendientes
      const refreshedItems = await tx.medicalOrderItem.findMany({
        where: { orderId },
      });

      const totalPending = refreshedItems.reduce((acc, item) => acc + item.pendingQty, 0);
      const totalDelivered = refreshedItems.reduce((acc, item) => acc + item.deliveredQty, 0);
      const totalPrescribed = refreshedItems.reduce((acc, item) => acc + item.prescribedQty, 0);

      let finalStatus = "pending";
      if (totalPending === 0 && totalDelivered > 0) {
        finalStatus = "completed";
      } else if (totalDelivered > 0 && totalPending > 0) {
        finalStatus = "partial";
      }

      const updatePayload: any = {
        status: finalStatus,
      };

      if (receiptUrl !== undefined) {
        updatePayload.receiptUrl = receiptUrl || null;
      }
      if (nextClaimDate !== undefined) {
        updatePayload.nextClaimDate = nextClaimDate ? new Date(nextClaimDate) : null;
      }

      const updatedOrder = await tx.medicalOrder.update({
        where: { id: orderId },
        data: updatePayload,
        include: { items: true },
      });

      return updatedOrder;
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Claim medications error:", error);
    return NextResponse.json(
      { error: error.message || "Error al registrar el reclamo de medicamentos" },
      { status: 500 }
    );
  }
}
