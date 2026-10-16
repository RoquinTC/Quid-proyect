import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateBody, pantryAdjustSchema } from "@/lib/validations";
import { requireUserId, applyMovement, withStock } from "@/lib/pantry/api-helpers";

/**
 * POST /api/pantry/[id]/adjust
 *
 * Ajuste manual del inventario: el "Modo inventario / Recuento" de la nevera.
 *
 * Es la vía por la que el usuario corrige lo que tiene en físico. Acepta dos
 * formas:
 *
 *   { delta: -2, reason: "Me comí dos" }         → resta 2
 *   { delta: 5,  reason: "Encontré más" }        → suma 5
 *
 * El delta puede ser negativo y NO se acota por abajo en el movimiento, pero el
 * stock resultante sí se acota a 0: el inventario físico no puede ser negativo
 * (ver `applyMovement`).
 *
 * `adjust` NO toca `lastUsedAt`: contar no es usar.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    let body;
    try {
      body = await validateBody(req, pantryAdjustSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const item = await db.pantryItem.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true, name: true, quantity: true, unit: true },
    });
    if (!item) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const result = await db.$transaction(async (tx) => {
      const { movementId, newQuantity } = await applyMovement(tx, {
        itemId: item.id,
        userId: auth.userId,
        type: "adjust",
        quantity: body.delta,
        note: body.reason,
        touchLastUsed: false,
      });

      const updated = await tx.pantryItem.findUniqueOrThrow({ where: { id: item.id } });
      return { movementId, newQuantity, updated };
    });

    return NextResponse.json({
      ...withStock(result.updated),
      movementId: result.movementId,
      previousQuantity: item.quantity,
      applied: result.newQuantity - item.quantity,
    });
  } catch (error) {
    console.error("Adjust pantry item error:", error);
    return NextResponse.json({ error: "Error al ajustar el inventario" }, { status: 500 });
  }
}
