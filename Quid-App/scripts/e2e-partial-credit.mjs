/**
 * Verifica dos bugs reportados:
 *   1. Una compra PARCIAL debe dejar la lista abierta con el resto pendiente.
 *   2. Pagar con TARJETA debe dejar la cuota con cuenta de cobro (no "sin cuenta").
 *
 *   node scripts/e2e-partial-credit.mjs [puerto]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const PORT = Number(process.argv[2] || 3102);
const BASE = `http://127.0.0.1:${PORT}`;
const SECRET = process.env.NEXTAUTH_SECRET;
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function check(label, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`);
  }
}

async function post(path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: `next-auth.session-token=${token}` },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  if (!SECRET) throw new Error("Falta NEXTAUTH_SECRET");

  const user = await prisma.user.create({
    data: { email: `e2e-partial-${Date.now()}@test.local`, name: "Partial", password: "x" },
  });
  const userId = user.id;

  try {
    const account = await prisma.account.create({
      data: { userId, name: "Cuenta E2E", type: "bank", balance: 1_000_000, color: "#10B981" },
    });
    const card = await prisma.debt.create({
      data: { userId, name: "TC E2E", type: "credit_card", totalAmount: 2_000_000, currentBalance: 0 },
    });

    const token = await encode({
      secret: SECRET,
      token: { id: userId, sub: userId, email: user.email, name: "Partial" },
      maxAge: 3600,
    });

    // ── Lista con 4 líneas, todas marcadas como compradas ──
    const list = await prisma.shoppingList.create({
      data: {
        userId,
        name: "Mercado parcial",
        status: "shopping",
        storeName: "Éxito",
        items: {
          create: [
            { name: "Pollo", unit: "g", quantity: 800, actualPrice: 14200, isPurchased: true, priceUnitId: "kg", multiplyQuantity: true },
            { name: "Papa", unit: "kg", quantity: 1.5, actualPrice: 1100, isPurchased: true },
            { name: "Tomate", unit: "kg", quantity: 1, actualPrice: 3200, isPurchased: true },
            { name: "Cebolla", unit: "kg", quantity: 1, actualPrice: 2800, isPurchased: true },
          ],
        },
      },
      include: { items: true },
    });

    // Confirma SOLO las dos primeras (compra parcial en una tienda).
    const firstTwo = list.items.slice(0, 2);
    const r1 = await post(`/api/shopping-lists/${list.id}/confirm`, token, {
      paymentType: "account",
      accountId: account.id,
      subAccountId: null,
      items: firstTwo.map((i) => ({ id: i.id, quantity: i.quantity })),
      minMode: false,
      storeName: "Éxito",
      purchaseDate: "2026-10-17T12:00:00.000Z",
    });

    check(`confirma parcial (status ${r1.status})`, r1.status === 200, JSON.stringify(r1.body)?.slice(0, 300));

    // Pollo: 800 g a 14.200/kg = 11.360. Papa: 1,5 kg a 1.100 = 1.650. Total 13.010.
    check("el total convierte la unidad (13.010)", r1.body?.confirmation?.total === 13010, String(r1.body?.confirmation?.total));

    const afterPartial = await prisma.shoppingList.findUniqueOrThrow({
      where: { id: list.id },
      include: { items: true },
    });
    check("la lista NO quedó completada", afterPartial.status !== "completed", afterPartial.status);
    check("quedó en compra parcial", afterPartial.status === "partially_confirmed", afterPartial.status);

    const pending = afterPartial.items.filter(
      (i) => i.confirmedQuantity < i.quantity - 1e-9
    );
    check("quedan 2 líneas por comprar", pending.length === 2, String(pending.length));

    // ── Segunda tienda: el resto, pagando con tarjeta ──
    const r2 = await post(`/api/shopping-lists/${list.id}/confirm`, token, {
      paymentType: "credit_card",
      debtId: card.id,
      accountId: account.id,
      subAccountId: null,
      installmentCount: 1,
      items: pending.map((i) => ({ id: i.id, quantity: i.quantity })),
      minMode: false,
      storeName: "D1",
      purchaseDate: "2026-10-17T18:00:00.000Z",
    });

    check(`confirma el resto (status ${r2.status})`, r2.status === 200, JSON.stringify(r2.body)?.slice(0, 300));

    const afterAll = await prisma.shoppingList.findUniqueOrThrow({ where: { id: list.id } });
    check("ahora sí quedó completada", afterAll.status === "completed", afterAll.status);

    const confirmations = await prisma.pantryListConfirmation.findMany({
      where: { shoppingListId: list.id },
      orderBy: { purchaseDate: "asc" },
    });
    check("dos confirmaciones (una por tienda)", confirmations.length === 2, String(confirmations.length));
    check("con tiendas distintas", confirmations.map((c) => c.storeName).join(",") === "Éxito,D1", confirmations.map((c) => c.storeName).join(","));

    // ── La cuota de la tarjeta debe tener cuenta de cobro ──
    const installment = await prisma.installment.findFirst({ where: { debtId: card.id } });
    check("se creó la cuota de la TC", !!installment);
    if (installment) {
      check(
        "la cuota tiene cuenta de cobro (no 'sin cuenta')",
        installment.accountId === account.id,
        String(installment.accountId)
      );
    }

    const cardAfter = await prisma.debt.findUniqueOrThrow({ where: { id: card.id } });
    check("el saldo de la TC subió", Number(cardAfter.currentBalance) > 0, String(cardAfter.currentBalance));

    // El pollo entró a la nevera con la cantidad en gramos.
    const pollo = await prisma.pantryItem.findFirst({
      where: { userId, nameNormalized: "pollo" },
    });
    check("el pollo quedó en la nevera", !!pollo);
    if (pollo) {
      check("con 800 g", Number(pollo.quantity) === 800, String(pollo.quantity));
      check("y la unidad de precio kg", pollo.priceUnitId === "kg", String(pollo.priceUnitId));
    }
  } finally {
    await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    console.log("\nUsuario de prueba eliminado.");
  }

  console.log(`\n${passed} comprobaciones OK, ${failed} fallidas`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("E2E falló:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
