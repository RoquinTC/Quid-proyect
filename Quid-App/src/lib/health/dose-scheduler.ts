/**
 * Generador de ocurrencias (las "tomas" concretas de un tratamiento).
 *
 * Reglas verificadas en MyTherapy (`GetSchedulerOccurrencesUseCaseImpl`) que se
 * adoptan aquí:
 *   1. La recurrencia se ancla en `startDate` (nunca en "hoy").
 *   2. `EVERY_X_DAYS` = día 0 del ciclo `(daysActive + daysPaused)`.
 *   3. Mensual usa `min(díaInicio, últimoDíaDelMes)` para que el 31 no se pierda.
 *   4. El bitmask de días es POR BLOQUE HORARIO, no por plan.
 *   5. La generación es idempotente por `(medicationId, scheduledAt)`.
 *   6. Los overrides por fecha (futuro) se aplican AL FINAL, nunca durante.
 *
 * Este módulo no toca la base de datos: recibe un `Medication` y devuelve
 * ocurrencias planificadas. La persistencia vive en `dose-actions.ts`.
 */

import {
  DEFAULT_TIMEZONE,
  addDaysToDayString,
  currentTherapyDay,
  daysBetweenDayStrings,
  parseTimeOfDay,
  zonedInstant,
} from "./therapy-day";

/** Forma mínima de `Medication` que necesita el generador. */
export interface SchedulableMedication {
  id: string;
  frequency?: string | null;
  customSchedule?: string | null;
  reminderTimes?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  createdAt?: string | Date | null;
  doseQuantity?: number | null;
  isActive?: boolean | null;
  reminderEnabled?: boolean | null;
}

export interface PlannedOccurrence {
  medicationId: string;
  scheduledAt: Date;
  scheduledDay: string;
  plannedDose: number;
  timezone: string;
}

/** Excepción puntual sobre un día concreto (no muta la recurrencia). */
export interface DoseOverrideInput {
  day: string;
  type: "modify_time" | "modify_dose" | "skip_day" | string;
  payload?: { times?: string[]; dose?: number } | null;
}

type OverrideIndex = Map<string, DoseOverrideInput[]>;

function indexOverrides(overrides?: DoseOverrideInput[] | null): OverrideIndex {
  const index: OverrideIndex = new Map();
  for (const override of overrides ?? []) {
    const list = index.get(override.day) ?? [];
    list.push(override);
    index.set(override.day, list);
  }
  return index;
}

/** Horas efectivas de un día, ya con el override de hora aplicado. */
function timesForDay(
  medication: SchedulableMedication,
  dayOverrides: DoseOverrideInput[] | undefined,
  fallback: string[],
): string[] {
  const timeOverride = dayOverrides?.find((entry) => entry.type === "modify_time");
  const times = timeOverride?.payload?.times;
  if (Array.isArray(times) && times.length > 0) {
    const valid = times
      .map((value) => (parseTimeOfDay(value) == null ? null : value))
      .filter((value): value is string => value !== null);
    if (valid.length > 0) return Array.from(new Set(valid));
  }
  return fallback;
}

/** Dosis efectiva de un día, ya con el override de dosis aplicado. */
function doseForDay(
  dayOverrides: DoseOverrideInput[] | undefined,
  fallback: number,
): number {
  const doseOverride = dayOverrides?.find((entry) => entry.type === "modify_dose");
  const dose = Number(doseOverride?.payload?.dose);
  return Number.isFinite(dose) && dose > 0 ? dose : fallback;
}

type CustomSchedule = {
  type?: string;
  everyDays?: number;
  daysOfWeek?: number[];
  daysActive?: number;
  daysPaused?: number;
  monthlyDay?: number;
  times?: string[];
};

/** Horas por defecto si el medicamento no declara ninguna. */
export const DEFAULT_TIMES_OF_DAY = ["08:00"];

export function parseCustomSchedule(value?: string | null): CustomSchedule | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as CustomSchedule;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** Horas de toma declaradas ("HH:mm"), saneadas y ordenadas. */
export function timesOfDayFor(medication: SchedulableMedication): string[] {
  const custom = parseCustomSchedule(medication.customSchedule);
  const candidates: string[] = [];

  if (medication.reminderTimes) {
    try {
      const parsed = JSON.parse(medication.reminderTimes);
      if (Array.isArray(parsed)) candidates.push(...parsed.filter((v) => typeof v === "string"));
    } catch {
      // reminderTimes no es JSON: se ignora en vez de romper el agendado.
    }
  }
  if (custom?.times?.length) candidates.push(...custom.times);

  const valid = candidates
    .map((value) => {
      const minutes = parseTimeOfDay(value);
      return minutes == null ? null : { value, minutes };
    })
    .filter((entry): entry is { value: string; minutes: number } => entry !== null)
    .sort((a, b) => a.minutes - b.minutes)
    .map((entry) => entry.value);

  return valid.length > 0 ? Array.from(new Set(valid)) : DEFAULT_TIMES_OF_DAY;
}

function toDayString(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/** Lunes = 0 … domingo = 6, a partir de un `YYYY-MM-DD`. */
function weekdayIndex(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, date)).getUTCDay(); // 0=domingo
  return (jsDay + 6) % 7;
}

function lastDayOfMonth(day: string): number {
  const [year, month] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * ¿Este medicamento tiene toma en este día lógico?
 *
 * `day` es un día de calendario (`YYYY-MM-DD`), no un instante: la hora se
 * resuelve después, por cada bloque horario.
 */
export function isMedicationDueOn(medication: SchedulableMedication, day: string): boolean {
  if (medication.isActive === false) return false;

  const start = toDayString(medication.startDate ?? medication.createdAt ?? null);
  const end = toDayString(medication.endDate ?? null);
  if (start && daysBetweenDayStrings(start, day) < 0) return false;
  if (end && daysBetweenDayStrings(end, day) > 0) return false;

  const frequency = (medication.frequency ?? "daily").toLowerCase();
  const custom = parseCustomSchedule(medication.customSchedule);
  const anchor = start ?? day;

  if (frequency === "as_needed" || custom?.type === "as_needed") return false;

  if (frequency === "every_n_days" || custom?.type === "interval_days") {
    const everyDays = Math.max(2, Math.floor(Number(custom?.everyDays) || 2));
    const diff = daysBetweenDayStrings(anchor, day);
    return diff >= 0 && diff % everyDays === 0;
  }

  if (frequency === "weekly") {
    return weekdayIndex(day) === weekdayIndex(anchor);
  }

  if (custom?.type === "selected_weekdays" && custom.daysOfWeek?.length) {
    return custom.daysOfWeek.includes(weekdayIndex(day));
  }

  if (custom?.type === "monthly") {
    const [, , date] = day.split("-").map(Number);
    const anchorDay = Number(anchor.slice(8, 10));
    const desired = Math.min(Number(custom.monthlyDay) || anchorDay, lastDayOfMonth(day));
    return date === desired;
  }

  if (custom?.type === "cycle") {
    const daysActive = Math.max(1, Math.floor(Number(custom.daysActive) || 1));
    const daysPaused = Math.max(0, Math.floor(Number(custom.daysPaused) || 0));
    const diff = daysBetweenDayStrings(anchor, day);
    if (diff < 0) return false;
    return diff % (daysActive + daysPaused) < daysActive;
  }

  // daily / twice_daily / three_times_daily / custom con horas
  return true;
}

/**
 * Ocurrencias planificadas de un medicamento en un rango de días lógicos.
 *
 * El tope evita generar un tratamiento de un año de golpe: se trabaja con una
 * ventana móvil (7–14 días) y se va extendiendo.
 *
 * Ojo con las horas anteriores al inicio del día lógico: una toma a la 01:00 del
 * día lógico `D` ocurre en el calendario del día `D+1`. Es la misma regla que
 * MyTherapy (`getTimeOfDayInDeadlineRange`), y es lo que evita que la toma de
 * madrugada cuente en el día equivocado.
 */
export function planOccurrences(
  medication: SchedulableMedication,
  options: {
    fromDay: string;
    toDay: string;
    timeZone?: string;
    startHour?: number;
    maxPerMedication?: number;
    /** Overrides por día: se aplican aquí, nunca mutando el plan base. */
    overrides?: DoseOverrideInput[] | null;
  },
): PlannedOccurrence[] {
  const timeZone = options.timeZone ?? DEFAULT_TIMEZONE;
  const startHour = options.startHour ?? 4;
  const max = options.maxPerMedication ?? 120;
  const baseTimes = timesOfDayFor(medication);
  const baseDose = Number(medication.doseQuantity ?? 1) || 1;
  const overrides = indexOverrides(options.overrides);
  const out: PlannedOccurrence[] = [];

  const span = daysBetweenDayStrings(options.fromDay, options.toDay);
  if (span < 0) return out;

  for (let offset = 0; offset <= span; offset += 1) {
    if (out.length >= max) break;
    const day = addDaysToDayString(options.fromDay, offset);
    if (!isMedicationDueOn(medication, day)) continue;

    const dayOverrides = overrides.get(day);
    // Un día saltado no genera nada, aunque la recurrencia diga que sí.
    if (dayOverrides?.some((entry) => entry.type === "skip_day")) continue;

    const times = timesForDay(medication, dayOverrides, baseTimes);
    const plannedDose = doseForDay(dayOverrides, baseDose);

    for (const time of times) {
      if (out.length >= max) break;
      const minutes = parseTimeOfDay(time);
      if (minutes == null) continue;
      // Antes del corte del día lógico ⇒ cae en el calendario del día siguiente.
      const calendarDay =
        minutes < startHour * 60 ? addDaysToDayString(day, 1) : day;
      const scheduledAt = zonedInstant(
        calendarDay,
        Math.floor(minutes / 60),
        minutes % 60,
        timeZone,
      );
      out.push({
        medicationId: medication.id,
        scheduledAt,
        scheduledDay: day,
        plannedDose,
        timezone: timeZone,
      });
    }
  }

  return out;
}

/** Ventana por defecto de generación: hoy − 1 día a hoy + N días. */
export const DEFAULT_GENERATION_PAST_DAYS = 1;
export const DEFAULT_GENERATION_FUTURE_DAYS = 7;

export function defaultGenerationRange(
  options: {
    startHour?: number;
    timeZone?: string;
    now?: Date;
    pastDays?: number;
    futureDays?: number;
  } = {},
): { fromDay: string; toDay: string } {
  const today = currentTherapyDay(options.startHour, options.timeZone, options.now);
  return {
    fromDay: addDaysToDayString(today, -(options.pastDays ?? DEFAULT_GENERATION_PAST_DAYS)),
    toDay: addDaysToDayString(today, options.futureDays ?? DEFAULT_GENERATION_FUTURE_DAYS),
  };
}
