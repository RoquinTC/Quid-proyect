/**
 * F-23 · Detección de suscripciones.
 *
 * Busca en el historial de gastos los cobros que se repiten: mismo comercio,
 * intervalo de ~un mes y monto estable. No crea nada ni consulta la base: recibe
 * las transacciones y devuelve candidatos para que el usuario decida.
 *
 * La identidad de una sugerencia es `merchantKey` (comercio normalizado), no el
 * texto original: "NETFLIX.COM 1234" y "netflix com" son la misma suscripción.
 */

export type SubscriptionConfidence = "high" | "medium";

export type DetectedTransaction = {
  id: string;
  /** ISO o `YYYY-MM-DD`. */
  date: string;
  amount: number;
  description: string | null;
  category?: string | null;
  type?: string | null;
};

export type SubscriptionCandidate = {
  merchantKey: string;
  /** Nombre legible para la tarjeta. */
  label: string;
  /** Monto típico de un cobro. */
  amount: number;
  /** Estimado mensual (un cobro por cadencia). */
  monthlyAmount: number;
  /** Días entre cobros (mediana). */
  cadenceDays: number;
  occurrences: number;
  /** `YYYY-MM-DD` del último y del siguiente cobro estimado. */
  lastCharge: string;
  nextCharge: string;
  category: string | null;
  confidence: SubscriptionConfidence;
  transactionIds: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Palabras que no distinguen un comercio de otro. */
const NOISE = new Set([
  "compra", "pago", "pagos", "debito", "debito", "credito", "tarjeta", "pos",
  "sucursal", "tienda", "online", "app", "co", "com", "www", "ltda", "sas",
  "bogota", "medellin", "cali", "colombia", "factura", "electronica",
]);

/** Quita acentos y todo lo que no sea letra o espacio. */
function clean(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Comercio normalizado. Se queda con las primeras palabras significativas:
 * alcanza para agrupar y sobrevive a los números de referencia del banco.
 */
export function normalizeMerchant(description: string | null | undefined): string {
  if (!description) return "";
  const tokens = clean(description)
    .split(" ")
    .filter((token) => token.length > 1 && !NOISE.has(token));
  return tokens.slice(0, 4).join(" ");
}

function toMs(date: string): number {
  const value = Date.parse(date.length === 10 ? `${date}T00:00:00Z` : date);
  return Number.isNaN(value) ? Number.NaN : value;
}

function toKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function titleCase(text: string): string {
  return text
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Ventana mensual aceptada: entre 25 y 35 días. */
const MIN_GAP_DAYS = 25;
const MAX_GAP_DAYS = 35;
/** Un monto que varía más de esto no parece una suscripción. */
const MAX_AMOUNT_RATIO = 1.25;
const MIN_OCCURRENCES = 3;

/**
 * Devuelve los candidatos ordenados por monto mensual.
 *
 * Solo mira gastos: una suscripción es un cobro que sale. Los ingresos y las
 * transferencias se ofrecen después, al crear el pago recurrente, no aquí.
 */
export function detectSubscriptions(
  transactions: DetectedTransaction[]
): SubscriptionCandidate[] {
  const groups = new Map<string, DetectedTransaction[]>();

  for (const transaction of transactions) {
    if ((transaction.type ?? "expense") !== "expense") continue;
    if (!(transaction.amount > 0)) continue;

    const key = normalizeMerchant(transaction.description);
    if (!key) continue;

    const group = groups.get(key);
    if (group) group.push(transaction);
    else groups.set(key, [transaction]);
  }

  const candidates: SubscriptionCandidate[] = [];

  for (const [merchantKey, group] of groups) {
    if (group.length < MIN_OCCURRENCES) continue;

    const sorted = [...group].sort((a, b) => toMs(a.date) - toMs(b.date));
    const times = sorted.map((transaction) => toMs(transaction.date));
    if (times.some((time) => Number.isNaN(time))) continue;

    const gaps: number[] = [];
    for (let index = 1; index < times.length; index += 1) {
      gaps.push((times[index] - times[index - 1]) / DAY_MS);
    }
    const cadence = median(gaps);
    if (!Number.isFinite(cadence) || cadence < MIN_GAP_DAYS || cadence > MAX_GAP_DAYS) {
      continue;
    }

    // Todos los intervalos deben parecerse: un cobro mensual con un salto de
    // medio año en el medio no es una suscripción, es casualidad.
    const consistent = gaps.every(
      (gap) => gap >= MIN_GAP_DAYS - 5 && gap <= MAX_GAP_DAYS + 5
    );
    if (!consistent) continue;

    const amounts = sorted.map((transaction) => transaction.amount);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (min <= 0 || max / min > MAX_AMOUNT_RATIO) continue;

    const average = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
    const last = sorted[sorted.length - 1];
    const lastMs = times[times.length - 1];
    const nextMs = lastMs + cadence * DAY_MS;

    const confidence: SubscriptionConfidence =
      sorted.length >= 4 && max / min <= 1.1 ? "high" : "medium";

    candidates.push({
      merchantKey,
      label: titleCase(merchantKey),
      amount: Math.round(average),
      monthlyAmount: Math.round(average),
      cadenceDays: Math.round(cadence),
      occurrences: sorted.length,
      lastCharge: toKey(lastMs),
      nextCharge: toKey(nextMs),
      category: last.category ?? null,
      confidence,
      transactionIds: sorted.map((transaction) => transaction.id),
    });
  }

  return candidates.sort((a, b) => b.monthlyAmount - a.monthlyAmount);
}

/** `YYYY-MM-DD` del próximo cobro a partir de la fecha del último. */
export function nextChargeDate(lastCharge: string, cadenceDays: number): string {
  const ms = toMs(lastCharge);
  if (Number.isNaN(ms)) return lastCharge;
  return toKey(ms + cadenceDays * DAY_MS);
}
