/**
 * Verifica los borrados y el conteo de la confirmación.
 *
 *   node scripts/e2e-delete.mjs [puerto]
 *
 *  1. Eliminar una línea de la lista de compras (en cualquier estado abierto).
 *  2. Eliminar un producto de la nevera (baja lógica: sale de la nevera pero
 *     conserva su historial).
 *  3. Confirmar una compra hecha SOLO con el carrito devuelve `itemCount`
 *     correcto (el bug de producción mostraba "0 ítems" con importe válido).
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
    data: { email: `e2e-del-${Date.now()}@test.local`, name: "Del", password: "x" },
  });
  const userId = user.id;

  try {
    const token = await encode({
      secret: SECRET,
      token: { id: userId, sub: userId, email: user.email, name: "Del", onboardingCompleted: true },
      maxAge: 3600,
    });
    const call = async (method, path, body) => {
      const res = await fetch(`${BASE}${path}`, {
        method,
        headers: { "Content-Type": "application/json", cookie: `next-auth.session-token=${token}` },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    };

    const account = await prisma.account.create({
      data: { userId, name: "Cuenta", type: "bank", balance: 500000, color: "#10B981" },
    });

    // ── 1. Lista en estado "comprando" (no borrador) ──
    console.log("\n[1] Eliminar un producto de la lista de compras");
    const list = await prisma.shoppingList.create({
      data: {
        userId,
        name: "Lista con borrado",
        status: "shopping",
        items: {
          create: [
            { name: "Tomate", unit: "kg", quantity: 1, estimatedPrice: 3000, addedToCart: true },
            { name: "Cebolla", unit: "kg", quantity: 1, estimatedPrice: 2500, addedToCart: true },
            { name: "Papa", unit: "kg", quantity: 2, estimatedPrice: 1100 },
          ],
        },
      },
      include: { items: true },
    });
    const cebolla = list.items.find((i) => i.name === "Cebolla");

    const del = await call("DELETE", `/api/shopping-lists/${list.id}/items/${cebolla.id}`);
    check(`elimina la línea (${del.status})`, del.status === 200 || del.status === 204, JSON.stringify(del.body)?.slice(0, 160));

    const afterDelete = await prisma.shoppingListItem.findMany({ where: { shoppingListId: list.id } });
    check("quedan 2 líneas", afterDelete.length === 2, String(afterDelete.length));
    check("la cebolla desapareció", !afterDelete.some((i) => i.name === "Cebolla"));

    // ── 2. Confirmación hecha solo con el carrito ──
    console.log("\n[2] Confirmar lo que está en el carrito");
    const tomate = afterDelete.find((i) => i.name === "Tomate");
    const confirm = await call("POST", `/api/shopping-lists/${list.id}/confirm`, {
      paymentType: "account",
      accountId: account.id,
      items: [{ id: tomate.id, quantity: 1 }],
      minMode: false,
      storeName: "Éxito",
      purchaseDate: new Date().toISOString(),
    });
    check(`confirma (${confirm.status})`, confirm.status === 200, JSON.stringify(confirm.body)?.slice(0, 220));
    check("itemCount = 1 (no 0)", confirm.body?.confirmation?.itemCount === 1, String(confirm.body?.confirmation?.itemCount));
    check("y el total es 3.000", confirm.body?.confirmation?.total === 3000, String(confirm.body?.confirmation?.total));

    // ── 3. Eliminar un producto de la nevera ──
    console.log("\n[3] Eliminar un producto de la nevera");
    const tomateItem = await prisma.pantryItem.findFirst({ where: { userId, nameNormalized: "tomate" } });
    check("el tomate entró a la nevera", Boolean(tomateItem));

    const delPantry = await call("DELETE", `/api/pantry/${tomateItem.id}`);
    check(`elimina (${delPantry.status})`, delPantry.status === 200, JSON.stringify(delPantry.body)?.slice(0, 160));

    const stillThere = await prisma.pantryItem.findUnique({ where: { id: tomateItem.id } });
    check("se conserva la fila (baja lógica)", Boolean(stillThere));
    check("queda inactivo", stillThere?.isActive === false, String(stillThere?.isActive));

    const pantryList = await call("GET", "/api/pantry");
    check(
      "ya no aparece en la nevera",
      !(pantryList.body?.items ?? []).some((i) => i.id === tomateItem.id),
      JSON.stringify(pantryList.body?.items?.map((i) => i.name))
    );

    const movements = await prisma.pantryMovement.count({ where: { itemId: tomateItem.id } });
    check("el historial de movimientos se conserva", movements > 0, String(movements));

    // El movimiento financiero de la compra sigue existiendo.
    const finance = await prisma.transaction.count({ where: { userId, sourceModule: "pantry" } });
    check("el gasto no se borró", finance === 1, String(finance));

    // ── 4. La lista sigue editable después del borrado ──
    console.log("\n[4] La lista sigue abierta");
    const listAfter = await prisma.shoppingList.findUnique({ where: { id: list.id } });
    check("sigue en 'comprando' o parcial", ["shopping", "partially_confirmed", "completed"].includes(listAfter.status), listAfter.status);

    // ── 5. Un producto eliminado NO debe volver a ser obligatorio ──
    // Este es el caso que motivó todo: "este producto ya no lo voy a comprar".
    console.log("\n[5] Eliminado → deja de ser obligatorio en la lista generada");
    const yuca = await prisma.pantryItem.create({
      data: {
        userId,
        name: "Yuca",
        nameNormalized: "yuca",
        quantity: 0,
        unit: "kg",
        minStock: 1,
        targetQuantity: 2,
        isActive: true,
      },
    });

    const gen1 = await call("POST", "/api/pantry/restock-list", {});
    const list1Id = gen1.body?.listId ?? gen1.body?.list?.id ?? gen1.body?.id;
    const list1 = list1Id ? await call("GET", `/api/shopping-lists/${list1Id}`) : { body: null };
    check(
      "antes de eliminarlo, la yuca entra en la lista",
      (list1.body?.items ?? []).some((i) => i.name === "Yuca"),
      JSON.stringify(list1.body?.items?.map((i) => i.name))
    );

    await call("DELETE", `/api/pantry/${yuca.id}`);

    const gen2 = await call("POST", "/api/pantry/restock-list", {});
    const list2Id = gen2.body?.listId ?? gen2.body?.list?.id ?? gen2.body?.id;
    const list2 = list2Id ? await call("GET", `/api/shopping-lists/${list2Id}`) : { body: null };
    check(
      "después de eliminarlo, YA NO entra",
      !(list2.body?.items ?? []).some((i) => i.name === "Yuca"),
      JSON.stringify(list2.body?.items?.map((i) => i.name))
    );

    // ── 6. Si lo vuelves a comprar, regresa a la nevera ──
    console.log("\n[6] Volver a comprarlo lo reactiva");
    const reyes = await prisma.shoppingList.create({
      data: {
        userId,
        name: "Recompra de yuca",
        status: "shopping",
        items: {
          create: [{ name: "Yuca", unit: "kg", quantity: 2, actualPrice: 2500, addedToCart: true }],
        },
      },
      include: { items: true },
    });
    const reyesLine = reyes.items[0];

    const reyesConfirm = await call("POST", `/api/shopping-lists/${reyes.id}/confirm`, {
      paymentType: "account",
      accountId: account.id,
      items: [{ id: reyesLine.id, quantity: 2 }],
      minMode: false,
      storeName: "D1",
      purchaseDate: new Date().toISOString(),
    });
    check(`recompra confirmada (${reyesConfirm.status})`, reyesConfirm.status === 200, JSON.stringify(reyesConfirm.body)?.slice(0, 200));

    const yucaAfter = await prisma.pantryItem.findUnique({ where: { id: yuca.id } });
    check("la fila se reactivó", yucaAfter?.isActive === true, String(yucaAfter?.isActive));
    check("y tiene el stock nuevo (2 kg)", Number(yucaAfter?.quantity) === 2, String(yucaAfter?.quantity));

    const pantryFinal = await call("GET", "/api/pantry");
    check(
      "vuelve a aparecer en la nevera",
      (pantryFinal.body?.items ?? []).some((i) => i.name === "Yuca"),
      JSON.stringify(pantryFinal.body?.items?.map((i) => i.name))
    );

    // ── 7. Darlo de alta a mano también lo reactiva (no da 409) ──
    console.log("\n[7] Alta manual de un producto eliminado");
    await call("DELETE", `/api/pantry/${yuca.id}`);
    const recreate = await call("POST", "/api/pantry", { name: "Yuca", unit: "kg", quantity: 1 });
    check(`no lo rechaza como duplicado (${recreate.status})`, recreate.status === 200 || recreate.status === 201, JSON.stringify(recreate.body)?.slice(0, 160));
    const yucaRecreated = await prisma.pantryItem.findUnique({ where: { id: yuca.id } });
    check("queda activo otra vez", yucaRecreated?.isActive === true, String(yucaRecreated?.isActive));
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
