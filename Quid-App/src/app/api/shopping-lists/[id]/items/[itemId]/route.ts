import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, shoppingItemUpdateSchema } from "@/lib/validations";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, itemId } = await params;
    let body;
    try {
      body = await validateBody(req, shoppingItemUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    // Verify the list belongs to the user
    const list = await db.shoppingList.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!list) {
      return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
    }

    const existing = await db.shoppingListItem.findFirst({
      where: { id: itemId, shoppingListId: id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.quantity !== undefined) updateData.quantity = body.quantity;
    if (body.unit !== undefined) updateData.unit = body.unit;
    if (body.estimatedPrice !== undefined) updateData.estimatedPrice = body.estimatedPrice;
    if (body.actualPrice !== undefined) updateData.actualPrice = body.actualPrice;
    if (body.isPurchased !== undefined) updateData.isPurchased = body.isPurchased;
    if (body.checked !== undefined) updateData.checked = body.checked;

    const item = await db.shoppingListItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error("Update shopping list item error:", error);
    return NextResponse.json({ error: "Error al actualizar item" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, itemId } = await params;

    const list = await db.shoppingList.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!list) {
      return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
    }

    const existing = await db.shoppingListItem.findFirst({
      where: { id: itemId, shoppingListId: id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });
    }

    await db.shoppingListItem.delete({ where: { id: itemId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete shopping list item error:", error);
    return NextResponse.json({ error: "Error al eliminar item" }, { status: 500 });
  }
}
