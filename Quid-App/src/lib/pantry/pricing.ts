/**
 * Motor de importe de línea y descuentos — lógica pura.
 *
 * Portado de SoftList 2.8.3 (§4.3 de la ingeniería inversa) y adaptado a las
 * decisiones de la especificación del módulo Nevera:
 *
 *   SoftList                                 Nevera
 *   ───────────────────────────────────────  ─────────────────────────────────
 *   MULTIPLICAR_VALOR en la tabla UNIDADES    `multiplyQuantity` por producto
 *   COUPON_TYPE int 1|2                       enum "FIXED" | "PERCENT"
 *   impuesto + cupón por línea                descuento por línea + descuento
 *                                             total por confirmación (tienda)
 *
 * Se conserva la regla del original: **el impuesto se aplica DESPUÉS del
 * descuento, sobre el monto ya descontado, y no se aplica si el descuento dejó
 * el monto en ≤ 0.**
 *
 * Módulo puro: sin Prisma, sin `@/lib/db`.
 */

/** Tipo de descuento. `FIXED` resta un monto; `PERCENT` resta una fracción. */
export type DiscountType = "FIXED" | "PERCENT";

export interface LinePricingInput {
  /** Cantidad comprada. */
  quantity: number;
  /**
   * Valor capturado en la lista.
   * Si `multiplyQuantity` es true es el **precio unitario**;
   * si es false es el **total de la línea** (típico en granel: g, ml).
   */
  value: number;
  /** ¿Multiplicar cantidad × precio? Ver `defaultMultiplyQuantity`. */
  multiplyQuantity: boolean;

  /** Descuento aplicado a ESTA línea (lo pone la tienda en el producto). */
  discountType?: DiscountType;
  discountValue?: number;

  /** Impuesto sobre la línea. Fracción: 0.19 = 19 %. */
  taxEnabled?: boolean;
  taxRate?: number;
}

export interface LinePricingResult {
  /** Valor de la línea antes de descuento e impuesto. */
  amount: number;
  /** Lo que se restó por el descuento de línea. */
  discount: number;
  /** Base después del descuento, antes de impuesto. */
  base: number;
  /** Impuesto aplicado (0 si no aplica). */
  tax: number;
  /** Total de la línea: base + impuesto. */
  total: number;
  /** ¿Se pudo interpretar el tipo de descuento? `false` ⇒ se ignoró. */
  discountApplied: boolean;
}

export interface TotalDiscountInput {
  type: DiscountType;
  /** Monto si `FIXED`, fracción si `PERCENT` (0.20 = 20 %). */
  value: number;
}

export interface TotalDiscountResult {
  /** Descuento efectivo en dinero. */
  discount: number;
  /** Total después del descuento, nunca por debajo de 0. */
  total: number;
}

/** Unidades menores (centavos) para redondeo monetario exacto. */
const MONEY_SCALE = 100;

/**
 * Redondeo monetario HALF_UP a 2 decimales.
 *
 * Se hace en unidades menores (×100) para evitar el sesgo clásico de
 * `Math.round` con binarios: `Math.round(1.005 * 100)` puede dar 100 en vez de
 * 101 porque `1.005 * 100 === 100.49999999999999`. Sumar `Number.EPSILON`
 * relativo corrige ese caso sin afectar los demás.
 *
 * Es el equivalente de `BigDecimal.setScale(2, HALF_UP)` del original.
 */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  const scaled = amount * MONEY_SCALE;
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled) + Number.EPSILON * Math.abs(scaled));
  return rounded / MONEY_SCALE;
}

/**
 * Normaliza una entrada de porcentaje a fracción (0–1).
 *
 * Acepta las dos formas porque la UI y la base de datos usan convenciones
 * distintas: `0.19` (fracción) y `19` (por ciento). SoftList captura el
 * porcentaje, lo limita a 100 y lo divide; aquí se hace igual pero **sin
 * recortar en silencio**: un valor fuera de rango se rechaza (`undefined`) para
 * que el llamador decida, en vez de aplicar un descuento que el usuario no
 * pidió.
 *
 * @returns Fracción en [0, 1], o `undefined` si el valor no es válido.
 */
export function normalizePercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const fraction = value > 1 ? value / 100 : value;
  if (fraction < 0 || fraction > 1) return undefined;
  return fraction;
}

/** Normaliza un tipo de descuento que puede venir como texto libre o nulo. */
export function normalizeDiscountType(value: unknown): DiscountType | undefined {
  if (value === "FIXED" || value === "fixed") return "FIXED";
  if (value === "PERCENT" || value === "percent" || value === "percentage") return "PERCENT";
  return undefined;
}

/**
 * Calcula el importe de una línea.
 *
 * ```ts
 * // 3 unidades a 2.500 → 7.500
 * lineAmount({ quantity: 3, value: 2500, multiplyQuantity: true }).total  // 7500
 *
 * // Granel: 500 g por 12.000 (el valor YA es el total)
 * lineAmount({ quantity: 500, value: 12000, multiplyQuantity: false }).total  // 12000
 *
 * // Con descuento del 10 % y luego IVA 19 %
 * lineAmount({
 *   quantity: 1, value: 100000, multiplyQuantity: true,
 *   discountType: "PERCENT", discountValue: 0.10,
 *   taxEnabled: true, taxRate: 0.19,
 * }).total  // 107100  →  100000 − 10000 = 90000;  90000 + 17100 = 107100
 * ```
 */
export function lineAmount(input: LinePricingInput): LinePricingResult {
  const quantity = Number.isFinite(input.quantity) ? input.quantity : 0;
  const value = Number.isFinite(input.value) ? input.value : 0;

  const amount = roundMoney(
    input.multiplyQuantity ? value * quantity : value
  );

  // ── Descuento de línea ──
  let discount = 0;
  let discountApplied = false;
  const discountType = normalizeDiscountType(input.discountType);
  const discountValue = Number.isFinite(input.discountValue) ? input.discountValue! : 0;

  if (discountType && discountValue > 0) {
    if (discountType === "FIXED") {
      discount = roundMoney(Math.min(discountValue, amount));
      discountApplied = true;
    } else {
      const rate = normalizePercent(discountValue);
      if (rate !== undefined) {
        discount = roundMoney(Math.min(amount * rate, amount));
        discountApplied = true;
      }
      // Porcentaje fuera de rango (p. ej. 500 %): se ignora y se informa.
    }
  }

  const base = roundMoney(amount - discount);

  // ── Impuesto, DESPUÉS del descuento y solo si la base sigue siendo positiva ──
  let tax = 0;
  if (input.taxEnabled && Number.isFinite(input.taxRate) && input.taxRate! > 0 && base > 0) {
    tax = roundMoney(base * input.taxRate!);
  }

  return {
    amount,
    discount,
    base,
    tax,
    total: roundMoney(base + tax),
    discountApplied,
  };
}

/**
 * Aplica un descuento **total de la compra** (por tienda / por confirmación).
 *
 * Nunca deja el total por debajo de 0: un descuento fijo mayor que el subtotal
 * se recorta, en vez de producir un total negativo que descuadraría el balance.
 *
 * ```ts
 * applyTotalDiscount(150000, { type: "PERCENT", value: 0.20 }).total  // 120000
 * applyTotalDiscount(150000, { type: "FIXED", value: 5000 }).total    // 145000
 * applyTotalDiscount(3000,   { type: "FIXED", value: 9000 }).total    // 0
 * ```
 */
export function applyTotalDiscount(
  subtotal: number,
  discount?: TotalDiscountInput | null
): TotalDiscountResult {
  const safeSubtotal = roundMoney(Number.isFinite(subtotal) ? Math.max(subtotal, 0) : 0);

  if (!discount || !Number.isFinite(discount.value) || discount.value <= 0) {
    return { discount: 0, total: safeSubtotal };
  }

  let amount: number;
  if (discount.type === "FIXED") {
    amount = roundMoney(discount.value);
  } else {
    const rate = normalizePercent(discount.value);
    // Porcentaje fuera de rango: no se aplica nada, en vez de recortar en silencio.
    if (rate === undefined) return { discount: 0, total: safeSubtotal };
    amount = roundMoney(safeSubtotal * rate);
  }

  const applied = roundMoney(Math.min(Math.max(amount, 0), safeSubtotal));

  return { discount: applied, total: roundMoney(safeSubtotal - applied) };
}

/** Suma de importes de línea, redondeada una sola vez al final. */
export function sumLineTotals(lines: readonly LinePricingResult[]): number {
  return roundMoney(lines.reduce((sum, line) => sum + line.total, 0));
}

/**
 * Reparte un descuento total entre las líneas, proporcional a su peso.
 *
 * **No se usa para el flujo principal**: la especificación exige que el
 * descuento total sea *por tienda/confirmación*, nunca repartido. Existe para
 * dos casos concretos:
 *
 *   1. Mostrar en la UI "cuánto te ahorraste por línea" a modo informativo.
 *   2. Reversar: al deshacer una confirmación hay que saber cuánto devolver.
 *
 * Usa el método del resto mayor para que la suma de las partes sea exactamente
 * el total, sin perder ni ganar centavos por redondeo.
 */
export function allocateProportionally(
  totalToAllocate: number,
  weights: readonly number[]
): number[] {
  const total = roundMoney(Math.max(totalToAllocate, 0));
  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const weightSum = safeWeights.reduce((sum, w) => sum + w, 0);

  if (total === 0 || weightSum === 0) return safeWeights.map(() => 0);

  const totalMinor = Math.round(total * MONEY_SCALE);
  const rawMinor = safeWeights.map((w) => (totalMinor * w) / weightSum);
  const flooredMinor = rawMinor.map((r) => Math.floor(r));
  let remainder = totalMinor - flooredMinor.reduce((sum, r) => sum + r, 0);

  // Reparte el remanente empezando por los restos decimales más altos.
  const order = rawMinor
    .map((r, index) => ({ index, fraction: r - Math.floor(r) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...flooredMinor];
  for (let i = 0; remainder > 0 && i < order.length; i++, remainder--) {
    result[order[i].index] += 1;
  }

  return result.map((minor) => minor / MONEY_SCALE);
}
