import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { executeConfirmedTool } from "@/lib/aura/tools/execute-confirmed";
import { getReadExecutor } from "@/lib/aura/tools/executors";

/**
 * Ejecución real de herramientas contra la base local.
 *
 * Estos tests comprueban lo que de verdad importa: que una escritura confirmada
 * deje los datos correctos, y que una lectura devuelva datos reales del usuario
 * en lugar de un resumen precalculado.
 *
 * El usuario y sus datos se crean y se borran acá, así que la base queda igual.
 */

const TEST_EMAIL = "aura-exec-test@quid.local";
let userId: string;
let accountId: string;
let subAccountId: string;

async function cleanup() {
  const user = await db.user.findUnique({ where: { email: TEST_EMAIL }, select: { id: true } });
  if (!user) return;
  await db.pendingAuraAction.deleteMany({ where: { userId: user.id } });
  await db.transaction.deleteMany({ where: { userId: user.id } });
  await db.budget.deleteMany({ where: { userId: user.id } });
  await db.fuelLog.deleteMany({ where: { vehicle: { userId: user.id } } });
  await db.vehicle.deleteMany({ where: { userId: user.id } });
  await db.subAccount.deleteMany({ where: { account: { userId: user.id } } });
  await db.account.deleteMany({ where: { userId: user.id } });
  await db.user.delete({ where: { id: user.id } });
}

beforeAll(async () => {
  await cleanup();

  const user = await db.user.create({
    data: { email: TEST_EMAIL, name: "Exec Test", password: "no-usar-en-produccion" },
  });
  userId = user.id;

  const account = await db.account.create({
    data: { userId, name: "Cuenta Principal", type: "bank", balance: 100000 },
  });
  accountId = account.id;

  const sub = await db.subAccount.create({
    data: { accountId, name: "Bolsillo Mercado", type: "pocket", balance: 50000 },
  });
  subAccountId = sub.id;
});

afterAll(async () => {
  await cleanup();
  await db.$disconnect();
});

describe("executeConfirmedTool — registrar_transaccion con cuenta", () => {
  it("crea el gasto, descuenta el saldo y actualiza el presupuesto", async () => {
    await db.budget.create({
      data: { userId, type: "expense", category: "Ropa", amount: 100000, spent: 0 },
    });

    const result = await executeConfirmedTool(
      "registrar_transaccion",
      { type: "expense", amount: 15000, category: "Ropa", accountName: "Cuenta Principal" },
      { userId }
    );

    expect(result.text).toContain("15.000");
    expect(result.text).toContain("Cuenta Principal");

    const tx = await db.transaction.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
    expect(tx).toBeTruthy();
    expect(Number(tx!.amount)).toBe(15000);
    expect(tx!.type).toBe("expense");
    expect(tx!.category).toBe("Ropa");
    expect(tx!.accountId).toBe(accountId);
    expect(tx!.sourceModule).toBe("aura");

    const account = await db.account.findUnique({ where: { id: accountId } });
    expect(Number(account!.balance)).toBe(85000);

    const budget = await db.budget.findFirst({ where: { userId, category: "Ropa" } });
    expect(Number(budget!.spent)).toBe(15000);
  });

  it("acredita un ingreso", async () => {
    const result = await executeConfirmedTool(
      "registrar_transaccion",
      { type: "income", amount: 5000, category: "Salario", accountName: "Cuenta Principal" },
      { userId }
    );
    expect(result.text).toContain("ingreso");

    const account = await db.account.findUnique({ where: { id: accountId } });
    expect(Number(account!.balance)).toBe(90000);
  });

  it("descuenta del bolsillo correcto y no de la cuenta padre", async () => {
    // Es un caso que se rompe fácil: si el saldo se acreditara a la cuenta padre,
    // el total del usuario seguiría siendo correcto pero el bolsillo quedaría mal,
    // y el desglose por bolsillos que ve el usuario sería mentira.
    await executeConfirmedTool(
      "registrar_transaccion",
      { type: "expense", amount: 10000, category: "Alimentación", accountName: "Bolsillo Mercado" },
      { userId }
    );

    const sub = await db.subAccount.findUnique({ where: { id: subAccountId } });
    expect(Number(sub!.balance)).toBe(40000);

    const parent = await db.account.findUnique({ where: { id: accountId } });
    expect(Number(parent!.balance)).toBe(90000);
  });

  it("resuelve la cuenta por una parte del nombre", async () => {
    const result = await executeConfirmedTool(
      "registrar_transaccion",
      { type: "expense", amount: 1000, category: "Otros", accountName: "Mercado" },
      { userId }
    );
    expect(result.text).toContain("Bolsillo Mercado");
  });

  it("falla con un monto inválido sin escribir nada", async () => {
    const before = await db.transaction.count({ where: { userId } });
    await expect(
      executeConfirmedTool(
        "registrar_transaccion",
        { type: "expense", amount: 0, accountName: "Cuenta Principal" },
        { userId }
      )
    ).rejects.toThrow(/valor/i);
    expect(await db.transaction.count({ where: { userId } })).toBe(before);
  });

  it("falla con una cuenta inexistente y no escribe nada", async () => {
    const before = await db.transaction.count({ where: { userId } });
    await expect(
      executeConfirmedTool(
        "registrar_transaccion",
        { type: "expense", amount: 1000, accountName: "Cuenta Que No Existe" },
        { userId }
      )
    ).rejects.toThrow(/No encontré/);
    expect(await db.transaction.count({ where: { userId } })).toBe(before);
  });

  it("falla si no se indica cuenta ni tarjeta", async () => {
    await expect(
      executeConfirmedTool("registrar_transaccion", { type: "expense", amount: 1000 }, { userId })
    ).rejects.toThrow(/cuenta/i);
  });
});

describe("executeConfirmedTool — registrar_tanqueo", () => {
  it("crea el tanqueo y calcula los galones desde el precio", async () => {
    const vehicle = await db.vehicle.create({
      data: { userId, name: "Moto", type: "motorcycle", currentKm: 1000 },
    });

    const result = await executeConfirmedTool(
      "registrar_tanqueo",
      { vehicleName: "Moto", amount: 50000, pricePerGallon: 16000, km: 1200, isFullTank: true },
      { userId }
    );

    expect(result.text).toContain("Moto");

    const log = await db.fuelLog.findFirst({ where: { vehicleId: vehicle.id } });
    expect(log).toBeTruthy();
    expect(Number(log!.amount)).toBe(50000);
    expect(Number(log!.pricePerGallon)).toBe(16000);
    expect(Number(log!.gallons)).toBeCloseTo(3.125, 2);
    expect(log!.km).toBe(1200);
    expect(log!.isFullTank).toBe(true);
  });

  it("actualiza el odómetro del vehículo", async () => {
    const vehicle = await db.vehicle.findFirst({ where: { userId } });
    const updated = await db.vehicle.findUnique({ where: { id: vehicle!.id } });
    expect(updated!.currentKm).toBe(1200);
  });

  it("NO retrocede el odómetro si el km informado es menor", async () => {
    // Un error de tipeo, o cargar tarde un registro viejo, no debe corromper el
    // contador del vehículo.
    const vehicle = await db.vehicle.findFirst({ where: { userId } });

    await executeConfirmedTool(
      "registrar_tanqueo",
      { vehicleName: "Moto", amount: 20000, pricePerGallon: 16000, km: 500 },
      { userId }
    );

    const after = await db.vehicle.findUnique({ where: { id: vehicle!.id } });
    expect(after!.currentKm).toBe(1200);
  });

  it("falla si el usuario no tiene vehículos", async () => {
    await db.fuelLog.deleteMany({ where: { vehicle: { userId } } });
    await db.vehicle.deleteMany({ where: { userId } });

    await expect(
      executeConfirmedTool("registrar_tanqueo", { amount: 10000 }, { userId })
    ).rejects.toThrow(/vehículo/i);
  });

  it("rechaza una herramienta sin ejecutor", async () => {
    await expect(
      executeConfirmedTool("consultar_saldo", {}, { userId })
    ).rejects.toThrow(/no tiene ejecutor/i);
  });
});

describe("ejecutores de lectura", () => {
  it("consultar_saldo devuelve solo las cuentas del usuario", async () => {
    const executor = getReadExecutor("consultar_saldo")!;
    const result = await executor({}, { userId });
    expect(result.text).toContain("Cuenta Principal");
    expect(result.text).toContain("Bolsillo Mercado");
  });

  it("consultar_gastos agrupa por categoría", async () => {
    const executor = getReadExecutor("consultar_gastos")!;
    const result = await executor({ period: "mes" }, { userId });
    expect(result.text).toContain("Gastos de este mes");
    // Los gastos creados en este archivo son de este mes.
    expect(result.data?.count).toBeGreaterThan(0);
  });

  it("consultar_gastos no filtra datos de otros usuarios", async () => {
    const executor = getReadExecutor("consultar_gastos")!;
    const result = await executor({ period: "mes" }, { userId: "usuario-inexistente" });
    expect(result.text).toContain("No tienes gastos");
  });

  it("consultar_medicamentos responde cuando no hay ninguno", async () => {
    const executor = getReadExecutor("consultar_medicamentos")!;
    const result = await executor({}, { userId });
    expect(result.text).toContain("No tienes medicamentos");
  });
});
