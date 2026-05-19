/**
 * Tests for currency formatting utilities
 */
import { describe, it, expect } from 'vitest';
import {
  formatCurrencyNoDecimals,
  formatCurrencyShort,
  formatCurrency,
} from '@/lib/format';

describe('formatCurrencyNoDecimals', () => {
  it('should format without decimal places', () => {
    const result = formatCurrencyNoDecimals(1_234_567);
    expect(result).toContain('1.234.567');
    expect(result).not.toMatch(/\,\d{2}$/); // No decimal portion
  });

  it('should handle NaN', () => {
    expect(formatCurrencyNoDecimals(NaN)).toBe('$0');
  });

  it('should handle null', () => {
    const result = formatCurrencyNoDecimals(null);
    // Locale may produce "$ 0" or "$0"
    expect(result).toContain('0');
  });

  it('should handle undefined', () => {
    expect(formatCurrencyNoDecimals(undefined)).toBe('$0');
  });

  it('should handle string numbers', () => {
    const result = formatCurrencyNoDecimals("100000");
    expect(result).toContain('100.000');
  });
});

describe('formatCurrencyShort', () => {
  it('should format millions with M suffix', () => {
    expect(formatCurrencyShort(1_500_000)).toBe('$1.5M');
    expect(formatCurrencyShort(2_000_000)).toBe('$2.0M');
  });

  it('should format thousands with K suffix', () => {
    expect(formatCurrencyShort(800_000)).toBe('$800K');
    expect(formatCurrencyShort(1_500)).toBe('$2K'); // Rounded
  });

  it('should format small numbers without suffix', () => {
    expect(formatCurrencyShort(500)).toBe('$500');
    expect(formatCurrencyShort(999)).toBe('$999');
  });

  it('should handle NaN', () => {
    expect(formatCurrencyShort(NaN)).toBe('$0');
  });

  it('should handle null', () => {
    expect(formatCurrencyShort(null)).toBe('$0');
  });

  it('should handle undefined', () => {
    expect(formatCurrencyShort(undefined)).toBe('$0');
  });
});

describe('formatCurrency (from format.ts)', () => {
  it('should format whole numbers without decimals', () => {
    const result = formatCurrency(1_000_000);
    // Whole number: 0 decimal places
    expect(result).toContain('1.000.000');
  });

  it('should format fractional numbers with 2 decimals', () => {
    const result = formatCurrency(1_000.5);
    expect(result).toContain('1.000,50');
  });

  it('should handle NaN', () => {
    const result = formatCurrency(NaN);
    expect(result).toContain('0');
  });

  it('should handle null', () => {
    const result = formatCurrency(null);
    expect(result).toContain('0');
  });
});
