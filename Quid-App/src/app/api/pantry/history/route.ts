import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/pantry/api-helpers";
import { toNumber } from "@/lib/decimal-serializer";

/**
 * GET /api/pantry/history
 *
 * Historial **individualizado por confirmación**, no por lista: una compra
 * dividida entre dos tiendas son dos registros, cada uno con su fecha, su
 * tienda y su valor. Así lo pidió el usuario, y es lo que permite reversar solo
 * la parcial que se registró mal.
 *
 * Query params:
 *   ?listId=...   filtra por lista
 *   ?limit=20     tamaño de página
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const params = req.nextUrl.searchParams;
    const listId = params.get("listId");
    const limit = Math.min(Number(params.get("limit")) || 50, 100);

    const confirmations = await db.pantryListConfirmation.findMany({
      where: {
        userId: auth.userId,
        ...(listId ? { shoppingListId: listId } : {}),
      },
      orderBy: { purchaseDate: "desc" },
      take: limit,
      include: {
        shoppingList: { select: { id: true, name: true, status: true } },
      },
    });

    return NextResponse.json({
      confirmations: confirmations.map((c) => ({
        id: c.id,
        shoppingListId: c.shoppingListId,
        listName: c.shoppingList?.name ?? "Lista",
        listStatus: c.shoppingList?.status ?? null,
        storeName: c.storeName,
        purchaseDate: c.purchaseDate,
        subtotal: toNumber(c.subtotal),
        discountAmount: toNumber(c.discountAmount),
        total: toNumber(c.total),
        discountType: c.discountType,
        discountValue: c.discountValue === null ? null : toNumber(c.discountValue),
        paymentType: c.paymentType,
        itemCount: c.itemCount,
        reversedAt: c.reversedAt,
        // La UI deshabilita "Reversar" cuando ya está reversada.
        canReverse: c.reversedAt === null,
      })),
    });
  } catch (error) {
    console.error("Get pantry history error:", error);
    return NextResponse.json({ error: "Error al obtener el historial" }, { status: 500 });
  }
}
