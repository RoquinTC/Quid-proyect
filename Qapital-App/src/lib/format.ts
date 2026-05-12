/**
 * Format a number as Colombian pesos.
 * Shows up to 2 decimal places when the value has fractional parts.
 *
 * Defensive: if the value is NaN, null, undefined, or a non-number
 * (e.g., a Prisma Decimal object that wasn't converted), it falls
 * back to 0 instead of showing "$ NaN".
 */
export function formatCurrency(value: number | string | null | undefined): string {
  // Coerce to number: handles strings, Prisma Decimal .toString(), null, undefined
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return formatCurrency(0);
  }
  const hasDecimals = num % 1 !== 0;
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: hasDecimals ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(num)
}

/**
 * Shortened currency format (e.g., $1.5M)
 */
export function formatCurrencyShort(value: number | string | null | undefined): string {
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return '$0';
  }
  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(0)}K`
  }
  return `$${num}`
}
