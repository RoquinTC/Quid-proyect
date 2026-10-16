"use client";

/**
 * Vocabulario visual del módulo Nevera.
 *
 * Dos decisiones de diseño que viven aquí y no repetidas por los componentes:
 *
 *  1. **Paleta frío/calor.** El frío (cian/azul) es la nevera; el calor (ámbar)
 *     es la acción. No agrega colores nuevos: el ámbar ya es el acento del
 *     módulo; el cian es su complementario.
 *
 *  2. **Una sola cápsula por producto** (regla 4 de la especificación). El
 *     servidor ya calcula cuál es la más grave en `evaluateStock`; aquí solo se
 *     le pone estilo. Nunca se muestran dos cápsulas en la misma fila.
 */

import type { StockStatus } from "@/lib/types/pantry";

/** Orden en que la UI ofrece los filtros. */
export const STOCK_FILTERS: { value: StockStatus; label: string }[] = [
  { value: "out", label: "Agotados" },
  { value: "low", label: "Stock bajo" },
  { value: "expiring", label: "Por vencer" },
  { value: "unused", label: "Sin usar" },
];

/** Clases de la cápsula según el estado. Coherente con la paleta existente. */
export const STOCK_CAPSULE_CLASS: Record<StockStatus, string> = {
  expired: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  out: "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400",
  expiring: "bg-orange-50 text-orange-600 dark:bg-orange-950/40 dark:text-orange-400",
  low: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400",
  running_low: "bg-amber-50/70 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400",
  unused: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  ok: "",
};

/** Etiquetas de ubicación, con su icono conceptual. */
export const LOCATION_LABELS: Record<string, string> = {
  nevera: "Nevera",
  alacena: "Alacena",
  congelador: "Congelador",
};

export const LOCATION_ORDER = ["nevera", "alacena", "congelador"] as const;

/** Orden de gravedad para agrupar: primero lo que urge. */
export const STOCK_SEVERITY_ORDER: StockStatus[] = [
  "expired",
  "expiring",
  "out",
  "low",
  "running_low",
  "unused",
  "ok",
];

/** Índice de gravedad (menor = más urgente). */
export function severityRank(status?: StockStatus): number {
  const index = STOCK_SEVERITY_ORDER.indexOf(status ?? "ok");
  return index === -1 ? STOCK_SEVERITY_ORDER.length : index;
}

/**
 * Micro-copys del personaje. **Dinámicos según lo que pasa**, no un texto fijo
 * por caso: cambian con la hora del día, con cuántos productos hay y con si es
 * la primera vez que se usa la nevera.
 */
export function fridgeVoice(seed: {
  total: number;
  out: number;
  low: number;
  expiring: number;
  isFirstTime?: boolean;
}): string {
  const { total, out, low, expiring, isFirstTime } = seed;
  const hour = new Date().getHours();
  const isNight = hour >= 21 || hour < 6;
  const isMorning = hour >= 6 && hour < 12;

  if (isFirstTime || total === 0) {
    return isNight
      ? "Aquí solo hay frío. Mañana la llenamos."
      : "Aquí solo hay frío. Agrega algo.";
  }

  if (out > 0 && expiring > 0) {
    return `${out} se acabaron y ${expiring} ${expiring === 1 ? "está" : "están"} por vencerse. Toca mercado.`;
  }
  if (out > 0) {
    return out === 1
      ? "Se acabó algo. Buen momento para anotarlo."
      : `Se acabaron ${out} cosas. Buen momento para anotarlas.`;
  }
  if (expiring > 0) {
    return expiring === 1
      ? "Algo está por vencerse. Úsalo primero."
      : `${expiring} cosas están por vencerse. Úsalas primero.`;
  }
  if (low > 0) {
    return low === 1
      ? "Se nos está acabando algo."
      : `Se nos están acabando ${low} cosas.`;
  }

  if (total >= 30) return isNight ? "Todo lleno. Puedes cerrar la puerta." : "Bien surtida. Nada urgente.";
  if (isMorning) return "Todo en orden. ¿Qué preparamos hoy?";
  return "Todo en orden. Puedes cerrar la puerta.";
}

/** Etiqueta de cantidad con su unidad, sin decimales innecesarios. */
export function formatQuantity(quantity: number, unit: string): string {
  const rounded = Math.round(quantity * 1000) / 1000;
  const text = Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, "");
  return `${text} ${unit}`;
}
