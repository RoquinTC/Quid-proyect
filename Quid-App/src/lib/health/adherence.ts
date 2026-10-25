/**
 * Métricas de adherencia.
 *
 * "Adherencia" es solo una división: de las tomas que tocaban, cuántas se
 * confirmaron. Lo valioso es separar **omisión** (decisión) de **olvido**
 * (fallo del recordatorio), porque cada una se corrige de forma distinta.
 *
 * Se calcula sobre `DoseOccurrence` y excluye las tomas a demanda (`prn`), que
 * no tienen horario prescrito.
 */

import { db } from "@/lib/db";
import { addDaysToDayString, currentTherapyDay, therapyDayStart } from "./therapy-day";
import { getHealthSettings } from "./dose-actions";

export interface AdherenceSummary {
  fromDay: string;
  toDay: string;
  /** Tomas que tocaban y ya están resueltas (tomadas, omitidas, no registradas). */
  evaluable: number;
  taken: number;
  /** `skipped`: el usuario decidió no tomarla. */
  skipped: number;
  /** `missed`: nadie hizo nada y venció el día. */
  missed: number;
  /** `taken / evaluable`, 0–1. `null` cuando no hay nada evaluable. */
  adherenceRate: number | null;
  /** Fracción de lo evaluable que fue omisión activa. */
  skipRate: number | null;
  /** Fracción de lo evaluable que se pasó sin acción. */
  missRate: number | null;
  /** Retraso medio en minutos de las tomas confirmadas. */
  averageDelayMinutes: number | null;
  /** Tomas pospuestas al menos una vez (fricción del recordatorio). */
  snoozedCount: number;
  /** Racha actual de días lógicos con todas las tomas confirmadas. */
  currentStreak: number;
  /** Tomas de hoy aún abiertas. */
  pendingToday: number;
}

function ratio(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

/**
 * Resumen de los últimos `days` días lógicos (incluye hoy).
 */
export async function getAdherenceSummary(
  userId: string,
  options: { days?: number; now?: Date } = {},
): Promise<AdherenceSummary> {
  const settings = await getHealthSettings(userId);
  const days = Math.max(1, Math.min(365, options.days ?? 7));
  const today = currentTherapyDay(settings.startHour, settings.timeZone, options.now);
  const fromDay = addDaysToDayString(today, -(days - 1));
  const fromInstant = therapyDayStart(fromDay, settings.startHour, settings.timeZone);

  const occurrences = await db.doseOccurrence.findMany({
    where: {
      userId,
      source: { not: "prn" },
      scheduledAt: { gte: fromInstant },
    },
    select: {
      status: true,
      scheduledDay: true,
      scheduledAt: true,
      actedAt: true,
      snoozeCount: true,
    },
    orderBy: { scheduledAt: "asc" },
  });

  let evaluable = 0;
  let taken = 0;
  let skipped = 0;
  let missed = 0;
  let snoozedCount = 0;
  let delaySum = 0;
  let delayCount = 0;

  const perDay = new Map<string, { taken: number; resolved: number; pending: number }>();

  for (const occurrence of occurrences) {
    if (occurrence.snoozeCount > 0) snoozedCount += 1;

    const bucket = perDay.get(occurrence.scheduledDay) ?? { taken: 0, resolved: 0, pending: 0 };
    switch (occurrence.status) {
      case "taken": {
        taken += 1;
        evaluable += 1;
        bucket.taken += 1;
        bucket.resolved += 1;
        if (occurrence.actedAt) {
          const delay = (occurrence.actedAt.getTime() - occurrence.scheduledAt.getTime()) / 60000;
          // Solo cuenta retraso positivo y razonable (evita correcciones tardías).
          if (delay >= 0 && delay <= 24 * 60) {
            delaySum += delay;
            delayCount += 1;
          }
        }
        break;
      }
      case "skipped":
        skipped += 1;
        evaluable += 1;
        bucket.resolved += 1;
        break;
      case "missed":
        missed += 1;
        evaluable += 1;
        bucket.resolved += 1;
        break;
      default:
        bucket.pending += 1;
        break;
    }
    perDay.set(occurrence.scheduledDay, bucket);
  }

  // Racha: días consecutivos (de hoy hacia atrás) con todo resuelto y sin fallos.
  let currentStreak = 0;
  for (let offset = 0; offset < days; offset += 1) {
    const day = addDaysToDayString(today, -offset);
    const bucket = perDay.get(day);
    if (!bucket || bucket.pending > 0) break;
    if (bucket.resolved === 0) break;
    if (bucket.taken !== bucket.resolved) break;
    currentStreak += 1;
  }

  const pendingToday = perDay.get(today)?.pending ?? 0;

  return {
    fromDay,
    toDay: today,
    evaluable,
    taken,
    skipped,
    missed,
    adherenceRate: ratio(taken, evaluable),
    skipRate: ratio(skipped, evaluable),
    missRate: ratio(missed, evaluable),
    averageDelayMinutes: delayCount > 0 ? Math.round(delaySum / delayCount) : null,
    snoozedCount,
    currentStreak,
    pendingToday,
  };
}
