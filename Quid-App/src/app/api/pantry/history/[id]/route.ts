import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/pantry/api-helpers";
import { reverseConfirmation } from "@/lib/pantry/reverse";
import { toNumber } from "@/lib/decimal-serializer";

/**
 * GET /api/pantry/history/[id]
 *
 * El **tiquete**: los productos que entraron a la nevera en esa confirmación.
 *
 * Se leen de `PantryMovement` filtrado por `confirmationId`, que es la fuente
 * exacta: cada movimiento sabe qué línea lo originó (`sourceItemId`) y con qué
 * precio entró.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const confirmation = await db.pantryListConfirmation.findFirst({
      where: { id, userId: auth.userId },
      include: {
        shoppingList: { select: { id: true, name: true, status: true } },
      },
    });

    if (!confirmation) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    const movements = await db.pantryMovement.findMany({
      where: { confirmationId: id, userId: auth.userId },
      orderBy: { occurredAt: "asc" },
      include: {
        item: { select: { id: true, name: true, unit: true, category: true } },
      },
    });

    return NextResponse.json({
      id: confirmation.id,
      listName: confirmation.shoppingList?.name ?? "Lista",
      shoppingListId: confirmation.shoppingListId,
      storeName: confirmation.storeName,
      purchaseDate: confirmation.purchaseDate,
      subtotal: toNumber(confirmation.subtotal),
      discountType: confirmation.discountType,
      discountValue:
        confirmation.discountValue === null ? null : toNumber(confirmation.discountValue),
      discountAmount: toNumber(confirmation.discountAmount),
      total: toNumber(confirmation.total),
      paymentType: confirmation.paymentType,
      itemCount: confirmation.itemCount,
      reversedAt: confirmation.reversedAt,
      canReverse: confirmation.reversedAt === null,
      lines: movements.map((m) => ({
        id: m.id,
        itemId: m.itemId,
        name: m.item?.name ?? "Producto",
        unit: m.unit ?? m.item?.unit ?? "unit",
        quantity: toNumber(m.quantity),
        unitPrice: m.unitPrice === null ? null : toNumber(m.unitPrice),
        // El importe real de la línea se recalcula en el cliente con `lineTotal`
        // para respetar la unidad de cobro; aquí se envía lo observado.
        sourceItemId: m.sourceItemId,
        reversedAt: m.reversedAt,
      })),
    });
  } catch (error) {
    console.error("Get pantry history detail error:", error);
    return NextResponse.json({ error: "Error al obtener el tiquete" }, { status: 500 });
  }
}

/**
 * DELETE /api/pantry/history/[id]?mode=history|full
 *
 * Dos acciones distintas, como pidió el usuario:
 *
 *  - `mode=history` (**solo quitarla del historial**): borra el registro.
 *    **No toca cuentas ni nevera.** Si la compra no estaba reversada se avisa
 *    explícitamente de que el gasto y el stock siguen vigentes.
 *
 *  - `mode=full` (**reversar y eliminar todo**): revierte primero (dinero,
 *    stock y saldo de la lista) y luego borra la lista con sus confirmaciones.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const mode = req.nextUrl.searchParams.get("mode") === "full" ? "full" : "history";

    const confirmation = await db.pantryListConfirmation.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true, shoppingListId: true, reversedAt: true },
    });
    if (!confirmation) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }

    if (mode === "history") {
      await db.pantryListConfirmation.delete({ where: { id } });
      const wasReversed = confirmation.reversedAt !== null;
      return NextResponse.json({
        success: true,
        mode: "history",
        message: wasReversed
          ? "Registro quitado del historial."
          : "Registro quitado del historial. El gasto y el stock NO se modificaron.",
        ...(wasReversed
          ? {}
          : {
              warning:
                "Esta compra no estaba reversada: el movimiento en Finanzas y los productos en la nevera siguen vigentes.",
            }),
      });
    }

    // mode === "full": reversar (si hace falta) y borrar la lista completa.
    if (!confirmation.reversedAt) {
      await reverseConfirmation(id, auth.userId);
    }
    await db.shoppingList.delete({ where: { id: confirmation.shoppingListId } });

    return NextResponse.json({
      success: true,
      mode: "full",
      message: "Compra reversada y lista eliminada, junto con sus confirmaciones.",
    });
  } catch (error) {
    console.error("Delete pantry history error:", error);
    const message = error instanceof Error ? error.message : "Error al eliminar la compra";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
