import { db } from "@/lib/db";
import { createAndPushNotification } from "@/lib/push";
import { getColombiaTodayString, createColombiaDate } from "@/lib/api";
import { calculateFuelLevel } from "@/lib/fuel-level";
import { toNumber } from "@/lib/decimal-serializer";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MEDICATION_REMINDER_WINDOW_MINUTES = 15;

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function daysUntil(date: Date, today: Date) {
  return Math.ceil((startOfDay(date).getTime() - startOfDay(today).getTime()) / DAY_MS);
}

function formatMoney(value: number) {
  return `$${value.toLocaleString("es-CO")}`;
}

function parseNotificationData(data: string | null): Record<string, unknown> {
  if (!data) return {};
  try {
    return JSON.parse(data) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseReminderTimes(reminderTimes: string | null) {
  if (!reminderTimes) return [];
  try {
    const parsed = JSON.parse(reminderTimes);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((time): time is string => typeof time === "string" && /^\d{2}:\d{2}$/.test(time));
  } catch {
    return [];
  }
}

function getColombiaMinutesNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function isTimeDue(time: string, nowMinutes: number) {
  const [hours, minutes] = time.split(":").map(Number);
  const scheduledMinutes = hours * 60 + minutes;
  const configuredWindow = Number(process.env.MEDICATION_REMINDER_WINDOW_MINUTES);
  const windowMinutes = Number.isFinite(configuredWindow) && configuredWindow > 0
    ? configuredWindow
    : DEFAULT_MEDICATION_REMINDER_WINDOW_MINUTES;
  const elapsed = nowMinutes - scheduledMinutes;
  return elapsed >= 0 && elapsed < windowMinutes;
}

async function wasReminderSent(userId: string, reminderKey: string, type: string, since: Date) {
  const existing = await db.appNotification.findMany({
    where: {
      userId,
      type,
      createdAt: { gte: since },
    },
    select: { data: true },
  });

  return existing.some((notification) => parseNotificationData(notification.data).reminderKey === reminderKey);
}

async function sendReminderOnce(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  pushBody?: string;
  url?: string;
  reminderKey: string;
  data?: Record<string, unknown>;
  since: Date;
}) {
  const alreadySent = await wasReminderSent(params.userId, params.reminderKey, params.type, params.since);
  if (alreadySent) return false;

  await createAndPushNotification({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    pushBody: params.pushBody,
    url: params.url,
    data: {
      ...params.data,
      reminderKey: params.reminderKey,
    },
  });

  return true;
}

async function sendRecurringPaymentReminders(today: Date, since: Date) {
  const tomorrow = addDays(today, 1);
  const dueToday = await db.recurringPayment.findMany({
    where: {
      status: "pending",
      scheduledDate: { gte: today, lt: tomorrow },
      user: {
        settings: { notificationsEnabled: true },
      },
    },
    include: {
      account: { select: { name: true } },
      debt: { select: { name: true } },
    },
    orderBy: { scheduledDate: "asc" },
  });

  const byUser = new Map<string, typeof dueToday>();
  for (const payment of dueToday) {
    const list = byUser.get(payment.userId) ?? [];
    list.push(payment);
    byUser.set(payment.userId, list);
  }

  let sent = 0;
  for (const [userId, payments] of byUser) {
    const totalAmount = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const paymentList = payments
      .slice(0, 3)
      .map((payment) => {
        const source = payment.debt?.name || payment.account?.name || "";
        return `${payment.description}${source ? ` (${source})` : ""}`;
      })
      .join(", ");
    const moreCount = payments.length > 3 ? payments.length - 3 : 0;
    const pushBody = moreCount > 0
      ? `${paymentList} y ${moreCount} mas. Total: ${formatMoney(totalAmount)}`
      : `${paymentList}. Total: ${formatMoney(totalAmount)}`;

    const wasSent = await sendReminderOnce({
      userId,
      type: "recurring_due",
      title: `Pagos pendientes hoy (${payments.length})`,
      message: `Tienes ${payments.length} pago(s) programado(s) para hoy por un total de ${formatMoney(totalAmount)}. ${moreCount > 0 ? `${paymentList} y ${moreCount} mas.` : paymentList}`,
      pushBody,
      url: "/?module=finance&tab=recurring",
      reminderKey: `recurring:${getColombiaTodayString()}`,
      data: {
        paymentIds: payments.map((payment) => payment.id),
        totalAmount,
        count: payments.length,
      },
      since,
    });
    if (wasSent) sent += 1;
  }

  return { checked: byUser.size, sent };
}

async function sendTransportReminders(today: Date, since: Date) {
  const vehicles = await db.vehicle.findMany({
    where: {
      user: {
        settings: { notificationsEnabled: true },
      },
    },
    include: {
      fuelLogs: { orderBy: { date: "desc" } },
      maintenanceRecords: true,
      documents: true,
      reminders: { where: { isActive: true } },
    },
  });

  let sent = 0;
  let checked = 0;

  for (const vehicle of vehicles) {
    checked += 1;

    if (vehicle.tankCapacity && vehicle.fuelType !== "electric") {
      const fuelLevel = calculateFuelLevel(
        {
          tankCapacity: vehicle.tankCapacity,
          currentKm: vehicle.currentKm,
          type: vehicle.type,
        },
        vehicle.fuelLogs.map((log) => ({
          id: log.id,
          date: log.date,
          km: log.km,
          amount: toNumber(log.amount),
          pricePerGallon: toNumber(log.pricePerGallon),
          gallons: log.gallons,
          isFullTank: log.isFullTank,
        }))
      );

      if (fuelLevel.fuelLevel > 0 && fuelLevel.fuelLevel <= 15) {
        const wasSent = await sendReminderOnce({
          userId: vehicle.userId,
          type: "transport_fuel_low",
          title: `Combustible bajo: ${vehicle.name}`,
          message: `${vehicle.name} esta en ${Math.round(fuelLevel.fuelLevel)}%. Quedan aproximadamente ${fuelLevel.estimatedRange} km de autonomia.`,
          pushBody: `${vehicle.name}: ${Math.round(fuelLevel.fuelLevel)}% de combustible, ~${fuelLevel.estimatedRange} km.`,
          url: "/?module=transport",
          reminderKey: `fuel-low:${vehicle.id}:${getColombiaTodayString()}`,
          data: {
            vehicleId: vehicle.id,
            fuelLevel: fuelLevel.fuelLevel,
            estimatedRange: fuelLevel.estimatedRange,
          },
          since,
        });
        if (wasSent) sent += 1;
      }
    }

    for (const record of vehicle.maintenanceRecords) {
      if (!record.reminderEnabled) continue;
      const kmRemaining = record.nextDueKm ? record.nextDueKm - vehicle.currentKm : null;
      const dateDays = record.nextDueDate ? daysUntil(record.nextDueDate, today) : null;
      const isKmDue = kmRemaining !== null && kmRemaining <= 1000;
      const isDateDue = dateDays !== null && dateDays <= 30;
      if (!isKmDue && !isDateDue) continue;

      const dueText = kmRemaining !== null && kmRemaining <= 0
        ? "ya esta vencido por kilometraje"
        : kmRemaining !== null
          ? `vence en ${Math.max(0, Math.round(kmRemaining)).toLocaleString("es-CO")} km`
          : dateDays !== null && dateDays <= 0
            ? "vence hoy"
            : `vence en ${dateDays} dias`;

      const wasSent = await sendReminderOnce({
        userId: vehicle.userId,
        type: "transport_maintenance_due",
        title: `Mantenimiento: ${vehicle.name}`,
        message: `${record.description || record.type} ${dueText}.`,
        pushBody: `${vehicle.name}: ${record.description || record.type} ${dueText}.`,
        url: "/?module=transport",
        reminderKey: `maintenance:${record.id}:${getColombiaTodayString()}`,
        data: {
          vehicleId: vehicle.id,
          maintenanceId: record.id,
          kmRemaining,
          daysUntil: dateDays,
        },
        since,
      });
      if (wasSent) sent += 1;
    }

    for (const doc of vehicle.documents) {
      if (!doc.reminderEnabled) continue;
      const remaining = daysUntil(doc.expiryDate, today);
      if (remaining > doc.reminderDays) continue;

      const dueText = remaining < 0
        ? `vencio hace ${Math.abs(remaining)} dias`
        : remaining === 0
          ? "vence hoy"
          : `vence en ${remaining} dias`;

      const wasSent = await sendReminderOnce({
        userId: vehicle.userId,
        type: "transport_document_due",
        title: `Documento por vencer: ${vehicle.name}`,
        message: `${doc.type.toUpperCase()} ${dueText}.`,
        pushBody: `${vehicle.name}: ${doc.type.toUpperCase()} ${dueText}.`,
        url: "/?module=transport",
        reminderKey: `document:${doc.id}:${getColombiaTodayString()}`,
        data: {
          vehicleId: vehicle.id,
          documentId: doc.id,
          daysUntil: remaining,
        },
        since,
      });
      if (wasSent) sent += 1;
    }

    for (const reminder of vehicle.reminders) {
      const kmRemaining = reminder.dueKm != null ? reminder.dueKm - vehicle.currentKm : null;
      const dateDays = reminder.dueDate ? daysUntil(reminder.dueDate, today) : null;
      const isKmDue = kmRemaining !== null && kmRemaining <= (reminder.warningKm ?? 500);
      const isDateDue = dateDays !== null && dateDays <= reminder.warningDays;
      if (!isKmDue && !isDateDue) continue;

      const dueParts = [
        kmRemaining !== null && kmRemaining <= 0
          ? "ya esta vencido por kilometraje"
          : kmRemaining !== null
            ? `faltan ${Math.max(0, Math.round(kmRemaining)).toLocaleString("es-CO")} km`
            : null,
        dateDays !== null && dateDays <= 0
          ? "vence hoy"
          : dateDays !== null
            ? `vence en ${dateDays} dias`
            : null,
      ].filter(Boolean);

      const dueText = dueParts.join(" y ");
      const wasSent = await sendReminderOnce({
        userId: vehicle.userId,
        type: "transport_custom_reminder_due",
        title: `Recordatorio: ${vehicle.name}`,
        message: `${reminder.title}${dueText ? `: ${dueText}` : ""}.`,
        pushBody: `${vehicle.name}: ${reminder.title}${dueText ? ` (${dueText})` : ""}.`,
        url: "/?module=transport",
        reminderKey: `vehicle-reminder:${reminder.id}:${getColombiaTodayString()}`,
        data: {
          vehicleId: vehicle.id,
          reminderId: reminder.id,
          kmRemaining,
          daysUntil: dateDays,
        },
        since,
      });
      if (wasSent) sent += 1;
    }
  }

  return { checked, sent };
}

async function sendMedicationReminders(since: Date) {
  const medications = await db.medication.findMany({
    where: {
      isActive: true,
      reminderEnabled: true,
      user: {
        settings: { notificationsEnabled: true },
      },
    },
    select: {
      id: true,
      userId: true,
      name: true,
      dosage: true,
      howToTake: true,
      reminderTimes: true,
    },
  });

  const nowMinutes = getColombiaMinutesNow();
  let sent = 0;

  for (const medication of medications) {
    for (const time of parseReminderTimes(medication.reminderTimes)) {
      if (!isTimeDue(time, nowMinutes)) continue;

      const instructions = medication.howToTake === "with_food"
        ? " Tómalo con alimentos."
        : medication.howToTake === "without_food"
          ? " Tómalo en ayunas."
          : "";
      const wasSent = await sendReminderOnce({
        userId: medication.userId,
        type: "medication_due",
        title: `Hora de tomar ${medication.name}`,
        message: `Toma ${medication.dosage} de ${medication.name} a las ${time}.${instructions}`,
        pushBody: `${medication.name}: ${medication.dosage}.${instructions}`,
        url: "/?module=health&tab=medications",
        reminderKey: `medication:${medication.id}:${getColombiaTodayString()}:${time}`,
        data: {
          medicationId: medication.id,
          scheduledTime: time,
        },
        since,
      });
      if (wasSent) sent += 1;
    }
  }

  return { checked: medications.length, sent };
}

export async function runServerReminders() {
  const todayString = getColombiaTodayString();
  const today = createColombiaDate(todayString);
  const since = startOfDay(today);

  const [recurring, transport, medications] = await Promise.all([
    sendRecurringPaymentReminders(today, since),
    sendTransportReminders(today, since),
    sendMedicationReminders(since),
  ]);

  return {
    date: todayString,
    recurring,
    transport,
    medications,
    sent: recurring.sent + transport.sent + medications.sent,
  };
}
