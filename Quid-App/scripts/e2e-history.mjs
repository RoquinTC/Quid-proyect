/**
 * Verifica el Historial y la reversa:
 *   - dos confirmaciones (dos tiendas) aparecen como registros separados
 *   - reversar una devuelve el stock, reabre la lista y NO toca la otra
 *   - "solo quitarla del historial" no modifica stock
 *   - descuento de línea y descuento total se aplican
 *
 *   node scripts/e2e-history.mjs [puerto]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const PORT = Number(process.argv[2] || 3103);
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

async function call(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", cookie: `next-auth.session-token=${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  if (!SECRET) throw new Error("Falta NEXTAUTH_SECRET");

  const user = await prisma.user.create({
    data: { email: `e2e-hist-${Date.now()}@test.local`, name: "Hist", password: "x" },
  });
  const userId = user.id;

  try {
    const account = await prisma.account.create({
      data: { userId, name: "Cuenta", type: "bank", balance: 1_000_000, color: "#10B981" },
    });
    const token = await encode({
      secret: SECRET,
      token: { id: userId, sub: userId, email: user.email, name: "Hist" },
      maxAge: 3600,
    });

    // Café: 250 g a 38.000/kg con 10 % de descuento de línea → 8.550
    // Papa: 2 kg a 1.100 → 2.200
    const list = await prisma.shoppingList.create({
      data: {
        userId,
        name: "Mercado historial",
        status: "shopping",
        items: {
          create: [
            { name: "Café", unit: "g", quantity: 250, actualPrice: 38000, priceUnitId: "kg",
              discountType: "PERCENT", discountValue: 0.1, isPurchased: true, addedToCart: true },
            { name: "Papa", unit: "kg", quantity: 2, actualPrice: 1100, isPurchased: true, addedToCart: true },
            { name: "Tomate", unit: "kg", quantity: 1, actualPrice: 3200, isPurchased: true },
          ],
        },
      },
      include: { items: true },
    });

    const cafe = list.items.find((i) => i.name === "Café");
    const papa = list.items.find((i) => i.name === "Papa");

    // Tienda 1: café + papa, con 10 % de descuento TOTAL.
    const r1 = await call("POST", `/api/shopping-lists/${list.id}/confirm`, token, {
      paymentType: "account",
      accountId: account.id,
      items: [
        { id: cafe.id, quantity: 250 },
        { id: papa.id, quantity: 2 },
      ],
      minMode: false,
      storeName: "Éxito",
      purchaseDate: "2026-10-17T10:00:00.000Z",
      totalDiscountType: "PERCENT",
      totalDiscountValue: 0.1,
    });
    check(`confirma tienda 1 (${r1.status})`, r1.status === 200, JSON.stringify(r1.body)?.slice(0, 300));

    // (0,25 × 38.000 = 9.500, 10 % línea → 8.550) + 2.200 = 10.750
    check("subtotal con descuento de línea (10.750)", r1.body?.confirmation?.subtotal === 10750, String(r1.body?.confirmation?.subtotal));
    // menos 10 % total → 9.675
    check("total con descuento por tienda (9.675)", r1.body?.confirmation?.total === 9675, String(r1.body?.confirmation?.total));

    // Tienda 2: el tomate.
    const r2 = await call("POST", `/api/shopping-lists/${list.id}/confirm`, token, {
      paymentType: "account",
      accountId: account.id,
      items: [{ id: list.items.find((i) => i.name === "Tomate").id, quantity: 1 }],
      minMode: false,
      storeName: "D1",
      purchaseDate: "2026-10-17T18:00:00.000Z",
    });
    check(`confirma tienda 2 (${r2.status})`, r2.status === 200, JSON.stringify(r2.body)?.slice(0, 200));

    // ── Historial: dos registros ──
    const hist = await call("GET", "/api/pantry/history", token);
    check("el historial lista 2 compras", hist.body?.confirmations?.length === 2, String(hist.body?.confirmations?.length));
    check("una por tienda", hist.body?.confirmations?.map((c) => c.storeName).sort().join(",") === "D1,Éxito", JSON.stringify(hist.body?.confirmations?.map((c) => c.storeName)));

    const exitoso = hist.body.confirmations.find((c) => c.storeName === "Éxito");
    const d1 = hist.body.confirmations.find((c) => c.storeName === "D1");

    // ── Tiquete ──
    const ticket = await call("GET", `/api/pantry/history/${exitoso.id}`, token);
    check("el tiquete trae las 2 líneas", ticket.body?.lines?.length === 2, String(ticket.body?.lines?.length));
    check("con el descuento de tienda", ticket.body?.discountAmount === 1075, String(ticket.body?.discountAmount));

    // ── Reversar SOLO la de Éxito ──
    const stockAntes = await prisma.pantryItem.findMany({ where: { userId }, select: { nameNormalized: true, quantity: true } });
    const cafeAntes = Number(stockAntes.find((s) => s.nameNormalized === "café")?.quantity ?? stockAntes.find((s) => s.nameNormalized === "cafe")?.quantity ?? 0);
    const tomateAntes = Number(stockAntes.find((s) => s.nameNormalized === "tomate")?.quantity ?? 0);

    const rev = await call("POST", `/api/pantry/history/${exitoso.id}/reverse`, token);
    check(`reversa la de Éxito (${rev.status})`, rev.status === 200, JSON.stringify(rev.body)?.slice(0, 300));
    check("revirtió 2 movimientos", rev.body?.movementsReversed === 2, String(rev.body?.movementsReversed));

    const stockDespues = await prisma.pantryItem.findMany({ where: { userId }, select: { nameNormalized: true, quantity: true } });
    const cafeDespues = Number(stockDespues.find((s) => s.nameNormalized === (stockAntes.some((s) => s.nameNormalized === "café") ? "café" : "cafe"))?.quantity ?? 0);
    const tomateDespues = Number(stockDespues.find((s) => s.nameNormalized === "tomate")?.quantity ?? 0);

    check(`el café volvió a 0 (antes ${cafeAntes}, ahora ${cafeDespues})`, cafeDespues === 0, String(cafeDespues));
    check(`el tomate NO se tocó (${tomateAntes} → ${tomateDespues})`, tomateDespues === tomateAntes, `${tomateAntes} → ${tomateDespues}`);

    const listAfter = await prisma.shoppingList.findUniqueOrThrow({ where: { id: list.id } });
    check("la lista se reabrió", listAfter.status === "partially_confirmed", listAfter.status);

    const cafeLine = await prisma.shoppingListItem.findUniqueOrThrow({ where: { id: cafe.id } });
    check("el saldo de la línea de café volvió a 0", Number(cafeLine.confirmedQuantity) === 0, String(cafeLine.confirmedQuantity));
    check("y quedó pendiente de compra", cafeLine.isPurchased === false, String(cafeLine.isPurchased));

    const d1Line = await prisma.shoppingListItem.findUniqueOrThrow({ where: { id: list.items.find((i) => i.name === "Tomate").id } });
    check("la línea de la otra tienda sigue saldada", Number(d1Line.confirmedQuantity) === 1, String(d1Line.confirmedQuantity));

    // ── Reversar dos veces debe rechazarse ──
    const rev2 = await call("POST", `/api/pantry/history/${exitoso.id}/reverse`, token);
    check("reversar dos veces se rechaza (409)", rev2.status === 409, String(rev2.status));

    // ── "Solo quitar del historial" no toca stock ──
    const hist2 = await call("GET", "/api/pantry/history", token);
    check("sigue habiendo 2 registros", hist2.body?.confirmations?.length === 2, String(hist2.body?.confirmations?.length));
    const del = await call("DELETE", `/api/pantry/history/${d1.id}?mode=history`, token);
    check(`quita del historial (${del.status})`, del.status === 200, JSON.stringify(del.body)?.slice(0, 200));

    const hist3 = await call("GET", "/api/pantry/history", token);
    check("queda 1 registro", hist3.body?.confirmations?.length === 1, String(hist3.body?.confirmations?.length));

    // El stock del tomate sigue, porque solo se quitó el registro.
    const tomateFinal = await prisma.pantryItem.findFirst({ where: { userId, nameNormalized: "tomate" } });
    check("el stock del tomate sigue intacto", Number(tomateFinal?.quantity ?? 0) === 1, String(tomateFinal?.quantity));

    // Reversar la de Éxito elimina su movimiento financiero (el dinero volvió).
    // Quitar la de D1 del historial NO debe tocar el suyo: ese gasto sigue vivo.
    const fin = await prisma.transaction.findMany({ where: { userId, sourceModule: "pantry" } });
    check("tras la reversa solo queda el movimiento de D1", fin.length === 1, String(fin.length));
    check(
      "y sigue apuntando a la confirmación de D1 (no se borró al quitar el historial)",
      fin[0]?.sourceId === d1.id,
      `${fin[0]?.sourceId} vs ${d1.id}`
    );
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
