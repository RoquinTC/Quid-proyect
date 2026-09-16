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
    const { name, profileId, storeName, purpose } = body;
    const listName = name?.trim() || "Mercado";
    const listPurpose = purpose?.trim() || "Mercado";

    // Get all pantry items
    const pantryItems = await db.pantryItem.findMany({
      where: { userId: session.user.id },
    });

    // Find items below their target (targetQuantity if set, else fall back to minStock)
    const lowStockItems = pantryItems.filter((item) => {
      const target = item.targetQuantity ?? item.minStock;
      return (
        target !== null &&
        target !== undefined &&
        toNumber(item.quantity) < toNumber(target)
      );
    });

    if (lowStockItems.length === 0) {
      return NextResponse.json({
        error: "No hay productos faltantes. Revisa que los productos tengan stock mínimo configurado y que la cantidad actual esté por debajo de ese valor.",
      }, { status: 400 });
    }

    const generatedList = await db.$transaction(async (tx) => {
      let list = await tx.shoppingList.findFirst({
        where: {
          userId: session.user.id,
          name: listName,
          status: { not: "completed" },
        },
        orderBy: { updatedAt: "desc" },
      });

      if (list) {
        await tx.shoppingListItem.deleteMany({ where: { shoppingListId: list.id } });
        list = await tx.shoppingList.update({
          where: { id: list.id },
          data: {
            status: "draft",
            profileId: profileId || list.profileId || null,
            storeName: storeName?.trim() || list.storeName || null,
            purpose: listPurpose,
          },
        });
      } else {
        list = await tx.shoppingList.create({
          data: {
            userId: session.user.id,
            name: listName,
            status: "draft",
            profileId: profileId || null,
            storeName: storeName?.trim() || null,
            purpose: listPurpose,
          },
        });
      }

      await tx.shoppingListItem.createMany({
              data: lowStockItems.map((item) => {
                const target = item.targetQuantity ?? item.minStock ?? 0;
                const needed = Math.max(toNumber(target) - toNumber(item.quantity), 0);
                return {
                  shoppingListId: list.id,
                  name: item.name,
                  quantity: needed,
                  unit: item.unit,
            // estimatedPrice is unit price; the UI multiplies it by quantity.
            estimatedPrice: item.purchasePrice ? toNumber(item.purchasePrice) : null,
            actualPrice: null,
            isPurchased: false,
            checked: false,
            pantryItemId: item.id,
          };
        }),
      });

      return tx.shoppingList.findUnique({
        where: { id: list.id },
        include: { items: true },
      });
    });

    return NextResponse.json(generatedList, { status: 201 });
  } catch (error) {
    console.error("Generate shopping list error:", error);
    return NextResponse.json({ error: "Error al generar lista de compras" }, { status: 500 });
  }
}
