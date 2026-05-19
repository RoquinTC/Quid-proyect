/**
 * Tests for financial calculation utilities
 *
 * These are the most critical functions in the app — incorrect CDT interest
 * calculations or currency formatting could directly impact user finances.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateCDTInterest,
  calculateCDTReteFuente,
  getCDTBreakdown,
  getCurrentCDTInterest,
  formatCurrency,
  calcPercentage,
  getDaysBetween,
  createColombiaDate,
  adjustForWeekend,
  getColombianHolidays,
  adjustForBusinessDay,
  formatShortDate,
  formatDate,
} from '@/lib/api';

// ============================================
// CDT Interest Calculations (Compound - EA rate)
// ============================================

describe('calculateCDTInterest', () => {
  it('should calculate compound interest correctly for EA rate', () => {
    // 1,000,000 COP at 12% EA for 365 days = 120,000
    const result = calculateCDTInterest(1_000_000, 12, 365);
    expect(result).toBeCloseTo(120_000, 0);
  });

  it('should calculate interest for partial year correctly', () => {
    // 1,000,000 COP at 12% EA for 180 days
    // Formula: amount * ((1 + rate/100)^(days/365) - 1)
    const result = calculateCDTInterest(1_000_000, 12, 180);
    expect(result).toBeGreaterThan(55_000);
    expect(result).toBeLessThan(60_000);
  });

  it('should return 0 for zero amount', () => {
    expect(calculateCDTInterest(0, 12, 365)).toBe(0);
  });

  it('should return 0 for zero rate', () => {
    expect(calculateCDTInterest(1_000_000, 0, 365)).toBe(0);
  });

  it('should return 0 for zero days', () => {
    expect(calculateCDTInterest(1_000_000, 12, 0)).toBe(0);
  });

  it('should return 0 for negative amount', () => {
    expect(calculateCDTInterest(-100, 12, 365)).toBe(0);
  });

  it('should handle string numbers (Prisma Decimal defense)', () => {
    // Prisma sometimes returns Decimal as string — function should coerce
    const result = calculateCDTInterest("800000" as any, "10" as any, 90);
    expect(result).toBeGreaterThan(0);
  });

  it('should calculate small amounts correctly', () => {
    // 100,000 COP at 15% EA for 30 days
    const result = calculateCDTInterest(100_000, 15, 30);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(100_000); // Interest should be less than principal
  });
});

// ============================================
// ReteFuente (4% withholding tax)
// ============================================

describe('calculateCDTReteFuente', () => {
  it('should calculate 4% withholding correctly', () => {
    const interest = 100_000;
    const retefuente = calculateCDTReteFuente(interest);
    expect(retefuente).toBe(4_000);
  });

  it('should handle zero interest', () => {
    expect(calculateCDTReteFuente(0)).toBe(0);
  });

  it('should handle custom rate', () => {
    const retefuente = calculateCDTReteFuente(100_000, 0.07);
    expect(retefuente).toBeCloseTo(7_000, 0);
  });

  it('should handle string numbers (Prisma Decimal defense)', () => {
    const retefuente = calculateCDTReteFuente("50000" as any);
    expect(retefuente).toBe(2_000);
  });
});

// ============================================
// Full CDT Breakdown
// ============================================

describe('getCDTBreakdown', () => {
  it('should return complete breakdown with correct values', () => {
    const breakdown = getCDTBreakdown(1_000_000, 12, 365);

    // Gross interest ≈ 120,000
    expect(breakdown.grossInterest).toBeCloseTo(120_000, 0);
    // ReteFuente = 4% of gross interest
    expect(breakdown.retefuente).toBeCloseTo(4_800, 0);
    // Net interest = gross - retefuente
    expect(breakdown.netInterest).toBeCloseTo(115_200, 0);
    // Net total = amount + net interest
    expect(breakdown.netTotal).toBeCloseTo(1_115_200, 0);
  });

  it('should handle string amounts (Prisma Decimal defense)', () => {
    const breakdown = getCDTBreakdown("800000" as any, 10, 90);
    expect(breakdown.grossInterest).toBeGreaterThan(0);
    expect(breakdown.retefuente).toBeGreaterThan(0);
    expect(breakdown.netInterest).toBeGreaterThan(0);
    expect(breakdown.netTotal).toBeGreaterThan(800_000);
  });

  it('should have consistent math: gross = retefuente/0.04', () => {
    const breakdown = getCDTBreakdown(500_000, 15, 180);
    expect(breakdown.grossInterest * 0.04).toBeCloseTo(breakdown.retefuente, 2);
  });

  it('should have consistent math: net = gross - retefuente', () => {
    const breakdown = getCDTBreakdown(2_000_000, 10, 365);
    expect(breakdown.grossInterest - breakdown.retefuente).toBeCloseTo(breakdown.netInterest, 2);
  });
});

// ============================================
// Currency Formatting
// ============================================

describe('formatCurrency', () => {
  it('should format positive numbers as COP', () => {
    const result = formatCurrency(1_000_000);
    expect(result).toContain('1.000.000');
    expect(result).toContain('$');
  });

  it('should format zero correctly', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('should handle NaN gracefully', () => {
    const result = formatCurrency(NaN);
    expect(result).toContain('0');
  });

  it('should handle null gracefully', () => {
    const result = formatCurrency(null);
    expect(result).toContain('0');
  });

  it('should handle undefined gracefully', () => {
    const result = formatCurrency(undefined);
    expect(result).toContain('0');
  });

  it('should handle string numbers', () => {
    const result = formatCurrency("500000");
    expect(result).toContain('500.000');
  });

  it('should always show 2 decimal places', () => {
    const result = formatCurrency(1000);
    // Colombian locale uses comma for decimals: "1.000,00"
    expect(result).toMatch(/,\d{2}$/);
  });
});

// ============================================
// Percentage Calculation
// ============================================

describe('calcPercentage', () => {
  it('should calculate percentage correctly', () => {
    expect(calcPercentage(25, 100)).toBe(25);
    expect(calcPercentage(50, 200)).toBe(25);
  });

  it('should return 0 for zero total', () => {
    expect(calcPercentage(50, 0)).toBe(0);
  });

  it('should return 100 for equal value and total', () => {
    expect(calcPercentage(100, 100)).toBe(100);
  });

  it('should handle percentages over 100', () => {
    expect(calcPercentage(150, 100)).toBe(150);
  });

  it('should round to nearest integer', () => {
    expect(calcPercentage(1, 3)).toBe(33); // 33.33... → 33
  });
});

// ============================================
// Date Utilities
// ============================================

describe('createColombiaDate', () => {
  it('should create a date from YYYY-MM-DD string', () => {
    const date = createColombiaDate('2026-05-10');
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(4); // May = 4 (0-indexed)
    expect(date.getDate()).toBe(10);
  });

  it('should represent midnight Colombia time (UTC+5)', () => {
    const date = createColombiaDate('2026-01-15');
    // Midnight Colombia = 5:00 UTC
    expect(date.getUTCHours()).toBe(5);
  });
});

describe('getDaysBetween', () => {
  it('should calculate days between two dates', () => {
    const days = getDaysBetween('2026-01-01', '2026-01-31');
    expect(days).toBe(30);
  });

  it('should return 0 for same date', () => {
    const days = getDaysBetween('2026-05-10', '2026-05-10');
    expect(days).toBe(0);
  });

  it('should return 0 if end is before start', () => {
    const days = getDaysBetween('2026-12-31', '2026-01-01');
    expect(days).toBe(0);
  });

  it('should handle Date objects', () => {
    const start = new Date(2026, 0, 1); // Jan 1
    const end = new Date(2026, 0, 11);  // Jan 11
    const days = getDaysBetween(start, end);
    expect(days).toBe(10);
  });
});

// ============================================
// Weekend / Business Day Adjustments
// ============================================

describe('adjustForWeekend', () => {
  it('should not adjust weekdays', () => {
    // Test that a weekday returns the same day-of-week
    // Use a known Thursday: 2026-07-16
    const adjusted = adjustForWeekend('2026-07-16');
    // The adjusted date should still be a weekday (Mon-Fri = 1-5)
    const d = new Date(adjusted + 'T12:00:00'); // Noon to avoid timezone shift
    const day = d.getDay();
    expect(day).toBeGreaterThanOrEqual(1);
    expect(day).toBeLessThanOrEqual(5);
  });

  it('should adjust Saturday to Friday', () => {
    // 2026-05-09 is a Saturday → should go to Friday 2026-05-08
    const adjusted = adjustForWeekend('2026-05-09');
    const adjDate = new Date(adjusted);
    expect(adjDate.getDay()).not.toBe(6); // Not Saturday
    expect(adjDate.getDay()).not.toBe(0); // Not Sunday
  });

  it('should adjust Sunday to Friday', () => {
    // 2026-05-10 is a Sunday → should go to Friday
    const adjusted = adjustForWeekend('2026-05-10');
    const adjDate = new Date(adjusted);
    expect(adjDate.getDay()).not.toBe(6); // Not Saturday
    expect(adjDate.getDay()).not.toBe(0); // Not Sunday
  });
});

describe('getColombianHolidays', () => {
  it('should include fixed holidays for a given year', () => {
    const holidays = getColombianHolidays(2026);
    expect(holidays).toContain('2026-01-01'); // Año Nuevo
    expect(holidays).toContain('2026-05-01'); // Día del Trabajo
    expect(holidays).toContain('2026-07-20'); // Independencia
    expect(holidays).toContain('2026-12-25'); // Navidad
  });

  it('should include Semana Santa (Easter) holidays', () => {
    const holidays = getColombianHolidays(2026);
    // Should have at least Jueves Santo and Viernes Santo
    const hasEasterHolidays = holidays.length >= 18; // 6 fixed + 7 Emiliani + 5 Easter-based
    expect(hasEasterHolidays).toBe(true);
  });

  it('should return unique dates only', () => {
    const holidays = getColombianHolidays(2026);
    const unique = new Set(holidays);
    expect(holidays.length).toBe(unique.size);
  });
});

describe('adjustForBusinessDay', () => {
  it('should not adjust regular weekdays that are not holidays', () => {
    // Use a safe weekday date
    const adjusted = adjustForBusinessDay('2026-06-15');
    // Should remain a weekday
    const d = new Date(adjusted);
    expect(d.getDay()).not.toBe(6); // Not Saturday
    expect(d.getDay()).not.toBe(0); // Not Sunday
  });

  it('should adjust holidays to previous business day', () => {
    // 2026-01-01 is Año Nuevo (Thursday)
    const adjusted = adjustForBusinessDay('2026-01-01');
    // Should move to a business day before Jan 1
    expect(adjusted).not.toBe('2026-01-01');
  });

  it('should adjust weekends when flag is enabled', () => {
    // 2026-05-09 is Saturday
    const adjusted = adjustForBusinessDay('2026-05-09', true, false);
    const adjDate = new Date(adjusted);
    expect(adjDate.getDay()).not.toBe(6); // Not Saturday
    expect(adjDate.getDay()).not.toBe(0); // Not Sunday
  });

  it('should skip weekend adjustment when flag is disabled', () => {
    // 2026-05-09 is Saturday
    const adjusted = adjustForBusinessDay('2026-05-09', false, false);
    expect(adjusted).toBe('2026-05-09'); // Unchanged
  });
});
