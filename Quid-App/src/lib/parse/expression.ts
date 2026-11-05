/**
 * Evaluador de expresiones aritméticas para el campo "monto".
 *
 * Permite escribir cosas como:
 *   12000/3            → 4000        (dividir una cuenta entre 3)
 *   2500+1800           → 4300
 *   (1200+800)*2        → 4000
 *   45000*0.19          → 8550
 *
 * Reglas:
 *  - Operadores soportados: + - * / y paréntesis.
 *  - Sin `eval` ni `Function`: se tokeniza y se evalúa con descenso recursivo.
 *  - Interpreta números en formato colombiano: "12.000" = 12000, "12.000,50" = 12000.5.
 *  - Un número suelto se devuelve tal cual (no requiere ser una expresión).
 *  - Entrada vacía o inválida devuelve `{ ok: false }` con un motivo.
 *
 * El objetivo es que el usuario vea SIEMPRE el resultado antes de guardar
 * (la UI muestra un "= $X" cuando lo escrito no es un número plano), así una
 * mala interpretación del formato nunca pasa desapercibida.
 */

export type EvalOk = { ok: true; value: number; isExpression: boolean };
export type EvalErr = { ok: false; error: string; isExpression: boolean };
export type EvalResult = EvalOk | EvalErr;

const MAX_INPUT_LENGTH = 120;

/** Caracteres que consideramos "aritmética". El resto es un número plano. */
const OPERATOR_CHARS = ["+", "-", "*", "/", "(", ")"];

/**
 * ¿El texto parece una expresión (y no un monto plano)?
 * Se usa para decidir si mostramos el resultado calculado.
 */
export function looksLikeExpression(input: string): boolean {
  const s = (input ?? "").trim();
  if (!s) return false;
  // Un '-' inicial es un negativo, no una expresión.
  const withoutLeadingSign = s.startsWith("-") ? s.slice(1) : s;
  return OPERATOR_CHARS.some((c) => withoutLeadingSign.includes(c));
}

/**
 * Convierte un literal numérico en formato colombiano/latino a number.
 *
 * Casos:
 *   "12000"      → 12000
 *   "12.000"     → 12000      (punto = miles, 3 dígitos finales)
 *   "12.000,50"  → 12000.5    (punto = miles, coma = decimal)
 *   "12,50"      → 12.5
 *   "12.5"       → 12.5       (punto = decimal, no 3 dígitos finales)
 *   "1.234.567"  → 1234567
 */
export function parseAmountLiteral(raw: string): number {
  let s = (raw ?? "").trim().replace(/\s/g, "");
  if (!s) return NaN;

  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // El último separador que aparece es el decimal.
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(",", ".");
  } else if (hasDot) {
    const parts = s.split(".");
    if (parts.length > 2) {
      // Solo es válido como separador de miles si los grupos son 1-3 + 3+3...
      const validGroups =
        /^\d{1,3}$/.test(parts[0]) && parts.slice(1).every((p) => /^\d{3}$/.test(p));
      if (!validGroups) return NaN;
      s = parts.join("");
    } else if (parts[1].length === 3 && parts[0].length >= 1) {
      // "12.000" → miles (convención COP)
      s = parts.join("");
    }
    // si no, queda como decimal: "12.5"
  }

  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const value = Number(s);
  if (!Number.isFinite(value)) return NaN;
  return negative ? -value : value;
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" | "(" | ")" };

function tokenize(input: string): { ok: true; tokens: Token[] } | { ok: false; error: string } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];

    if (ch === " " || ch === "\t" || ch === "\u00A0") {
      i++;
      continue;
    }

    if ("+-*/()".includes(ch)) {
      tokens.push({ kind: "op", value: ch as "+" | "-" | "*" | "/" | "(" | ")" });
      i++;
      continue;
    }

    // Literal numérico: dígitos, puntos y comas.
    const start = i;
    while (i < input.length && /[\d.,]/.test(input[i])) i++;
    if (i === start) {
      return { ok: false, error: `Carácter no válido: "${ch}"` };
    }
    const literal = input.slice(start, i);
    const value = parseAmountLiteral(literal);
    if (Number.isNaN(value)) {
      return { ok: false, error: `Número no válido: "${literal}"` };
    }
    tokens.push({ kind: "num", value });
  }

  if (tokens.length === 0) return { ok: false, error: "Vacío" };
  return { ok: true, tokens };
}

/**
 * Parser de descenso recursivo.
 *
 *   expression := term (("+" | "-") term)*
 *   term       := factor (("*" | "/") factor)*
 *   factor     := ("+" | "-") factor | number | "(" expression ")"
 */
export function evaluateExpression(raw: string): EvalResult {
  const input = (raw ?? "").trim();
  const isExpression = looksLikeExpression(input);

  if (!input) return { ok: false, error: "Vacío", isExpression };
  if (input.length > MAX_INPUT_LENGTH) {
    return { ok: false, error: "Expresión demasiado larga", isExpression };
  }

  // Atajo: un número plano no pasa por el parser.
  if (!isExpression) {
    const plain = parseAmountLiteral(input);
    if (Number.isNaN(plain)) return { ok: false, error: "Número no válido", isExpression };
    return { ok: true, value: plain, isExpression: false };
  }

  const t = tokenize(input);
  if (!t.ok) return { ok: false, error: t.error, isExpression };

  const tokens = t.tokens;
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const eatOp = (ops: string[]): string | null => {
    const tk = peek();
    if (tk && tk.kind === "op" && ops.includes(tk.value)) {
      pos++;
      return tk.value;
    }
    return null;
  };

  // Se declara antes de usarse en parseFactor (recursión mutua).
  let parseExpression: () => number;

  const parseFactor = (): number => {
    const unary = eatOp(["+", "-"]);
    if (unary) {
      const v = parseFactor();
      return unary === "-" ? -v : v;
    }

    const tk = peek();
    if (!tk) throw new Error("Se esperaba un número");

    if (tk.kind === "num") {
      pos++;
      return tk.value;
    }

    if (tk.kind === "op" && tk.value === "(") {
      pos++;
      const v = parseExpression();
      const close = eatOp([")"]);
      if (!close) throw new Error("Falta cerrar el paréntesis");
      return v;
    }

    throw new Error(`Token inesperado: "${tk.value}"`);
  };

  const parseTerm = (): number => {
    let value = parseFactor();
    for (;;) {
      const op = eatOp(["*", "/"]);
      if (!op) return value;
      const rhs = parseFactor();
      if (op === "*") {
        value *= rhs;
      } else {
        if (rhs === 0) throw new Error("División por cero");
        value /= rhs;
      }
    }
  };

  parseExpression = (): number => {
    let value = parseTerm();
    for (;;) {
      const op = eatOp(["+", "-"]);
      if (!op) return value;
      const rhs = parseTerm();
      value = op === "+" ? value + rhs : value - rhs;
    }
  };

  try {
    const value = parseExpression();
    if (pos !== tokens.length) {
      return { ok: false, error: "Sobra un operador o número", isExpression };
    }
    if (!Number.isFinite(value)) {
      return { ok: false, error: "Resultado no válido", isExpression };
    }
    // Redondeo a 2 decimales para evitar 0.30000000000000004
    const rounded = Math.round(value * 100) / 100;
    return { ok: true, value: rounded, isExpression };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Expresión no válida",
      isExpression,
    };
  }
}
