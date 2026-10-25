import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/pantry/api-helpers";
import { reverseConfirmation } from "@/lib/pantry/reverse";

/**
 * POST /api/pantry/history/[id]/reverse
 *
 * Botón **Reversar**: hace la inversa de todo lo que esa compra movió y
 * **reabre la lista** para editarla. No borra nada.
 *
 * Idempotente: si ya está reversada responde 409 en vez de descontar dos veces.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const confirmation = await db.pantryListConfirmation.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true, reversedAt: true },
    });
    if (!confirmation) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }
    if (confirmation.reversedAt) {
      return NextResponse.json(
        {
          error: "already_reversed",
          message: "Esta compra ya fue reversada. No se puede reversar dos veces.",
        },
        { status: 409 }
      );
    }

    const result = await reverseConfirmation(id, auth.userId);

    return NextResponse.json({
      success: true,
      ...result,
      message:
        "Compra reversada. El inventario y la lista volvieron atrás." +
        (result.financeReversed > 0 ? " El dinero se devolvió." : ""),
    });
  } catch (error) {
    console.error("Reverse pantry confirmation error:", error);
    const message = error instanceof Error ? error.message : "Error al reversar la compra";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
