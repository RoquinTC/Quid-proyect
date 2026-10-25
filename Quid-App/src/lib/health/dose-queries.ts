/**
 * Consultas de tomas para la UI y para el sincronizador de notificaciones.
 */

import { db } from "@/lib/db";
import { addDaysToDayString, currentTherapyDay, therapyDayStart } from "./therapy-day";
import { getHealthSettings } from "./dose-actions";

export interface DoseListItem {
  id: string;
  medicationId: string;
  medicationName: string;
  dosage: string | null;
  scheduledAt: string;
  scheduledDay: string;
  status: string;
  plannedDose: number;
  actualDose: number | null;
  actedAt: string | null;
  snoozeCount: number;
  source: string;
  isCritical: boolean;
  stockUnit: string | null;
  lowStock: boolean;
}

function isLowStock(
  stockQuantity: number | null,
  lowStockThreshold: number | null,
): boolean {
  return (
    stockQuantity != null && lowStockThreshold != null && stockQuantity <= lowStockThreshold
  );
}

/**
 * Tomas de un rango de días lógicos. Por defecto, hoy.
 */
export async function listDoses(
  userId: string,
  options: { fromDay?: string; toDay?: string; now?: Date; status?: string[] } = {},
): Promise<{ fromDay: string; toDay: string; items: DoseListItem[] }> {
  const settings = await getHealthSettings(userId);
  const today = currentTherapyDay(settings.startHour, settings.timeZone, options.now);
  const fromDay = options.fromDay ?? today;
  const toDay = options.toDay ?? today;

  const fromInstant = therapyDayStart(fromDay, settings.startHour, settings.timeZone);
  const toInstant = therapyDayStart(
    addDaysToDayString(toDay, 1),
    settings.startHour,
    settings.timeZone,
  );

  const occurrences = await db.doseOccurrence.findMany({
    where: {
      userId,
      scheduledAt: { gte: fromInstant, lt: toInstant },
      ...(options.status?.length ? { status: { in: options.status } } : {}),
    },
    include: {
      medication: {
        select: {
          name: true,
          dosage: true,
          stockQuantity: true,
          stockUnit: true,
          lowStockThreshold: true,
        },
      },
    },
    orderBy: { scheduledAt: "asc" },
  });

  return {
    fromDay,
    toDay,
    items: occurrences.map((occurrence) => ({
      id: occurrence.id,
      medicationId: occurrence.medicationId,
      medicationName: occurrence.medication.name,
      dosage: occurrence.medication.dosage ?? null,
      scheduledAt: occurrence.scheduledAt.toISOString(),
      scheduledDay: occurrence.scheduledDay,
      status: occurrence.status,
      plannedDose: occurrence.plannedDose,
      actualDose: occurrence.actualDose,
      actedAt: occurrence.actedAt?.toISOString() ?? null,
      snoozeCount: occurrence.snoozeCount,
      source: occurrence.source,
      isCritical: false,
      stockUnit: occurrence.medication.stockUnit ?? null,
      lowStock: isLowStock(
        occurrence.medication.stockQuantity,
        occurrence.medication.lowStockThreshold,
      ),
    })),
  };
}

/**
 * Toma accionable más cercana de un medicamento (para el "tomar" genérico y
 * para resolver el id cuando la notificación no lo trae).
 */
export async function findActionableOccurrence(
  userId: string,
  medicationId: string,
  options: { now?: Date } = {},
): Promise<{ id: string; scheduledAt: Date } | null> {
  const settings = await getHealthSettings(userId);
  const today = currentTherapyDay(settings.startHour, settings.timeZone, options.now);
  const fromInstant = therapyDayStart(
    addDaysToDayString(today, -1),
    settings.startHour,
    settings.timeZone,
  );
  const toInstant = therapyDayStart(
    addDaysToDayString(today, 1),
    settings.startHour,
    settings.timeZone,
  );

  const now = options.now ?? new Date();

  const upcoming = await db.doseOccurrence.findFirst({
    where: {
      userId,
      medicationId,
      status: { in: ["pending", "snoozed"] },
      scheduledAt: { gte: fromInstant, lt: toInstant },
    },
    orderBy: { scheduledAt: "asc" },
    select: { id: true, scheduledAt: true },
  });
  if (upcoming) return upcoming;

  // Si no queda nada abierto en la ventana, la más reciente del día sirve para
  // registrar la toma que el usuario acaba de hacer.
  return db.doseOccurrence.findFirst({
    where: {
      userId,
      medicationId,
      scheduledAt: { gte: fromInstant, lte: now },
    },
    orderBy: { scheduledAt: "desc" },
    select: { id: true, scheduledAt: true },
  });
}
