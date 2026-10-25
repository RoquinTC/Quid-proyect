/**
 * Reparto de los recordatorios de agua entre la hora de despertar y la de dormir.
 *
 * Regla: se reparten **equitativamente** en la ventana despierta, centrados.
 * Con 10 vasos entre las 06:00 y las 22:00 (960 min), el intervalo es 96 min y
 * el primero cae a las 06:48, no a las 06:00: nadie quiere que le suene la
 * notificación en el instante en que abre los ojos, ni justo cuando se acuesta.
 *
 * Si el usuario cruza la medianoche (se acuesta a las 00:30), la ventana se
 * calcula sumando 24 h; el reparto sigue siendo correcto.
 */

export interface WakeWindow {
  /** "HH:mm" */
  wakeTime: string;
  /** "HH:mm" */
  sleepTime: string;
}

export type ReminderAlignment = "centered" | "edges";

export interface ReminderSlot {
  /** Minutos desde la medianoche del día base (puede pasar de 1440 si cruza). */
  minutes: number;
  /** "HH:mm" listo para mostrar. */
  label: string;
}

export function parseTimeToMinutes(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec((value ?? "").trim());
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return 0;
  return hours * 60 + minutes;
}

export function formatMinutes(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Minutos que la persona está despierta (soporta cruzar medianoche). */
export function awakeMinutes(window: WakeWindow): number {
  const wake = parseTimeToMinutes(window.wakeTime);
  const sleep = parseTimeToMinutes(window.sleepTime);
  return sleep > wake ? sleep - wake : sleep + 1440 - wake;
}

/**
 * Horarios de los recordatorios del día.
 *
 * `count` sale del plan de hidratación (número de vasos). Devuelve los horarios
 * ordenados; el llamador decide cuáles ya pasaron.
 */
export function computeReminderSlots(
  window: WakeWindow,
  count: number,
  alignment: ReminderAlignment = "centered",
): ReminderSlot[] {
  const total = Math.max(1, Math.floor(count));
  const wake = parseTimeToMinutes(window.wakeTime);
  const awake = awakeMinutes(window);

  // Un solo aviso: a mitad de la ventana, ni al despertar ni al dormir.
  if (total === 1) {
    const minutes = wake + Math.round(awake / 2);
    return [{ minutes, label: formatMinutes(minutes) }];
  }

  // De punta a punta: el primero al despertar y el último al acostarse.
  if (alignment === "edges") {
    const interval = awake / (total - 1);
    return Array.from({ length: total }, (_, index) => {
      const minutes = wake + Math.round(interval * index);
      return { minutes, label: formatMinutes(minutes) };
    });
  }

  // Centrado (por defecto): medio intervalo de margen en cada extremo.
  const interval = awake / total;
  return Array.from({ length: total }, (_, index) => {
    const minutes = wake + Math.round(interval * (index + 0.5));
    return { minutes, label: formatMinutes(minutes) };
  });
}

/** Intervalo medio entre avisos, para mostrarlo en la UI. */
export function averageIntervalMinutes(
  window: WakeWindow,
  count: number,
  alignment: ReminderAlignment = "centered",
): number {
  const total = Math.max(1, Math.floor(count));
  if (total <= 0) return 0;
  const awake = awakeMinutes(window);
  return Math.round(alignment === "edges" && total > 1 ? awake / (total - 1) : awake / total);
}

export function formatInterval(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return "según tu día";
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours <= 0) return `cada ${minutes} min`;
  if (minutes <= 0) return `cada ${hours} h`;
  return `cada ${hours} h ${minutes} min`;
}

export interface DaySlots {
  /** Día base en formato "YYYY-MM-DD" (hora local). */
  day: string;
  slots: ReminderSlot[];
}

/**
 * Horarios de los próximos `days` días, descartando los de hoy que ya pasaron.
 *
 * `now` se inyecta para poder probar sin depender del reloj real.
 */
export function upcomingReminderTimes(
  window: WakeWindow,
  count: number,
  options: { now: Date; days?: number; graceMinutes?: number; alignment?: ReminderAlignment },
): { at: Date; label: string }[] {
  const days = Math.max(1, options.days ?? 7);
  const grace = options.graceMinutes ?? 5;
  const now = options.now;
  const slots = computeReminderSlots(window, count, options.alignment ?? "centered");
  const out: { at: Date; label: string }[] = [];

  for (let offset = 0; offset < days; offset += 1) {
    const base = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    for (const slot of slots) {
      const at = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        Math.floor(slot.minutes / 60),
        slot.minutes % 60,
        0,
        0,
      );
      // Los de hoy que ya pasaron (con margen) no se programan.
      if (offset === 0 && at.getTime() < now.getTime() + grace * 60_000) continue;
      out.push({ at, label: slot.label });
    }
  }

  return out;
}

/** Identificador estable del día, para agrupar en la UI. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}
