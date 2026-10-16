import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { validateBody, pantryRestockSchema } from "@/lib/validations";
import { normalizeName } from "@/lib/pantry/names";
import { requireUserId } from "@/lib/pantry/api-helpers";
import { evaluateStock, isReplenishable } from "@/lib/pantry/stock";

/**
 * POST /api/pantry/restock-list
 *
 * Genera una lista de compra con los faltantes de la nevera.
 *
 * Reglas de la especificación (§4.6 y §6.4):
 *  - Solo entran los productos con **umbral definido** (`isReplenishable`). Sin
 *    mínimo ni objetivo, el producto es "solo registro" y no debe generar ruido.
 *  - La cantidad es **el faltante** (`deficit`), no la cantidad total.
 *  - El precio es **el último precio confirmado** de `PriceHistory`, para que la
 *    lista arranque con un valor realista. Si el usuario lo cambia, ese pasa a
 *    ser el precio vigente en la siguiente lista.
 *  - La lista nace en estado `draft` y **la marca de stock viene deshabilitada**:
 *    estos productos ya existen en la nevera, así que no se vuelven a declarar.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let body;
    try {
      body = await validateBody(req, pantryRestockSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
    }

    const includeRunningLow = body.includeRunningLow ?? true;

    const items = await db.pantryItem.findMany({
      where: {
        userId,
        isActive: true,
        ...(body.itemIds && body.itemIds.length > 0 ? { id: { in: body.itemIds } } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { nameNormalized: "asc" }],
    });

    // Solo los reponibles, con su estado evaluado. Un faltante de 0 no entra:
    // no hay nada que comprar, y generar líneas en cero ensucia la lista.
    const candidates = items
      .filter(isReplenishable)
      .map((item) => ({ item, stock: evaluateStock(item) }))
      .filter(({ stock }) =>
        stock.deficit > 0 && (includeRunningLow || stock.isOut || stock.isLow)
      );

    if (candidates.length === 0) {
      return NextResponse.json(
        {
          error: "nothing_to_restock",
          message:
            "No hay faltantes. Define un mínimo o un objetivo en los productos para que la nevera sepa cuándo reponer.",
        },
        { status: 409 }
      );
    }

    // Último precio confirmado de cada producto (una sola consulta).
    const itemIds = candidates.map(({ item }) => item.id);
    const priceRows = await db.priceHistory.findMany({
      where: { userId, itemId: { in: itemIds } },
      orderBy: { date: "desc" },
      select: { itemId: true, price: true, unit: true, date: true },
    });
    const lastPrice = new Map<string, { price: number; unit: string | null }>();
    for (const row of priceRows) {
      if (!lastPrice.has(row.itemId)) {
        lastPrice.set(row.itemId, { price: Number(row.price), unit: row.unit });
      }
    }
    // Fallback: el precio de la última compra del propio producto.
    for (const { item } of candidates) {
      if (!lastPrice.has(item.id) && item.purchasePrice != null) {
        lastPrice.set(item.id, { price: Number(item.purchasePrice), unit: item.unit });
      }
    }

    const created = await db.$transaction(async (tx) => {
      const list = await tx.shoppingList.create({
        data: {
          userId,
          name: body.name?.trim() || "Reposición de nevera",
          status: "draft",
          storeName: body.storeName ?? null,
          purpose: body.purpose ?? "Reposición",
        },
      });

      let order = 1;
      for (const { item, stock } of candidates) {
        const price = lastPrice.get(item.id);
        await tx.shoppingListItem.create({
          data: {
            shoppingListId: list.id,
            name: item.name,
            nameNormalized: normalizeName(item.name),
            quantity: stock.deficit,
            unit: item.unit,
            estimatedPrice: price?.price ?? null,
            multiplyQuantity: item.multiplyQuantity,
            // Ya está en la nevera: no se declara como stock de nuevo.
            isStock: false,
            sortOrder: order++,
          },
        });
      }

      return tx.shoppingList.findUniqueOrThrow({
        where: { id: list.id },
        include: { items: { orderBy: { sortOrder: "asc" } } },
      });
    });

    return NextResponse.json(
      {
        ...created,
        generatedFrom: "pantry_deficit",
        note: "La marca de stock viene deshabilitada: estos productos ya están en la nevera.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Generate restock list error:", error);
    return NextResponse.json(
      { error: "Error al generar la lista de reposición" },
      { status: 500 }
    );
  }
}
