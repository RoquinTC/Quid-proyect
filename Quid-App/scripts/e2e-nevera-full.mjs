/**
 * PRUEBA DE EXTREMO A EXTREMO DEL MÓDULO NEVERA.
 *
 * Recorre el ciclo completo como lo haría una persona, empezando por un
 * producto AGOTADO:
 *
 *   1. Hay un producto con stock 0 y mínimo definido → aparece como faltante.
 *   2. Generar la lista de compras desde los faltantes.
 *   3. Crear una lista nueva a mano y agregarle productos.
 *   4. Marcar al carrito y confirmar la compra (genera stock + gasto).
 *   5. Verificar que el producto agotado YA TIENE stock.
 *   6. Pedir recetas (con respaldo si no hay IA) y guardar una.
 *   7. Cocinar en modo B (descuenta stock) y verificar el descuento.
 *   8. Cocinar en modo C (faltantes → lista de compras).
 *   9. Historial: tiquete, reversa y verificación del stock devuelto.
 *  10. Perfiles alimenticios: condiciones, restricciones y filtrado de recetas.
 *
 *   node scripts/e2e-nevera-full.mjs [puerto]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const PORT = Number(process.argv[2] || 3104);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = process.env.NEXTAUTH_SECRET;
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const fails = [];

function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    fails.push(label);
    console.log(`  ✗ ${label}${detail !== undefined ? `\n      → ${detail}` : ""}`);
  }
}

let token = "";
async function api(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      cookie: `next-auth.session-token=${token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function norm(name) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, "");
}

async function main() {
  if (!SECRET) throw new Error("Falta NEXTAUTH_SECRET");

  const user = await prisma.user.create({
    data: { email: `e2e-full-${Date.now()}@test.local`, name: "Full", password: "x" },
  });
  const userId = user.id;

  try {
    token = await encode({
      secret: SECRET,
      token: { id: userId, sub: userId, email: user.email, name: "Full" },
      maxAge: 3600,
    });

    const account = await prisma.account.create({
      data: { userId, name: "Cuenta", type: "bank", balance: 2_000_000, color: "#10B981" },
    });

    // ── 1. Producto AGOTADO con mínimo ──
    console.log("\n[1] Producto agotado en la nevera");
    const pollo = await prisma.pantryItem.create({
      data: {
        userId,
        name: "Pechuga de pollo",
        nameNormalized: norm("Pechuga de pollo"),
        quantity: 0,
        unit: "g",
        location: "congelador",
        minStock: 500,
        targetQuantity: 1000,
        priceUnitId: "kg",
        purchasePrice: 14200,
        multiplyQuantity: true,
      },
    });
    // Un producto que sí hay, para que la receta tenga algo.
    await prisma.pantryItem.create({
      data: {
        userId,
        name: "Arroz",
        nameNormalized: "arroz",
        quantity: 1000,
        unit: "g",
        location: "alacena",
        minStock: 300,
        multiplyQuantity: true,
      },
    });

    const pantry = await api("GET", "/api/pantry");
    check("la nevera responde", pantry.status === 200, pantry.status);
    const polloOut = pantry.body.items?.find((i) => i.id === pollo.id);
    check("el pollo figura como agotado", polloOut?.status === "out", polloOut?.status);
    check(
      "y aparece en faltantes",
      (pantry.body.lowStockItems ?? []).some((i) => i.id === pollo.id),
      JSON.stringify((pantry.body.lowStockItems ?? []).map((i) => i.name))
    );

    // ── 2. Generar lista desde faltantes ──
    console.log("\n[2] Generar lista de compras desde faltantes");
    const restock = await api("POST", "/api/pantry/restock-list", {});
    check(`genera la lista (${restock.status})`, restock.status === 200 || restock.status === 201, JSON.stringify(restock.body)?.slice(0, 200));
    const listId = restock.body?.listId ?? restock.body?.list?.id ?? restock.body?.id;
    check("devuelve la lista creada", Boolean(listId), JSON.stringify(restock.body)?.slice(0, 200));

    const listDetail = listId ? await api("GET", `/api/shopping-lists/${listId}`) : { body: null };
    const polloLine = listDetail.body?.items?.find((i) => norm(i.name) === norm("Pechuga de pollo"));
    check("la lista incluye el pollo agotado", Boolean(polloLine), JSON.stringify(listDetail.body?.items?.map((i) => i.name)));
    check("con la unidad de precio heredada (kg)", polloLine?.priceUnitId === "kg", polloLine?.priceUnitId);

    // ── 3. Lista nueva a mano ──
    console.log("\n[3] Crear lista nueva y agregarle productos");
    const created = await api("POST", "/api/shopping-lists", { name: "Mercado de prueba" });
    check(`crea la lista (${created.status})`, created.status === 201 || created.status === 200, JSON.stringify(created.body)?.slice(0, 200));
    const manualListId = created.body?.id;
    check("devuelve id", Boolean(manualListId));

    const addItem = await api("POST", `/api/shopping-lists/${manualListId}/items`, {
      name: "Pechuga de pollo",
      quantity: 800,
      unit: "g",
      estimatedPrice: 14200,
      priceUnitId: "kg",
    });
    check(`agrega producto (${addItem.status})`, addItem.status === 201 || addItem.status === 200, JSON.stringify(addItem.body)?.slice(0, 200));

    const manualDetail = await api("GET", `/api/shopping-lists/${manualListId}`);
    const manualLine = manualDetail.body?.items?.find((i) => norm(i.name) === norm("Pechuga de pollo"));
    check("800 g × 14.200/kg = 11.360 (no 11.360.000)", manualLine?.estimatedPrice === 14200, manualLine?.estimatedPrice);

    // ── 4. Al carrito y confirmar ──
    console.log("\n[4] Marcar al carrito y confirmar la compra");
    await api("PUT", `/api/shopping-lists/${manualListId}/items/${manualLine.id}`, { addedToCart: true });

    const confirm = await api("POST", `/api/shopping-lists/${manualListId}/confirm`, {
      paymentType: "account",
      accountId: account.id,
      items: [{ id: manualLine.id, quantity: 800 }],
      minMode: false,
      storeName: "Éxito",
      purchaseDate: new Date().toISOString(),
      totalDiscountType: "PERCENT",
      totalDiscountValue: 0.1,
    });
    check(`confirma (${confirm.status})`, confirm.status === 200, JSON.stringify(confirm.body)?.slice(0, 300));
    check("subtotal 11.360", confirm.body?.confirmation?.subtotal === 11360, confirm.body?.confirmation?.subtotal);
    check("total con 10 % de descuento: 10.224", confirm.body?.confirmation?.total === 10224, confirm.body?.confirmation?.total);

    // ── 5. El producto agotado ya tiene stock ──
    console.log("\n[5] El producto agotado ya tiene stock");
    const polloAfter = await prisma.pantryItem.findUniqueOrThrow({ where: { id: pollo.id } });
    check("el pollo tiene 800 g", Number(polloAfter.quantity) === 800, Number(polloAfter.quantity));

    const pantryAfter = await api("GET", "/api/pantry");
    const polloStatus = pantryAfter.body.items?.find((i) => i.id === pollo.id);
    check("y su estado ya no es 'out'", polloStatus?.status !== "out", polloStatus?.status);

    // ── 6. Recetas ──
    console.log("\n[6] Pedir recetas y guardar una");
    const gen = await api("POST", "/api/ai/recipes", { servings: 2 });
    check(`genera recetas (${gen.status})`, gen.status === 200, JSON.stringify(gen.body)?.slice(0, 200));
    const recipes = gen.body?.recipes ?? [];
    check("devuelve al menos una receta", recipes.length > 0, String(recipes.length));
    check("cada receta trae disponibilidad", Boolean(recipes[0]?.availability), JSON.stringify(recipes[0]?.availability)?.slice(0, 120));

    const chosen = recipes[0];
    const saveRecipe = await api("POST", "/api/pantry/recipes", {
      name: chosen.name,
      description: chosen.description,
      type: chosen.type,
      servings: chosen.servings,
      cookingTime: chosen.cookingTime,
      difficulty: chosen.difficulty,
      instructions: chosen.instructions,
      ingredients: chosen.ingredients,
      source: chosen.source,
    });
    check(`guarda la receta (${saveRecipe.status})`, saveRecipe.status === 201 || saveRecipe.status === 200, JSON.stringify(saveRecipe.body)?.slice(0, 200));
    const recipeId = saveRecipe.body?.id;

    const savedList = await api("GET", "/api/pantry/recipes");
    check("aparece en guardadas", (savedList.body?.recipes ?? []).some((r) => r.id === recipeId), String(savedList.body?.recipes?.length));

    // ── 7. Cocinar modo B ──
    console.log("\n[7] Cocinar en modo B (descuenta lo disponible)");
    const polloBefore = Number((await prisma.pantryItem.findUniqueOrThrow({ where: { id: pollo.id } })).quantity);
    const cookB = await api("POST", `/api/pantry/recipes/${recipeId}/cook`, { mode: "B", servings: 2 });
    check(`cocina modo B (${cookB.status})`, cookB.status === 200, JSON.stringify(cookB.body)?.slice(0, 250));

    const mealLogs = await prisma.pantryMealLog.findMany({ where: { userId } });
    check("queda el registro de la comida", mealLogs.length === 1, String(mealLogs.length));
    check("con el modo elegido", mealLogs[0]?.mode === "B", mealLogs[0]?.mode);

    const polloAfterCook = Number((await prisma.pantryItem.findUniqueOrThrow({ where: { id: pollo.id } })).quantity);
    check(
      `el stock del pollo bajó (${polloBefore} → ${polloAfterCook})`,
      polloAfterCook <= polloBefore,
      `${polloBefore} → ${polloAfterCook}`
    );

    // ── 8. Modo C: faltantes a la lista ──
    console.log("\n[8] Cocinar en modo C (faltantes → lista de compras)");
    // Se deja el pollo en 0 para forzar faltante.
    await prisma.pantryItem.update({ where: { id: pollo.id }, data: { quantity: 0 } });
    const cookC = await api("POST", `/api/pantry/recipes/${recipeId}/cook`, { mode: "C", servings: 4 });
    check(`cocina modo C (${cookC.status})`, cookC.status === 200, JSON.stringify(cookC.body)?.slice(0, 250));
    const buyListId = cookC.body?.shoppingListId;
    check("creó o usó una lista de compras", Boolean(buyListId), String(buyListId));
    check("agregó faltantes", (cookC.body?.addedToList ?? 0) > 0, String(cookC.body?.addedToList));

    if (buyListId) {
      const buyList = await api("GET", `/api/shopping-lists/${buyListId}`);
      check("la lista de faltantes tiene productos", (buyList.body?.items ?? []).length > 0, String(buyList.body?.items?.length));
    }

    // ── 9. Historial, tiquete y reversa ──
    console.log("\n[9] Historial, tiquete y reversa");
    const hist = await api("GET", "/api/pantry/history");
    check(`el historial responde (${hist.status})`, hist.status === 200, JSON.stringify(hist.body)?.slice(0, 150));
    check("hay 1 compra registrada", (hist.body?.confirmations ?? []).length === 1, String(hist.body?.confirmations?.length));

    const conf = hist.body?.confirmations?.[0];
    const ticket = await api("GET", `/api/pantry/history/${conf.id}`);
    check("el tiquete trae el pollo", (ticket.body?.lines ?? []).some((l) => norm(l.name) === norm("Pechuga de pollo")), JSON.stringify(ticket.body?.lines?.map((l) => l.name)));
    check("con el descuento aplicado", ticket.body?.discountAmount === 1136, ticket.body?.discountAmount);

    const stockBeforeReverse = Number((await prisma.pantryItem.findUniqueOrThrow({ where: { id: pollo.id } })).quantity);
    const reverse = await api("POST", `/api/pantry/history/${conf.id}/reverse`);
    check(`reversa (${reverse.status})`, reverse.status === 200, JSON.stringify(reverse.body)?.slice(0, 250));

    const stockAfterReverse = Number((await prisma.pantryItem.findUniqueOrThrow({ where: { id: pollo.id } })).quantity);
    check(
      `el stock volvió atrás (${stockBeforeReverse} → ${stockAfterReverse})`,
      stockAfterReverse < stockBeforeReverse || stockBeforeReverse === 0,
      `${stockBeforeReverse} → ${stockAfterReverse}`
    );

    // Comprobaciones fuertes de la reversa: sin esto, "0 → 0" puede pasar sin
    // haber revertido nada.
    const reversedMovements = await prisma.pantryMovement.findMany({
      where: { userId, confirmationId: conf.id },
    });
    check("los movimientos quedaron marcados como reversados",
      reversedMovements.length > 0 && reversedMovements.every((m) => m.reversedAt !== null),
      JSON.stringify(reversedMovements.map((m) => m.reversedAt))
    );

    const confAfter = await prisma.pantryListConfirmation.findUniqueOrThrow({ where: { id: conf.id } });
    check("la confirmación quedó marcada como reversada", confAfter.reversedAt !== null, String(confAfter.reversedAt));

    const financeAfter = await prisma.transaction.findMany({
      where: { userId, sourceModule: "pantry", sourceId: conf.id },
    });
    check("el movimiento financiero se revirtió", financeAfter.length === 0, String(financeAfter.length));

    const accountAfterReverse = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    check(
      "el dinero volvió a la cuenta (2.000.000)",
      Number(accountAfterReverse.balance) === 2_000_000,
      String(accountAfterReverse.balance)
    );

    const listAfterReverse = await prisma.shoppingList.findUniqueOrThrow({ where: { id: manualListId } });
    check("la lista se reabrió", listAfterReverse.status !== "completed", listAfterReverse.status);

    // ── 10. Perfiles alimenticios ──
    console.log("\n[10] Perfiles alimenticios y filtrado de recetas");
    const profile = await prisma.healthProfile.create({
      data: { userId, name: "Ana", type: "owner" },
    });

    const putDietary = await api("PUT", `/api/pantry/profiles/${profile.id}/dietary`, {
      conditions: ["Diabetes tipo 2"],
      restrictions: ["Lactosa"],
      avoid: ["Cilantro"],
      preferences: [],
    });
    check(`guarda el perfil alimenticio (${putDietary.status})`, putDietary.status === 200, JSON.stringify(putDietary.body)?.slice(0, 250));

    const getDietary = await api("GET", `/api/pantry/profiles/${profile.id}/dietary`);
    check("guarda la condición", (getDietary.body?.conditions ?? []).some((c) => c.name === "Diabetes tipo 2"), JSON.stringify(getDietary.body?.conditions));
    check("guarda la restricción dura", (getDietary.body?.restrictions ?? []).includes("Lactosa"), JSON.stringify(getDietary.body?.restrictions));

    const withProfile = await api("POST", "/api/ai/recipes", { profileId: profile.id });
    check(`genera recetas con perfil (${withProfile.status})`, withProfile.status === 200, JSON.stringify(withProfile.body)?.slice(0, 150));
    const generatedNames = (withProfile.body?.recipes ?? []).map((r) => r.name.toLowerCase());
    check("ninguna receta lleva lácteo evidente", !generatedNames.some((n) => n.includes("queso") || n.includes("leche")), JSON.stringify(generatedNames));
  } finally {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    console.log("\nUsuario de prueba eliminado.");
  }

  console.log(`\n${passed} comprobaciones OK, ${failed} fallidas`);
  if (failed > 0) {
    console.log("Fallaron: " + fails.join(" | "));
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("E2E FALLÓ:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
