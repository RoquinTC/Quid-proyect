/**
 * Día lógico de salud ("therapy day").
 *
 * ¿POR QUÉ EXISTE ESTO?
 *
 * Un paciente que toma su medicación a la 01:00 del martes está tomando, en la
 * práctica, la dosis del lunes. Si el día empieza a las 00:00, esa toma aparece
 * como "martes" y el lunes queda incumplido: se rompe la racha y la adherencia
 * miente.
 *
 * MyTherapy resuelve esto con un día lógico que empieza a las 04:00
 * (`TherapyDayUtils`: `toTherapyDay(dt) = (dt - 4h).date`). Quid lo adopta, pero
 * con la hora configurable por usuario (`UserSettings.therapyDayStartHour`).
 *
 * Este único concepto alimenta: "hoy", la ventana de gracia, el cierre de tomas
 * vencidas, las rachas y los reportes. Por eso vive en un solo archivo.
 */

/** Zona por defecto del proyecto (Colombia, UTC-05). */
export const DEFAULT_TIMEZONE = "America/Bogota";

/** Hora por defecto a la que empieza el día lógico. */
export const DEFAULT_THERAPY_DAY_START_HOUR = 4;

type DateParts = { year: number; month: number; day: number };

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partsFormatterCache.get(timeZone);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  partsFormatterCache.set(timeZone, formatter);
  return formatter;
}

/** Partes de calendario (año/mes/día) de un instante en una zona dada. */
export function calendarParts(date: Date, timeZone = DEFAULT_TIMEZONE): DateParts {
  const parts = partsFormatter(timeZone).formatToParts(date);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

/** `YYYY-MM-DD` de un instante en una zona dada. */
export function calendarDayString(date: Date, timeZone = DEFAULT_TIMEZONE): string {
  const { year, month, day } = calendarParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Día lógico al que pertenece un instante.
 *
 * Se obtiene restando `startHour` horas y tomando la fecha de calendario:
 * 01:30 del martes con startHour=4 → 21:30 del lunes → "lunes".
 */
export function therapyDayOf(
  date: Date,
  startHour = DEFAULT_THERAPY_DAY_START_HOUR,
  timeZone = DEFAULT_TIMEZONE,
): string {
  const shifted = new Date(date.getTime() - startHour * 60 * 60 * 1000);
  return calendarDayString(shifted, timeZone);
}

/**
 * Instante en el que empieza el día lógico `day` ("YYYY-MM-DD").
 *
 * Se construye como día de calendario `day T00:00` en la zona indicada y se le
 * suman `startHour` horas. Usa el offset real de la zona para ese día.
 */
export function therapyDayStart(
  day: string,
  startHour = DEFAULT_THERAPY_DAY_START_HOUR,
  timeZone = DEFAULT_TIMEZONE,
): Date {
  const [year, month, date] = day.split("-").map(Number);
  // Medianoche local de ese día expresada en UTC.
  const utcMidnight = Date.UTC(year, month - 1, date, 0, 0, 0, 0);
  const offset = timeZoneOffsetMs(new Date(utcMidnight), timeZone);
  return new Date(utcMidnight - offset + startHour * 60 * 60 * 1000);
}

/** Instante en el que termina el día lógico `day` (empieza el siguiente). */
export function therapyDayEnd(
  day: string,
  startHour = DEFAULT_THERAPY_DAY_START_HOUR,
  timeZone = DEFAULT_TIMEZONE,
): Date {
  return therapyDayStart(addDaysToDayString(day, 1), startHour, timeZone);
}

/** Desplazamiento (ms) entre la hora de pared de la zona y UTC para un instante. */
function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const read = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour") % 24,
    read("minute"),
    read("second"),
  );
  return asUtc - date.getTime();
}

/** Suma (o resta) días a una cadena `YYYY-MM-DD` sin cruzar zonas horarias. */
export function addDaysToDayString(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, date));
  base.setUTCDate(base.getUTCDate() + days);
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(
    base.getUTCDate(),
  ).padStart(2, "0")}`;
}

/** Diferencia en días de calendario entre dos cadenas `YYYY-MM-DD`. */
export function daysBetweenDayStrings(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** Día lógico actual. */
export function currentTherapyDay(
  startHour = DEFAULT_THERAPY_DAY_START_HOUR,
  timeZone = DEFAULT_TIMEZONE,
  now: Date = new Date(),
): string {
  return therapyDayOf(now, startHour, timeZone);
}

/**
 * Instante real de una hora de pared ("YYYY-MM-DD" + hh:mm) en una zona dada.
 *
 * Se corrige el offset dos veces porque en los cambios de horario de verano el
 * primer cálculo puede caer del lado equivocado del salto.
 */
export function zonedInstant(
  day: string,
  hour: number,
  minute: number,
  timeZone = DEFAULT_TIMEZONE,
): Date {
  const [year, month, date] = day.split("-").map(Number);
  const utcGuess = Date.UTC(year, month - 1, date, hour, minute, 0, 0);
  const firstOffset = timeZoneOffsetMs(new Date(utcGuess), timeZone);
  const secondOffset = timeZoneOffsetMs(new Date(utcGuess - firstOffset), timeZone);
  return new Date(utcGuess - secondOffset);
}

/** "HH:mm" (o "H:mm") → minutos desde medianoche. `null` si no es válido. */
export function parseTimeOfDay(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
