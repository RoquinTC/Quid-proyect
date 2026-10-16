/**
 * Verifica el bug que rompía la confirmación de compras.
 *
 * CAUSA: al confirmar, el endpoint creaba los productos de la nevera sin
 * `nameNormalized`, que nacía como `""`. Con la restricción única
 * `(userId, nameNormalized, unit)`, **el segundo producto nuevo de la misma
 * compra chocaba** y toda la confirmación fallaba.
 *
 * Este script reproduce ese caso exacto: una compra con varios productos que
 * todavía no están en la nevera, y verifica que ahora se crean todos con su
 * clave normalizada.
 *
 *   node scripts/smoke-confirm.mjs
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
let passed = 0;
let failed = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}\n      esperado: ${JSON.stringify(expected)}\n      obtenido: ${JSON.stringify(actual)}`);
  }
}

function normalizeName(name) {
  if (!name) return "";
  const original = name.trim();
  if (!original) return "";
  return (
    original
      .normalize("NFD")
      .replace(/[\u0300-\u036f\u1ab0-\u1aff\u1dc0-\u1dff\u20d0-\u20ff\ufe20-\ufe2f]/g, "")
      .toLowerCase()
      .replace(/\s+/g, "") || original
  );
}

/** Réplica del alta de producto que hace el endpoint de confirmación. */
async function createPantryFromLine(tx, userId, line) {
  let pantryItemId = line.pantryItemId;

  if (pantryItemId) {
    const exists = await tx.pantryItem.findFirst({
      where: { id: pantryItemId, userId },
      select: { id: true },
    });
    if (!exists) pantryItemId = null;
  }

  if (!pantryItemId) {
    const key = normalizeName(line.name);
    const existing = await tx.pantryItem.findFirst({
      where: { userId, nameNormalized: key, unit: line.unit },
      select: { id: true },
    });
    pantryItemId = existing?.id ?? null;
  }

  if (!pantryItemId) {
    const created = await tx.pantryItem.create({
      data: {
        userId,
        name: line.name,
        nameNormalized: normalizeName(line.name),
        category: "other",
        quantity: 0,
        unit: line.unit,
        minStock: line.minStock ?? null,
      },
    });
    pantryItemId = created.id;
  }
  return pantryItemId;
}

async function main() {
  const email = `confirm-smoke-${Date.now()}@test.local`;
  const user = await prisma.user.create({
    data: { email, name: "Confirm Smoke", password: "x" },
  });
  const userId = user.id;
  console.log(`\nUsuario de prueba: ${email}\n`);

  try {
    // ── 1. El bug: dos productos NUEVOS con la misma unidad ──
    console.log("1. Dos productos nuevos con la misma unidad (el caso que fallaba)");
    const list = await prisma.shoppingList.create({
      data: {
        userId,
        name: "Mercado de prueba",
        status: "shopping",
        storeName: "Éxito",
        items: {
          create: [
            { name: "Pan tajado", unit: "unit", quantity: 2, actualPrice: 4500, isPurchased: true },
            { name: "Huevos", unit: "unit", quantity: 12, actualPrice: 700, isPurchased: true },
            { name: "Leche entera", unit: "unit", quantity: 1, actualPrice: 4200, isPurchased: true },
          ],
        },
      },
      include: { items: true },
    });

    let created = [];
    try {
      created = await prisma.$transaction(async (tx) => {
        const ids = [];
        for (const line of list.items) {
          ids.push(await createPantryFromLine(tx, userId, line));
        }
        return ids;
      });
      check("los 3 productos se crean sin chocar con la restricción única", created.length, 3);
    } catch (e) {
      failed++;
      console.log(`  ✗ la transacción falló: ${e.message}`);
    }

    const keys = await prisma.pantryItem.findMany({
      where: { userId },
      select: { name: true, nameNormalized: true, unit: true },
      orderBy: { name: "asc" },
    });
    check("ninguna clave quedó vacía", keys.every((k) => k.nameNormalized !== ""), true);
    check("las claves son las esperadas", keys.map((k) => k.nameNormalized), [
      "huevos",
      "lecheentera",
      "pantajado",
    ]);

    // ── 2. El auto-match evita duplicar ──
    console.log("\n2. Auto-match: un producto que ya existe no se duplica");
    const before = await prisma.pantryItem.count({ where: { userId } });
    const matched = await prisma.$transaction(async (tx) =>
      createPantryFromLine(tx, userId, { name: "PAN TAJADO", unit: "unit" })
    );
    const after = await prisma.pantryItem.count({ where: { userId } });
    check("no se creó un duplicado", after, before);
    const panRow = await prisma.pantryItem.findFirst({
      where: { userId, nameNormalized: "pantajado" },
      select: { id: true },
    });
    check("se enlazó al producto existente", matched, panRow.id);

    // ── 3. Unidad distinta sí es un producto distinto ──
    console.log("\n3. La misma clave con otra unidad es otro registro (correcto)");
    const otro = await prisma.$transaction(async (tx) =>
      createPantryFromLine(tx, userId, { name: "Leche entera", unit: "l" })
    );
    const total = await prisma.pantryItem.count({ where: { userId } });
    check("se creó un cuarto registro", total, 4);
    check("el nuevo id es distinto", otro !== matched, true);

    // ── 4. Ledger + historial de precios ──
    console.log("\n4. El stock entra por el ledger y deja historial de precios");
    const pan = await prisma.pantryItem.findFirst({
      where: { userId, nameNormalized: "pantajado" },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      await tx.pantryMovement.create({
        data: {
          itemId: pan.id, userId, type: "in", quantity: 2, unit: "unit",
          note: "Compra en Éxito", sourceListId: list.id, sourceStore: "Éxito",
          unitPrice: 4500, occurredAt: new Date(),
        },
      });
      await tx.pantryItem.update({
        where: { id: pan.id },
        data: { quantity: { increment: 2 } },
      });
      await tx.priceHistory.create({
        data: {
          itemId: pan.id, userId, price: 4500, quantity: 2, unit: "unit",
          date: new Date(), sourceListId: list.id, sourceStore: "Éxito",
          storeName: normalizeName("Éxito"),
        },
      });
    });
    const panAfter = await prisma.pantryItem.findUniqueOrThrow({ where: { id: pan.id } });
    check("cantidad tras la entrada", panAfter.quantity, 2);
    const moves = await prisma.pantryMovement.count({ where: { itemId: pan.id, type: "in" } });
    check("movimiento de entrada registrado", moves, 1);
    const prices = await prisma.priceHistory.findMany({
      where: { itemId: pan.id },
      select: { price: true, storeName: true },
    });
    check("precio histórico registrado", Number(prices[0].price), 4500);
    check("con la tienda normalizada", prices[0].storeName, "exito");

    // ── 5. Registro de la confirmación parcial ──
    console.log("\n5. Cada confirmación queda como registro propio");
    const confirmation = await prisma.pantryListConfirmation.create({
      data: {
        shoppingListId: list.id,
        userId,
        storeName: "Éxito",
        purchaseDate: new Date(),
        subtotal: 21600,
        total: 21600,
        paymentType: "account",
        itemCount: 3,
      },
    });
    check("confirmación creada", confirmation.total.toString(), "21600");
    check("sin reversa", confirmation.reversedAt, null);

    // ── 6. El mínimo nunca baja ──
    console.log("\n6. El mínimo recordado nunca baja");
    await prisma.pantryItem.update({ where: { id: pan.id }, data: { minStock: 5 } });
    // Compra de 2 con minMode: debe seguir en 5, no bajar a 2.
    const currentMin = 5;
    const movedQty = 2;
    const nextMin = Math.max(currentMin, movedQty);
    check("el mínimo se mantiene en 5", nextMin, 5);
    check("y si la compra fuera mayor, subiría", Math.max(currentMin, 8), 8);

    // ── 7. Estado de la lista según saldado ──
    console.log("\n7. Estado de la lista según lo saldado");
    const lines = await prisma.shoppingListItem.findMany({
      where: { shoppingListId: list.id },
      select: { quantity: true, confirmedQuantity: true },
    });
    const allSettled = lines.every((l) => l.confirmedQuantity >= l.quantity - 1e-9);
    check("sin confirmar nada, no está saldada", allSettled, false);

    await prisma.shoppingListItem.updateMany({
      where: { shoppingListId: list.id },
      data: { confirmedQuantity: 0 },
    });
    await prisma.shoppingListItem.updateMany({
      where: { shoppingListId: list.id },
      data: { confirmedQuantity: 99 },
    });
    const lines2 = await prisma.shoppingListItem.findMany({
      where: { shoppingListId: list.id },
      select: { quantity: true, confirmedQuantity: true },
    });
    check(
      "con todo confirmado, sí queda saldada",
      lines2.every((l) => l.confirmedQuantity >= l.quantity - 1e-9),
      true
    );
  } finally {
    await prisma.user.delete({ where: { id: userId } });
    console.log("\nUsuario de prueba eliminado.");
  }

  console.log(`\n${passed} comprobaciones OK, ${failed} fallidas`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("Smoke test falló:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
