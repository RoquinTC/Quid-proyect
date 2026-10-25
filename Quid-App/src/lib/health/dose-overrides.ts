/**
 * Overrides por fecha: mover una toma, cambiar la dosis de un día o saltarlo.
 *
 * Regla tomada de MyTherapy (`scheduler_modification`): el override **no muta**
 * la recurrencia. Se guarda aparte y se aplica al generar; así el patrón base
 * sigue siendo auditable y se puede deshacer borrando el override.
 *
 * Reconciliación: cuando se crea o borra un override se recalculan **solo** las
 * ocurrencias futuras de ese día. Las ya resueltas (`taken`, `skipped`, `missed`)
 * nunca se tocan: borrar historial sería mentir sobre la adherencia.
 */

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  addDaysToDayString,
  therapyDayStart,
} from "./therapy-day";
import { getHealthSettings } from "./dose-actions";
import { planOccurrences } from "./dose-scheduler";

export const OVERRIDE_TYPES = ["modify_time", "modify_dose", "skip_day"] as const;
export type OverrideType = (typeof OVERRIDE_TYPES)[number];

export interface OverrideInput {
  day: string;
  type: OverrideType;
  times?: string[];
  dose?: number;
  note?: string | null;
}

export interface OverrideView {
  id: string;
  medicationId: string;
  day: string;
  type: OverrideType;
  times: string[] | null;
  dose: number | null;
  note: string | null;
}

function toView(row: {
  id: string;
  medicationId: string;
  day: string;
  type: string;
  payload: unknown;
  note: string | null;
}): OverrideView {
  const payload = (row.payload ?? {}) as { times?: string[]; dose?: number };
  return {
    id: row.id,
    medicationId: row.medicationId,
    day: row.day,
    type: row.type as OverrideType,
    times: Array.isArray(payload.times) ? payload.times : null,
    dose: typeof payload.dose === "number" ? payload.dose : null,
    note: row.note,
  };
}

function buildPayload(input: OverrideInput): Prisma.InputJsonObject {
  if (input.type === "modify_time") {
    return { times: (input.times ?? []).filter(Boolean) };
  }
  if (input.type === "modify_dose") {
    return { dose: Number(input.dose) };
  }
  return {};
}

/**
 * Recalcula las ocurrencias futuras de un medicamento en un día lógico.
 *
 * - Borra solo `pending`/`snoozed` de la ventana del día.
 * - Regenera con los overrides vigentes.
 */
export async function reconcileOverrideDay(params: {
  userId: string;
  medicationId: string;
  day: string;
}): Promise<{ removed: number; created: number }> {
  const settings = await getHealthSettings(params.userId);
  const from = therapyDayStart(params.day, settings.startHour, settings.timeZone);
  const to = therapyDayStart(
    addDaysToDayString(params.day, 1),
    settings.startHour,
    settings.timeZone,
  );

  const removed = await db.doseOccurrence.deleteMany({
    where: {
      userId: params.userId,
      medicationId: params.medicationId,
      scheduledAt: { gte: from, lt: to },
      status: { in: ["pending", "snoozed"] },
    },
  });

  const medication = await db.medication.findFirst({
    where: { id: params.medicationId, userId: params.userId },
    select: {
      id: true,
      frequency: true,
      customSchedule: true,
      reminderTimes: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      doseQuantity: true,
      isActive: true,
      reminderEnabled: true,
    },
  });
  if (!medication || medication.isActive === false) {
    return { removed: removed.count, created: 0 };
  }

  const overrides = await db.doseOverride.findMany({
    where: { userId: params.userId, medicationId: params.medicationId, day: params.day },
    select: { day: true, type: true, payload: true },
  });

  const planned = planOccurrences(medication, {
    fromDay: params.day,
    toDay: params.day,
    timeZone: settings.timeZone,
    startHour: settings.startHour,
    overrides: overrides.map((row) => ({
      day: row.day,
      type: row.type,
      payload: (row.payload ?? {}) as { times?: string[]; dose?: number },
    })),
  });

  if (planned.length === 0) return { removed: removed.count, created: 0 };

  const created = await db.doseOccurrence.createMany({
    data: planned.map((occurrence) => ({
      userId: params.userId,
      medicationId: occurrence.medicationId,
      scheduledAt: occurrence.scheduledAt,
      scheduledDay: occurrence.scheduledDay,
      timezone: occurrence.timezone,
      plannedDose: occurrence.plannedDose,
      status: "pending",
      source: "scheduled",
    })),
    skipDuplicates: true,
  });

  return { removed: removed.count, created: created.count };
}

/** Crea o reemplaza el override de un día y reconcilia. */
export async function upsertOverride(
  userId: string,
  medicationId: string,
  input: OverrideInput,
): Promise<{ override: OverrideView; removed: number; created: number }> {
  const medication = await db.medication.findFirst({
    where: { id: medicationId, userId },
    select: { id: true },
  });
  if (!medication) throw new Error("Medicamento no encontrado");

  if (input.type === "modify_time") {
    const times = (input.times ?? []).filter((value) => /^\d{1,2}:\d{2}$/.test(value));
    if (times.length === 0) throw new Error("Horas inválidas");
  }
  if (input.type === "modify_dose") {
    if (!Number.isFinite(Number(input.dose)) || Number(input.dose) <= 0) {
      throw new Error("Dosis inválida");
    }
  }

  const row = await db.doseOverride.upsert({
    where: {
      medicationId_day_type: { medicationId, day: input.day, type: input.type },
    },
    create: {
      userId,
      medicationId,
      day: input.day,
      type: input.type,
      payload: buildPayload(input),
      note: input.note ?? null,
    },
    update: {
      payload: buildPayload(input),
      note: input.note ?? null,
    },
  });

  const reconciled = await reconcileOverrideDay({ userId, medicationId, day: input.day });
  return { override: toView(row), ...reconciled };
}

/** Borra un override (vuelve al patrón base) y reconcilia su día. */
export async function deleteOverride(
  userId: string,
  overrideId: string,
): Promise<{ removed: number; created: number }> {
  const row = await db.doseOverride.findFirst({
    where: { id: overrideId, userId },
    select: { id: true, medicationId: true, day: true },
  });
  if (!row) throw new Error("Excepción no encontrada");

  await db.doseOverride.delete({ where: { id: row.id } });
  return reconcileOverrideDay({
    userId,
    medicationId: row.medicationId,
    day: row.day,
  });
}

/** Overrides de un rango de días (para pintarlos en la UI). */
export async function listOverrides(
  userId: string,
  options: { fromDay: string; toDay: string; medicationId?: string },
): Promise<OverrideView[]> {
  const rows = await db.doseOverride.findMany({
    where: {
      userId,
      day: { gte: options.fromDay, lte: options.toDay },
      ...(options.medicationId ? { medicationId: options.medicationId } : {}),
    },
    orderBy: [{ day: "asc" }, { type: "asc" }],
  });
  return rows.map(toView);
}
