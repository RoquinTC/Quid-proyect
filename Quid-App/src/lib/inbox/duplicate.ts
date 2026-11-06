/**
 * F-49b · ¿Esta captura ya está registrada?
 *
 * La bandeja lee SMS de días atrás, y esos movimientos muchas veces ya se
 * registraron a mano (o entraron por otro camino). Sin esta comprobación,
 * aceptar una captura crea un gasto duplicado y descuadra los saldos.
 *
 * Criterio: el monto es la señal fuerte y la fecha la de apoyo, porque el
 * texto del banco y la descripción del usuario casi nunca coinciden
 * ("EXITO PRADO" vs "mercado de la semana").
 *
 *   monto exacto + mismo día          → alta
 *   monto exacto + hasta 3 días       → media
 *   monto exacto pero otro tipo       → baja (el usuario pudo registrarlo
 *                                       como transferencia y no como gasto)
 *
 * Nunca se descarta nada solo: se avisa y decide el usuario. Un falso
 * positivo silencioso perdería un movimiento real, y eso es peor.
 */

export type MatchableTransaction = {
  id: string;
  amount: number;
  date: string; // ISO
  type: string;
  description: string;
};

export type MatchableCapture = {
  parsedAmount: number | null;
  parsedType: string | null;
  parsedDate: string | null;
};

export type DuplicateConfidence = "high" | "medium" | "low";

export type DuplicateMatch = MatchableTransaction & {
  confidence: DuplicateConfidence;
  /** Días de diferencia entre la captura y el movimiento registrado. */
  daysApart: number;
};

/** Ventana máxima, en días, para considerar que es el mismo movimiento. */
export const MATCH_WINDOW_DAYS = 3;

/**
 * Interpreta una fecha sin desplazarla de día.
 *
 * `new Date("2026-11-17")` se lee como medianoche **UTC**, que en Bogotá
 * (UTC-5) todavía es el 16. Comparar así corría todas las fechas un día y
 * arruinaba la detección. Las fechas sin hora se construyen en local.
 */
function toDate(value: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const local = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(local.getTime()) ? null : local;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Diferencia en días completos entre dos fechas (sin importar la hora). */
function daysBetween(a: Date, b: Date): number {
  const da = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const db = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.abs(Math.round((da - db) / 86_400_000));
}

const CONFIDENCE_ORDER: Record<DuplicateConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Busca el movimiento registrado que probablemente corresponde a la captura.
 *
 * @param capture     montos y tipo detectados por el clasificador
 * @param candidates  transacciones del usuario en la ventana de fechas
 * @param reference   fecha de la captura (por defecto, la de hoy)
 */
export function findDuplicate(
  capture: MatchableCapture,
  candidates: MatchableTransaction[],
  reference: Date = new Date()
): DuplicateMatch | null {
  if (capture.parsedAmount === null || !Number.isFinite(capture.parsedAmount)) {
    return null;
  }

  const captureDate = capture.parsedDate ? toDate(capture.parsedDate) : reference;
  if (!captureDate) return null;

  const matches: DuplicateMatch[] = [];

  for (const candidate of candidates) {
    const candidateDate = toDate(candidate.date);
    if (!candidateDate) continue;

    // Monto exacto: es la condición sin la cual no hay duplicado.
    if (Math.abs(candidate.amount - capture.parsedAmount) > 0.01) continue;

    const daysApart = daysBetween(captureDate, candidateDate);
    if (daysApart > MATCH_WINDOW_DAYS) continue;

    const sameType = (capture.parsedType || "expense") === candidate.type;

    let confidence: DuplicateConfidence;
    if (daysApart === 0) {
      confidence = sameType ? "high" : "medium";
    } else {
      confidence = sameType ? "medium" : "low";
    }

    matches.push({ ...candidate, confidence, daysApart });
  }

  if (matches.length === 0) return null;

  // Mejor candidato: más confianza y, a igualdad, el más cercano en fecha.
  matches.sort((a, b) => {
    const byConfidence = CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence];
    if (byConfidence !== 0) return byConfidence;
    return a.daysApart - b.daysApart;
  });

  return matches[0];
}
