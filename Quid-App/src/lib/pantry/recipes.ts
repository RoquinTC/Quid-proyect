/**
 * Recetas de la Nevera — lógica pura.
 *
 * Tres piezas que el resto del módulo reutiliza:
 *
 *  1. `checkAvailability` — cruza los ingredientes de una receta contra la
 *     nevera y dice qué hay, qué falta y cuánto.
 *  2. `BASE_RECIPES` — catálogo de respaldo. Si la IA no responde (sin
 *     conexión, modelo caído, JSON inválido) el usuario **igual** recibe
 *     recetas: el módulo nunca queda muerto.
 *  3. `planConsumption` — calcula cuánto descontar de cada producto según el
 *     modo de cocina (A/B/C) y qué falta comprar.
 *
 * Sin Prisma: entra una lista de productos, sale un plan.
 */

import { normalizeName } from "@/lib/pantry/names";
import { convertQuantity } from "@/lib/pantry/units";

export interface PantryLike {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface IngredientLike {
  name: string;
  quantity: number;
  unit?: string | null;
  isOptional?: boolean;
}

export type Availability = "full" | "partial" | "missing";

export interface IngredientStatus extends IngredientLike {
  pantryItemId: string | null;
  /** Cuánto hay disponible, ya en la unidad del ingrediente. */
  available: number;
  /** Cuánto falta para completar la receta. */
  missing: number;
  status: Availability;
  /** true si hubo que convertir unidades para compararlos. */
  converted: boolean;
}

export interface AvailabilityResult {
  ingredients: IngredientStatus[];
  /** 0..1 — proporción de ingredientes cubiertos (los opcionales no penalizan). */
  coverage: number;
  canCook: boolean;
  missingCount: number;
}

/**
 * Cruza los ingredientes contra la nevera.
 *
 * Reglas:
 *  - El match es por **nombre normalizado**: "Tomate" y "tomate" son el mismo.
 *  - Si las unidades difieren pero son compatibles, se convierte antes de
 *    comparar (250 g contra 1 kg).
 *  - Si son incompatibles, se comparan los números y se marca `converted:false`
 *    en vez de inventar una equivalencia.
 *  - Un ingrediente opcional que falta no impide cocinar.
 */
export function checkAvailability(
  ingredients: IngredientLike[],
  pantry: PantryLike[]
): AvailabilityResult {
  const byName = new Map<string, PantryLike>();
  for (const item of pantry) {
    // Si hay repetidos gana el de mayor cantidad: es el que sirve.
    const key = normalizeName(item.name);
    const prev = byName.get(key);
    if (!prev || item.quantity > prev.quantity) byName.set(key, item);
  }

  const statuses: IngredientStatus[] = ingredients.map((ing) => {
    const match = byName.get(normalizeName(ing.name)) ?? null;
    if (!match) {
      return {
        ...ing,
        pantryItemId: null,
        available: 0,
        missing: ing.quantity,
        status: "missing",
        converted: false,
      };
    }

    const targetUnit = ing.unit || match.unit;
    const converted = convertQuantity(match.quantity, match.unit, targetUnit);
    const available = converted.converted ? converted.quantity : match.quantity;
    const missing = Math.max(0, ing.quantity - available);

    return {
      ...ing,
      pantryItemId: match.id,
      available,
      missing: Math.round(missing * 1000) / 1000,
      status: missing <= 1e-9 ? "full" : available > 0 ? "partial" : "missing",
      converted: converted.converted,
    };
  });

  const required = statuses.filter((s) => !s.isOptional);
  const covered = required.filter((s) => s.status === "full").length;
  const coverage = required.length === 0 ? 1 : covered / required.length;
  const missingCount = statuses.filter((s) => s.status !== "full").length;

  return {
    ingredients: statuses,
    coverage,
    // Se puede cocinar si no falta nada obligatorio.
    canCook: required.every((s) => s.status === "full"),
    missingCount,
  };
}

export type CookMode = "A" | "B" | "C";

export interface ConsumptionPlan {
  /** Productos a descontar y cuánto. */
  consume: { pantryItemId: string; quantity: number; name: string; unit: string }[];
  /** Lo que faltó y hay que comprar (solo en modo C). */
  toBuy: { name: string; quantity: number; unit: string }[];
  affectedStock: boolean;
}

/**
 * Plan de consumo según el modo de cocina (§3.9):
 *
 *  - **A**: solo preparar. No toca stock; queda el registro de la comida.
 *  - **B**: descontar **solo lo disponible**. Lo que falta no se compra.
 *  - **C**: cocinar completo. Descuenta lo disponible y **manda a compras** lo
 *    que falte.
 *
 * `servings` escala las cantidades de la receta.
 */
export function planConsumption(
  availability: AvailabilityResult,
  mode: CookMode,
  baseServings = 1,
  servings = 1
): ConsumptionPlan {
  if (mode === "A") {
    return { consume: [], toBuy: [], affectedStock: false };
  }

  const factor = baseServings > 0 ? servings / baseServings : 1;
  const consume: ConsumptionPlan["consume"] = [];
  const toBuy: ConsumptionPlan["toBuy"] = [];

  for (const ing of availability.ingredients) {
    if (ing.isOptional) continue;
    const needed = ing.quantity * factor;

    if (ing.pantryItemId && ing.available > 0) {
      const take = Math.min(ing.available, needed);
      if (take > 1e-9) {
        consume.push({
          pantryItemId: ing.pantryItemId,
          quantity: Math.round(take * 1000) / 1000,
          name: ing.name,
          unit: ing.unit || "unit",
        });
      }
      const stillMissing = needed - take;
      if (mode === "C" && stillMissing > 1e-9) {
        toBuy.push({
          name: ing.name,
          quantity: Math.round(stillMissing * 1000) / 1000,
          unit: ing.unit || "unit",
        });
      }
    } else if (mode === "C") {
      toBuy.push({
        name: ing.name,
        quantity: Math.round(needed * 1000) / 1000,
        unit: ing.unit || "unit",
      });
    }
  }

  return { consume, toBuy, affectedStock: consume.length > 0 };
}

/**
 * Catálogo de respaldo, con comida corriente y productos que suelen estar en
 * una nevera colombiana. Se usa cuando la IA no responde.
 */
export const BASE_RECIPES: {
  name: string;
  description: string;
  type: string;
  servings: number;
  cookingTime: number;
  difficulty: string;
  ingredients: { name: string; quantity: number; unit: string; isOptional?: boolean }[];
  instructions: string[];
}[] = [
  {
    name: "Arroz con huevo y cebolla",
    description: "Lo que se hace cuando no hay tiempo y sí hay huevos.",
    type: "almuerzo",
    servings: 2,
    cookingTime: 20,
    difficulty: "facil",
    ingredients: [
      { name: "Arroz", quantity: 400, unit: "g" },
      { name: "Huevos", quantity: 2, unit: "unit" },
      { name: "Cebolla", quantity: 100, unit: "g" },
      { name: "Aceite de oliva", quantity: 15, unit: "ml" },
      { name: "Sal", quantity: 1, unit: "unit", isOptional: true },
    ],
    instructions: [
      "Pica la cebolla fina y sofríela en el aceite.",
      "Agrega el arroz cocido y mezcla bien.",
      "Haz un hueco, casca los huevos y revuelve hasta cuajar.",
      "Sazona y sirve.",
    ],
  },
  {
    name: "Pollo guisado con papa",
    description: "Guiso de olla, rinde para dos comidas.",
    type: "almuerzo",
    servings: 3,
    cookingTime: 40,
    difficulty: "media",
    ingredients: [
      { name: "Pechuga de pollo", quantity: 500, unit: "g" },
      { name: "Papa", quantity: 500, unit: "g" },
      { name: "Tomate", quantity: 200, unit: "g" },
      { name: "Cebolla", quantity: 150, unit: "g" },
      { name: "Aceite de oliva", quantity: 20, unit: "ml" },
    ],
    instructions: [
      "Sofríe cebolla y tomate picados.",
      "Agrega el pollo en trozos y dora.",
      "Suma la papa en cubos y agua hasta cubrir.",
      "Tapa y cocina 25 minutos a fuego medio.",
    ],
  },
  {
    name: "Pasta con tomate y queso",
    description: "Rápida, con lo que haya en la nevera.",
    type: "cena",
    servings: 2,
    cookingTime: 25,
    difficulty: "facil",
    ingredients: [
      { name: "Pasta", quantity: 200, unit: "g" },
      { name: "Tomate", quantity: 200, unit: "g" },
      { name: "Queso campesino", quantity: 100, unit: "g" },
      { name: "Aceite de oliva", quantity: 15, unit: "ml" },
    ],
    instructions: [
      "Cocina la pasta según el empaque.",
      "Aparte, sofríe el tomate picado con el aceite.",
      "Mezcla la pasta con la salsa y corona con queso.",
    ],
  },
  {
    name: "Huevos pericos con arepa",
    description: "Desayuno de siempre, en diez minutos.",
    type: "desayuno",
    servings: 2,
    cookingTime: 10,
    difficulty: "facil",
    ingredients: [
      { name: "Huevos", quantity: 3, unit: "unit" },
      { name: "Tomate", quantity: 100, unit: "g" },
      { name: "Cebolla", quantity: 80, unit: "g" },
      { name: "Arepa", quantity: 2, unit: "unit", isOptional: true },
    ],
    instructions: [
      "Pica tomate y cebolla y sofríelos.",
      "Agrega los huevos batidos y revuelve.",
      "Sirve con arepa.",
    ],
  },
  {
    name: "Frijoles con arroz",
    description: "De olla grande, mejor al día siguiente.",
    type: "almuerzo",
    servings: 4,
    cookingTime: 60,
    difficulty: "media",
    ingredients: [
      { name: "Frijol", quantity: 500, unit: "g" },
      { name: "Arroz", quantity: 400, unit: "g" },
      { name: "Cebolla", quantity: 100, unit: "g" },
      { name: "Tomate", quantity: 150, unit: "g" },
    ],
    instructions: [
      "Deja los fríjoles en agua la noche anterior.",
      "Cocínalos con cebolla y tomate hasta que ablanden.",
      "Prepara el arroz aparte y sirve junto.",
    ],
  },
  {
    name: "Ensalada de tomate y queso",
    description: "Fresca, sin cocción.",
    type: "cena",
    servings: 2,
    cookingTime: 5,
    difficulty: "facil",
    ingredients: [
      { name: "Tomate", quantity: 200, unit: "g" },
      { name: "Queso campesino", quantity: 80, unit: "g" },
      { name: "Aceite de oliva", quantity: 10, unit: "ml" },
      { name: "Cebolla", quantity: 50, unit: "g", isOptional: true },
    ],
    instructions: ["Corta el tomate y el queso.", "Aliña con aceite y sirve."],
  },
  {
    name: "Café con pan tajado",
    description: "Desayuno mínimo.",
    type: "desayuno",
    servings: 1,
    cookingTime: 5,
    difficulty: "facil",
    ingredients: [
      { name: "Café molido", quantity: 15, unit: "g" },
      { name: "Pan tajado", quantity: 2, unit: "unit" },
      { name: "Leche entera", quantity: 100, unit: "ml", isOptional: true },
    ],
    instructions: ["Prepara el café.", "Sirve con el pan."],
  },
  {
    name: "Yuca frita",
    description: "Para acompañar cualquier cosa.",
    type: "snack",
    servings: 2,
    cookingTime: 25,
    difficulty: "facil",
    ingredients: [
      { name: "Yuca", quantity: 500, unit: "g" },
      { name: "Aceite de oliva", quantity: 200, unit: "ml" },
      { name: "Sal", quantity: 1, unit: "unit", isOptional: true },
    ],
    instructions: [
      "Pela y corta la yuca en tiras.",
      "Fríe hasta dorar y escurre.",
      "Sazona con sal.",
    ],
  },
];

/**
 * Elige las recetas base que mejor encajan, priorizando las que se pueden
 * cocinar con lo que hay. Sirve de respaldo y también para ordenar sugerencias.
 */
export function pickBaseRecipes(
  pantry: PantryLike[],
  limit = 4,
  avoid: string[] = []
): { recipe: (typeof BASE_RECIPES)[number]; availability: AvailabilityResult }[] {
  const avoidSet = new Set(avoid.map((a) => a.toLowerCase().trim()));

  return BASE_RECIPES
    // Restricciones duras: se descarta la receta si contiene algo a evitar.
    .filter(
      (r) =>
        !r.ingredients.some((ing) => {
          const n = ing.name.toLowerCase();
          return [...avoidSet].some((a) => a && (n.includes(a) || a.includes(n)));
        })
    )
    .map((recipe) => ({
      recipe,
      availability: checkAvailability(recipe.ingredients, pantry),
    }))
    .sort((a, b) => {
      // Primero las que se pueden cocinar, luego por cobertura.
      if (a.availability.canCook !== b.availability.canCook) {
        return a.availability.canCook ? -1 : 1;
      }
      return b.availability.coverage - a.availability.coverage;
    })
    .slice(0, limit);
}

/**
 * Traduce una restricción a los ingredientes que la incumplen.
 *
 * "Lactosa" no es un ingrediente: es un nutriente. Sin este mapa, poner
 * "Lactosa" como restricción dura NO bloqueaba "Pasta con queso", porque el
 * filtro comparaba nombres de ingredientes contra la palabra "lactosa".
 */
const RESTRICTION_INGREDIENTS: Record<string, string[]> = {
  lactosa: ["leche", "queso", "mantequilla", "yogur", "crema", "helado", "kumis"],
  lácteos: ["leche", "queso", "mantequilla", "yogur", "crema", "helado"],
  lacteos: ["leche", "queso", "mantequilla", "yogur", "crema", "helado"],
  gluten: ["pan", "pasta", "harina", "arepa", "trigo", "galleta", "cebada"],
  celiaquía: ["pan", "pasta", "harina", "arepa", "trigo", "galleta", "cebada"],
  celiaquia: ["pan", "pasta", "harina", "arepa", "trigo", "galleta", "cebada"],
  mani: ["maní", "mani", "cacahuate"],
  maní: ["maní", "mani", "cacahuate"],
  mariscos: ["camarón", "camaron", "pescado", "langostino", "mejillón", "marisco"],
  huevo: ["huevo"],
  azúcar: ["azúcar", "azucar", "panela", "miel", "dulce"],
  azucar: ["azúcar", "azucar", "panela", "miel", "dulce"],
  soya: ["soya", "soja", "tofu"],
  frutos_secos: ["almendra", "nuez", "maní", "avellana", "pistacho", "marañón"],
  "frutos secos": ["almendra", "nuez", "maní", "avellana", "pistacho", "marañón"],
};

/** Convierte restricciones en nombres de ingredientes a evitar. */
export function expandRestrictions(restrictions: string[]): string[] {
  const out = new Set<string>();
  for (const raw of restrictions) {
    const key = raw.toLowerCase().trim();
    const mapped = RESTRICTION_INGREDIENTS[key];
    if (mapped) {
      for (const ing of mapped) out.add(ing);
    } else {
      // Sin mapa conocido se usa la palabra tal cual: mejor de más que de menos.
      out.add(key);
    }
  }
  return [...out];
}
