import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateBody, pantryConsumeSchema } from "@/lib/validations";
import { requireUserId, applyMovement, withStock } from "@/lib/pantry/api-helpers";

/**
 * POST /api/pantry/[id]/consume
 *
 * Descuenta del inventario: consumo normal (`out`) o merma (`waste`).
 *
 *   { quantity: 1 }                       → consumí 1
 *   { quantity: 2, type: "waste", note: "Se venció" }  → merma
 *
 * `waste` es lo que SoftList no distingue y es el dato que más valor da en una
 * nevera real: saber **cuánto se pierde** es lo que permite ajustar cuánto
 * comprar. Por eso es un tipo propio y no un `out` con nota.
 *
 * El stock se acota a 0, pero si se pide consumir más de lo disponible la
 * respuesta lo informa (`shortfall`) en vez de fallar en silencio: el consumo
 * físico ya ocurrió aunque el registro no lo refleje.
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
      body = await validateBody(req, pantryConsumeSchema);
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

    const type = body.type ?? "out";
    const shortfall = Math.max(0, body.quantity - item.quantity);

    const result = await db.$transaction(async (tx) => {
      const { movementId, newQuantity } = await applyMovement(tx, {
        itemId: item.id,
        userId: auth.userId,
        type,
        quantity: body.quantity,
        note: body.note ?? (type === "waste" ? "Merma" : "Consumo"),
        // Consumir SÍ es usar.
        touchLastUsed: true,
      });

      const updated = await tx.pantryItem.findUniqueOrThrow({ where: { id: item.id } });
      return { movementId, newQuantity, updated };
    });

    return NextResponse.json({
      ...withStock(result.updated),
      movementId: result.movementId,
      previousQuantity: item.quantity,
      consumed: Math.min(body.quantity, item.quantity),
      ...(shortfall > 0
        ? {
            shortfall,
            warning: `Se consumieron ${body.quantity} ${item.unit} pero solo había ${item.quantity}. El stock quedó en 0 y el faltante no se registró como negativo.`,
          }
        : {}),
    });
  } catch (error) {
    console.error("Consume pantry item error:", error);
    return NextResponse.json({ error: "Error al registrar el consumo" }, { status: 500 });
  }
}
