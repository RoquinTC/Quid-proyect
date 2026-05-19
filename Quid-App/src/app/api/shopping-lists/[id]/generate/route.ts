import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, shoppingGenerateSchema } from "@/lib/validations";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // This endpoint generates a new shopping list from low-stock pantry items
    // The [id] param is not used for generation but we keep it for consistency
    // Actually, let's use the body to get a name for the new list
    let body;
    try {
      body = await validateBody(req, shoppingGenerateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { name, profileId } = body;

    // Get all pantry items
    const pantryItems = await db.pantryItem.findMany({
      where: { userId: session.user.id },
    });

    // Find items below minStock
    const lowStockItems = pantryItems.filter(
      (item) => item.minStock && item.quantity < item.minStock
    );

    if (lowStockItems.length === 0) {
      return NextResponse.json({ error: "No hay items con stock bajo para generar la lista" }, { status: 400 });
    }

    // Create shopping list
    const list = await db.shoppingList.create({
      data: {
        userId: session.user.id,
        name: name || "Lista Auto-generada",
        status: "draft",
        profileId: profileId || null,
      },
    });

    // Create items for the list
    const listItems = await Promise.all(
      lowStockItems.map((item) =>
        db.shoppingListItem.create({
          data: {
            shoppingListId: list.id,
            name: item.name,
            quantity: toNumber((item.minStock ?? 0)) - toNumber(item.quantity),
            unit: item.unit,
            estimatedPrice: item.purchasePrice
              ? toNumber(item.purchasePrice) * (toNumber(item.minStock ?? 0) - toNumber(item.quantity))
              : null,
            isPurchased: false,
            checked: false,
            pantryItemId: item.id,
          },
        })
      )
    );

    return NextResponse.json({ ...list, items: listItems }, { status: 201 });
  } catch (error) {
    console.error("Generate shopping list error:", error);
    return NextResponse.json({ error: "Error al generar lista de compras" }, { status: 500 });
  }
}
