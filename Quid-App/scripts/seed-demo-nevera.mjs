/**
 * Deja un usuario demo con datos realistas para inspeccionar la UI.
 *
 * Crea (o recrea) el usuario `demo-nevera@quid.local` con:
 *   - una cuenta con dos bolsillos
 *   - una tarjeta de crédito
 *   - nevera surtida (12 productos con estados variados)
 *   - una lista de mercado en curso con 8 líneas
 *   - un histórico de compras
 *
 *   node scripts/seed-demo-nevera.mjs [--clean]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const EMAIL = "demo-nevera@quid.local";
const PASSWORD_HASH =
  "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"; // "demo1234"

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

const day = 86_400_000;
const now = Date.now();
const inDays = (d) => new Date(now + d * day);
const agoDays = (d) => new Date(now - d * day);

const PANTRY = [
  { name: "Leche entera", category: "dairy", quantity: 1, unit: "l", location: "nevera", minStock: 2, targetQuantity: 4, expires: 2, used: 1 },
  { name: "Huevos", category: "dairy", quantity: 6, unit: "unit", location: "nevera", minStock: 12, targetQuantity: 30, expires: 9, used: 2 },
  { name: "Queso campesino", category: "dairy", quantity: 250, unit: "g", location: "nevera", minStock: 250, targetQuantity: 500, expires: 5, used: 3 },
  { name: "Pechuga de pollo", category: "meat", quantity: 0, unit: "kg", location: "congelador", minStock: 1, targetQuantity: 2, expires: 40, used: 6 },
  { name: "Carne molida", category: "meat", quantity: 1, unit: "kg", location: "congelador", minStock: 0.5, targetQuantity: 1.5, expires: 20, used: 5 },
  { name: "Tomate", category: "vegetables", quantity: 0.4, unit: "kg", location: "nevera", minStock: 0.5, targetQuantity: 1, expires: 1, used: 1 },
  { name: "Cebolla", category: "vegetables", quantity: 1.2, unit: "kg", location: "alacena", minStock: 0.5, targetQuantity: 1.5, expires: 25, used: 2 },
  { name: "Arroz", category: "grains", quantity: 1.5, unit: "kg", location: "alacena", minStock: 2, targetQuantity: 5, expires: 300, used: 4 },
  { name: "Frijol", category: "grains", quantity: 900, unit: "g", location: "alacena", minStock: 500, targetQuantity: 1000, expires: 200, used: 40 },
  { name: "Café molido", category: "beverages", quantity: 500, unit: "g", location: "alacena", minStock: 250, targetQuantity: 500, expires: 120, used: 1, priceUnitId: "kg" },
  { name: "Pan tajado", category: "grains", quantity: 0, unit: "unit", location: "alacena", minStock: 1, targetQuantity: 2, expires: -1, used: 1 },
  { name: "Aceite de oliva", category: "condiments", quantity: 0.75, unit: "l", location: "alacena", minStock: 0.25, targetQuantity: 1, expires: 400, used: 60 },
];

const LIST_ITEMS = [
  { name: "Leche entera", unit: "l", quantity: 2, price: 4200, cart: true, bought: true, stock: true },
  { name: "Huevos", unit: "unit", quantity: 30, price: 650, cart: true, bought: true, stock: true },
  { name: "Pechuga de pollo", unit: "kg", quantity: 1.5, price: 14200, cart: true, bought: true, stock: true },
  { name: "Tomate", unit: "kg", quantity: 1, price: 3200, cart: true, bought: false, stock: false },
  { name: "Pan tajado", unit: "unit", quantity: 2, price: 4800, cart: false, bought: false, stock: false },
  { name: "Arroz", unit: "kg", quantity: 3, price: 5400, cart: false, bought: false, stock: false },
  { name: "Café molido", unit: "g", quantity: 250, price: 38000, cart: false, bought: false, stock: false, priceUnit: "kg" },
  { name: "Aceite de oliva", unit: "l", quantity: 1, price: 32000, cart: false, bought: false, stock: false },
];

async function main() {
  const clean = process.argv.includes("--clean");

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    if (!clean) {
      console.log("El usuario demo ya existe. Usa --clean para recrearlo.");
      return;
    }
    await prisma.user.delete({ where: { id: existing.id } });
    console.log("Usuario demo anterior eliminado.");
  }

  const user = await prisma.user.create({
    data: {
      email: EMAIL,
      name: "Ana",
      password: PASSWORD_HASH,
      currency: "COP",
      onboardingCompleted: true,
      onboardingStep: 7,
    },
  });
  const userId = user.id;

  // ── Cuenta con bolsillos ──
  const account = await prisma.account.create({
    data: {
      userId,
      name: "Bancolombia",
      type: "bank",
      balance: 1_850_000,
      color: "#F59E0B",
    },
  });
  await prisma.subAccount.createMany({
    data: [
      { accountId: account.id, name: "Mercado", balance: 450_000, type: "expense" },
      { accountId: account.id, name: "Ahorro viaje", balance: 800_000, type: "savings" },
    ],
  });

  // ── Tarjeta de crédito ──
  await prisma.debt.create({
    data: {
      userId,
      name: "Visa Éxito",
      type: "credit_card",
      totalAmount: 3_000_000,
      currentBalance: 620_000,
      cutoffDate: 20,
      paymentDate: 5,
      color: "#8B5CF6",
    },
  });

  // ── Nevera ──
  for (const item of PANTRY) {
    await prisma.pantryItem.create({
      data: {
        userId,
        name: item.name,
        nameNormalized: normalizeName(item.name),
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location,
        minStock: item.minStock ?? null,
        targetQuantity: item.targetQuantity ?? null,
        expirationDate: item.expires !== undefined ? inDays(item.expires) : null,
        lastUsedAt: item.used !== undefined ? agoDays(item.used) : null,
        priceUnitId: item.priceUnitId ?? null,
        multiplyQuantity: item.unit !== "g" && item.unit !== "ml",
        purchaseDate: agoDays(7),
        purchasePrice: 4200,
      },
    });
  }

  // ── Historial de precios y movimientos, para que los Reportes tengan datos:
  // el mismo producto comprado en dos tiendas y con precios que cambian.
  const seeded = await prisma.pantryItem.findMany({ where: { userId } });
  const byKey = new Map(seeded.map((i) => [i.nameNormalized, i]));

  const PRICE_SEED = [
    { key: "lecheentera", store: "Éxito", storeKey: "exito", days: 60, price: 3800, qty: 1, unit: "l" },
    { key: "lecheentera", store: "D1", storeKey: "d1", days: 25, price: 4400, qty: 1, unit: "l" },
    { key: "lecheentera", store: "Éxito", storeKey: "exito", days: 5, price: 4100, qty: 1, unit: "l" },
    { key: "tomate", store: "Éxito", storeKey: "exito", days: 40, price: 2800, qty: 1000, unit: "g" },
    { key: "tomate", store: "D1", storeKey: "d1", days: 12, price: 3200, qty: 1000, unit: "g" },
    { key: "arroz", store: "D1", storeKey: "d1", days: 55, price: 4800, qty: 1, unit: "kg" },
    { key: "arroz", store: "Éxito", storeKey: "exito", days: 18, price: 5400, qty: 1, unit: "kg" },
    { key: "cafemolido", store: "Éxito", storeKey: "exito", days: 45, price: 34000, qty: 250, unit: "g" },
    { key: "cafemolido", store: "D1", storeKey: "d1", days: 8, price: 38000, qty: 250, unit: "g" },
    { key: "huevos", store: "D1", storeKey: "d1", days: 30, price: 600, qty: 12, unit: "unit" },
    { key: "huevos", store: "Éxito", storeKey: "exito", days: 3, price: 650, qty: 12, unit: "unit" },
  ];

  for (const p of PRICE_SEED) {
    const item = byKey.get(p.key);
    if (!item) continue;
    const date = agoDays(p.days);
    await prisma.priceHistory.create({
      data: {
        itemId: item.id,
        userId,
        price: p.price,
        quantity: p.qty,
        unit: p.unit,
        date,
        sourceStore: p.store,
        storeName: p.storeKey,
      },
    });
    await prisma.pantryMovement.create({
      data: {
        itemId: item.id,
        userId,
        type: "in",
        quantity: p.qty,
        unit: p.unit,
        unitPrice: p.price,
        occurredAt: date,
        note: `Compra en ${p.store}`,
      },
    });
  }

  // ── Lista de mercado en curso ──
  await prisma.shoppingList.create({
    data: {
      userId,
      name: "Mercado de la semana",
      status: "shopping",
      storeName: "Éxito",
      purpose: "Mercado",
      items: {
        create: LIST_ITEMS.map((item, index) => ({
          name: item.name,
          nameNormalized: normalizeName(item.name),
          unit: item.unit,
          quantity: item.quantity,
          estimatedPrice: item.price,
          actualPrice: item.bought ? item.price : null,
          isPurchased: item.bought,
          checked: item.cart,
          addedToCart: item.cart,
          isStock: item.stock,
          multiplyQuantity: item.unit !== "g",
          sortOrder: index + 1,
        })),
      },
    },
  });

  // ── Histórico: dos compras ya cerradas ──
  for (const [i, store] of ["Éxito", "D1"].entries()) {
    const purchaseDate = agoDays(14 - i * 7);
    const list = await prisma.shoppingList.create({
      data: {
        userId,
        name: i === 0 ? "Mercado quincenal" : "Mercado rápido",
        status: "completed",
        storeName: store,
        purpose: "Mercado",
        purchaseDate,
        completedAt: purchaseDate,
      },
    });
    const confirmation = await prisma.pantryListConfirmation.create({
      data: {
        shoppingListId: list.id,
        userId,
        storeName: store,
        purchaseDate,
        subtotal: i === 0 ? 142_300 : 38_700,
        total: i === 0 ? 128_070 : 38_700,
        discountType: i === 0 ? "PERCENT" : null,
        discountValue: i === 0 ? 0.1 : null,
        discountAmount: i === 0 ? 14_230 : 0,
        paymentType: i === 0 ? "account" : "credit_card",
        accountId: i === 0 ? account.id : null,
        itemCount: 6,
      },
    });
    console.log(`  histórico ${store}: ${confirmation.total}`);
  }

  console.log(`\nUsuario demo listo.`);
  console.log(`  email:    ${EMAIL}`);
  console.log(`  password: demo1234`);
}

main()
  .catch((e) => {
    console.error("Seed falló:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
