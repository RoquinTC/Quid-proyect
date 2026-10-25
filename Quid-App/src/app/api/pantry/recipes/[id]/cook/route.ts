import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId, applyMovement } from "@/lib/pantry/api-helpers";
import { normalizeName } from "@/lib/pantry/names";
import { toNumber } from "@/lib/decimal-serializer";
import {
  checkAvailability,
  planConsumption,
  type CookMode,
  type PantryLike,
} from "@/lib/pantry/recipes";

/**
 * POST /api/pantry/recipes/[id]/cook
 *
 * Registra que cocinaste una receta y, según el modo, mueve el stock:
 *
 *  - **A** — solo preparar: no toca stock, deja el registro de la comida.
 *  - **B** — descontar lo disponible: baja del inventario lo que había, sin
 *    inventar lo que falta.
 *  - **C** — cocinar completo: descuenta lo disponible **y manda a la lista de
 *    compras lo que faltó**.
 *
 * Todo descuento va por el ledger (`applyMovement`), nunca escribiendo
 * `quantity` a mano.
 *
 * Body: { mode: "A"|"B"|"C", servings?, addToShoppingList?, listId? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const mode: CookMode = ["A", "B", "C"].includes(body?.mode) ? body.mode : "A";

    const recipe = await db.recipe.findFirst({
      where: { id, userId: auth.userId },
      include: { ingredients: true },
    });
    if (!recipe) {
      return NextResponse.json({ error: "Receta no encontrada" }, { status: 404 });
    }

    const servings = Number(body?.servings) || recipe.servings || 1;

    const pantryItems = await db.pantryItem.findMany({
      where: { userId: auth.userId, isActive: true },
      select: { id: true, name: true, quantity: true, unit: true },
    });
    const pantry: PantryLike[] = pantryItems.map((p) => ({
      id: p.id,
      name: p.name,
      quantity: toNumber(p.quantity),
      unit: p.unit,
    }));

    const ingredients = recipe.ingredients.map((i) => ({
      name: i.name,
      quantity: toNumber(i.quantity),
      unit: i.unit ?? "unit",
      isOptional: i.isOptional,
    }));

    const availability = checkAvailability(ingredients, pantry);
    const plan = planConsumption(availability, mode, recipe.servings || 1, servings);

    // ── Descuento por el ledger ──
    let consumed = 0;
    if (plan.consume.length > 0) {
      await db.$transaction(async (tx) => {
        for (const entry of plan.consume) {
          await applyMovement(tx, {
            itemId: entry.pantryItemId,
            userId: auth.userId,
            type: "out",
            quantity: entry.quantity,
            unit: entry.unit,
            note: `Receta: ${recipe.name}`,
            sourceMealId: undefined,
            touchLastUsed: true,
          });
          consumed += 1;
        }
      });
    }

    // ── Registro de la comida ──
    const mealLog = await db.pantryMealLog.create({
      data: {
        userId: auth.userId,
        recipeId: recipe.id,
        recipeName: recipe.name,
        servingsMade: servings,
        mode,
        affectedStock: plan.affectedStock,
        notes: body?.notes ?? "",
      },
    });

    await db.recipe.update({
      where: { id: recipe.id },
      data: { lastCookedAt: new Date() },
    });

    // ── Modo C: lo que faltó va a una lista de compras ──
    let shoppingListId: string | null = null;
    let addedToList = 0;

    if (mode === "C" && plan.toBuy.length > 0) {
      let listId = body?.listId as string | undefined;

      if (!listId) {
        // Sin lista indicada se crea una, para no perder lo que falta.
        const list = await db.shoppingList.create({
          data: {
            userId: auth.userId,
            name: `Compras para ${recipe.name}`,
            status: "draft",
            purpose: "Receta",
          },
        });
        listId = list.id;
      } else {
        const owned = await db.shoppingList.findFirst({
          where: { id: listId, userId: auth.userId },
          select: { id: true },
        });
        if (!owned) {
          return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
        }
      }

      // Evita duplicar la misma línea si ya se había agregado.
      const existing = await db.shoppingListItem.findMany({
        where: { shoppingListId: listId },
        select: { nameNormalized: true },
      });
      const seen = new Set(existing.map((i) => i.nameNormalized));

      for (const missing of plan.toBuy) {
        const key = normalizeName(missing.name);
        if (seen.has(key)) continue;
        seen.add(key);

        await db.shoppingListItem.create({
          data: {
            shoppingListId: listId,
            name: missing.name,
            nameNormalized: key,
            quantity: missing.quantity,
            unit: missing.unit,
            isPurchased: false,
            checked: false,
            addedToCart: false,
            isStock: true,
          },
        });
        addedToList += 1;
      }

      shoppingListId = listId;
    }

    return NextResponse.json({
      success: true,
      mode,
      servings,
      mealLogId: mealLog.id,
      consumedItems: consumed,
      affectedStock: plan.affectedStock,
      ...(mode === "C"
        ? { shoppingListId, addedToList, missing: plan.toBuy }
        : {}),
      message:
        mode === "A"
          ? "Comida registrada. No se descontó nada del inventario."
          : mode === "B"
            ? `Se descontaron ${consumed} producto(s) de lo que había.`
            : `Se descontaron ${consumed} producto(s) y se agregaron ${addedToList} a la lista de compras.`,
    });
  } catch (error) {
    console.error("Cook recipe error:", error);
    const message = error instanceof Error ? error.message : "No se pudo registrar la comida";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
