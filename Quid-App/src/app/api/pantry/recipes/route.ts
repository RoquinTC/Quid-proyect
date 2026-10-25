import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/pantry/api-helpers";
import { normalizeName } from "@/lib/pantry/names";
import { toNumber } from "@/lib/decimal-serializer";
import { checkAvailability, type PantryLike } from "@/lib/pantry/recipes";

/**
 * GET /api/pantry/recipes — recetas guardadas, con su disponibilidad recalculada
 * contra la nevera de AHORA (no la de cuando se guardó).
 *
 * POST /api/pantry/recipes — guarda una receta (de la IA o escrita a mano).
 */
export async function GET() {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const [recipes, pantryItems] = await Promise.all([
      db.recipe.findMany({
        where: { userId: auth.userId },
        orderBy: [{ isFavorite: "desc" }, { createdAt: "desc" }],
        include: { ingredients: true },
      }),
      db.pantryItem.findMany({
        where: { userId: auth.userId, isActive: true },
        select: { id: true, name: true, quantity: true, unit: true },
      }),
    ]);

    const pantry: PantryLike[] = pantryItems.map((p) => ({
      id: p.id,
      name: p.name,
      quantity: toNumber(p.quantity),
      unit: p.unit,
    }));

    return NextResponse.json({
      recipes: recipes.map((r) => {
        const ingredients = r.ingredients.map((i) => ({
          name: i.name,
          quantity: toNumber(i.quantity),
          unit: i.unit ?? "unit",
          isOptional: i.isOptional,
        }));
        return {
          id: r.id,
          name: r.name,
          description: r.description,
          type: r.type,
          servings: r.servings,
          cookingTime: r.cookingTime,
          prepTime: r.prepTime,
          difficulty: r.difficulty,
          instructions: r.instructions ? safeJsonArray(r.instructions) : [],
          source: r.source,
          isFavorite: r.isFavorite,
          lastCookedAt: r.lastCookedAt,
          createdAt: r.createdAt,
          ingredients,
          availability: checkAvailability(ingredients, pantry),
        };
      }),
    });
  } catch (error) {
    console.error("Get recipes error:", error);
    return NextResponse.json({ error: "Error al obtener recetas" }, { status: 500 });
  }
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    // Algunas recetas viejas guardan los pasos como texto plano.
    return value.split(/\n+/).filter(Boolean);
  }
}

interface SaveIngredient {
  name: string;
  quantity?: number;
  unit?: string;
  isOptional?: boolean;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => null);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!name) {
      return NextResponse.json({ error: "La receta necesita un nombre" }, { status: 400 });
    }

    const ingredients: SaveIngredient[] = Array.isArray(body?.ingredients)
      ? body.ingredients.filter((i: SaveIngredient) => i?.name)
      : [];

    // Guardar dos veces no debe duplicar: se actualiza por nombre.
    const existing = await db.recipe.findFirst({
      where: { userId: auth.userId, name },
    });

    const data = {
      name,
      description: body?.description ?? null,
      type: body?.type ?? null,
      servings: Number(body?.servings) || 1,
      cookingTime: body?.cookingTime ? Number(body.cookingTime) : null,
      prepTime: body?.prepTime ? Number(body.prepTime) : null,
      difficulty: body?.difficulty ?? null,
      instructions: Array.isArray(body?.instructions)
        ? JSON.stringify(body.instructions)
        : null,
      source: body?.source === "ai" ? "ai" : body?.source === "base" ? "base" : "manual",
      aiGenerated: body?.source === "ai",
      isFavorite: Boolean(body?.isFavorite),
    };

    const recipe = existing
      ? await db.recipe.update({
          where: { id: existing.id },
          data,
        })
      : await db.recipe.create({
          data: { ...data, userId: auth.userId },
        });

    // Los ingredientes se reemplazan completos: es una receta, no un ledger.
    await db.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
    if (ingredients.length > 0) {
      await db.recipeIngredient.createMany({
        data: ingredients.map((i) => ({
          recipeId: recipe.id,
          name: i.name,
          nameNormalized: normalizeName(i.name),
          quantity: Number(i.quantity) || 1,
          unit: i.unit ?? "unit",
          isOptional: Boolean(i.isOptional),
        })),
      });
    }

    return NextResponse.json({ id: recipe.id, name: recipe.name }, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error("Save recipe error:", error);
    return NextResponse.json({ error: "No se pudo guardar la receta" }, { status: 500 });
  }
}
