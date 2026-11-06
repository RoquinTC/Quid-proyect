/**
 * F-01 · Clasificador de capturas.
 *
 * El parser (`parse.ts`) extrae *qué* dice el mensaje (monto, fecha, comercio).
 * Este módulo decide **si el mensaje es un movimiento y de qué tipo**.
 *
 * Los SMS de un banco mezclan cuatro cosas muy distintas, y tratarlas igual
 * llena la bandeja de basura:
 *
 *   1. Movimientos reales (compra, retiro, transferencia, ingreso)
 *   2. Claves temporales / códigos de verificación  → NO son movimientos
 *   3. Publicidad y promociones                     → NO son movimientos
 *   4. Intentos de estafa                           → NO son movimientos
 *
 * Sin esta capa, una clave dinámica de 6 dígitos se registra como un gasto.
 *
 * Los patrones salieron de SMS reales: "Su clave temporal para realizar el
 * retiro", "Su retiro sin tarjeta en Caj. Automat de ATH fue aprobado",
 * "Transferencia por Banca Movil $15,000.00 de Cta Aho #3601 a Cta Aho #190",
 * "BoldCF: Has recibido una transferencia", "Buscando celu? En Full Equipo
 * tienes plan celular ilimitado".
 *
 * Criterio: ante la duda se conserva el mensaje como movimiento (perder un
 * gasto real es peor que revisar uno de más), pero el ruido evidente se
 * descarta y se informa por qué.
 */

export type CaptureKind = "expense" | "income" | "transfer" | "noise";

export type NoiseReason = "otp" | "promo" | "scam";

export type Classification = {
  kind: CaptureKind;
  /** Explicación corta y legible, para mostrar en la bandeja. */
  reason: string;
  /** Solo cuando kind === "noise". */
  noiseReason?: NoiseReason;
  /** `true` si el retiro fue en cajero/ventanilla: el dinero pasó a efectivo. */
  cashWithdrawal?: boolean;
};

function norm(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * ¿El texto trae un enlace? Señal fuerte de publicidad o estafa.
 *
 * Se quitan antes las direcciones de correo: "facturas@movistar.co" parece un
 * dominio con `.co` y hacía que una factura legítima se descartara como
 * publicidad.
 */
function hasLink(text: string): boolean {
  const withoutEmails = text.replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, " ");
  return /https?:\/\/|www\.|\b\w+\.(com|co|net|org)\b|bit\.ly|t\.me\/|wa\.me\//i.test(withoutEmails);
}

/**
 * Claves temporales y códigos de verificación.
 *
 * Es lo primero que se evalúa: si el mensaje es una clave, nada más importa.
 * Un código de 6 dígitos no es un monto, y tratarlo como tal corrompe la
 * bandeja y los totales. Nótese que el SMS de la clave menciona "retiro" y
 * "cajero": si se evaluara el retiro primero, entraría como movimiento.
 */
const OTP_PATTERNS: RegExp[] = [
  /clave\s+(dinamica|temporal|de\s+un\s+solo\s+uso|virtual|de\s+seguridad)/,
  /codigo\s+(de\s+)?(verificacion|seguridad|confirmacion|activacion)/,
  /\botp\b/,
  /\btoken\b/,
  /no\s+(la|lo|las|los)\s+compartas?/,
  /nunca\s+(la|lo)\s+compartas?/,
  /tu\s+clave\s+(es|sera)\s*:?\s*\d/,
  /clave\s*:?\s*\d{4,8}\b/,
  /codigo\s*:?\s*\d{4,8}\b/,
  /clave\s+de\s+acceso/,
];

/** Retiro de efectivo: cajero, ventanilla o corresponsal. */
const CASH_PATTERNS: RegExp[] = [
  /\bretiraste\b/,
  /\bretiro\b/,
  /\bcajero\b/,
  /\bcaj\.?\s*automat/,
  /\bcorresponsal\b/,
  /\bventanilla\b/,
  /\bath\b/,
  /\bdispensador\b/,
];

/** Dinero que entra. */
const INCOME_PATTERNS: RegExp[] = [
  /\brecibiste\b/,
  /\bha(s)?\s+recibido\b/,
  /\brecibio\b/,
  /\bte\s+(transfirieron|lleg(o|aron))/,
  /\babono\b/,
  /\bconsignacion\b/,
  /\bdeposito\b/,
  /\bingreso\b/,
  /\bpago\s+recibido\b/,
  /\breembolso\b/,
  /\bdevolucion\b/,
  /\bsalario\b/,
  /\bnomina\b/,
];

/** Transferencias que salen o se mueven entre cuentas propias. */
const TRANSFER_OUT_PATTERNS: RegExp[] = [
  /\btransferiste\b/,
  /\benviaste\b/,
  /\bgiro\b/,
  /\btransferencia\s+(a|enviada|por\s+banca)/,
  /\bde\s+cta\b/,
  /\bde\s+cuenta\b.*\ba\s+cuenta\b/,
];

/** Compra o pago. */
const EXPENSE_PATTERNS: RegExp[] = [
  /\bcompraste\b/,
  /\bcompra\b/,
  /\bpagaste\b/,
  /\bpago\b/,
  /\bdebito\b/,
  /\bfactura\b/,
  /\bconsumo\b/,
  /\bcobro\b/,
  /\bsuscripcion\b/,
  /\brecargaste\b/,
  /\brecarga\b/,
  /\bseguro\b/,
  /\bcuota\b/,
];

/** Verbos que confirman que el mensaje reporta una operación. */
const MOVEMENT_VERBS: RegExp[] = [
  /\bcompraste\b/,
  /\bpagaste\b/,
  /\bretiraste\b/,
  /\brecibiste\b/,
  /\bha(s)?\s+recibido\b/,
  /\btransferiste\b/,
  /\benviaste\b/,
  /\brecargaste\b/,
  /\baprobad(o|a)\b/,
];

/** Publicidad y promociones. */
const PROMO_PATTERNS: RegExp[] = [
  /\bdescuento(s)?\b/,
  /\bpromocion(es)?\b/,
  /\baprovecha\b/,
  /\bexclusivo\s+para\s+ti\b/,
  /\bcompra\s+(ya|ahora)\b/,
  /\bte\s+esperamos\b/,
  /\bcondiciones\s+aplican\b/,
  /\bpremio\b/,
  /\bgana(ste|dor|dores)\b/,
  /\bsorteo\b/,
  /\bcashback\b/,
  /\bte\s+devuelva\b/,
  /\brebaja(s)?\b/,
  /\bbuscando\s+celu\b/,
  /\bplan\s+celular\b/,
  /\bcelular\s+ilimitado\b/,
  /\bconsulta\s+y\s+paga\b/,
];

/** Señales de estafa: urgencia, premio o exigencia de pago. */
const SCAM_PATTERNS: RegExp[] = [
  /\bhas\s+sido\s+seleccionado\b/,
  /\breclama(r)?\b/,
  /\bactualiza\s+tus\s+datos\b/,
  /\bverifica\s+tu\s+cuenta\b/,
  /\bcuenta\s+(suspendida|bloqueada)\b/,
  /\bsu\s+cuenta\s+(sera|fue)\s+(suspendida|bloqueada)\b/,
  /\bdebes\s+pagar\b/,
  /\burgente(mente)?\b/,
  /\bultimo\s+aviso\b/,
  /\bpremio\b/,
];

function matches(patterns: RegExp[], text: string): boolean {
  return patterns.some((re) => re.test(text));
}

/**
 * Clasifica un mensaje.
 *
 * Orden deliberado:
 *  1. Clave/código — gana sobre todo lo demás.
 *  2. Retiro en efectivo — antes que ingreso/gasto, porque el mensaje dice
 *     "retiro" y sin esta prioridad quedaría como gasto (y el dinero no se
 *     gastó: cambió de sitio).
 *  3. Operaciones con verbo claro.
 *  4. Estafa, publicidad y enlaces sueltos.
 *  5. Duda → gasto para revisar.
 */
export function classifyCapture(rawText: string): Classification {
  const text = norm(rawText || "");

  if (!text.trim()) {
    return { kind: "noise", reason: "Mensaje vacío", noiseReason: "otp" };
  }

  // 1. Claves y códigos: nunca son movimientos.
  if (matches(OTP_PATTERNS, text)) {
    return {
      kind: "noise",
      reason: "Clave o código de verificación, no es un movimiento",
      noiseReason: "otp",
    };
  }

  const hasMovementVerb = matches(MOVEMENT_VERBS, text);

  // 2. Retiro en efectivo (cajero/ventanilla): transferencia al bolsillo.
  if (matches(CASH_PATTERNS, text) && !matches(INCOME_PATTERNS, text)) {
    return {
      kind: "transfer",
      reason: "Retiro en efectivo: pasa de la cuenta al bolsillo",
      cashWithdrawal: true,
    };
  }

  // 3. Operaciones con verbo explícito.
  if (hasMovementVerb) {
    if (matches(INCOME_PATTERNS, text)) {
      return { kind: "income", reason: "Ingreso detectado" };
    }
    if (matches(TRANSFER_OUT_PATTERNS, text)) {
      return { kind: "transfer", reason: "Transferencia entre cuentas o a terceros" };
    }
    return { kind: "expense", reason: "Compra o pago" };
  }

  // 4. Estafa: exige pago o reclamación, normalmente con enlace.
  if (matches(SCAM_PATTERNS, text)) {
    return { kind: "noise", reason: "Parece un intento de estafa", noiseReason: "scam" };
  }

  // 5. Publicidad (con o sin enlace).
  if (matches(PROMO_PATTERNS, text)) {
    return { kind: "noise", reason: "Publicidad o promoción", noiseReason: "promo" };
  }

  // 6. Marcadores de operación sin verbo conjugado.
  if (matches(INCOME_PATTERNS, text)) {
    return { kind: "income", reason: "Ingreso detectado" };
  }
  if (matches(TRANSFER_OUT_PATTERNS, text)) {
    return { kind: "transfer", reason: "Transferencia entre cuentas" };
  }
  if (matches(EXPENSE_PATTERNS, text)) {
    return { kind: "expense", reason: "Compra o pago" };
  }

  // 7. Un enlace sin ningún marcador de operación es publicidad o engaño.
  // Va después de los marcadores para no descartar una factura con su enlace
  // de pago.
  if (hasLink(text)) {
    return {
      kind: "noise",
      reason: "Mensaje con enlace que no reporta una operación",
      noiseReason: "promo",
    };
  }

  // 8. Sin señal reconocible: se conserva, pero marcado para revisión.
  return { kind: "expense", reason: "No se reconoció el tipo; revísalo" };
}

/** ¿Este mensaje debe entrar a la bandeja? */
export function isMovement(classification: Classification): boolean {
  return classification.kind !== "noise";
}
