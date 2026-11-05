/**
 * F-06 · Bandeja de pagos: vencidos vs próximos.
 *
 * Separa las obligaciones pendientes en dos cubos y calcula sus totales.
 * La lógica vive aquí (y no en el componente) para poder probarla: es
 * aritmética de fechas y dinero, justo donde un error se ve bonito pero
 * está mal.
 *
 * Convención de fechas: `scheduledDate` viene como ISO; se usa solo la parte
 * "YYYY-MM-DD", que es la fecha en Colombia. Igual que el resto del módulo.
 */

/** Ventana de "próximos". Son acumulativas: "mañana" incluye hoy. */
export type UpcomingPeriod = "today" | "tomorrow" | "week" | "month";

/** Días máximos de cada ventana. */
export const PERIOD_LIMITS: Record<UpcomingPeriod, number> = {
  today: 0,
  tomorrow: 1,
  week: 7,
  month: 30,
};

export const PERIOD_LABELS: Record<UpcomingPeriod, string> = {
  today: "Hoy",
  tomorrow: "Mañana",
  week: "Esta semana",
  month: "Este mes",
};

export type PaymentLike = {
  id: string;
  status: string;
  scheduledDate: string;
  amount: number;
  type: string;
};

export type Totals = {
  /** Dinero que sale: gastos y transferencias. */
  out: number;
  /** Dinero que entra: ingresos. */
  income: number;
  /** Número de pagos en el cubo. */
  count: number;
};

export type SplitResult<T extends PaymentLike> = {
  overdue: T[];
  upcoming: T[];
  overdueTotals: Totals;
  upcomingTotals: Totals;
};

/** Medianoche local de hoy, para comparar solo días. */
export function startOfToday(reference: Date = new Date()): Date {
  return new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
}

/**
 * Días que faltan para una fecha (negativo = vencida).
 * Parsea "YYYY-MM-DD" a medianoche local para no arrastrar horas ni zonas.
 */
export function daysUntilDate(dateStr: string, reference: Date = new Date()): number {
  const datePart = (dateStr || "").split("T")[0];
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return Number.NaN;

  const target = new Date(y, m - 1, d);
  const today = startOfToday(reference);
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/** Etiqueta corta para una fecha relativa. */
export function dueLabel(days: number): string {
  if (Number.isNaN(days)) return "";
  if (days < 0) return `Vencido hace ${Math.abs(days)}d`;
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days}d`;
}

function emptyTotals(): Totals {
  return { out: 0, income: 0, count: 0 };
}

function addTo(totals: Totals, payment: PaymentLike) {
  const amount = typeof payment.amount === "number" ? payment.amount : Number(payment.amount) || 0;
  if (payment.type === "income") totals.income += amount;
  else totals.out += amount;
  totals.count += 1;
}

const byDateAsc = (a: PaymentLike, b: PaymentLike) =>
  (a.scheduledDate || "").localeCompare(b.scheduledDate || "");

/**
 * Divide los pagos pendientes en vencidos y próximos.
 *
 * - **Vencidos**: siempre completos, sin importar cuántos ni de qué mes.
 *   Un pago vencido no debe poder "desaparecer" por un filtro de período.
 * - **Próximos**: fecha entre hoy y el límite del período elegido.
 *
 * Los confirmados y cancelados se ignoran.
 */
export function splitUpcomingPayments<T extends PaymentLike>(
  payments: T[],
  period: UpcomingPeriod,
  reference: Date = new Date()
): SplitResult<T> {
  const limit = PERIOD_LIMITS[period] ?? PERIOD_LIMITS.month;

  const overdue: T[] = [];
  const upcoming: T[] = [];
  const overdueTotals = emptyTotals();
  const upcomingTotals = emptyTotals();

  for (const payment of payments) {
    if (payment.status !== "pending") continue;

    const days = daysUntilDate(payment.scheduledDate, reference);
    if (Number.isNaN(days)) continue;

    if (days < 0) {
      overdue.push(payment);
      addTo(overdueTotals, payment);
    } else if (days <= limit) {
      upcoming.push(payment);
      addTo(upcomingTotals, payment);
    }
  }

  overdue.sort(byDateAsc);
  upcoming.sort(byDateAsc);

  return { overdue, upcoming, overdueTotals, upcomingTotals };
}
