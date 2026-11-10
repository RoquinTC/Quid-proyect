/**
 * Ejecución de herramientas de escritura YA CONFIRMADAS.
 *
 * Este módulo solo debe invocarse desde `/api/aura/tools/confirm`, después de que
 * la propuesta pasó las validaciones de existencia, pertenencia, estado y
 * vigencia. No tiene ninguna comprobación de confirmación propia a propósito:
 * concentrar esa responsabilidad en un único punto evita que existan dos caminos
 * de ejecución con reglas distintas.
 *
 * POR QUÉ NO REUTILIZA `executeTransactionProposal` DE index.ts
 *
 * Ese ejecutor recibe `accounts: any[]` y `debts: any[]` ya resueltos por el
 * engine, porque antes todo el estado vivía en memoria durante la conversación.
 * Acá los argumentos llegan de una fila de base de datos, así que el ejecutor
 * resuelve las cuentas por sí mismo. Es una dependencia menos y hace que la
 * ejecución sea testeable sin montar una conversación.
 */

import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { applyBalanceDelta } from "@/lib/finance-ledger";
import { createCreditCardPurchaseFromAura } from "@/lib/aura/index";
import type { ExecutionContext, ExecutionResult } from "./executors";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resuelve una fecha a partir de texto en lenguaje natural.
 * Se mantiene el vocabulario que ya usaba el engine para no cambiar el
 * comportamiento percibido.
 */
export function resolveRecordDate(dateText?: unknown): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (typeof dateText !== "string") return today;

  const text = normalize(dateText);
  if (/\b(antes de ayer|antier|anteayer)\b/.test(text)) {
    const date = new Date(today);
    date.setDate(today.getDate() - 2);
    return date;
  }
  if (/\bayer\b/.test(text)) {
    const date = new Date(today);
    date.setDate(today.getDate() - 1);
    return date;
  }
  return today;
}

interface ResolvedAccount {
  id: string;
  name: string;
  kind: "account" | "subAccount";
  parentAccountId?: string;
}

/** Cuentas y bolsillos del usuario, con el nombre compuesto igual que en la UI. */
async function listAccounts(userId: string): Promise<ResolvedAccount[]> {
  const accounts = await db.account.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { subAccounts: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
  });

  return accounts.flatMap((account) => [
    { id: account.id, name: account.name, kind: "account" as const },
    ...account.subAccounts.map((sub) => ({
      id: sub.id,
      name: `${account.name} / ${sub.name}`,
      kind: "subAccount" as const,
      parentAccountId: account.id,
    })),
  ]);
}

async function listDebts(userId: string) {
  const debts = await db.debt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, bank: true },
  });
  return debts.map((debt) => ({
    id: debt.id,
    name: debt.bank ? `${debt.name} ${debt.bank}` : debt.name,
  }));
}

/**
 * Busca por nombre de forma tolerante.
 *
 * Se compara sin tildes ni mayúsculas, y además por partes: "Bold / Mercado Bold"
 * debe encontrarse tanto por el nombre completo como por "Mercado". Las partes
 * de menos de 4 caracteres se ignoran para no matchear por casualidad.
 */
function findByMention<T extends { name: string }>(mention: string, candidates: T[]): T | undefined {
  const target = normalize(mention);
  if (!target) return undefined;

  return candidates.find((candidate) => {
    const name = normalize(candidate.name);
    if (name === target || name.includes(target) || target.includes(name)) return true;
    return name.split(" / ").some((part) => part.length >= 4 && target.includes(part));
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// registrar_transaccion
// ─────────────────────────────────────────────────────────────────────────────

export async function executeRegistrarTransaccion(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const type = args.type === "income" ? "income" : "expense";
  const amount = typeof args.amount === "number" ? args.amount : null;
  const category = typeof args.category === "string" ? args.category : null;
  const subCategory = typeof args.subCategory === "string" ? args.subCategory : null;
  const accountName = typeof args.accountName === "string" ? args.accountName : null;
  const debtName = typeof args.debtName === "string" ? args.debtName : null;
  const date = resolveRecordDate(args.dateText);

  if (!amount || amount <= 0) {
    throw new Error("Falta el valor del movimiento, o no es un monto válido.");
  }

  const categoryLabel = subCategory ? `${category} / ${subCategory}` : category ?? "Otros";

  // ── Con tarjeta o deuda: se delega en el flujo de compra con crédito ──────
  if (debtName) {
    const debts = await listDebts(ctx.userId);
    const debt = findByMention(debtName, debts);
    if (!debt) {
      throw new Error(`No encontré ninguna tarjeta o deuda que coincida con "${debtName}".`);
    }

    await createCreditCardPurchaseFromAura({
      userId: ctx.userId,
      debtId: debt.id,
      amount,
      description: `${category ?? "Gasto"} registrado por Aura`,
      category: category ?? "Otros",
      subCategory,
      date,
    });

    return {
      text: `Listo, guardé la compra en ${debt.name}: ${COP.format(amount)}, categoría ${categoryLabel}.`,
      data: { debtId: debt.id, amount, category, subCategory },
    };
  }

  // ── Con cuenta o bolsillo ────────────────────────────────────────────────
  const accounts = await listAccounts(ctx.userId);
  const account = accountName ? findByMention(accountName, accounts) : undefined;

  if (!account) {
    throw new Error(
      accountName
        ? `No encontré ninguna cuenta o bolsillo que coincida con "${accountName}".`
        : "Falta indicar desde qué cuenta se registra el movimiento."
    );
  }

  const balanceChange = type === "income" ? amount : -amount;
  const description = `${category ?? (type === "income" ? "Ingreso" : "Gasto")} registrado por Aura`;

  const transaction = await db.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId: ctx.userId,
        type,
        amount,
        description,
        category: category ?? "Otros",
        subCategory,
        date,
        accountId: account.kind === "subAccount" ? account.parentAccountId! : account.id,
        subAccountId: account.kind === "subAccount" ? account.id : null,
        sourceModule: "aura",
        notes: "Registrado desde Aura",
      },
    });

    // Se actualiza el saldo del contenedor real: un bolsillo tiene su propio
    // saldo, y si se acreditara a la cuenta padre el total del usuario quedaría mal.
    if (account.kind === "subAccount") {
      await tx.subAccount.update({
        where: { id: account.id },
        data: { balance: { increment: balanceChange } },
      });
    } else {
      await tx.account.update({
        where: { id: account.id },
        data: { balance: { increment: balanceChange } },
      });
    }

    const budget = await tx.budget.findFirst({
      where: { userId: ctx.userId, type, category: category ?? "Otros", subCategory: subCategory ?? null },
    });
    if (budget) {
      await tx.budget.update({
        where: { id: budget.id },
        data: { spent: { increment: amount } },
      });
    }

    return created;
  });

  const verb = type === "income" ? "ingreso" : "gasto";
  return {
    text: `Listo, guardé el ${verb} en ${account.name}: ${COP.format(amount)}, categoría ${categoryLabel}.`,
    data: { transactionId: transaction.id, amount, type, category, subCategory },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// registrar_tanqueo
// ─────────────────────────────────────────────────────────────────────────────

export async function executeRegistrarTanqueo(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const vehicleName = typeof args.vehicleName === "string" ? args.vehicleName : null;
  const amount = typeof args.amount === "number" ? args.amount : null;
  const gallons = typeof args.gallons === "number" ? args.gallons : null;
  const pricePerGallon = typeof args.pricePerGallon === "number" ? args.pricePerGallon : null;
  const km = typeof args.km === "number" ? args.km : null;
  const date = resolveRecordDate(args.dateText);

  const vehicles = await db.vehicle.findMany({
    where: { userId: ctx.userId },
    select: { id: true, name: true, plate: true },
  });

  if (vehicles.length === 0) {
    throw new Error("No tienes ningún vehículo registrado.");
  }

  const vehicle = vehicleName
    ? vehicles.find(
        (candidate) =>
          findByMention(vehicleName, [{ name: candidate.name }]) !== undefined ||
          (candidate.plate ? normalize(candidate.plate) === normalize(vehicleName) : false)
      )
    : vehicles[0];

  if (!vehicle) {
    throw new Error(`No encontré ningún vehículo que coincida con "${vehicleName}".`);
  }

  // Completar los datos que falten a partir de los otros: con dos de los tres
  // (valor, galones, precio por galón) se puede calcular el tercero.
  let resolvedGallons = gallons;
  let resolvedPrice = pricePerGallon;
  let resolvedAmount = amount;

  if (resolvedAmount === null && resolvedGallons !== null && resolvedPrice !== null) {
    resolvedAmount = Math.round(resolvedGallons * resolvedPrice);
  }
  if (resolvedGallons === null && resolvedAmount !== null && resolvedPrice !== null && resolvedPrice > 0) {
    resolvedGallons = Number((resolvedAmount / resolvedPrice).toFixed(3));
  }
  if (resolvedPrice === null && resolvedAmount !== null && resolvedGallons !== null && resolvedGallons > 0) {
    resolvedPrice = Math.round(resolvedAmount / resolvedGallons);
  }

  if (resolvedAmount === null) {
    throw new Error("Falta el valor del tanqueo para poder registrarlo.");
  }

  const log = await db.fuelLog.create({
    data: {
      vehicleId: vehicle.id,
      date,
      km: km ?? 0,
      amount: resolvedAmount,
      pricePerGallon: resolvedPrice ?? 0,
      gallons: resolvedGallons ?? 0,
      isFullTank: args.isFullTank === true,
      notes: "Registrado desde Aura",
    },
  });

  // El odómetro del vehículo se actualiza solo si el nuevo es mayor: si el
  // usuario informa un km menor (error de tipeo, o un registro viejo que carga
  // tarde), no se debe retroceder el contador.
  if (km !== null && km > 0) {
    const current = await db.vehicle.findUnique({
      where: { id: vehicle.id },
      select: { currentKm: true },
    });
    if (!current || km > current.currentKm) {
      await db.vehicle.update({ where: { id: vehicle.id }, data: { currentKm: km } });
    }
  }

  const details = [
    COP.format(resolvedAmount),
    resolvedGallons !== null ? `${resolvedGallons} gal` : null,
    km !== null ? `${km} km` : null,
  ].filter(Boolean);

  return {
    text: `Listo, guardé el tanqueo de ${vehicle.name}: ${details.join(", ")}.`,
    data: {
      fuelLogId: log.id,
      vehicleId: vehicle.id,
      amount: resolvedAmount,
      gallons: resolvedGallons,
      km,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// registrar_transferencia
// ─────────────────────────────────────────────────────────────────────────────

export async function executeRegistrarTransferencia(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const fromName = typeof args.fromAccountName === "string" ? args.fromAccountName : "";
  const toName = typeof args.toAccountName === "string" ? args.toAccountName : "";
  const amount = typeof args.amount === "number" ? args.amount : null;
  const notes = typeof args.notes === "string" ? args.notes : null;
  const date = resolveRecordDate(args.dateText);

  if (!amount || amount <= 0) {
    throw new Error("Falta el valor de la transferencia, o no es un monto válido.");
  }

  const accounts = await listAccounts(ctx.userId);
  const source = findByMention(fromName, accounts);
  const destination = findByMention(toName, accounts);

  if (!source) throw new Error(`No encontré ninguna cuenta de origen que coincida con "${fromName}".`);
  if (!destination) throw new Error(`No encontré ninguna cuenta de destino que coincida con "${toName}".`);
  if (source.id === destination.id) {
    throw new Error("El origen y el destino de la transferencia no pueden ser el mismo lugar.");
  }

  const description = notes?.trim() || `Transferencia a ${destination.name}`;

  const result = await db.$transaction(async (tx) => {
    const created = await tx.transaction.create({
      data: {
        userId: ctx.userId,
        type: "transfer",
        amount,
        description,
        accountId: source.kind === "subAccount" ? source.parentAccountId! : source.id,
        subAccountId: source.kind === "subAccount" ? source.id : null,
        date,
        sourceModule: "aura",
        notes: "Transferencia registrada desde Aura",
        excludeFromBudget: true,
      },
    });

    await applyBalanceDelta(tx, {
      accountId: source.kind === "subAccount" ? source.parentAccountId! : source.id,
      subAccountId: source.kind === "subAccount" ? source.id : null,
      amount: -amount,
    });

    const counterpart = await tx.transaction.create({
      data: {
        userId: ctx.userId,
        type: "income",
        amount,
        description: `Transferencia recibida: ${description}`,
        accountId: destination.kind === "subAccount" ? destination.parentAccountId! : destination.id,
        subAccountId: destination.kind === "subAccount" ? destination.id : null,
        category: "Otros",
        date,
        notes: `Transferencia desde ${source.name}`,
        excludeFromBudget: true,
        relatedTransactionId: created.id,
      },
    });

    await tx.transaction.update({
      where: { id: created.id },
      data: { relatedTransactionId: counterpart.id },
    });

    await applyBalanceDelta(tx, {
      accountId: destination.kind === "subAccount" ? destination.parentAccountId! : destination.id,
      subAccountId: destination.kind === "subAccount" ? destination.id : null,
      amount,
    });

    return created;
  });

  return {
    text: `Listo, moví ${COP.format(amount)} de ${source.name} a ${destination.name}.`,
    data: {
      transactionId: result.id,
      from: source.id,
      to: destination.id,
      amount,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// crear_presupuesto
// ─────────────────────────────────────────────────────────────────────────────

export async function executeCrearPresupuesto(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const category = typeof args.category === "string" ? args.category.trim() : "";
  const amount = typeof args.amount === "number" ? args.amount : null;
  const type = args.type === "income" ? "income" : "expense";
  const period = typeof args.period === "string" ? args.period : "monthly";

  if (!category) throw new Error("Falta la categoría del presupuesto.");
  if (!amount || amount <= 0) throw new Error("Falta el monto del presupuesto, o no es válido.");

  // No hay restricción única en la tabla: se busca a mano para no duplicar.
  const existing = await db.budget.findFirst({
    where: { userId: ctx.userId, type, category, subCategory: null },
  });

  if (existing) {
    const updated = await db.budget.update({
      where: { id: existing.id },
      data: { amount, period },
    });

    return {
      text: `Actualicé el presupuesto de ${category}: ${COP.format(amount)} (${period === "monthly" ? "mensual" : period === "weekly" ? "semanal" : "anual"}). Lo ejecutado no cambia.`,
      data: { budgetId: updated.id, updated: true, amount },
    };
  }

  const created = await db.budget.create({
    data: {
      userId: ctx.userId,
      type,
      category,
      amount,
      period,
      spent: 0,
    },
  });

  return {
    text: `Creé el presupuesto de ${category}: ${COP.format(amount)} (${period === "monthly" ? "mensual" : period === "weekly" ? "semanal" : "anual"}).`,
    data: { budgetId: created.id, updated: false, amount },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// crear_cuenta
// ─────────────────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES = new Set([
  "checking",
  "savings",
  "cash",
  "digital_wallet",
  "credit_card",
  "other",
]);

export async function executeCrearCuenta(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const name = typeof args.name === "string" ? args.name.trim() : "";
  const rawType = typeof args.type === "string" ? args.type : "checking";
  const type = ACCOUNT_TYPES.has(rawType) ? rawType : "checking";
  const balance = typeof args.balance === "number" ? args.balance : 0;

  if (!name) throw new Error("Falta el nombre de la cuenta.");

  // Comparación en JS: `mode: "insensitive"` no existe en el motor SQLite.
  const accounts = await db.account.findMany({
    where: { userId: ctx.userId },
    select: { name: true },
  });
  if (accounts.some((account) => account.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`Ya tienes una cuenta llamada "${name}".`);
  }

  const account = await db.account.create({
    data: {
      userId: ctx.userId,
      name,
      type,
      balance,
      color: "#10B981",
    },
  });

  return {
    text: `Creé la cuenta ${name}${balance > 0 ? ` con saldo inicial de ${COP.format(balance)}` : ""}.`,
    data: { accountId: account.id, name, type, balance },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// crear_deuda
// ─────────────────────────────────────────────────────────────────────────────

export async function executeCrearDeuda(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const name = typeof args.name === "string" ? args.name.trim() : "";
  const type = args.type === "loan" ? "loan" : args.type === "other" ? "other" : "credit_card";
  const totalAmount = typeof args.totalAmount === "number" ? args.totalAmount : null;
  const currentBalance =
    typeof args.currentBalance === "number" ? args.currentBalance : totalAmount;
  const bank = typeof args.bank === "string" ? args.bank.trim() : null;
  const monthlyPayment =
    typeof args.monthlyPayment === "number" ? args.monthlyPayment : null;
  const cutoffDate = typeof args.cutoffDate === "number" ? Math.round(args.cutoffDate) : null;
  const paymentDate = typeof args.paymentDate === "number" ? Math.round(args.paymentDate) : null;

  if (!name) throw new Error("Falta el nombre de la deuda.");
  if (!totalAmount || totalAmount <= 0) throw new Error("Falta el monto total de la deuda.");

  const debt = await db.debt.create({
    data: {
      userId: ctx.userId,
      name,
      type,
      bank,
      totalAmount,
      currentBalance: currentBalance ?? totalAmount,
      monthlyPayment,
      cutoffDate,
      paymentDate,
      color: "#EF4444",
    },
  });

  const kind = type === "credit_card" ? "tarjeta" : type === "loan" ? "préstamo" : "deuda";
  return {
    text: `Registré la ${kind} ${name}${bank ? ` (${bank})` : ""} por ${COP.format(totalAmount)}.`,
    data: { debtId: debt.id, name, type, totalAmount },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// crear_meta
// ─────────────────────────────────────────────────────────────────────────────

export async function executeCrearMeta(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const name = typeof args.name === "string" ? args.name.trim() : "";
  const targetAmount = typeof args.targetAmount === "number" ? args.targetAmount : null;
  const deadlineRaw = typeof args.deadline === "string" ? args.deadline.trim() : "";

  if (!name) throw new Error("Falta el nombre de la meta.");
  if (!targetAmount || targetAmount <= 0) throw new Error("Falta el monto objetivo de la meta.");

  let deadline: Date | null = null;
  if (deadlineRaw) {
    const parsed = new Date(`${deadlineRaw}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`No entendí la fecha "${deadlineRaw}". Usa el formato AAAA-MM-DD.`);
    }
    deadline = parsed;
  }

  const goal = await db.savingsGoal.create({
    data: {
      userId: ctx.userId,
      name,
      targetAmount,
      currentAmount: 0,
      deadline,
      status: "activa",
      type: "general",
    },
  });

  return {
    text: `Creé la meta ${name} por ${COP.format(targetAmount)}${deadline ? `, para el ${deadline.toISOString().slice(0, 10)}` : ""}.`,
    data: { goalId: goal.id, name, targetAmount },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// crear_cdt
// ─────────────────────────────────────────────────────────────────────────────

export async function executeCrearCdt(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const bank = typeof args.bank === "string" ? args.bank.trim() : "";
  const amount = typeof args.amount === "number" ? args.amount : null;
  const effectiveRate = typeof args.effectiveRate === "number" ? args.effectiveRate : null;
  const termDays = typeof args.termDays === "number" ? Math.round(args.termDays) : null;

  if (!bank) throw new Error("Falta el banco del CDT.");
  if (!amount || amount <= 0) throw new Error("Falta el monto del CDT.");
  if (effectiveRate === null || effectiveRate <= 0) throw new Error("Falta la tasa efectiva anual (% EA) del CDT.");
  if (!termDays || termDays <= 0) throw new Error("Falta el plazo en días del CDT.");

  const startDate = new Date();
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + termDays);

  const cdt = await db.cDT.create({
    data: {
      userId: ctx.userId,
      bank,
      amount,
      effectiveRate,
      startDate,
      endDate,
      termDays,
      status: "active",
    },
  });

  const endKey = endDate.toISOString().slice(0, 10);
  return {
    text: `Registré el CDT de ${bank} por ${COP.format(amount)} al ${effectiveRate} % EA, vence el ${endKey}.`,
    data: { cdtId: cdt.id, bank, amount, effectiveRate, termDays },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Despacho
// ─────────────────────────────────────────────────────────────────────────────

const WRITE_EXECUTORS: Record<
  string,
  (args: Record<string, unknown>, ctx: ExecutionContext) => Promise<ExecutionResult>
> = {
  registrar_transaccion: executeRegistrarTransaccion,
  registrar_tanqueo: executeRegistrarTanqueo,
  registrar_transferencia: executeRegistrarTransferencia,
  crear_presupuesto: executeCrearPresupuesto,
  crear_cuenta: executeCrearCuenta,
  crear_deuda: executeCrearDeuda,
  crear_meta: executeCrearMeta,
  crear_cdt: executeCrearCdt,
};

/**
 * Ejecuta una herramienta de escritura previamente confirmada.
 *
 * Lanza si el nombre no corresponde a una herramienta de escritura implementada:
 * es preferible un error explícito a un `undefined is not a function`.
 */
export async function executeConfirmedTool(
  tool: string,
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const executor = WRITE_EXECUTORS[tool];
  if (!executor) {
    throw new Error(`La herramienta de escritura "${tool}" no tiene ejecutor registrado.`);
  }
  return executor(args, ctx);
}

export function hasWriteExecutor(tool: string): boolean {
  return Boolean(WRITE_EXECUTORS[tool]);
}

export { listAccounts, listDebts, findByMention };
