/**
 * Estado de stock de un producto de la Nevera.
 *
 * Traduce las columnas de `PantryItem` a los estados que la UI muestra como
 * cápsulas. La especificación exige **una sola cápsula visible por producto**
 * (la más grave), así que aquí se calcula una prioridad explícita en vez de
 * dejar que la UI decida el orden.
 *
 * Módulo puro: sin Prisma, sin `@/lib/db`.
 */

/** Cápsulas, en orden de gravedad (menor índice = más grave). */
export type StockStatus =
  | "expired"      // ya pasó la fecha
  | "expiring"     // vence dentro de 3 días
  | "out"          // cantidad 0
  | "low"          // llegó o bajó del mínimo
  | "running_low"  // bajo el objetivo, sobre el mínimo
  | "unused"       // mucho tiempo sin consumo
  | "ok";

/** Orden de gravedad. La UI toma el primer estado presente. */
export const STOCK_STATUS_PRIORITY: readonly StockStatus[] = [
  "expired",
  "expiring",
  "out",
  "low",
  "running_low",
  "unused",
  "ok",
] as const;

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  expired: "Vencido",
  expiring: "Vence pronto",
  out: "Agotado",
  low: "Stock bajo",
  running_low: "Se acaba",
  unused: "Sin usar",
  ok: "",
};

/** Días de antelación con que se avisa un vencimiento. */
export const EXPIRING_SOON_DAYS = 3;

/** Días sin consumo a partir de los cuales se considera "sin usar". */
export const UNUSED_AFTER_DAYS = 30;

export interface StockInput {
  quantity: number;
  minStock?: number | null;
  targetQuantity?: number | null;
  expirationDate?: Date | string | null;
  lastUsedAt?: Date | string | null;
}

export interface StockEvaluation {
  /** La cápsula a mostrar (la más grave). `ok` ⇒ ninguna. */
  status: StockStatus;
  label: string;
  /** Cuánto falta para llegar al objetivo. */
  deficit: number;
  /** Objetivo efectivo: `targetQuantity` si existe, si no `minStock`. */
  effectiveTarget: number;
  /** ¿Llegó o bajó del mínimo? */
  isLow: boolean;
  /** ¿Está agotado? */
  isOut: boolean;
  /** Días hasta el vencimiento (negativo si ya venció). `null` si no hay fecha. */
  daysToExpiry: number | null;
  /** Días desde el último uso. `null` si nunca se ha usado. */
  daysSinceUse: number | null;
  /** Todos los estados presentes, para filtros y depuración. */
  flags: StockStatus[];
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * Evalúa el estado de stock de un producto.
 *
 * ```ts
 * evaluateStock({ quantity: 0, minStock: 2 }).status                  // "out"
 * evaluateStock({ quantity: 1, minStock: 2 }).status                  // "low"
 * evaluateStock({ quantity: 5, minStock: 2, targetQuantity: 10 })     // "running_low"
 * ```
 *
 * `now` es inyectable para que los tests no dependan del reloj.
 */
export function evaluateStock(input: StockInput, now: Date = new Date()): StockEvaluation {
  const quantity = Number.isFinite(input.quantity) ? input.quantity : 0;
  const minStock = input.minStock ?? null;
  const targetQuantity = input.targetQuantity ?? null;

  const effectiveTarget = targetQuantity ?? minStock ?? 0;
  const deficit = Math.max(0, effectiveTarget - quantity);
  const isOut = quantity <= 0;
  const isLow =
    minStock !== null && minStock !== undefined && quantity <= minStock;

  const expiration = toDate(input.expirationDate);
  const daysToExpiry = expiration ? daysBetween(expiration, now) : null;

  const lastUsed = toDate(input.lastUsedAt);
  const daysSinceUse = lastUsed ? daysBetween(now, lastUsed) : null;

  const flags: StockStatus[] = [];
  if (daysToExpiry !== null) {
    if (daysToExpiry < 0) flags.push("expired");
    else if (daysToExpiry <= EXPIRING_SOON_DAYS) flags.push("expiring");
  }
  if (isOut) flags.push("out");
  if (isLow) flags.push("low");
  // "Se acaba" solo si hay objetivo por encima del mínimo y no está ya en bajo.
  if (!isLow && !isOut && deficit > 0 && targetQuantity !== null) {
    flags.push("running_low");
  }
  if (daysSinceUse !== null && daysSinceUse > UNUSED_AFTER_DAYS) {
    flags.push("unused");
  }

  const status =
    STOCK_STATUS_PRIORITY.find((candidate) => flags.includes(candidate)) ?? "ok";

  return {
    status,
    label: STOCK_STATUS_LABELS[status],
    deficit,
    effectiveTarget,
    isLow,
    isOut,
    daysToExpiry,
    daysSinceUse,
    flags,
  };
}

/**
 * ¿Este producto participa en la generación automática de listas?
 *
 * Solo si tiene un objetivo o un mínimo definido. Sin umbral, el producto es
 * "solo registro" y no debe aparecer como faltante — de lo contrario una nevera
 * grande generaría listas de cientos de líneas.
 */
export function isReplenishable(input: StockInput): boolean {
  return input.minStock != null || input.targetQuantity != null;
}
