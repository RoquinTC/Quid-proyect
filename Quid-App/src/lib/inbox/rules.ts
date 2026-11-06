/**
 * F-36 · Reglas de clasificación de capturas.
 *
 * Con la bandeja llena, el trabajo ya no es capturar sino clasificar una por
 * una. Una regla dice: "si el mensaje contiene X, propone categoría Y, cuenta
 * Z y tipo T". Así el arriendo, la tarjeta o el banco de siempre se resuelven
 * solos y solo se revisa lo nuevo.
 *
 * Diseño:
 *  - La comparación ignora mayúsculas y tildes ("cajero" encuentra "CAJERO"
 *    y "Cajéro"): los bancos escriben de todas las formas.
 *  - Gana la primera regla por `priority` ascendente; a igual prioridad, la
 *    que tenga el texto más específico (más largo), para que "TRANSFERENCIA
 *    LULO" le gane a "TRANSFERENCIA".
 *  - Una regla solo **propone**: el usuario sigue viendo y pudiendo cambiar
 *    el formulario. Nada se registra automáticamente.
 */

export type RuleLike = {
  id: string;
  name: string;
  contains: string;
  category: string | null;
  subCategory: string | null;
  accountId: string | null;
  type: string | null;
  priority: number;
  active: boolean;
};

export type AppliedRule = {
  id: string;
  name: string;
  contains: string;
  category: string | null;
  subCategory: string | null;
  accountId: string | null;
  type: string | null;
};

/** Normaliza para comparar: minúsculas y sin tildes. */
export function normalizeForMatch(text: string): string {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Busca la regla que aplica a un texto.
 * @returns la regla ganadora o `null` si ninguna coincide.
 */
export function findRuleFor(text: string, rules: RuleLike[]): AppliedRule | null {
  const haystack = normalizeForMatch(text);
  if (!haystack) return null;

  const matches = rules
    .filter((rule) => rule.active)
    .filter((rule) => {
      const needle = normalizeForMatch(rule.contains);
      return needle.length > 0 && haystack.includes(needle);
    });

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    // 1) prioridad menor primero
    if (a.priority !== b.priority) return a.priority - b.priority;
    // 2) texto más específico primero
    const lengthDiff = normalizeForMatch(b.contains).length - normalizeForMatch(a.contains).length;
    if (lengthDiff !== 0) return lengthDiff;
    // 3) orden estable por nombre para no depender del orden de la base
    return a.name.localeCompare(b.name);
  });

  const winner = matches[0];
  return {
    id: winner.id,
    name: winner.name,
    contains: winner.contains,
    category: winner.category,
    subCategory: winner.subCategory,
    accountId: winner.accountId,
    type: winner.type,
  };
}

/**
 * Sugiere un nombre de regla a partir de una captura: usa el comercio
 * detectado o las primeras palabras del mensaje.
 */
export function suggestRuleName(merchant: string | null, rawText: string): string {
  const base = (merchant || rawText || "").replace(/\s+/g, " ").trim();
  if (!base) return "Regla";
  return base.length > 40 ? `${base.slice(0, 37)}…` : base;
}

/**
 * Propone el texto a buscar. Si hay comercio, es el comercio; si no, las
 * palabras más "identificativas" del mensaje (sin números ni fechas).
 */
export function suggestRuleContains(merchant: string | null, rawText: string): string {
  if (merchant && merchant.trim().length >= 3) return merchant.trim();

  const words = (rawText || "")
    .replace(/[\d$.,#*:;()/-]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 4)
    .slice(0, 3);

  return words.join(" ") || (rawText || "").slice(0, 30);
}
