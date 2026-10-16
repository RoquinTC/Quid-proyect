/**
 * Backfill de `nameNormalized` — un solo uso.
 *
 * POR QUÉ EXISTE:
 *   La restricción única `(userId, nameNormalized, unit)` de `pantry_items`
 *   colapsaría filas existentes porque la columna nueva nace con `""` para
 *   todos los registros previos. Antes de añadir la restricción hay que
 *   rellenar la columna con la clave real.
 *
 *   Mismo problema en `shopping_list_items.nameNormalized` y
 *   `recipe_ingredients.nameNormalized` (esas dos no tienen restricción única,
 *   pero un `""` rompería el auto-match contra la nevera).
 *
 * Es IDEMPOTENTE: se puede correr varias veces sin efecto adicional.
 *
 *   node scripts/backfill-pantry-normalized.mjs
 *   node scripts/backfill-pantry-normalized.mjs --dry-run
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dryRun = process.argv.includes("--dry-run");

/** Espejo exacto de src/lib/pantry/names.ts::normalizeName */
function normalizeName(name) {
  if (!name) return "";
  const original = name.trim();
  if (!original) return "";
  const normalized = original
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
  return normalized || original;
}

async function report(model, label) {
  const rows = await model.findMany({
    where: { nameNormalized: "" },
    select: { id: true, name: true },
  });
  console.log(`\n${label}: ${rows.length} fila(s) sin normalizar`);
  return rows;
}

async function backfillPantryItems() {
  const rows = await prisma.pantryItem.findMany({
    where: { nameNormalized: "" },
    select: { id: true, name: true, userId: true, unit: true },
  });
  console.log(`\npantry_items: ${rows.length} fila(s) sin normalizar`);

  // Detecta colisiones que harían fallar la restricción única.
  const seen = new Map();
  const collisions = [];
  for (const row of rows) {
    const key = `${row.userId}|${normalizeName(row.name)}|${row.unit}`;
    if (seen.has(key)) {
      collisions.push({ key, a: seen.get(key), b: row.id, name: row.name });
    } else {
      seen.set(key, row.id);
    }
  }

  if (collisions.length > 0) {
    console.error("\n✖ COLISIONES detectadas — la restricción única fallaría:");
    for (const c of collisions) {
      console.error(`   ${c.key}  (${c.a} vs ${c.b})`);
    }
    console.error("\nResuelve las colisiones antes de añadir la restricción.");
    return false;
  }

  if (dryRun) {
    for (const row of rows) {
      console.log(`   [dry] ${row.name} → ${normalizeName(row.name)}`);
    }
    return true;
  }

  for (const row of rows) {
    await prisma.pantryItem.update({
      where: { id: row.id },
      data: { nameNormalized: normalizeName(row.name) },
    });
    console.log(`   ${row.name} → ${normalizeName(row.name)}`);
  }
  return true;
}

async function backfillShoppingItems() {
  const rows = await prisma.shoppingListItem.findMany({
    where: { nameNormalized: "" },
    select: { id: true, name: true },
  });
  console.log(`\nshopping_list_items: ${rows.length} fila(s) sin normalizar`);
  if (!dryRun) {
    for (const row of rows) {
      await prisma.shoppingListItem.update({
        where: { id: row.id },
        data: { nameNormalized: normalizeName(row.name) },
      });
    }
  }
  return true;
}

async function backfillRecipeIngredients() {
  const rows = await prisma.recipeIngredient.findMany({
    where: { nameNormalized: "" },
    select: { id: true, name: true },
  });
  console.log(`\nrecipe_ingredients: ${rows.length} fila(s) sin normalizar`);
  if (!dryRun) {
    for (const row of rows) {
      await prisma.recipeIngredient.update({
        where: { id: row.id },
        data: { nameNormalized: normalizeName(row.name) },
      });
    }
  }
  return true;
}

async function main() {
  console.log(`Backfill de nameNormalized${dryRun ? " (DRY RUN)" : ""}`);

  const okItems = await backfillPantryItems();
  await backfillShoppingItems();
  await backfillRecipeIngredients();

  // Verificación final: ninguna fila debe quedar en blanco.
  const remaining = await prisma.pantryItem.count({ where: { nameNormalized: "" } });
  console.log(`\npantry_items sin normalizar restantes: ${remaining}`);

  if (!okItems) process.exitCode = 1;
  else if (remaining > 0) process.exitCode = 1;
  else console.log("✔ Backfill completo");
}

main()
  .catch((error) => {
    console.error("Backfill falló:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
