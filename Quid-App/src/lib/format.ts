/**
 * Currency formatting utilities for Quid.
 *
 * NOTE: The primary formatCurrency is in api.ts (used by most components).
 * This file provides alternative formats and is the canonical location for
 * formatCurrencyShort and formatCurrencyNoDecimals.
 */

/**
 * Format a number as Colombian pesos with NO decimal places.
 * Use this for compact displays where cents are not relevant (COP rarely uses cents).
 * Defensive: NaN/null/undefined → "$0"
 */
export function formatCurrencyNoDecimals(value: number | string | null | undefined): string {
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return '$0';
  }
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

/**
 * Shortened currency format (e.g., $1.5M, $800K)
 * Defensive: NaN/null/undefined → "$0"
 */
export function formatCurrencyShort(value: number | string | null | undefined): string {
  const num = Number(value);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return '$0';
  }
  if (num >= 1_000_000) {
    return `$${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `$${(num / 1_000).toFixed(0)}K`;
  }
  return `$${num}`;
}

/**
 * Format a number as Colombian pesos.
 * Shows 0 decimals for whole numbers, 2 for fractional.
 * Defensive: NaN/null/undefined → "$0"
 *
 * NOTE: Most components should use formatCurrency from @/lib/api instead,
 * which always shows 2 decimals. This version is kept for components
 * that prefer the no-decimals-on-whole-numbers format.
 */
export function formatCurrency(value: number | string | null | undefined): string {
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
  }).format(num);
}
