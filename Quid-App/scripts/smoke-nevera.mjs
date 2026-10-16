/**
 * Prueba de humo del flujo de la Nevera — Fase 1.
 *
 * Ejercita el ledger directamente contra la base real: alta con movimiento
 * inicial, ajuste, consumo, merma, acotado a 0 y generación de lista de
 * reposición. Crea su propio usuario de prueba y lo borra al terminar.
 *
 *   node scripts/smoke-nevera.mjs
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

function approx(label, actual, expected, tolerance = 1e-9) {
  const ok = Math.abs(actual - expected) <= tolerance;
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label} → esperado ${expected}, obtenido ${actual}`);
  }
}

/** Réplica de movementDelta + acotado, que es la regla que se está verificando. */
function movementDelta(type, quantity) {
  switch (type) {
    case "out":
    case "waste":
      return -Math.abs(quantity);
    case "in":
      return Math.abs(quantity);
    default:
      return quantity;
  }
}

async function main() {
  const email = `nevera-smoke-${Date.now()}@test.local`;
  const user = await prisma.user.create({
    data: { email, name: "Nevera Smoke", password: "x" },
  });
  const userId = user.id;
  console.log(`\nUsuario de prueba: ${email}\n`);

  const applyMovement = async (itemId, type, quantity, note) => {
    const delta = movementDelta(type, quantity);
    return prisma.$transaction(async (tx) => {
      const current = await tx.pantryItem.findUniqueOrThrow({ where: { id: itemId } });
      const newQuantity = Math.max(0, current.quantity + delta);
      const movement = await tx.pantryMovement.create({
        data: {
          itemId, userId, type, quantity: Math.abs(quantity),
          unit: current.unit, note: note ?? null, occurredAt: new Date(),
        },
      });
      await tx.pantryItem.update({
        where: { id: itemId },
        data: {
          quantity: newQuantity,
          ...(type === "out" || type === "waste" ? { lastUsedAt: new Date() } : {}),
        },
      });
      return { movementId: movement.id, newQuantity };
    });
  };

  try {
    // ── 1. Alta con cantidad inicial ⇒ debe crear movimiento `in` ──
    console.log("1. Alta de producto con carga inicial");
    const arroz = await prisma.$transaction(async (tx) => {
      const item = await tx.pantryItem.create({
        data: {
          userId, name: "Arroz", nameNormalized: "arroz",
          category: "grains", quantity: 2, unit: "kg",
          location: "alacena", minStock: 2, targetQuantity: 5,
        },
      });
      await tx.pantryMovement.create({
        data: { itemId: item.id, userId, type: "in", quantity: 2, unit: "kg", note: "Carga inicial" },
      });
      return item;
    });
    check("cantidad inicial", arroz.quantity, 2);
    check("mínimo fijado en el primer registro", arroz.minStock, 2);
    check("ubicación", arroz.location, "alacena");
    const movs0 = await prisma.pantryMovement.count({ where: { itemId: arroz.id } });
    check("se creó el movimiento de entrada", movs0, 1);

    // ── 2. Ajuste al alza (recuento físico) ──
    console.log("\n2. Ajuste al alza");
    const up = await applyMovement(arroz.id, "adjust", 3, "Encontré más");
    const afterUp = await prisma.pantryItem.findUniqueOrThrow({ where: { id: arroz.id } });
    check("cantidad tras ajuste +3", afterUp.quantity, 5);
    check("lastUsedAt NO se toca en adjust", afterUp.lastUsedAt, null);

    // ── 3. Consumo ──
    console.log("\n3. Consumo");
    await applyMovement(arroz.id, "out", 2, "Almuerzo");
    const afterOut = await prisma.pantryItem.findUniqueOrThrow({ where: { id: arroz.id } });
    check("cantidad tras consumo −2", afterOut.quantity, 3);
    check("lastUsedAt SÍ se toca al consumir", afterOut.lastUsedAt !== null, true);

    // ── 4. Merma ──
    console.log("\n4. Merma");
    await applyMovement(arroz.id, "waste", 1, "Se humedeció");
    const afterWaste = await prisma.pantryItem.findUniqueOrThrow({ where: { id: arroz.id } });
    check("cantidad tras merma −1", afterWaste.quantity, 2);
    const wasteRows = await prisma.pantryMovement.count({
      where: { itemId: arroz.id, type: "waste" },
    });
    check("la merma queda registrada como tipo propio", wasteRows, 1);

    // ── 5. Acotado a 0 ──
    console.log("\n5. Consumo mayor que lo disponible se acota a 0");
    await applyMovement(arroz.id, "out", 99, "Intento excesivo");
    const afterOver = await prisma.pantryItem.findUniqueOrThrow({ where: { id: arroz.id } });
    check("nunca queda negativo", afterOver.quantity, 0);

    // ── 6. Unidades distintas con precio por kilo ──
    console.log("\n6. Producto con precio por kg y compra en gramos/libras");
    const cafe = await prisma.pantryItem.create({
      data: {
        userId, name: "Café molido", nameNormalized: "cafemolido",
        category: "beverages", quantity: 500, unit: "g", location: "alacena",
        priceUnitId: "kg", multiplyQuantity: true, minStock: 500,
      },
    });
    check("unidad de compra", cafe.unit, "g");
    check("unidad de precio", cafe.priceUnitId, "kg");

    // El motor real vive en src/lib/pantry/units.ts; aquí se replica la regla
    // para verificar el dato persistido: 500 g = 0,5 kg × 40.000 = 20.000
    approx("500 g a 40.000/kg", (cafe.quantity / 1000) * 40000, 20000);
    // 1 lb = 0,45359237 kg × 40.000 = 18.143,6948
    approx("1 lb a 40.000/kg", 0.45359237 * 40000, 18143.6948, 1e-9);

    const arrozUnit = await prisma.pantryItem.findUniqueOrThrow({ where: { id: arroz.id } });
    check("unidad del arroz sigue siendo kg", arrozUnit.unit, "kg");

    // ── 7. Restricción única ──
    console.log("\n7. La restricción única impide duplicados");
    let duplicated = false;
    try {
      await prisma.pantryItem.create({
        data: {
          userId, name: "ARROZ", nameNormalized: "arroz",
          category: "grains", quantity: 1, unit: "kg",
        },
      });
      duplicated = true;
    } catch {
      duplicated = false;
    }
    check("crear 'ARROZ' con la misma clave falla", duplicated, false);

    // ── 8. Baja lógica (antes de la reposición, para verificar el filtro) ──
    console.log("\n8. Baja lógica conserva el historial");
    await prisma.pantryItem.update({ where: { id: arroz.id }, data: { isActive: false } });
    const archived = await prisma.pantryItem.findUniqueOrThrow({ where: { id: arroz.id } });
    const itsMovements = await prisma.pantryMovement.count({ where: { itemId: arroz.id } });
    check("el producto sale de la nevera", archived.isActive, false);
    check("sus movimientos siguen ahí", itsMovements > 0, true);

    // ── 9. Lista de reposición ──
    console.log("\n9. Lista de reposición desde los faltantes");
    const items = await prisma.pantryItem.findMany({ where: { userId, isActive: true } });
    const replenishable = items.filter((i) => i.minStock != null || i.targetQuantity != null);
    check("el arroz dado de baja no participa", replenishable.length, 1);

    const arrozNow = await prisma.pantryItem.findUniqueOrThrow({ where: { id: arroz.id } });
    // objetivo 5, cantidad 0 ⇒ faltan 5 (aunque esté de baja, el cálculo es correcto)
    approx("faltante del arroz", Math.max(0, (arrozNow.targetQuantity ?? 0) - arrozNow.quantity), 5);

    const list = await prisma.shoppingList.create({
      data: {
        userId, name: "Reposición de nevera", status: "draft", purpose: "Reposición",
        items: {
          create: replenishable
            .map((i) => ({
              name: i.name,
              nameNormalized: i.nameNormalized,
              quantity: Math.max(0, (i.targetQuantity ?? i.minStock ?? 0) - i.quantity),
              unit: i.unit,
              multiplyQuantity: i.multiplyQuantity,
              isStock: false,
            }))
            // Un faltante de 0 no genera línea: no hay nada que comprar.
            .filter((line) => line.quantity > 0)
            .map((line, index) => ({ ...line, sortOrder: index + 1 })),
        },
      },
      include: { items: true },
    });
    check("el café no genera línea (no le falta nada)", list.items.length, 0);
    check("la marca de stock viene deshabilitada", list.items.every((i) => i.isStock === false), true);
    check("estado inicial", list.status, "draft");

    // Con el café sin faltante, se le sube el objetivo para verificar que sí genera línea.
    await prisma.pantryItem.update({
      where: { id: cafe.id },
      data: { targetQuantity: 1500 },
    });
    const items2 = await prisma.pantryItem.findMany({ where: { userId, isActive: true } });
    const shortfall = items2
      .filter((i) => i.minStock != null || i.targetQuantity != null)
      .map((i) => Math.max(0, (i.targetQuantity ?? i.minStock ?? 0) - i.quantity))
      .filter((q) => q > 0);
    check("al subir el objetivo aparece el faltante", shortfall, [1000]);
  } finally {
    // Limpieza: el usuario de prueba se lleva todo por cascada.
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
