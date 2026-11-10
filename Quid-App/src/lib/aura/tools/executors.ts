/**
 * Ejecutores de herramientas de Aura.
 *
 * POR QUÉ ESTÁN SEPARADOS DE LAS RUTAS
 *
 * Si la ejecución viviera dentro de `/api/aura/tools`, la única forma de
 * comprobarla sería levantar el servidor y llamar por HTTP. Al aislarla en
 * funciones puras sobre `userId`, se puede testear con la base local, que es
 * justo lo que hace `aura-tools.test.ts`.
 *
 * CONTRATO
 *
 * Cada ejecutor recibe argumentos YA VALIDADOS por `validateToolParameters` y el
 * `userId` resuelto en el servidor. Nunca confían en un id de usuario que venga
 * del cliente.
 */

import { db } from "@/lib/db";

export interface ExecutionContext {
  userId: string;
}

export interface ExecutionResult {
  /** Texto listo para mostrarle al usuario. */
  text: string;
  /** Datos estructurados, por si quien llama necesita algo más que el texto. */
  data?: Record<string, unknown>;
}

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/** Rango de fechas de un período nombrado, en hora de Colombia. */
function resolvePeriod(period: unknown): { from: Date; to: Date; label: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  switch (String(period ?? "mes")) {
    case "hoy":
      return { from, to, label: "hoy" };
    case "semana":
      from.setDate(from.getDate() - 6);
      return { from, to, label: "esta semana" };
    case "año":
      from.setMonth(0, 1);
      from.setHours(0, 0, 0, 0);
      return { from, to, label: "este año" };
    case "mes":
    default:
      from.setDate(1);
      from.setHours(0, 0, 0, 0);
      return { from, to, label: "este mes" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Herramientas de LECTURA
// ─────────────────────────────────────────────────────────────────────────────

export async function consultarGastos(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const { from, to, label } = resolvePeriod(args.period);
  const category = typeof args.category === "string" ? args.category : null;

  const transactions = await db.transaction.findMany({
    where: {
      userId: ctx.userId,
      type: "expense",
      date: { gte: from, lte: to },
      ...(category ? { category } : {}),
    },
    select: { amount: true, category: true, subCategory: true },
  });

  if (transactions.length === 0) {
    return {
      text: `No tienes gastos registrados ${label}${category ? ` en ${category}` : ""}.`,
      data: { total: 0, count: 0 },
    };
  }

  const total = transactions.reduce((sum, t) => sum + Number(t.amount), 0);

  // Agrupado por categoría, de mayor a menor: es el orden que hace útil el dato.
  const byCategory = new Map<string, number>();
  for (const t of transactions) {
    const key = t.subCategory ? `${t.category ?? "Otros"} / ${t.subCategory}` : t.category ?? "Otros";
    byCategory.set(key, (byCategory.get(key) ?? 0) + Number(t.amount));
  }

  const ordered = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const lines = ordered.slice(0, 8).map(([name, value]) => `• ${name}: ${COP.format(value)}`);
  const rest = ordered.length > 8 ? `\n…y ${ordered.length - 8} categoría(s) más.` : "";

  return {
    text: [
      `Gastos de ${label}: ${COP.format(total)} en ${transactions.length} movimiento(s).`,
      ...lines,
    ].join("\n") + rest,
    data: { total, count: transactions.length, byCategory: Object.fromEntries(ordered) },
  };
}

export async function consultarSaldo(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const accountName = typeof args.accountName === "string" ? args.accountName : null;

  const accounts = await db.account.findMany({
    where: { userId: ctx.userId },
    include: { subAccounts: true },
  });

  if (accounts.length === 0) {
    return { text: "Todavía no tienes cuentas registradas.", data: { accounts: [] } };
  }

  const normalize = (value: string) =>
    value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const filtered = accountName
    ? accounts.filter((account) => normalize(account.name).includes(normalize(accountName)))
    : accounts;

  if (filtered.length === 0) {
    return { text: `No encontré ninguna cuenta que coincida con "${accountName}".` };
  }

  const lines: string[] = [];
  let total = 0;

  for (const account of filtered) {
    const balance = Number(account.balance);
    total += balance;
    lines.push(`• ${account.name}: ${COP.format(balance)}`);
    for (const sub of account.subAccounts) {
      const subBalance = Number(sub.balance);
      total += subBalance;
      lines.push(`   - ${account.name} / ${sub.name}: ${COP.format(subBalance)}`);
    }
  }

  return {
    text: [`Saldo total: ${COP.format(total)}`, ...lines].join("\n"),
    data: { total },
  };
}

export async function consultarMedicamentos(
  _args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const medications = await db.medication.findMany({
    where: { userId: ctx.userId, isActive: true },
    orderBy: { name: "asc" },
  });

  if (medications.length === 0) {
    return { text: "No tienes medicamentos activos registrados.", data: { count: 0 } };
  }

  const lines = medications.map((med) => {
    let times: string[] = [];
    try {
      times = med.reminderTimes ? JSON.parse(med.reminderTimes) : [];
    } catch {
      times = [];
    }
    const schedule = times.length > 0 ? ` — ${times.join(", ")}` : "";
    const disease = med.disease ? ` (${med.disease})` : "";
    return `• ${med.name}: ${med.dosage}${schedule}${disease}`;
  });

  return {
    text: [`Tienes ${medications.length} medicamento(s) activo(s):`, ...lines].join("\n"),
    data: { count: medications.length },
  };
}

export async function consultarCitas(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const onlyUpcoming = args.onlyUpcoming !== false;

  const appointments = await db.medicalAppointment.findMany({
    where: {
      userId: ctx.userId,
      ...(onlyUpcoming ? { date: { gte: new Date() }, status: "scheduled" } : {}),
    },
    orderBy: { date: "asc" },
    take: 15,
  });

  if (appointments.length === 0) {
    return {
      text: onlyUpcoming ? "No tienes citas médicas programadas." : "No tienes citas registradas.",
      data: { count: 0 },
    };
  }

  const format = new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = appointments.map((apt) => {
    const who = apt.doctorName ? ` con ${apt.doctorName}` : "";
    const specialty = apt.specialty ? ` (${apt.specialty})` : "";
    return `• ${format.format(apt.date)}${who}${specialty}`;
  });

  return {
    text: [`Tienes ${appointments.length} cita(s):`, ...lines].join("\n"),
    data: { count: appointments.length },
  };
}

export async function consultarMovimientos(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const period = String(args.period ?? "mes");
  const type = String(args.type ?? "todos");
  const category = typeof args.category === "string" ? args.category : null;
  const search = typeof args.search === "string" ? args.search.trim() : "";
  const limitRaw = typeof args.limit === "number" ? args.limit : 15;
  const limit = Math.min(Math.max(Math.round(limitRaw), 1), 50);

  const { from, to, label } = resolvePeriod(period);

  const transactions = await db.transaction.findMany({
    where: {
      userId: ctx.userId,
      ...(period === "todo" ? {} : { date: { gte: from, lte: to } }),
      ...(type === "todos" ? { type: { in: ["income", "expense", "transfer"] } } : { type }),
      ...(category ? { category } : {}),
      ...(search ? { description: { contains: search } } : {}),
      relatedTransactionId: null,
    },
    select: {
      date: true,
      type: true,
      amount: true,
      description: true,
      category: true,
      account: { select: { name: true } },
      subAccount: { select: { name: true } },
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  if (transactions.length === 0) {
    return { text: `No hay movimientos que coincidan (${label}).`, data: { count: 0 } };
  }

  const format = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
  const lines = transactions.map((tx) => {
    const where = tx.subAccount?.name
      ? `${tx.account?.name ?? "?"} / ${tx.subAccount.name}`
      : (tx.account?.name ?? "sin cuenta");
    const sign = tx.type === "income" ? "+" : tx.type === "transfer" ? "→" : "−";
    return `• ${format.format(tx.date)} · ${sign}${COP.format(Number(tx.amount))} · ${tx.description ?? "sin descripción"} (${where}${tx.category ? ` · ${tx.category}` : ""})`;
  });

  return {
    text: [`Movimientos (${label}, ${transactions.length}):`, ...lines].join("\n"),
    data: { count: transactions.length },
  };
}

export async function consultarPresupuestos(
  _args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const budgets = await db.budget.findMany({
    where: { userId: ctx.userId },
    orderBy: { category: "asc" },
  });

  if (budgets.length === 0) {
    return { text: "Todavía no tienes presupuestos creados.", data: { count: 0 } };
  }

  const lines = budgets.map((budget) => {
    const limit = Number(budget.amount);
    const spent = Number(budget.spent);
    const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0;
    const left = limit - spent;
    const label = budget.subCategory ? `${budget.category} / ${budget.subCategory}` : budget.category;
    const state = left < 0 ? `pasado por ${COP.format(-left)}` : `quedan ${COP.format(left)}`;
    return `• ${label} (${budget.type === "income" ? "ingreso" : "gasto"}): ${COP.format(spent)} de ${COP.format(limit)} — ${percent} %, ${state}`;
  });

  return {
    text: [`Presupuestos (${budgets.length}):`, ...lines].join("\n"),
    data: { count: budgets.length },
  };
}

export async function consultarDeudas(
  _args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const debts = await db.debt.findMany({
    where: { userId: ctx.userId },
    orderBy: { createdAt: "desc" },
  });

  if (debts.length === 0) {
    return { text: "No tienes deudas registradas.", data: { count: 0, total: 0 } };
  }

  let total = 0;
  const lines = debts.map((debt) => {
    const balance = Number(debt.currentBalance);
    total += balance;
    const monthly = debt.monthlyPayment ? ` · cuota ${COP.format(Number(debt.monthlyPayment))}` : "";
    const days = debt.cutoffDate ? ` · corte día ${debt.cutoffDate}` : "";
    const pay = debt.paymentDate ? ` · pago día ${debt.paymentDate}` : "";
    const bank = debt.bank ? ` ${debt.bank}` : "";
    return `• ${debt.name}${bank} (${debt.type}): ${COP.format(balance)}${monthly}${days}${pay}`;
  });

  return {
    text: [`Deudas: ${COP.format(total)} en total.`, ...lines].join("\n"),
    data: { count: debts.length, total },
  };
}

export async function consultarMetas(
  _args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const goals = await db.savingsGoal.findMany({
    where: { userId: ctx.userId, status: "activa" },
    orderBy: { createdAt: "desc" },
  });

  if (goals.length === 0) {
    return { text: "No tienes metas de ahorro activas.", data: { count: 0 } };
  }

  const format = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
  const lines = goals.map((goal) => {
    const target = Number(goal.targetAmount);
    const current = Number(goal.currentAmount);
    const percent = target > 0 ? Math.round((current / target) * 100) : 0;
    const deadline = goal.deadline ? ` · para ${format.format(goal.deadline)}` : "";
    return `• ${goal.name}: ${COP.format(current)} de ${COP.format(target)} — ${percent} %${deadline}`;
  });

  return {
    text: [`Metas activas (${goals.length}):`, ...lines].join("\n"),
    data: { count: goals.length },
  };
}

export async function consultarPagosRecurrentes(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const daysRaw = typeof args.days === "number" ? args.days : 30;
  const days = Math.min(Math.max(Math.round(daysRaw), 1), 365);
  const typeFilter = typeof args.type === "string" ? args.type : "todos";

  const until = new Date();
  until.setDate(until.getDate() + days);

  const payments = await db.recurringPayment.findMany({
    where: {
      userId: ctx.userId,
      status: "pending",
      scheduledDate: { lte: until },
      ...(typeFilter === "todos" ? {} : { type: typeFilter }),
    },
    orderBy: { scheduledDate: "asc" },
    take: 40,
  });

  if (payments.length === 0) {
    return { text: `No tienes pagos pendientes en los próximos ${days} días.`, data: { count: 0 } };
  }

  const format = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short" });
  const totals: Record<string, number> = { expense: 0, income: 0, transfer: 0 };

  const lines = payments.map((payment) => {
    const amount = Number(payment.amount);
    if (payment.type in totals) totals[payment.type] += amount;
    const kind = payment.type === "income" ? "ingreso" : payment.type === "transfer" ? "transferencia" : "gasto";
    return `• ${format.format(payment.scheduledDate)} · ${payment.description} (${kind}): ${COP.format(amount)}`;
  });

  return {
    text: [
      `Pagos pendientes en ${days} días (${payments.length}):`,
      ...lines,
      `Total a pagar: ${COP.format(totals.expense)} · por recibir: ${COP.format(totals.income)} · transferencias: ${COP.format(totals.transfer)}`,
    ].join("\n"),
    data: { count: payments.length, totals },
  };
}

export async function consultarVehiculos(
  _args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const vehicles = await db.vehicle.findMany({
    where: { userId: ctx.userId },
    include: {
      reminders: { where: { isActive: true }, orderBy: { dueDate: "asc" } },
      documents: { orderBy: { expiryDate: "asc" } },
    },
  });

  if (vehicles.length === 0) {
    return { text: "No tienes vehículos registrados.", data: { count: 0 } };
  }

  const format = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" });
  const today = new Date();
  const lines: string[] = [];

  for (const vehicle of vehicles) {
    lines.push(`• ${vehicle.name}${vehicle.plate ? ` (${vehicle.plate})` : ""}: ${vehicle.currentKm} km`);

    for (const reminder of vehicle.reminders.slice(0, 5)) {
      const parts: string[] = [];
      if (reminder.dueDate) parts.push(`vence ${format.format(reminder.dueDate)}`);
      if (reminder.dueKm) parts.push(`a los ${Math.round(reminder.dueKm)} km`);
      if (reminder.triggerMode === "km" && reminder.dueKm) {
        parts.push(`faltan ${Math.round(reminder.dueKm - vehicle.currentKm)} km`);
      }
      lines.push(`   - ${reminder.title}${parts.length ? `: ${parts.join(", ")}` : ""}`);
    }

    for (const doc of vehicle.documents.slice(0, 4)) {
      const expired = doc.expiryDate < today;
      lines.push(
        `   - ${doc.type}: ${expired ? "venció" : "vence"} ${format.format(doc.expiryDate)}`
      );
    }
  }

  return {
    text: [`Vehículos (${vehicles.length}):`, ...lines].join("\n"),
    data: { count: vehicles.length },
  };
}

export async function consultarDespensa(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const onlyLow = args.onlyLow === true;

  const items = await db.pantryItem.findMany({
    where: { userId: ctx.userId, isActive: true },
    orderBy: { name: "asc" },
  });

  const low = items.filter(
    (item) => item.minStock !== null && Number(item.quantity) <= Number(item.minStock)
  );

  if (items.length === 0) {
    return { text: "No hay productos en la despensa.", data: { count: 0 } };
  }

  const list = onlyLow ? low : items;
  if (list.length === 0) {
    return { text: "No hay productos por debajo del mínimo.", data: { count: 0 } };
  }

  const lines = list.slice(0, 30).map((item) => {
    const isLow = item.minStock !== null && Number(item.quantity) <= Number(item.minStock);
    const threshold = item.minStock !== null ? ` (mínimo ${item.minStock})` : "";
    return `• ${item.name}: ${item.quantity} ${item.unit}${isLow ? " — bajo" : ""}${threshold}`;
  });

  return {
    text: [
      onlyLow ? `Productos con stock bajo (${low.length}):` : `Despensa: ${items.length} producto(s), ${low.length} bajo el mínimo.`,
      ...lines,
    ].join("\n"),
    data: { count: list.length, low: low.length },
  };
}

export async function consultarResumen(
  args: Record<string, unknown>,
  ctx: ExecutionContext
): Promise<ExecutionResult> {
  const monthsRaw = typeof args.months === "number" ? args.months : 6;
  const months = Math.min(Math.max(Math.round(monthsRaw), 1), 12);

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  from.setHours(0, 0, 0, 0);

  const transactions = await db.transaction.findMany({
    where: {
      userId: ctx.userId,
      type: { in: ["income", "expense"] },
      date: { gte: from },
      relatedTransactionId: null,
    },
    select: { date: true, type: true, amount: true },
  });

  if (transactions.length === 0) {
    return { text: "No hay movimientos en ese período.", data: { months: [] } };
  }

  const buckets = new Map<string, { income: number; expense: number }>();
  for (const tx of transactions) {
    const key = `${tx.date.getFullYear()}-${String(tx.date.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) ?? { income: 0, expense: 0 };
    if (tx.type === "income") bucket.income += Number(tx.amount);
    else bucket.expense += Number(tx.amount);
    buckets.set(key, bucket);
  }

  const ordered = [...buckets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const lines = ordered.map(([month, values]) => {
    const balance = values.income - values.expense;
    return `• ${month}: ingresos ${COP.format(values.income)}, gastos ${COP.format(values.expense)}, balance ${COP.format(balance)}`;
  });

  const last = ordered[ordered.length - 1];
  return {
    text: [
      `Resumen de los últimos ${months} mes(es) — el más reciente es ${last ? last[0] : "s/d"}:`,
      ...lines,
    ].join("\n"),
    data: { months: ordered.map(([month, values]) => ({ month, ...values })) },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Despacho
// ─────────────────────────────────────────────────────────────────────────────

const READ_EXECUTORS: Record<
  string,
  (args: Record<string, unknown>, ctx: ExecutionContext) => Promise<ExecutionResult>
> = {
  consultar_gastos: consultarGastos,
  consultar_saldo: consultarSaldo,
  consultar_medicamentos: consultarMedicamentos,
  consultar_citas: consultarCitas,
  consultar_movimientos: consultarMovimientos,
  consultar_presupuestos: consultarPresupuestos,
  consultar_deudas: consultarDeudas,
  consultar_metas: consultarMetas,
  consultar_pagos_recurrentes: consultarPagosRecurrentes,
  consultar_vehiculos: consultarVehiculos,
  consultar_despensa: consultarDespensa,
  consultar_resumen: consultarResumen,
};

export function getReadExecutor(name: string) {
  return READ_EXECUTORS[name];
}
