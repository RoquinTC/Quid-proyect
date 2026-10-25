import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireUserId } from "@/lib/pantry/api-helpers";
import { toNumber } from "@/lib/decimal-serializer";
import {
  checkAvailability,
  pickBaseRecipes,
  expandRestrictions,
  type PantryLike,
} from "@/lib/pantry/recipes";
import { requestAiCompletion, extractJsonFromAiText } from "@/lib/ai/llm";

/**
 * POST /api/ai/recipes
 *
 * Genera recetas. **La IA es el camino principal y el catálogo base el respaldo**:
 * si el modelo no responde, devuelve igual recetas reales (marcadas
 * `source: "base"`) en vez de un error. El módulo no se queda sin recetas por
 * un fallo de red.
 *
 * Body: { profileId?, type?, maxTime?, servings? }
 */
interface AiRecipeShape {
  name?: string;
  description?: string;
  type?: string;
  servings?: number;
  cookingTime?: number;
  difficulty?: string;
  ingredients?: { name?: string; quantity?: number; unit?: string; isOptional?: boolean }[];
  instructions?: string[];
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserId();
    if ("error" in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const type: string | undefined = body?.type || undefined;
    const maxTime: number | undefined = body?.maxTime ? Number(body.maxTime) : undefined;
    const servings: number = Number(body?.servings) || 2;
    const profileId: string | undefined = body?.profileId || undefined;

    // ── Nevera actual ──
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

    // ── Restricciones del perfil, si se eligió uno ──
    let avoid: string[] = [];
    let profileName: string | null = null;
    if (profileId) {
      const profile = await db.healthProfile.findFirst({
        where: { id: profileId, userId: auth.userId },
        include: { dietaryProfile: true, conditions: true },
      });
      if (profile) {
        profileName = profile.name;
        const dietary = profile.dietaryProfile;
        // `restrictions` son DURAS: se evitan siempre.
        if (dietary?.restrictions && typeof dietary.restrictions === "object") {
          const value = dietary.restrictions as Record<string, unknown>;
          avoid = Object.values(value)
            .flat()
            .filter((v): v is string => typeof v === "string");
        }
        if (Array.isArray(dietary?.avoid)) {
          avoid = avoid.concat((dietary!.avoid as unknown[]).filter((v): v is string => typeof v === "string"));
        }
        // "Lactosa" → leche, queso, mantequilla… Sin expandir, la restricción
        // no bloquea nada porque el ingrediente se llama distinto.
        avoid = expandRestrictions(avoid);
      }
    }

    const pantrySummary = pantry
      .filter((p) => p.quantity > 0)
      .slice(0, 40)
      .map((p) => `${p.name} (${p.quantity} ${p.unit})`)
      .join(", ");

    const prompt = [
      "Eres un cocinero colombiano práctico. Propón 4 recetas caseras.",
      `Nevera disponible: ${pantrySummary || "vacía"}.`,
      type ? `Tipo de comida: ${type}.` : "",
      maxTime ? `Máximo ${maxTime} minutos.` : "",
      `Para ${servings} porciones.`,
      avoid.length ? `Evita por completo: ${avoid.join(", ")}.` : "",
      "Prioriza ingredientes que ya estén en la nevera; puedes pedir 2 o 3 extra.",
      "Responde SOLO JSON: {\"recipes\":[{\"name\":\"\",\"description\":\"\",\"type\":\"\",",
      "\"servings\":2,\"cookingTime\":20,\"difficulty\":\"facil|media|dificil\",",
      "\"ingredients\":[{\"name\":\"\",\"quantity\":100,\"unit\":\"g\",\"isOptional\":false}],",
      "\"instructions\":[\"paso 1\",\"paso 2\"]}]}",
      "Unidades válidas: g, kg, ml, l, unit.",
    ]
      .filter(Boolean)
      .join("\n");

    let aiRecipes: AiRecipeShape[] = [];
    let aiFailed = false;
    try {
      const result = await requestAiCompletion({
        system: "Responde únicamente con JSON válido, sin explicaciones.",
        user: prompt,
        temperature: 0.7,
        timeoutMs: 25_000,
      });
      const parsed = extractJsonFromAiText<{ recipes?: AiRecipeShape[] }>(result.text);
      if (parsed?.recipes && Array.isArray(parsed.recipes)) {
        aiRecipes = parsed.recipes.slice(0, 4);
      } else {
        aiFailed = true;
      }
    } catch (error) {
      console.warn("IA de recetas no disponible, usando catálogo base:", error);
      aiFailed = true;
    }

    // ── Camino principal: recetas de la IA ──
    if (!aiFailed && aiRecipes.length > 0) {
      const recipes = aiRecipes
        .filter((r) => r.name && Array.isArray(r.ingredients) && r.ingredients.length > 0)
        .map((r) => {
          const ingredients = r.ingredients!
            .filter((i) => i.name)
            .map((i) => ({
              name: i.name!,
              quantity: Number(i.quantity) || 1,
              unit: i.unit || "unit",
              isOptional: Boolean(i.isOptional),
            }));
          const availability = checkAvailability(ingredients, pantry);
          return {
            name: r.name!,
            description: r.description ?? "",
            type: r.type ?? type ?? "almuerzo",
            servings: Number(r.servings) || servings,
            cookingTime: Number(r.cookingTime) || 30,
            difficulty: r.difficulty ?? "facil",
            instructions: Array.isArray(r.instructions) ? r.instructions : [],
            ingredients,
            availability,
            source: "ai" as const,
          };
        });

      if (recipes.length > 0) {
        return NextResponse.json({
          recipes,
          source: "ai",
          profileName,
          avoided: avoid,
        });
      }
    }

    // ── Respaldo: catálogo base ──
    const base = pickBaseRecipes(pantry, 4, avoid);
    const filtered = type
      ? base.filter((b) => b.recipe.type === type)
      : base;
    const chosen = (filtered.length > 0 ? filtered : base)
      // `maxTime` filtra sin dejar la lista vacía.
      .filter((b) => (maxTime ? b.recipe.cookingTime <= maxTime : true));

    const finalList = (chosen.length > 0 ? chosen : base.slice(0, 4)).map(({ recipe, availability }) => ({
      ...recipe,
      availability,
      source: "base" as const,
    }));

    return NextResponse.json({
      recipes: finalList,
      source: aiFailed ? "base" : "base",
      profileName,
      avoided: avoid,
      note: "Recetas del catálogo base (la IA no estaba disponible).",
    });
  } catch (error) {
    console.error("AI recipes error:", error);
    return NextResponse.json({ error: "No se pudieron generar recetas" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
