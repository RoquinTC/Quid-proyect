/**
 * F-05 · Safe to Spend ("puedo gastar hoy").
 *
 * Responde una sola pregunta: **¿cuánto puedo gastar hoy sin romper el
 * presupuesto del período?**
 *
 *   disponible = (presupuesto del período − gastado) − comprometido
 *   porDía     = disponible / días restantes (incluyendo hoy)
 *
 * Decisiones deliberadas:
 *
 *  - **Se restan los pagos pendientes** ("comprometido"). El presupuesto
 *    restante no es dinero libre si ya tienes cuentas por pagar.
 *
 *  - **Los vencidos también cuentan como comprometidos.** Una factura vencida
 *    sigue siendo dinero que hay que pagar; ignorarla inflaría el número justo
 *    cuando más cuidado hace falta.
 *
 *  - **Los ingresos pendientes NO se suman.** Es tentador, pero un ingreso que
 *    aún no ha llegado no es dinero disponible. Ser conservador aquí es lo
 *    correcto: el número solo debe sorprender hacia arriba.
 *
 *  - **Si no hay presupuesto configurado, no se inventa un número.**
 *    `hasBudget: false` y `safePerDay: null`, para que la UI pida configurarlo
 *    en vez de mostrar una cifra sin fundamento.
 *
 *  - **Si el resultado es negativo, se devuelve negativo.** Esconderlo en 0
 *    ocultaría que ya estás excedido.
 */

export type BudgetLike = {
  amount: number | string;
  spent: number | string;
};

export type PendingPaymentLike = {
  amount: number | string;
  type: string;
  scheduledDate: string | Date;
  status?: string;
};

export type SafeToSpendInput = {
  periodStart: Date;
  periodEnd: Date;
  today: Date;
  budgets: BudgetLike[];
  pendingPayments: PendingPaymentLike[];
};

export type SafeToSpendResult = {
  /** ¿Hay al menos un presupuesto de gasto configurado? */
  hasBudget: boolean;
  /** Suma de los presupuestos del período. */
  periodBudget: number;
  /** Suma de lo ya gastado en el período. */
  spent: number;
  /** periodBudget − spent. */
  remaining: number;
  /** Pagos pendientes que aún hay que cubrir (incluye vencidos). */
  committed: number;
  /** remaining − committed. Puede ser negativo. */
  available: number;
  /** Días que quedan del período, contando hoy. Mínimo 1. */
  daysLeft: number;
  /** available / daysLeft. `null` si no hay presupuesto. */
  safePerDay: number | null;
  /** El disponible no alcanza para lo comprometido. */
  overBudget: boolean;
  periodStart: Date;
  periodEnd: Date;
};

function toNumber(value: number | string | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Día absoluto (UTC) de una fecha local: evita desfases por hora o zona. */
function dayNumber(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Días entre dos fechas, contando ambos extremos. Nunca menos de 1. */
export function daysBetweenInclusive(from: Date, to: Date): number {
  const days = Math.floor((dayNumber(to) - dayNumber(from)) / 86400000) + 1;
  return Math.max(1, days);
}

function toDate(value: string | Date): Date | null {
  const d = typeof value === "string" ? new Date(value) : value;
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
}

/** ¿Este pago compromete dinero del período? */
export function isCommittedPayment(
  payment: PendingPaymentLike,
  periodEnd: Date
): boolean {
  if (payment.status && payment.status !== "pending") return false;
  // Un ingreso pendiente no es una obligación.
  if (payment.type === "income") return false;

  const date = toDate(payment.scheduledDate);
  if (!date) return false;

  // Todo lo que vence hasta el final del período, incluidos los vencidos.
  return dayNumber(date) <= dayNumber(periodEnd);
}

export function computeSafeToSpend(input: SafeToSpendInput): SafeToSpendResult {
  const { periodStart, periodEnd, today, budgets, pendingPayments } = input;

  // Solo presupuestos con monto positivo: uno en 0 no aporta ni restringe.
  const usableBudgets = budgets.filter((b) => toNumber(b.amount) > 0);

  const periodBudget = round2(usableBudgets.reduce((sum, b) => sum + toNumber(b.amount), 0));
  const spent = round2(usableBudgets.reduce((sum, b) => sum + toNumber(b.spent), 0));

  const hasBudget = usableBudgets.length > 0;
  const remaining = round2(periodBudget - spent);

  const committed = round2(
    pendingPayments
      .filter((p) => isCommittedPayment(p, periodEnd))
      .reduce((sum, p) => sum + Math.abs(toNumber(p.amount)), 0)
  );

  const available = round2(remaining - committed);
  const daysLeft = daysBetweenInclusive(today, periodEnd);

  return {
    hasBudget,
    periodBudget,
    spent,
    remaining,
    committed,
    available,
    daysLeft,
    safePerDay: hasBudget ? round2(available / daysLeft) : null,
    overBudget: available < 0,
    periodStart,
    periodEnd,
  };
}
