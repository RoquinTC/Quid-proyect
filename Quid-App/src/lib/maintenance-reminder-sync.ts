import { db } from "@/lib/db";
import {
  resolveMaintenanceRule,
  shouldCreateServiceReminder,
} from "@/lib/transport-maintenance-rules";

/**
 * One reminder per registered service item.
 *
 * Shared by the create and the edit routes on purpose. They used to disagree:
 * creating a record wrote a reminder per item, while editing wrote a single
 * record-level reminder and silently dropped every item, so a driver who edited
 * a maintenance to set "avisame en 2.500 km" got nothing at all.
 */
export interface MaintenanceReminderItem {
  name: string;
  typeKey?: string | null;
  scheduleReminder?: boolean;
  reminderIntervalKm?: number | null;
  reminderIntervalDays?: number | null;
  reminderWarningKm?: number | null;
}

export async function syncMaintenanceItemReminders(params: {
  userId: string;
  vehicleId: string;
  vehicleName: string;
  items: MaintenanceReminderItem[];
  description: string;
  recordKm: number;
  recordDate: Date;
  enabled: boolean;
}): Promise<void> {
  const { userId, vehicleId, vehicleName, items, description, recordKm, recordDate, enabled } = params;

  if (!enabled || items.length === 0) return;

  const userRules = await db.maintenanceServiceRule.findMany({ where: { userId } });

  for (const item of items) {
    if (item.scheduleReminder === false) continue;

    const itemName = item.name;
    const typeKey = item.typeKey || item.name;
    const resolvedRule = resolveMaintenanceRule({ name: itemName, typeKey }, userRules);

    // An explicit interval typed in the form wins over an inactive rule.
    if (!shouldCreateServiceReminder({
      scheduleReminder: item.scheduleReminder,
      reminderIntervalKm: item.reminderIntervalKm,
      reminderIntervalDays: item.reminderIntervalDays,
      ruleIsActive: resolvedRule.isActive,
    })) continue;

    // The previous reminder for this service, kept so a custom interval the
    // driver set on the reminder itself survives the round trip.
    const existingReminder = await db.vehicleReminder.findFirst({
      where: { userId, vehicleId, category: "maintenance", title: itemName, isActive: true },
    });

    if (existingReminder) {
      await db.vehicleReminder.update({
        where: { id: existingReminder.id },
        data: { isActive: false, completedAt: new Date(), completedKm: recordKm },
      });
    }

    // Service rules are the source of truth; the reminder keeps its own interval
    // when the driver edited only that.
    const intervalKm =
      item.reminderIntervalKm ?? existingReminder?.repeatIntervalKm ?? resolvedRule.intervalKm ?? 0;
    const intervalDays =
      item.reminderIntervalDays ?? existingReminder?.repeatIntervalDays ?? resolvedRule.intervalDays ?? 0;

    if (!intervalKm && !intervalDays) continue;

    const nextDueKm = intervalKm > 0 ? recordKm + intervalKm : null;
    let nextDueDate: Date | null = null;

    if (intervalDays > 0) {
      nextDueDate = new Date(recordDate);
      nextDueDate.setDate(nextDueDate.getDate() + intervalDays);
    }

    await db.vehicleReminder.create({
      data: {
        userId,
        vehicleId,
        title: itemName,
        description: description || `Próximo: ${itemName} de ${vehicleName}`,
        category: "maintenance",
        triggerMode: nextDueKm && nextDueDate ? "hybrid" : nextDueKm ? "km" : "date",
        dueKm: nextDueKm,
        dueDate: nextDueDate,
        warningKm: intervalKm ? item.reminderWarningKm ?? resolvedRule.warningKm : 500,
        warningDays: 15,
        repeatIntervalKm: intervalKm > 0 ? intervalKm : null,
        repeatIntervalDays: intervalDays > 0 ? intervalDays : null,
        isActive: true,
      },
    });
  }
}
