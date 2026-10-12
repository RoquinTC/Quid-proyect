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
};

export function getReadExecutor(name: string) {
  return READ_EXECUTORS[name];
}
