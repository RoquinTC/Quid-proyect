import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, shoppingItemCreateSchema } from "@/lib/validations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const list = await db.shoppingList.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!list) {
      return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
    }

    const items = await db.shoppingListItem.findMany({
      where: { shoppingListId: id },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error("Get shopping list items error:", error);
    return NextResponse.json({ error: "Error al obtener items de la lista" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    let body;
    try {
      body = await validateBody(req, shoppingItemCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { name, quantity, unit, estimatedPrice, pantryItemId } = body;

    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const list = await db.shoppingList.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!list) {
      return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
    }

    const item = await db.shoppingListItem.create({
      data: {
        shoppingListId: id,
        name,
        quantity: quantity || 1,
        unit: unit || "unit",
        estimatedPrice: estimatedPrice || null,
        actualPrice: null,
        isPurchased: false,
        checked: false,
        pantryItemId: pantryItemId || null,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Create shopping list item error:", error);
    return NextResponse.json({ error: "Error al agregar item a la lista" }, { status: 500 });
  }
}
