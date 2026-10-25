/**
 * Prueba de extremo a extremo de la confirmación de compra.
 *
 * Llama al endpoint REAL por HTTP con una sesión NextAuth firmada, contra el
 * servidor de desarrollo. Es la única forma de verificar lo que el usuario
 * reporta como "confirmo y se bloquea": un test que replique la lógica en un
 * script no ejercita la transacción, el pool de conexiones ni el handler.
 *
 *   node scripts/e2e-confirm.mjs [puerto]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";
import { randomUUID } from "node:crypto";

const PORT = Number(process.argv[2] || 3100);
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

async function main() {
  if (!SECRET) throw new Error("Falta NEXTAUTH_SECRET en el entorno");

  const email = `e2e-confirm-${Date.now()}@test.local`;
  const user = await prisma.user.create({
    data: { email, name: "E2E Confirm", password: "x" },
  });
  const userId = user.id;
  console.log(`\nUsuario: ${email}`);
  console.log(`Servidor: ${BASE}\n`);

  try {
    // Cuenta con un bolsillo, para probar la ruta de pago que incluye subAccountId.
    const account = await prisma.account.create({
      data: {
        userId,
        name: "Cuenta E2E",
        type: "bank",
        balance: 500000,
        color: "#10B981",
      },
    });
    const subAccount = await prisma.subAccount.create({
      data: { accountId: account.id, name: "Bolsillo E2E", balance: 100000, type: "savings" },
    });

    const list = await prisma.shoppingList.create({
      data: {
        userId,
        name: "Mercado E2E",
        status: "shopping",
        storeName: "Éxito",
        items: {
          create: [
            { name: "Pan tajado", unit: "unit", quantity: 2, actualPrice: 4500, isPurchased: true, isStock: true },
            { name: "Huevos", unit: "unit", quantity: 12, actualPrice: 700, isPurchased: true, isStock: true },
            { name: "Arroz", unit: "kg", quantity: 2, actualPrice: 5200, isPurchased: true, isStock: true },
          ],
        },
      },
      include: { items: true },
    });

    // Sesión NextAuth firmada con el mismo secreto que usa la app.
    const token = await encode({
      secret: SECRET,
      token: { id: userId, sub: userId, email, name: "E2E Confirm" },
      maxAge: 60 * 60,
    });

    const items = list.items.map((i) => ({ id: i.id, quantity: i.quantity }));

    const startedAt = Date.now();
    const controller = new AbortController();
    // Si el servidor se bloquea, esto corta a los 30s en vez de colgarse.
    const timeout = setTimeout(() => controller.abort(), 30_000);

    let response;
    let body;
    try {
      response = await fetch(`${BASE}/api/shopping-lists/${list.id}/confirm`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          cookie: `next-auth.session-token=${token}`,
        },
        body: JSON.stringify({
          paymentType: "account",
          accountId: account.id,
          subAccountId: subAccount.id,
          debtId: null,
          installmentCount: null,
          purchaseDate: "2026-10-17T12:00:00.000Z",
          storeName: "Éxito",
          purpose: "Mercado",
          description: null,
          items,
          minMode: true,
        }),
      });
      body = await response.json().catch(() => null);
    } catch (err) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        check("el endpoint responde (no se bloquea)", false, "timeout de 30s — se quedó colgado");
      } else {
        check("el endpoint responde", false, err.message);
      }
      return;
    }
    clearTimeout(timeout);
    const elapsed = Date.now() - startedAt;

    check("el endpoint responde sin bloquearse", true);
    console.log(`      respondió en ${elapsed} ms`);
    check(`status 200 (recibido ${response.status})`, response.status === 200, JSON.stringify(body)?.slice(0, 500));

    if (response.status !== 200) return;

    // ── Efectos en la base ──
    const freshList = await prisma.shoppingList.findUniqueOrThrow({
      where: { id: list.id },
      include: { items: true },
    });
    check("la lista quedó completada", freshList.status === "completed", freshList.status);

    const confirmation = await prisma.pantryListConfirmation.findFirst({
      where: { shoppingListId: list.id },
    });
    check("se creó la confirmación", !!confirmation);
    if (confirmation) {
      check("con la tienda", confirmation.storeName === "Éxito", confirmation.storeName ?? "null");
      check("con el total correcto (2×4500 + 12×700 + 2×5200 = 27800)", Number(confirmation.total) === 27800, String(confirmation.total));
    }

    const pantry = await prisma.pantryItem.findMany({ where: { userId } });
    check("se crearon 3 productos en la nevera", pantry.length === 3, String(pantry.length));
    check(
      "todos con clave normalizada",
      pantry.every((p) => p.nameNormalized !== ""),
      pantry.map((p) => `${p.name}=${p.nameNormalized}`).join(", ")
    );

    const movements = await prisma.pantryMovement.findMany({ where: { userId } });
    check("un movimiento de entrada por producto", movements.length === 3, String(movements.length));
    check("todos de tipo in", movements.every((m) => m.type === "in"));

    const arroz = pantry.find((p) => p.nameNormalized === "arroz");
    check("el arroz quedó con 2 kg", arroz?.quantity === 2, String(arroz?.quantity));

    const prices = await prisma.priceHistory.findMany({ where: { userId } });
    check("historial de precios escrito", prices.length === 3, String(prices.length));

    const tx = await prisma.transaction.findFirst({
      where: { userId, sourceModule: "pantry" },
    });
    check("movimiento financiero registrado", !!tx);
    if (tx) check("con el monto total", Number(tx.amount) === 27800, String(tx.amount));

    // El pago salió del BOLSILLO, así que el saldo de la cuenta principal no
    // cambia y el del bolsillo baja por el total.
    const acc = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
    const sub = await prisma.subAccount.findUniqueOrThrow({ where: { id: subAccount.id } });
    check(
      "la cuenta principal no se toca cuando se paga con bolsillo",
      Number(acc.balance) === 500000,
      String(acc.balance)
    );
    check(
      "el bolsillo bajó exactamente el total (100000 − 27800 = 72200)",
      Number(sub.balance) === 72200,
      String(sub.balance)
    );

    // ── Segunda confirmación sobre la misma lista debe rechazarse ──
    const again = await fetch(`${BASE}/api/shopping-lists/${list.id}/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: `next-auth.session-token=${token}`,
      },
      body: JSON.stringify({
        paymentType: "account",
        accountId: account.id,
        items,
        minMode: false,
      }),
    });
    check("confirmar dos veces se rechaza (400)", again.status === 400, String(again.status));
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
