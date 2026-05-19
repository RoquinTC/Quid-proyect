/**
 * Colombian Holiday Calculator
 * Calculates all public holidays for Colombia for a given year.
 * 
 * Colombian holidays follow "Ley de Emiliani" - some holidays are moved
 * to the following Monday if they don't fall on Monday.
 */

/**
 * Get the Easter date for a given year using the Anonymous Gregorian algorithm
 */
function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Move a date to the next Monday if it's not already Monday (Ley de Emiliani)
 */
function moveToMonday(date: Date): Date {
  const dayOfWeek = date.getDay();
  if (dayOfWeek === 1) return date; // Already Monday
  const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
  return addDays(date, daysUntilMonday);
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Get all Colombian public holidays for a given year
 * Returns a Map of date string (YYYY-MM-DD) -> holiday name
 */
export function getColombianHolidays(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  const easter = getEasterDate(year);

  // Fixed holidays (never moved)
  holidays.set(formatDate(new Date(year, 0, 1)), "Año Nuevo");
  holidays.set(formatDate(new Date(year, 4, 1)), "Día del Trabajo");
  holidays.set(formatDate(new Date(year, 6, 20)), "Grito de Independencia");
  holidays.set(formatDate(new Date(year, 7, 7)), "Batalla de Boyacá");
  holidays.set(formatDate(new Date(year, 11, 8)), "Inmaculada Concepción");
  holidays.set(formatDate(new Date(year, 11, 25)), "Navidad");

  // "Embridadas" holidays (moved to Monday via Ley de Emiliani)
  holidays.set(formatDate(moveToMonday(new Date(year, 0, 6))), "Reyes Magos");
  holidays.set(formatDate(moveToMonday(new Date(year, 2, 19))), "San José");
  holidays.set(formatDate(moveToMonday(new Date(year, 5, 29))), "San Pedro y San Pablo");
  holidays.set(formatDate(moveToMonday(new Date(year, 7, 15))), "Asunción de la Virgen");
  holidays.set(formatDate(moveToMonday(new Date(year, 9, 12))), "Día de la Raza");
  holidays.set(formatDate(moveToMonday(new Date(year, 10, 1))), "Todos los Santos");
  holidays.set(formatDate(moveToMonday(new Date(year, 10, 11))), "Independencia de Cartagena");

  // Easter-dependent holidays
  holidays.set(formatDate(addDays(easter, -3)), "Jueves Santo");
  holidays.set(formatDate(addDays(easter, -2)), "Viernes Santo");
  holidays.set(formatDate(moveToMonday(addDays(easter, 60))), "Corpus Christi");
  holidays.set(formatDate(moveToMonday(addDays(easter, 68))), "Sagrado Corazón");

  return holidays;
}

/**
 * Format date as YYYY-MM-DD
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Check if a specific date is a Colombian holiday
 */
export function isColombianHoliday(date: Date): boolean {
  const holidays = getColombianHolidays(date.getFullYear());
  return holidays.has(formatDate(date));
}

/**
 * Check if a date is a business day (not weekend, not holiday)
 */
export function isBusinessDay(date: Date, respectHolidays: boolean = true): boolean {
  if (isWeekend(date)) return false;
  if (respectHolidays && isColombianHoliday(date)) return false;
  return true;
}

/**
 * Get the previous business day from a given date
 * Used for: "si el día 10 es festivo o fin de semana, el pago se recibe el día hábil anterior"
 */
export function getPreviousBusinessDay(date: Date, respectHolidays: boolean = true): Date {
  let current = new Date(date);
  while (!isBusinessDay(current, respectHolidays)) {
    current = addDays(current, -1);
  }
  return current;
}

/**
 * Get the next business day from a given date
 * Used for: "si el día de pago cae fin de semana/festivo, pagar el día hábil siguiente"
 */
export function getNextBusinessDay(date: Date, respectHolidays: boolean = true): Date {
  let current = new Date(date);
  while (!isBusinessDay(current, respectHolidays)) {
    current = addDays(current, 1);
  }
  return current;
}

/**
 * Adjust a date to a business day based on direction preference.
 * - "before": move to the previous business day
 * - "after": move to the next business day
 * If the date is already a business day, return it unchanged.
 */
export function adjustToBusinessDay(
  date: Date,
  direction: "before" | "after" = "before",
  respectHolidays: boolean = true
): Date {
  if (isBusinessDay(date, respectHolidays)) return date;
  if (direction === "before") {
    return getPreviousBusinessDay(date, respectHolidays);
  }
  return getNextBusinessDay(date, respectHolidays);
}

/**
 * Clamp a day to the maximum days in a given month.
 * E.g., day 31 in February becomes 28 (or 29).
 */
export function clampDayToMonth(year: number, month: number, day: number): number {
  const maxDays = new Date(year, month + 1, 0).getDate();
  return Math.min(day, maxDays);
}

/**
 * Calculate the actual cutoff date for a given month and cutoff day.
 * 
 * Example: If cutoffDay is 10 and the 10th is a Saturday,
 * the actual cutoff is Friday the 8th (previous business day).
 * 
 * @param year - Year
 * @param month - Month (0-11, JavaScript convention)
 * @param cutoffDay - Day of month configured as cutoff (1-31)
 * @param respectHolidays - Whether to consider holidays
 * @returns The actual cutoff date (adjusted for business days)
 */
export function calculateCutoffDate(
  year: number,
  month: number,
  cutoffDay: number,
  respectHolidays: boolean = true
): Date {
  // Handle months with fewer days than cutoffDay
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const actualDay = Math.min(cutoffDay, daysInMonth);
  
  const targetDate = new Date(year, month, actualDay);
  
  // If the target date is not a business day, move to previous business day
  if (!isBusinessDay(targetDate, respectHolidays)) {
    return getPreviousBusinessDay(targetDate, respectHolidays);
  }
  
  return targetDate;
}

/**
 * Calculate the current budget period based on cutoff day.
 * 
 * The period starts on the cutoff day of one month and ends the day before
 * the cutoff day of the next month (adjusted for business days).
 * 
 * @param cutoffDay - Day of month configured as cutoff (1-31)
 * @param respectHolidays - Whether to consider holidays
 * @param referenceDate - Date to calculate period for (defaults to now)
 * @returns { start: Date, end: Date } of the current period
 */
export function getCurrentBudgetPeriod(
  cutoffDay: number,
  respectHolidays: boolean = true,
  referenceDate: Date = new Date()
): { start: Date; end: Date } {
  const now = referenceDate;
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();

  // Calculate this month's cutoff
  const thisMonthCutoff = calculateCutoffDate(year, month, cutoffDay, respectHolidays);
  
  // Calculate previous month's cutoff
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const prevMonthCutoff = calculateCutoffDate(prevYear, prevMonth, cutoffDay, respectHolidays);
  
  // Calculate next month's cutoff
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonthCutoff = calculateCutoffDate(nextYear, nextMonth, cutoffDay, respectHolidays);

  // Determine which period we're in
  if (now >= thisMonthCutoff) {
    // We're in the period: thisMonthCutoff -> day before nextMonthCutoff
    return {
      start: thisMonthCutoff,
      end: addDays(nextMonthCutoff, -1),
    };
  } else {
    // We're in the period: prevMonthCutoff -> day before thisMonthCutoff
    return {
      start: prevMonthCutoff,
      end: addDays(thisMonthCutoff, -1),
    };
  }
}

/**
 * Check if budgets need to be reset based on the last reset date
 * and the current budget period.
 */
export function needsBudgetReset(
  lastResetDate: Date | null,
  currentPeriodStart: Date
): boolean {
  if (!lastResetDate) return true;
  return lastResetDate < currentPeriodStart;
}
