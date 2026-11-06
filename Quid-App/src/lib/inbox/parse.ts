/**
 * F-49 · Parser de capturas para la bandeja de entrada.
 *
 * La bandeja recibe texto crudo de cualquier fuente (SMS del banco, correo,
 * notificación, o algo pegado a mano) y extrae lo mínimo para proponer un
 * movimiento: monto, tipo, comercio y fecha.
 *
 * Principios:
 *  - **Nunca inventa.** Si no encuentra monto, `amount` es `null` y la UI pide
 *    completarlo. Un monto adivinado es peor que uno vacío.
 *  - **La confianza es explícita.** Devuelve `confidence` (0..1) para que la
 *    interfaz pueda mostrar "revisar" en las capturas dudosas.
 *  - **No decide el tipo por el signo del número** (los SMS no traen signo):
 *    usa palabras ("recibiste", "abono", "compra").
 *  - Es puro y sin dependencias: se prueba con texto real de SMS.
 */


export type InboxSource = "sms" | "email" | "voice" | "notification" | "manual";

export type ParsedCapture = {
  /** Monto detectado, o `null` si no se pudo leer. */
  amount: number | null;
  /** `expense` por defecto: una captura sin señal de ingreso es un gasto. */
  type: "expense" | "income";
  /** Comercio o descripción propuesta. */
  merchant: string | null;
  /** Fecha `YYYY-MM-DD` si el texto la trae; `null` = usar hoy. */
  date: string | null;
  /** 0..1 — qué tan completa salió la lectura. */
  confidence: number;
  /** Qué se detectó y qué no, para poder explicarlo en la UI. */
  signals: {
    amount: boolean;
    type: boolean;
    merchant: boolean;
    date: boolean;
  };
};

/** Palabras que indican dinero que ENTRA. */
const INCOME_HINTS = [
  "recibiste",
  "recibió",
  "recibio",
  "abono",
  "ingreso",
  "consignación",
  "consignacion",
  "transferencia recibida",
  "te llegó",
  "te llego",
  "depósito",
  "deposito",
  "pago recibido",
  "reembolso",
  "devolución",
  "devolucion",
  "salario",
  "nómina",
  "nomina",
];

/** Palabras que indican dinero que SALE (solo se usan para desempatar). */
const EXPENSE_HINTS = [
  "compra",
  "pago",
  "pagar",
  "débito",
  "debito",
  "retiro",
  "cargo",
  "factura",
  "suscripción",
  "suscripcion",
  "consumo",
  "transferiste",
  "enviaste",
];

/** Normaliza para comparar sin tildes ni mayúsculas. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Interpreta un token de dinero venga en formato colombiano o estadounidense.
 *
 * Los bancos no se ponen de acuerdo: Bancolombia escribe `$45.900` y
 * `$1.234.567,50`, mientras que BBVA o Bold usan `$15,000.00` y `$1,234,567.89`.
 * Leer el segundo como si fuera colombiano multiplica el monto por 1000.
 *
 * Regla: el **último** separador manda.
 *  - Si le siguen 3 dígitos y todos los grupos son de 3 → es separador de
 *    miles (`15,000` → 15000, `12.000` → 12000).
 *  - Si le siguen 1 o 2 dígitos → es decimal y el resto son miles
 *    (`12.000,50` → 12000.5, `15,000.00` → 15000).
 */
export function parseMoneyToken(raw: string): number {
  const token = raw.replace(/[^\d.,]/g, "");
  if (!token) return NaN;

  const parts = token.split(/[.,]/);
  if (parts.length === 1) return Number(token);

  const lastSeparatorIndex = Math.max(token.lastIndexOf(","), token.lastIndexOf("."));
  const digitsAfterLast = token.length - lastSeparatorIndex - 1;
  const allGroupsOfThree = parts.slice(1).every((part) => part.length === 3);

  // Separador de miles: "15,000", "1.234.567".
  if (digitsAfterLast === 3 && allGroupsOfThree) {
    return Number(parts.join(""));
  }

  // Decimal en el último separador; el resto son miles.
  const whole = parts.slice(0, -1).join("");
  const decimals = parts[parts.length - 1];
  return Number(`${whole}.${decimals}`);
}

/**
 * Busca el monto en el texto.
 *
 * Estrategia en dos pasadas:
 *  1. Candidatos con símbolo de moneda (`$45.900`, `COP 45.900`): máxima
 *     prioridad, porque el banco marca así el valor de la operación.
 *  2. Si no hay, cualquier número con separadores de miles o decimales.
 *
 * En ambos casos se descartan valores absurdos (0, negativos, > 1e12) y se
 * elige el mayor: en un SMS la cifra de la operación suele ser la más grande,
 * mientras que horas, cuotas y números de referencia son menores.
 */
export function extractAmount(text: string): number | null {
  const candidates: number[] = [];

  // El token puede arrastrar la coma o el punto de la frase
  // ("$45.900, referencia"): se recortan antes de interpretarlo.
  const clean = (token: string) => token.replace(/[.,]+$/, "");

  const currencyPattern = /(?:\$|\bCOP\b|\bpesos?\b)\s*([\d][\d.,]*)/gi;
  for (const match of text.matchAll(currencyPattern)) {
    const value = parseMoneyToken(clean(match[1]));
    if (Number.isFinite(value) && value > 0 && value < 1e12) candidates.push(value);
  }

  if (candidates.length === 0) {
    // Números sueltos, pero solo con separadores de miles/decimales o de 3+
    // dígitos: así se evitan cuotas ("3"), meses ("11") y similares.
    const loosePattern = /\b(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2}|\d{3,})\b/g;
    for (const match of text.matchAll(loosePattern)) {
      const value = parseMoneyToken(clean(match[1]));
      if (Number.isFinite(value) && value > 0 && value < 1e12) candidates.push(value);
    }
  }

  if (candidates.length === 0) return null;
  return round2(Math.max(...candidates));
}

/** Decide el tipo por palabras; si no hay señal, es gasto. */
export function detectType(text: string): { type: "expense" | "income"; explicit: boolean } {
  const n = normalize(text);

  const income = INCOME_HINTS.some((hint) => n.includes(hint));
  if (income) return { type: "income", explicit: true };

  const expense = EXPENSE_HINTS.some((hint) => n.includes(hint));
  if (expense) return { type: "expense", explicit: true };

  return { type: "expense", explicit: false };
}

/**
 * ¿El candidato parece de verdad el nombre de un comercio?
 *
 * Los SMS reales traen frases como "Full Equipo tienes plan celular" o
 * "cajero automatico es 276000": si se aceptan tal cual, la bandeja muestra
 * oraciones como si fueran el nombre del negocio. Es preferible dejar el
 * comercio vacío (la UI cae al texto del mensaje) que mostrar una frase.
 */
function isLikelyMerchant(candidate: string): boolean {
  if (candidate.length < 3 || candidate.length > 30) return false;
  if (!/[A-Za-zÁÉÍÓÚÑÜ]/.test(candidate)) return false;

  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length > 5) return false;

  // Los bancos escriben el comercio en mayúsculas o con mayúscula inicial.
  if (!/^[A-ZÁÉÍÓÚÑÜ0-9]/.test(words[0])) return false;

  // Nada de verbos ni fórmulas de aviso.
  const banned =
    /\b(tienes|tiene|puedes|puede|usted|es|son|sera|será|favor|gracias|ahora|hoy|desde|para|debes|debe|caduca|vence)\b/i;
  if (banned.test(candidate)) return false;

  return true;
}

/** Intenta sacar el comercio del texto ("... en EXITO PRADO ..."). */
export function extractMerchant(text: string): string | null {
  // "en <COMERCIO>" — corta en punto, coma, punto y coma o salto de línea.
  const patterns = [
    /\ben\s+([A-Za-zÁÉÍÓÚÑÜ0-9][A-Za-zÁÉÍÓÚÑÜ0-9\s.&'-]{2,40})/i,
    /\b(?:comercio|establecimiento|destino)\s*:?\s*([A-Za-zÁÉÍÓÚÑÜ0-9][A-Za-zÁÉÍÓÚÑÜ0-9\s.&'-]{2,40})/i,
  ];

  // El comercio termina donde empieza la frase siguiente
  // ("EXITO PRADO con tu T.Debito" → "EXITO PRADO").
  const stopWords =
    /\s+(?:con|tu|su|sus|para|desde|ref|referencia|autorizaci[oó]n|aprobaci[oó]n|el|la|los|las|del|de)\s+/i;

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;

    let candidate = match[1].replace(/\s+/g, " ").trim();
    candidate = candidate.split(stopWords)[0].replace(/[.,;\s]+$/, "").trim();

    if (isLikelyMerchant(candidate)) {
      return candidate;
    }
  }

  return null;
}

/** Fechas `dd/mm`, `dd/mm/yyyy`, `dd-mm-yyyy` o `yyyy-mm-dd`. */
export function extractDate(text: string, reference: Date = new Date()): string | null {
  const pad = (n: number) => String(n).padStart(2, "0");

  // yyyy-mm-dd
  const iso = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    const [, y, m, d] = iso;
    const month = Number(m);
    const day = Number(d);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${pad(month)}-${pad(day)}`;
    }
  }

  // dd/mm[/yyyy] o dd-mm[-yyyy]
  const local = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](20\d{2}|\d{2}))?\b/);
  if (local) {
    const day = Number(local[1]);
    const month = Number(local[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      let year = reference.getFullYear();
      if (local[3]) {
        year = local[3].length === 2 ? 2000 + Number(local[3]) : Number(local[3]);
      }
      return `${year}-${pad(month)}-${pad(day)}`;
    }
  }

  return null;
}

/** Lee una captura completa. */
export function parseCapture(rawText: string, reference: Date = new Date()): ParsedCapture {
  const text = (rawText || "").trim();

  const amount = extractAmount(text);
  const { type, explicit } = detectType(text);
  const merchant = extractMerchant(text);
  const date = extractDate(text, reference);

  const signals = {
    amount: amount !== null,
    type: explicit,
    merchant: merchant !== null,
    date: date !== null,
  };

  // Sin monto no hay nada que registrar: la confianza se queda baja.
  let confidence = 0;
  if (signals.amount) confidence += 0.5;
  if (signals.type) confidence += 0.2;
  if (signals.merchant) confidence += 0.2;
  if (signals.date) confidence += 0.1;

  return {
    amount,
    type,
    merchant,
    date,
    confidence: round2(confidence),
    signals,
  };
}
