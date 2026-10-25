/**
 * Importe de una línea de lista de compra — un solo lugar.
 *
 * PROBLEMAS QUE RESUELVE (los dos fueron bugs reales):
 *
 *  1. **Unidad de precio.** Antes el importe se calculaba como `precio ×
 *     cantidad` en cuatro sitios distintos (fila, totales, tarjetas del listado
 *     y endpoint de confirmación). Eso ignora la unidad de cobro: 250 g de café
 *     a 38.000/kg daba 9.500.000 en vez de 9.500.
 *
 *  2. **Descuento de línea.** Los campos `discountType`/`discountValue` existían
 *     en la base desde la Fase 0 pero **ningún cálculo los aplicaba**, así que
 *     marcar un descuento no cambiaba el total.
 *
 * Ahora todas las pantallas pasan por aquí y la fórmula no puede discrepar.
 *
 * Módulo puro: sin Prisma.
 */

import { resolveLinePrice } from "@/lib/pantry/units";
import { lineAmount, type DiscountType } from "@/lib/pantry/pricing";

export interface PricedLine {
  quantity: number;
  /** Precio capturado, en la unidad de `priceUnitId`. */
  price: number | null | undefined;
  /** Unidad en que compraste. */
  unit: string;
  /** Unidad en que la tienda cobra. `null` ⇒ la misma que `unit`. */
  priceUnitId?: string | null;
  multiplyQuantity?: boolean | null;
  unitWeightFactor?: number | null;
  /** Descuento aplicado a ESTA línea (el que puso la tienda en el producto). */
  discountType?: DiscountType | string | null;
  discountValue?: number | null;
}

/** Importe real de la línea: conversión + descuento, redondeado a 2 decimales. */
export function lineTotal(line: PricedLine): number {
  const price = Number(line.price ?? 0);
  if (!Number.isFinite(price) || price <= 0) return 0;

  // Paso 1 — cantidad en la unidad en que se cobra.
  const resolved = resolveLinePrice({
    quantity: Number(line.quantity) || 0,
    value: price,
    unit: line.unit,
    priceUnitCode: line.priceUnitId ?? null,
    multiplyQuantity: line.multiplyQuantity ?? undefined,
    unitWeightFactor: line.unitWeightFactor ?? null,
  });

  // Paso 2 — descuento de línea sobre el importe ya convertido.
  // Se usa `lineAmount` con `multiplyQuantity: false` porque la conversión ya
  // está hecha: aquí el valor ES el importe de la línea.
  return lineAmount({
    quantity: 1,
    value: resolved.total,
    multiplyQuantity: false,
    discountType: (line.discountType ?? undefined) as DiscountType | undefined,
    discountValue: Number(line.discountValue ?? 0) || 0,
  }).total;
}

/** ¿Necesita conversión? Para mostrar el detalle "250 g × 38.000/kg". */
export function needsConversion(line: PricedLine): boolean {
  return Boolean(line.priceUnitId && line.priceUnitId !== line.unit);
}

/** ¿Tiene descuento aplicado? Para pintar la etiqueta en la fila. */
export function hasDiscount(line: PricedLine): boolean {
  return Boolean(line.discountType && Number(line.discountValue ?? 0) > 0);
}

/** Importe SIN descuento, para mostrar el "antes". */
export function lineTotalBeforeDiscount(line: PricedLine): number {
  return lineTotal({ ...line, discountType: null, discountValue: 0 });
}
