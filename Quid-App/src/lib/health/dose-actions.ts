/**
 * Servicio de tomas: persistencia, acciones y libro mayor de stock.
 *
 * Decisiones:
 *   - Cada acción es **idempotente**: repetir "tomar" sobre la misma toma no
 *     vuelve a descontar stock ni duplica asientos.
 *   - La toma guarda la hora **programada** (nunca se sobrescribe) y la hora
 *     **real** (`actedAt`).
 *   - El stock se mueve con un asiento (`MedicationStockEntry`), no mutando el
 *     campo a ciegas: así se puede auditar y reconstruir el inventario.
 *   - El cierre automático solo toca días lógicos **anteriores a hoy**
 *     (regla verificada en MyTherapy), nunca el día en curso.
 */

import { db } from "@/lib/db";
import {
  DEFAULT_TIMEZONE,
  DEFAULT_THERAPY_DAY_START_HOUR,
  currentTherapyDay,
  therapyDayOf,
  therapyDayStart,
} from "./therapy-day";
import {
  type PlannedOccurrence,
  defaultGenerationRange,
  planOccurrences,
} from "./dose-scheduler";
import {
  DEFAULT_SNOOZE_MINUTES,
  MAX_SNOOZES_PER_DOSE,
  canTransition,
  isActionable,
  parseSnoozeMinutes,
} from "./dose-status";

export interface HealthSettings {
  startHour: number;
  timeZone: string;
}

/** Ajustes de día lógico del usuario (con valores por defecto del proyecto). */
export async function getHealthSettings(userId: string): Promise<HealthSettings> {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { therapyDayStartHour: true },
  });
  return {
    startHour: settings?.therapyDayStartHour ?? DEFAULT_THERAPY_DAY_START_HOUR,
    timeZone: DEFAULT_TIMEZONE,
  };
}

/**
 * Crea las ocurrencias que falten para las próximas `horizonDays` jornadas.
 *
 * Idempotente: usa `upsert` sobre la clave única `(medicationId, scheduledAt)`.
 * Devuelve cuántas se crearon realmente.
 */
export async function ensureOccurrences(
  userId: string,
  options: { horizonDays?: number; now?: Date } = {},
): Promise<{ planned: number; created: number }> {
  const settings = await getHealthSettings(userId);
  const range = defaultGenerationRange({
    startHour: settings.startHour,
    timeZone: settings.timeZone,
    now: options.now,
    futureDays: options.horizonDays ?? 7,
    pastDays: 1,
  });

  const medications = await db.medication.findMany({
    where: { userId, isActive: true },
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

  let planned = 0;
  let created = 0;

  // Overrides del rango: se aplican al planificar, nunca mutando el plan base.
  const overrideRows = await db.doseOverride.findMany({
    where: { userId, day: { gte: range.fromDay, lte: range.toDay } },
    select: { medicationId: true, day: true, type: true, payload: true },
  });

  for (const medication of medications) {
    const overrides = overrideRows
      .filter((row) => row.medicationId === medication.id)
      .map((row) => ({
        day: row.day,
        type: row.type,
        payload: (row.payload ?? {}) as { times?: string[]; dose?: number },
      }));

    const occurrences = planOccurrences(medication, {
      fromDay: range.fromDay,
      toDay: range.toDay,
      timeZone: settings.timeZone,
      startHour: settings.startHour,
      overrides,
    });
    planned += occurrences.length;

    for (const occurrence of occurrences) {
      const result = await upsertOccurrence(userId, occurrence);
      if (result) created += 1;
    }
  }

  return { planned, created };
}

/**
 * Inserta la ocurrencia si no existe. Devuelve `true` si la creó.
 *
 * Se evita `upsert` para poder distinguir "creada" de "ya existía" sin leer dos
 * veces: `createMany({ skipDuplicates: true })` hace exactamente eso.
 */
async function upsertOccurrence(
  userId: string,
  occurrence: PlannedOccurrence,
): Promise<boolean> {
  const result = await db.doseOccurrence.createMany({
    data: [
      {
        userId,
        medicationId: occurrence.medicationId,
        scheduledAt: occurrence.scheduledAt,
        scheduledDay: occurrence.scheduledDay,
        timezone: occurrence.timezone,
        plannedDose: occurrence.plannedDose,
        status: "pending",
        source: "scheduled",
      },
    ],
    skipDuplicates: true,
  });
  return result.count > 0;
}

async function getOwnedOccurrence(userId: string, occurrenceId: string) {
  return db.doseOccurrence.findFirst({
    where: { id: occurrenceId, userId },
    include: { medication: { select: { id: true, name: true, stockQuantity: true, stockUnit: true } } },
  });
}

export type DoseActionResult = {
  id: string;
  status: string;
  actedAt: string | null;
  actualDose: number | null;
  snoozeCount: number;
  stockQuantity: number | null;
  lowStock: boolean;
};

function toResult(
  occurrence: {
    id: string;
    status: string;
    actedAt: Date | null;
    actualDose: number | null;
    snoozeCount: number;
  },
  stockQuantity: number | null,
  lowStockThreshold: number | null | undefined,
): DoseActionResult {
  return {
    id: occurrence.id,
    status: occurrence.status,
    actedAt: occurrence.actedAt?.toISOString() ?? null,
    actualDose: occurrence.actualDose,
    snoozeCount: occurrence.snoozeCount,
    stockQuantity,
    lowStock:
      stockQuantity != null &&
      lowStockThreshold != null &&
      stockQuantity <= lowStockThreshold,
  };
}

/**
 * Confirma una toma. Transacción: ocurrencia + movimiento de stock + asiento.
 * Si la toma ya estaba `taken`, no hace nada (idempotente).
 */
export async function takeDose(params: {
  userId: string;
  occurrenceId: string;
  dose?: number;
  at?: Date;
}): Promise<DoseActionResult> {
  const { userId, occurrenceId } = params;
  const at = params.at ?? new Date();

  return db.$transaction(async (tx) => {
    const occurrence = await tx.doseOccurrence.findFirst({
      where: { id: occurrenceId, userId },
      include: { medication: true },
    });
    if (!occurrence) throw new Error("Toma no encontrada");

    if (occurrence.status === "taken") {
      return toResult(occurrence, occurrence.medication.stockQuantity, occurrence.medication.lowStockThreshold);
    }
    if (!isActionable(occurrence.status) && occurrence.status !== "missed") {
      throw new Error("Esta toma ya está cerrada");
    }
    if (!canTransition(occurrence.status, "taken")) {
      throw new Error("Transición de estado no permitida");
    }

    const dose = Number(params.dose ?? occurrence.actualDose ?? occurrence.plannedDose) ||
      occurrence.plannedDose;

    const updated = await tx.doseOccurrence.update({
      where: { id: occurrence.id },
      data: { status: "taken", actedAt: at, actualDose: dose },
    });

    const medication = occurrence.medication;
    let stockQuantity = medication.stockQuantity;

    if (stockQuantity != null) {
      const nextStock = Math.max(0, Number(stockQuantity) - dose);
      const applied = Number(stockQuantity) - nextStock;
      await tx.medication.update({
        where: { id: medication.id },
        data: { stockQuantity: nextStock },
      });
      await tx.medicationStockEntry.create({
        data: {
          userId,
          medicationId: medication.id,
          delta: -applied,
          balanceAfter: nextStock,
          reason: "dose",
          refId: occurrence.id,
        },
      });
      stockQuantity = nextStock;
    }

    return toResult(updated, stockQuantity, medication.lowStockThreshold);
  });
}

/** El usuario decide no tomarla (distinto de "se le olvidó"). */
export async function skipDose(params: {
  userId: string;
  occurrenceId: string;
  note?: string | null;
  at?: Date;
}): Promise<DoseActionResult> {
  return closeWithoutStock(params, "skipped");
}

/** Descarta el aviso sin decisión explícita (cuenta como no tomada en métricas duras). */
export async function dismissDose(params: {
  userId: string;
  occurrenceId: string;
  at?: Date;
}): Promise<DoseActionResult> {
  return closeWithoutStock(params, "dismissed");
}

async function closeWithoutStock(
  params: { userId: string; occurrenceId: string; note?: string | null; at?: Date },
  status: "skipped" | "dismissed",
): Promise<DoseActionResult> {
  const at = params.at ?? new Date();
  return db.$transaction(async (tx) => {
    const occurrence = await tx.doseOccurrence.findFirst({
      where: { id: params.occurrenceId, userId: params.userId },
      include: { medication: true },
    });
    if (!occurrence) throw new Error("Toma no encontrada");
    if (!isActionable(occurrence.status)) {
      return toResult(occurrence, occurrence.medication.stockQuantity, occurrence.medication.lowStockThreshold);
    }
    if (!canTransition(occurrence.status, status)) {
      throw new Error("Transición de estado no permitida");
    }
    const updated = await tx.doseOccurrence.update({
      where: { id: occurrence.id },
      data: { status, actedAt: at, note: params.note ?? occurrence.note },
    });
    return toResult(updated, occurrence.medication.stockQuantity, occurrence.medication.lowStockThreshold);
  });
}

/**
 * Pospone la toma N minutos (una sola unidad: minutos).
 * Respeta `MAX_SNOOZES_PER_DOSE` para que no se convierta en "posponer siempre".
 */
export async function snoozeDose(params: {
  userId: string;
  occurrenceId: string;
  minutes?: number;
  at?: Date;
}): Promise<DoseActionResult> {
  const at = params.at ?? new Date();
  const minutes = parseSnoozeMinutes(params.minutes ?? DEFAULT_SNOOZE_MINUTES);

  return db.$transaction(async (tx) => {
    const occurrence = await tx.doseOccurrence.findFirst({
      where: { id: params.occurrenceId, userId: params.userId },
      include: { medication: true },
    });
    if (!occurrence) throw new Error("Toma no encontrada");
    if (!isActionable(occurrence.status)) {
      return toResult(occurrence, occurrence.medication.stockQuantity, occurrence.medication.lowStockThreshold);
    }
    if (occurrence.snoozeCount >= MAX_SNOOZES_PER_DOSE) {
      throw new Error("Ya se pospuso el máximo de veces: tomá u omití");
    }
    const updated = await tx.doseOccurrence.update({
      where: { id: occurrence.id },
      data: {
        status: "snoozed",
        snoozeCount: occurrence.snoozeCount + 1,
        // la hora programada NO cambia: solo se registra que se pospuso
        lastRemindedAt: at,
      },
    });
    return toResult(updated, occurrence.medication.stockQuantity, occurrence.medication.lowStockThreshold);
  });
}

/** Deshace una acción (corrección desde el historial) y devuelve el stock. */
export async function reopenDose(params: {
  userId: string;
  occurrenceId: string;
}): Promise<DoseActionResult> {
  return db.$transaction(async (tx) => {
    const occurrence = await tx.doseOccurrence.findFirst({
      where: { id: params.occurrenceId, userId: params.userId },
      include: { medication: true },
    });
    if (!occurrence) throw new Error("Toma no encontrada");
    if (occurrence.status === "pending") {
      return toResult(occurrence, occurrence.medication.stockQuantity, occurrence.medication.lowStockThreshold);
    }

    let stockQuantity = occurrence.medication.stockQuantity;
    if (occurrence.status === "taken" && stockQuantity != null) {
      const returned = Number(occurrence.actualDose ?? occurrence.plannedDose);
      const nextStock = Number(stockQuantity) + returned;
      await tx.medication.update({
        where: { id: occurrence.medication.id },
        data: { stockQuantity: nextStock },
      });
      await tx.medicationStockEntry.create({
        data: {
          userId: params.userId,
          medicationId: occurrence.medication.id,
          delta: returned,
          balanceAfter: nextStock,
          reason: "adjustment",
          refId: occurrence.id,
          note: "Reapertura de toma confirmada",
        },
      });
      stockQuantity = nextStock;
    }

    const updated = await tx.doseOccurrence.update({
      where: { id: occurrence.id },
      data: { status: "pending", actedAt: null, actualDose: null, snoozeCount: 0 },
    });
    return toResult(updated, stockQuantity, occurrence.medication.lowStockThreshold);
  });
}

/**
 * Cierra como `missed` las tomas de días lógicos anteriores a hoy.
 *
 * Regla: solo lo anterior al inicio del día lógico actual. Es idempotente y
 * nunca toca el día en curso (el usuario todavía puede confirmar).
 */
export async function closeExpiredOccurrences(
  userId: string,
  options: { now?: Date } = {},
): Promise<{ closed: number }> {
  const settings = await getHealthSettings(userId);
  const today = currentTherapyDay(settings.startHour, settings.timeZone, options.now);
  const cutoff = therapyDayStart(today, settings.startHour, settings.timeZone);

  const result = await db.doseOccurrence.updateMany({
    where: {
      userId,
      status: { in: ["pending", "snoozed"] },
      scheduledAt: { lt: cutoff },
    },
    data: { status: "missed", actedAt: cutoff },
  });

  return { closed: result.count };
}

/**
 * Registra una toma a demanda (PRN: "me tomé una pastilla porque me dolía").
 * No genera ocurrencias ni cuenta para la adherencia programada.
 */
export async function recordAsNeededDose(params: {
  userId: string;
  medicationId: string;
  dose?: number;
  at?: Date;
  note?: string | null;
}): Promise<DoseActionResult> {
  const at = params.at ?? new Date();
  const medication = await db.medication.findFirst({
    where: { id: params.medicationId, userId: params.userId },
  });
  if (!medication) throw new Error("Medicamento no encontrado");

  const dose = Number(params.dose ?? medication.doseQuantity ?? 1) || 1;
  const settings = await getHealthSettings(params.userId);

  return db.$transaction(async (tx) => {
    const occurrence = await tx.doseOccurrence.create({
      data: {
        userId: params.userId,
        medicationId: medication.id,
        scheduledAt: at,
        scheduledDay: therapyDayOf(at, settings.startHour, settings.timeZone),
        timezone: settings.timeZone,
        plannedDose: dose,
        actualDose: dose,
        status: "taken",
        actedAt: at,
        source: "prn",
        note: params.note ?? null,
      },
    });

    let stockQuantity = medication.stockQuantity;
    if (stockQuantity != null) {
      const nextStock = Math.max(0, Number(stockQuantity) - dose);
      const applied = Number(stockQuantity) - nextStock;
      await tx.medication.update({
        where: { id: medication.id },
        data: { stockQuantity: nextStock },
      });
      await tx.medicationStockEntry.create({
        data: {
          userId: params.userId,
          medicationId: medication.id,
          delta: -applied,
          balanceAfter: nextStock,
          reason: "dose",
          refId: occurrence.id,
        },
      });
      stockQuantity = nextStock;
    }

    return toResult(occurrence, stockQuantity, medication.lowStockThreshold);
  });
}

/** Repone stock (compra o corrección manual) dejando asiento. */
export async function addStock(params: {
  userId: string;
  medicationId: string;
  amount: number;
  reason?: "refill" | "adjustment" | "order_delivery";
  note?: string | null;
}): Promise<{ stockQuantity: number }> {
  const medication = await db.medication.findFirst({
    where: { id: params.medicationId, userId: params.userId },
  });
  if (!medication) throw new Error("Medicamento no encontrado");

  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount === 0) throw new Error("Cantidad inválida");

  const current = Number(medication.stockQuantity ?? 0);
  const nextStock = Math.max(0, current + amount);

  return db.$transaction(async (tx) => {
    await tx.medication.update({
      where: { id: medication.id },
      data: { stockQuantity: nextStock },
    });
    await tx.medicationStockEntry.create({
      data: {
        userId: params.userId,
        medicationId: medication.id,
        delta: nextStock - current,
        balanceAfter: nextStock,
        reason: params.reason ?? "refill",
        note: params.note ?? null,
      },
    });
    return { stockQuantity: nextStock };
  });
}
