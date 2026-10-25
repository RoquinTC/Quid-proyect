/**
 * Verifica los tres reportes de la Fase 9.
 *
 *   node scripts/e2e-reports.mjs [puerto]
 *
 * Crea historial de precios del mismo producto en dos tiendas y compras en
 * fechas distintas, y comprueba que:
 *   - el gasto por categoría suma lo comprado,
 *   - la variación de precio detecta subida y bajada,
 *   - la comparación entre tiendas encuentra la más barata.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const PORT = Number(process.argv[2] || 3105);
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
    console.log(`  ✗ ${label}${detail !== undefined ? `\n      → ${detail}` : ""}`);
  }
}

async function main() {
  if (!SECRET) throw new Error("Falta NEXTAUTH_SECRET");

  const user = await prisma.user.create({
    data: { email: `e2e-rep-${Date.now()}@test.local`, name: "Rep", password: "x" },
  });
  const userId = user.id;

  try {
    const token = await encode({
      secret: SECRET,
      token: { id: userId, sub: userId, email: user.email, name: "Rep", onboardingCompleted: true },
      maxAge: 3600,
    });

    // Papa: cobrada por kilo, comprada en gramos. 1.000 g = 1 kg.
    const papa = await prisma.pantryItem.create({
      data: {
        userId,
        name: "Papa",
        nameNormalized: "papa",
        quantity: 3000,
        unit: "kg",
        category: "vegetables",
        priceUnitId: "kg",
      },
    });
    const pollo = await prisma.pantryItem.create({
      data: {
        userId,
        name: "Pollo",
        nameNormalized: "pollo",
        quantity: 2000,
        unit: "g",
        category: "meat",
        priceUnitId: "kg",
      },
    });

    const daysAgo = (d) => new Date(Date.now() - d * 86400000);

    // ── Historial de precios: papa sube, pollo baja, dos tiendas ──
    await prisma.priceHistory.createMany({
      data: [
        { itemId: papa.id, userId, price: 2000, quantity: 1000, unit: "g", date: daysAgo(60), sourceStore: "Éxito", storeName: "exito" },
        { itemId: papa.id, userId, price: 2600, quantity: 1000, unit: "g", date: daysAgo(20), sourceStore: "D1", storeName: "d1" },
        { itemId: pollo.id, userId, price: 16000, quantity: 500, unit: "g", date: daysAgo(50), sourceStore: "Éxito", storeName: "exito" },
        { itemId: pollo.id, userId, price: 12000, quantity: 500, unit: "g", date: daysAgo(10), sourceStore: "D1", storeName: "d1" },
      ],
    });

    // ── Movimientos de entrada (lo que alimenta el gasto por categoría) ──
    await prisma.pantryMovement.createMany({
      data: [
        { itemId: papa.id, userId, type: "in", quantity: 1000, unit: "g", unitPrice: 2000, occurredAt: daysAgo(60) },
        { itemId: papa.id, userId, type: "in", quantity: 1000, unit: "g", unitPrice: 2600, occurredAt: daysAgo(20) },
        { itemId: pollo.id, userId, type: "in", quantity: 500, unit: "g", unitPrice: 16000, occurredAt: daysAgo(50) },
        { itemId: pollo.id, userId, type: "in", quantity: 500, unit: "g", unitPrice: 12000, occurredAt: daysAgo(10) },
      ],
    });

    const res = await fetch(`${BASE}/api/pantry/reports?days=90`, {
      headers: { cookie: `next-auth.session-token=${token}` },
    });
    const data = await res.json().catch(() => null);
    check(`el endpoint responde (${res.status})`, res.status === 200, JSON.stringify(data)?.slice(0, 200));

    // Papa: 1.000 g × 2.000/kg = 2.000. Otra: 1.000 g × 2.600 = 2.600.
    // Pollo: 500 g × 16.000/kg = 8.000. Otra: 500 g × 12.000 = 6.000.
    // Total = 18.600
    check(`gasto total 18.600 (recibido ${data?.totalSpent})`, data?.totalSpent === 18600, data?.totalSpent);

    const cat = Object.fromEntries((data?.spendingByCategory ?? []).map((c) => [c.category, c.total]));
    check("verduras 4.600", cat.vegetables === 4600, cat.vegetables);
    check("carnes 14.000", cat.meat === 14000, cat.meat);

    const papaVar = (data?.priceVariation ?? []).find((p) => p.name === "Papa");
    check("la papa aparece en variación", Boolean(papaVar), JSON.stringify(data?.priceVariation?.map((p) => p.name)));
    check(`la papa subió +30 % (recibido ${papaVar?.changePct})`, papaVar?.changePct === 30, papaVar?.changePct);
    check("con precio por kilo normalizado", papaVar?.last === 2600, papaVar?.last);

    const polloVar = (data?.priceVariation ?? []).find((p) => p.name === "Pollo");
    check(`el pollo bajó −25 % (recibido ${polloVar?.changePct})`, polloVar?.changePct === -25, polloVar?.changePct);

    const cmp = (data?.storeComparison ?? []).find((c) => c.name === "Papa");
    check("la papa se compara entre tiendas", Boolean(cmp), JSON.stringify(data?.storeComparison?.map((c) => c.name)));
    check("la más barata es Éxito", cmp?.cheapestStore === "Éxito", cmp?.cheapestStore);
    // 2.000 (Éxito) contra 2.600 (D1): ahorras 600 sobre 2.600 = 23,1 %.
    check(`ahorras 23,1 % (recibido ${cmp?.spreadPct})`, cmp?.spreadPct === 23.1, cmp?.spreadPct);
    check("expone la unidad de precio", papaVar?.priceUnit === "kg", papaVar?.priceUnit);

    // Sin historial suficiente no se inventan filas.
    const empty = await prisma.user.create({
      data: { email: `e2e-rep-vacio-${Date.now()}@test.local`, name: "Vacio", password: "x" },
    });
    try {
      const t2 = await encode({
        secret: SECRET,
        token: { id: empty.id, sub: empty.id, email: empty.email, name: "Vacio", onboardingCompleted: true },
        maxAge: 3600,
      });
      const r2 = await fetch(`${BASE}/api/pantry/reports?days=90`, {
        headers: { cookie: `next-auth.session-token=${t2}` },
      });
      const d2 = await r2.json();
      check("usuario sin compras → listas vacías, no error", r2.status === 200 && d2.priceVariation.length === 0 && d2.totalSpent === 0, JSON.stringify(d2)?.slice(0, 160));
    } finally {
      await prisma.user.delete({ where: { id: empty.id } }).catch(() => {});
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
