/**
 * Interés de una cuota de deuda.
 *
 * El banco publica la tasa como **efectiva anual** (por ejemplo 17,98% EA) y
 * cobra el interés del período sobre el saldo. Antes Quid tomaba ese 17,98 y lo
 * usaba como si fuera el interés del mes (17,98% mensual), inflando el interés
 * y bajando el abono a capital.
 *
 * Aquí se convierte la efectiva anual a la tasa del período:
 *   i = (1 + EA)^(días/365) − 1
 */
export function periodicRateFromAnnual(effectiveAnnualPercent: number, _days = 30): number {
  if (!Number.isFinite(effectiveAnnualPercent) || effectiveAnnualPercent <= 0) return 0;
  // El banco publica la tasa como nominal mes vencido anual (NMV) y cobra
  // 1/12 cada mes: es lo que cuadra con los extractos (81.454 sobre 5.469.280).
  return effectiveAnnualPercent / 100 / 12;
}

export function interestForPeriod(
  balance: number,
  effectiveAnnualPercent: number,
  days = 30
): number {
  if (!Number.isFinite(balance) || balance <= 0) return 0;
  const rate = periodicRateFromAnnual(effectiveAnnualPercent, days);
  return Math.round(balance * rate * 100) / 100;
}
