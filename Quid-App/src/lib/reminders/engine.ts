/**
 * Motor de recordatorios: fechas de calendario y cadencia por umbrales.
 *
 * Dos reglas que este archivo existe para sostener:
 *
 * 1. **Una fecha sin hora es un día, no un instante.** En Quid las fechas de
 *    pago, vencimiento y recordatorio se guardan a medianoche UTC (00:00Z) o a
 *    medianoche de Colombia (05:00Z). Comparar esos valores contra "ahora" con
 *    diferencias de milisegundos corre el día: un pago del 10 aparecía como
 *    "hoy" el 9 por la noche. Aquí todo se compara por clave `YYYY-MM-DD`
 *    tomada en UTC, que devuelve el día real en las dos convenciones.
 *
 * 2. **Un recordatorio avisa cuando cambia de tramo, no todos los días.**
 *    Un mantenimiento a 30 días no debe sonar 30 veces: suena al entrar al
 *    tramo de 30, al de 7, al de 1, el día y cuando vence.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const COLOMBIA_TIMEZONE = "America/Bogota";

/** Tramo de aviso: un umbral concreto, o "overdue" cuando ya pasó. */
export type ReminderBand = number | "overdue";

/** Clave de calendario `YYYY-MM-DD` (UTC) de un valor guardado sin hora. */
export function dateKeyOf(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Hoy en Colombia como `YYYY-MM-DD`, independiente de la zona del servidor. */
export function colombiaTodayKey(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: COLOMBIA_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function keyToMs(key: string): number | null {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return null;
  return Date.UTC(year, month - 1, day);
}

/** Días de calendario entre dos claves (positivo = `toKey` en el futuro). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  const from = keyToMs(fromKey);
  const to = keyToMs(toKey);
  if (from === null || to === null) return Number.NaN;
  return Math.round((to - from) / DAY_MS);
}

/** Suma (o resta) días a una clave de calendario. */
export function addDaysToKey(key: string, days: number): string {
  const ms = keyToMs(key);
  if (ms === null) return key;
  const next = new Date(ms + days * DAY_MS);
  return dateKeyOf(next) as string;
}

/**
 * Tramo en el que cae un valor que se acerca a cero (días o kilómetros).
 *
 * `thresholds` son los avisos configurados, en cualquier orden. Devuelve el
 * umbral más ajustado que todavía no se pasó; `null` si aún falta demasiado y
 * `"overdue"` si ya se cumplió.
 */
export function bandFor(value: number, thresholds: number[]): ReminderBand | null {
  if (!Number.isFinite(value)) return null;
  if (value < 0) return "overdue";

  const ascending = [...thresholds].filter((t) => Number.isFinite(t)).sort((a, b) => a - b);
  for (const threshold of ascending) {
    if (value <= threshold) return threshold;
  }
  return null;
}

/** 0 = vencido, 1 = día exacto, 2 = casi… sirve para elegir el aviso más urgente. */
export function bandUrgency(band: ReminderBand | null): number {
  if (band === "overdue") return 0;
  if (typeof band === "number") return 1 + band / 1000;
  return Number.POSITIVE_INFINITY;
}

/** El aviso más urgente entre varios (o `null` si ninguno aplica). */
export function mostUrgentBand(bands: Array<ReminderBand | null>): ReminderBand | null {
  let best: ReminderBand | null = null;
  for (const band of bands) {
    if (band === null) continue;
    if (best === null || bandUrgency(band) < bandUrgency(best)) best = band;
  }
  return best;
}

/** Texto corto: "10 nov" o "lun 10 nov". Se arma en UTC a propósito. */
export function formatKeyEs(
  key: string,
  options: { weekday?: boolean; month?: "short" | "long" } = {}
): string {
  const ms = keyToMs(key);
  if (ms === null) return key;

  return new Date(ms + 12 * 60 * 60 * 1000).toLocaleDateString("es-CO", {
    timeZone: "UTC",
    weekday: options.weekday ? "short" : undefined,
    day: "numeric",
    month: options.month ?? "short",
  });
}

/** Etiqueta de vencimiento con la fecha real, para el cuerpo del aviso. */
export function dueTextEs(days: number, key: string): string {
  if (Number.isNaN(days)) return "";
  if (days === 0) return `vence hoy (${formatKeyEs(key)})`;
  if (days === 1) return `vence mañana (${formatKeyEs(key)})`;
  if (days > 1) return `vence en ${days} días (${formatKeyEs(key)})`;
  return `venció el ${formatKeyEs(key)} (hace ${Math.abs(days)} días)`;
}

/** Clave estable de deduplicación: entidad + tramo. */
export function reminderKeyFor(prefix: string, entityId: string, band: ReminderBand): string {
  return `${prefix}:${entityId}:${band}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Pagos recurrentes
// ───────────────────────────────────────────────────────────────────────────

/** Aviso previo: con cuántos días de anticipación se avisa un pago. */
export const PAYMENT_UPCOMING_DAYS = 3;

export type PaymentBand = "upcoming" | "due" | "overdue";

/**
 * Cuándo toca avisar de un pago: a 3 días, el día, y si se pasó, al día
 * siguiente y después una vez por semana — nunca todos los días.
 */
export function paymentBandFor(days: number): PaymentBand | null {
  if (days === PAYMENT_UPCOMING_DAYS) return "upcoming";
  if (days === 0) return "due";
  if (days < 0 && (days === -1 || (days + 1) % 7 === 0)) return "overdue";
  return null;
}
