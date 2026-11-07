/**
 * F-51b · Máscara de dinero para los campos de monto.
 *
 * Mientras se escribe, el valor se muestra con separador de miles y coma
 * decimal: "100" → 100, "1000" → 1.000, "10500,5" → 10.500,5.
 *
 * Reglas:
 *  - El punto es SIEMPRE separador de miles (lo pone la máscara).
 *  - La coma es el separador decimal y admite hasta 2 dígitos.
 *  - Solo se permite una coma.
 *  - Se recortan los ceros a la izquierda ("007" → 7) pero se respeta "0,5".
 *  - Una coma al final se conserva mientras se escribe ("1.000,").
 *
 * No interpreta el valor: de eso se encarga `parseMoneyToken` al guardar.
 */

/** Deja solo dígitos y una coma decimal. */
export function cleanAmountInput(raw: string): string {
  const onlyAllowed = (raw || "").replace(/[^\d,]/g, "");
  const firstComma = onlyAllowed.indexOf(",");
  if (firstComma === -1) return onlyAllowed;

  // Solo la primera coma cuenta; las demás se descartan.
  const whole = onlyAllowed.slice(0, firstComma);
  const decimals = onlyAllowed.slice(firstComma + 1).replace(/,/g, "").slice(0, 2);
  return `${whole},${decimals}`;
}

/** Agrupa la parte entera con puntos de mil. */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Aplica la máscara a lo que el usuario va escribiendo.
 * Devuelve el texto que debe mostrarse en el campo.
 */
export function maskAmountInput(raw: string): string {
  const cleaned = cleanAmountInput(raw);

  if (cleaned === "") return "";

  const [wholeRaw, decimalsRaw] = cleaned.split(",");
  const hasComma = cleaned.includes(",");

  // "0" se conserva porque el usuario puede estar escribiendo "0,5".
  let whole = wholeRaw.replace(/^0+(?=\d)/, "");
  if (whole === "") whole = "0";
  // Sin coma, "007" pasa a "7"; con coma, "0," se respeta.
  if (!hasComma && /^0+$/.test(whole)) whole = "0";

  const grouped = groupThousands(whole);
  return hasComma ? `${grouped},${decimalsRaw}` : grouped;
}

/** ¿El texto ya trae algún separador puesto por la máscara? */
export function hasAmountMask(raw: string): boolean {
  return /^\d{1,3}(\.\d{3})*(,\d{0,2})?$/.test(raw || "");
}
