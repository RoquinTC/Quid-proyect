import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/pantry/api-helpers";

/**
 * DELETE /api/pantry/recipes/[id] — borra una receta y sus ingredientes.
 *
 * Los `PantryMealLog` NO se borran: guardan `recipeName` copiado a propósito,
 * así el historial de comidas sobrevive a la receta.
 *
 * PATCH — marca/desmarca favorita.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const recipe = await db.recipe.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true },
    });
    if (!recipe) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    await db.recipe.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete recipe error:", error);
    return NextResponse.json({ error: "No se pudo eliminar la receta" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const recipe = await db.recipe.findFirst({
      where: { id, userId: auth.userId },
      select: { id: true, isFavorite: true },
    });
    if (!recipe) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    const updated = await db.recipe.update({
      where: { id },
      data: {
        isFavorite:
          typeof body?.isFavorite === "boolean" ? body.isFavorite : !recipe.isFavorite,
      },
    });

    return NextResponse.json({ id: updated.id, isFavorite: updated.isFavorite });
  } catch (error) {
    console.error("Patch recipe error:", error);
    return NextResponse.json({ error: "No se pudo actualizar la receta" }, { status: 500 });
  }
}
