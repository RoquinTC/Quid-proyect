import { db } from "@/lib/db";
import { createAndPushNotification } from "@/lib/push";
import { calculateFuelLevel } from "@/lib/fuel-level";
import { toNumber } from "@/lib/decimal-serializer";
import {
  addDaysToKey,
  bandFor,
  colombiaTodayKey,
  dateKeyOf,
  daysBetweenKeys,
  dueTextEs,
  formatKeyEs,
  mostUrgentBand,
  PAYMENT_UPCOMING_DAYS,
  paymentBandFor,
  reminderKeyFor,
  type PaymentBand,
} from "@/lib/reminders/engine";

const DEFAULT_MEDICATION_REMINDER_WINDOW_MINUTES = 15;

/** Cuánto se mira hacia atrás para no repetir un aviso ya enviado. */
const DEDUPE_LOOKBACK_DAYS = 400;

/**
 * Pagos: aviso a 3 días y el día del vencimiento. Si se pasa, uno al día
 * siguiente y luego uno por semana — nunca todos los días.
 */

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

// ───────────────────────────────────────────────────────────────────────────
// Pagos recurrentes
// ───────────────────────────────────────────────────────────────────────────

async function sendRecurringPaymentReminders(scope: { userId?: string }, todayKey: string, since: Date) {
  const from = new Date(Date.UTC(
    Number(todayKey.slice(0, 4)),
    Number(todayKey.slice(5, 7)) - 1,
    Number(todayKey.slice(8, 10)) - 40,
  ));
  const to = new Date(Date.UTC(
    Number(todayKey.slice(0, 4)),
    Number(todayKey.slice(5, 7)) - 1,
    Number(todayKey.slice(8, 10)) + 10,
  ));

  const pending = await db.recurringPayment.findMany({
    where: {
      status: "pending",
      ...(scope.userId ? { userId: scope.userId } : {}),
      scheduledDate: { gte: from, lte: to },
      user: { settings: { notificationsEnabled: true } },
    },
    select: {
      id: true,
      userId: true,
      description: true,
      amount: true,
      type: true,
      scheduledDate: true,
      account: { select: { name: true } },
      debt: { select: { name: true } },
    },
    orderBy: { scheduledDate: "asc" },
  });

  type Entry = {
    id: string;
    description: string;
    amount: number;
    dueKey: string;
    days: number;
    band: PaymentBand;
    source: string;
    /** Un ingreso no se suma con lo que sale: son direcciones distintas. */
    isIncome: boolean;
  };

  const byUserAndBand = new Map<string, { userId: string; band: PaymentBand; entries: Entry[] }>();

  for (const payment of pending) {
    const dueKey = dateKeyOf(payment.scheduledDate);
    if (!dueKey) continue;

    const days = daysBetweenKeys(todayKey, dueKey);
    const band = paymentBandFor(days);
    if (!band) continue;

    const groupKey = `${payment.userId}:${band}`;
    const entry: Entry = {
      id: payment.id,
      description: payment.description,
      amount: toNumber(payment.amount),
      dueKey,
      days,
      band,
      source: payment.debt?.name || payment.account?.name || "",
      isIncome: payment.type === "income",
    };

    const group = byUserAndBand.get(groupKey);
    if (group) group.entries.push(entry);
    else byUserAndBand.set(groupKey, { userId: payment.userId, band, entries: [entry] });
  }

  let sent = 0;

  for (const { userId, band, entries } of byUserAndBand.values()) {
    entries.sort((a, b) => a.days - b.days);

    const total = entries.reduce((sum, entry) => sum + entry.amount, 0);
    const outTotal = entries.filter((entry) => !entry.isIncome).reduce((sum, entry) => sum + entry.amount, 0);
    const inTotal = entries.filter((entry) => entry.isIncome).reduce((sum, entry) => sum + entry.amount, 0);
    const hasIncome = inTotal > 0;

    // Sumar ingresos con gastos daría un total que no significa nada.
    const amountText = outTotal > 0 && hasIncome
      ? `${formatMoney(outTotal)} a pagar y ${formatMoney(inTotal)} por recibir`
      : hasIncome
        ? `${formatMoney(inTotal)} por recibir`
        : formatMoney(outTotal);
    const noun = hasIncome ? "movimiento" : "pago";

    const shown = entries.slice(0, 3).map((entry) => {
      const when = entry.days === 0
        ? "hoy"
        : entry.days > 0
          ? `en ${entry.days} d`
          : `vencido ${Math.abs(entry.days)} d`;
      const label = `• ${entry.description}${entry.source ? ` (${entry.source})` : ""}: ${formatMoney(entry.amount)}`;
      return `${label} — ${when}, ${formatKeyEs(entry.dueKey)}`;
    });
    const moreCount = entries.length - shown.length;
    const lines = [...shown, moreCount > 0 ? `• y ${moreCount} más` : ""].filter(Boolean).join("\n");

    const title = band === "upcoming"
      ? `${hasIncome ? "Movimientos" : "Pagos"} en ${PAYMENT_UPCOMING_DAYS} días (${entries.length})`
      : band === "due"
        ? `${hasIncome ? "Movimientos" : "Pagos"} que vencen hoy (${entries.length})`
        : `${hasIncome ? "Movimientos" : "Pagos"} vencidos (${entries.length})`;

    const headline = band === "upcoming"
      ? `Se acerca${entries.length > 1 ? "n" : ""} ${entries.length} ${noun}${entries.length > 1 ? "s" : ""} — ${amountText}:`
      : band === "due"
        ? `Vence${entries.length > 1 ? "n" : ""} hoy ${entries.length} ${noun}${entries.length > 1 ? "s" : ""} — ${amountText}:`
        : `Sigue${entries.length > 1 ? "n" : ""} pendiente${entries.length > 1 ? "s" : ""} ${entries.length} ${noun}${entries.length > 1 ? "s" : ""} — ${amountText}:`;

    const pushBody = entries.length === 1
      ? `${entries[0].description}: ${formatMoney(entries[0].amount)} · ${formatKeyEs(entries[0].dueKey)}`
      : `${entries.length} ${hasIncome ? "movimientos" : "pagos"} · ${amountText} · ${formatKeyEs(entries[0].dueKey)}`;

    const wasSent = await sendReminderOnce({
      userId,
      type: band === "upcoming" ? "recurring_upcoming" : "recurring_due",
      title,
      message: `${headline}\n${lines}`,
      pushBody,
      url: "/?module=finance&tab=recurring",
      reminderKey: `pay:${userId}:${band}:${todayKey}`,
      data: {
        band,
        paymentIds: entries.map((entry) => entry.id),
        dueKeys: entries.map((entry) => entry.dueKey),
        totalAmount: total,
        outTotal,
        inTotal,
        count: entries.length,
      },
      since,
    });
    if (wasSent) sent += 1;
  }

  return { checked: pending.length, sent };
}

// ───────────────────────────────────────────────────────────────────────────
// Transporte: recordatorios del vehículo y documentos
// ───────────────────────────────────────────────────────────────────────────

/**
 * Los mantenimientos NO se leen aquí a propósito: al registrarlos ya se crea
 * su `VehicleReminder` (la obligación pendiente). Leer las dos cosas mostraba
 * el mismo cambio de aceite dos veces y, con el aviso diario anterior, todos
 * los días.
 */
async function sendTransportReminders(scope: { userId?: string }, todayKey: string, since: Date) {
  const vehicles = await db.vehicle.findMany({
    where: {
      ...(scope.userId ? { userId: scope.userId } : {}),
      user: {
        settings: { notificationsEnabled: true },
      },
    },
    include: {
      fuelLogs: { orderBy: { date: "desc" } },
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
          message: `${vehicle.name} está en ${Math.round(fuelLevel.fuelLevel)}%. Quedan aproximadamente ${fuelLevel.estimatedRange} km de autonomía.`,
          pushBody: `${vehicle.name}: ${Math.round(fuelLevel.fuelLevel)}% de combustible, ~${fuelLevel.estimatedRange} km.`,
          url: "/?module=transport",
          reminderKey: `fuel-low:${vehicle.id}:${todayKey}`,
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

    for (const reminder of vehicle.reminders) {
      const dueKey = dateKeyOf(reminder.dueDate);
      const days = dueKey ? daysBetweenKeys(todayKey, dueKey) : null;
      const kmRemaining = reminder.dueKm != null ? reminder.dueKm - vehicle.currentKm : null;

      const dayBand = days === null ? null : bandFor(days, [reminder.warningDays ?? 30, 7, 1, 0]);
      const kmBand = kmRemaining === null ? null : bandFor(kmRemaining, [reminder.warningKm ?? 500, 300, 50, 0]);
      const band = mostUrgentBand([dayBand, kmBand]);
      if (band === null) continue;

      const parts: string[] = [];
      if (days !== null && dayBand !== null && dueKey) {
        parts.push(dueTextEs(days, dueKey));
      }
      if (kmRemaining !== null && kmBand !== null) {
        parts.push(kmRemaining <= 0
          ? "kilometraje cumplido"
          : `faltan ${Math.round(kmRemaining).toLocaleString("es-CO")} km`);
      }

      const detail = parts.join(" · ");
      const wasSent = await sendReminderOnce({
        userId: vehicle.userId,
        type: "transport_custom_reminder_due",
        title: `Recordatorio: ${vehicle.name}`,
        message: `${reminder.title}${detail ? `: ${detail}` : ""}.`,
        pushBody: `${vehicle.name}: ${reminder.title}${detail ? ` (${detail})` : ""}.`,
        url: "/?module=transport",
        reminderKey: reminderKeyFor("vehicle-reminder", reminder.id, band),
        data: {
          vehicleId: vehicle.id,
          reminderId: reminder.id,
          band,
          daysUntil: days,
          kmRemaining,
        },
        since,
      });
      if (wasSent) sent += 1;
    }

    for (const doc of vehicle.documents) {
      if (!doc.reminderEnabled) continue;

      const dueKey = dateKeyOf(doc.expiryDate);
      if (!dueKey) continue;

      const remaining = daysBetweenKeys(todayKey, dueKey);
      const band = bandFor(remaining, [doc.reminderDays ?? 30, 7, 1, 0]);
      if (band === null) continue;

      const detail = dueTextEs(remaining, dueKey);
      const wasSent = await sendReminderOnce({
        userId: vehicle.userId,
        type: "transport_document_due",
        title: `Documento por vencer: ${vehicle.name}`,
        message: `${doc.type.toUpperCase()} ${detail}.`,
        pushBody: `${vehicle.name}: ${doc.type.toUpperCase()} ${detail}.`,
        url: "/?module=transport",
        reminderKey: reminderKeyFor("document", doc.id, band),
        data: {
          vehicleId: vehicle.id,
          documentId: doc.id,
          band,
          daysUntil: remaining,
        },
        since,
      });
      if (wasSent) sent += 1;
    }
  }

  return { checked, sent };
}

// ───────────────────────────────────────────────────────────────────────────
// Medicamentos
// ───────────────────────────────────────────────────────────────────────────

async function sendMedicationReminders(scope: { userId?: string }, todayKey: string, since: Date) {
  const medications = await db.medication.findMany({
    where: {
      isActive: true,
      reminderEnabled: true,
      ...(scope.userId ? { userId: scope.userId } : {}),
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
        reminderKey: `medication:${medication.id}:${todayKey}:${time}`,
        data: {
          medicationId: medication.id,
          scheduledTime: time,
          band: todayKey,
        },
        since,
      });
      if (wasSent) sent += 1;
    }
  }

  return { checked: medications.length, sent };
}

// ───────────────────────────────────────────────────────────────────────────
// Entradas
// ───────────────────────────────────────────────────────────────────────────

function dedupeSince(todayKey: string, days = DEDUPE_LOOKBACK_DAYS): Date {
  return new Date(`${addDaysToKey(todayKey, -days)}T00:00:00.000Z`);
}

async function run(scope: { userId?: string }) {
  const todayKey = colombiaTodayKey();
  // Los tramos de pago/transporte viven meses; las tomas de medicamento se
  // identifican por día, así que basta mirar dos días atrás.
  const since = dedupeSince(todayKey);
  const medicationSince = dedupeSince(todayKey, 2);

  const [recurring, transport, medications] = await Promise.all([
    sendRecurringPaymentReminders(scope, todayKey, since),
    sendTransportReminders(scope, todayKey, since),
    sendMedicationReminders(scope, todayKey, medicationSince),
  ]);

  return {
    date: todayKey,
    recurring,
    transport,
    medications,
    sent: recurring.sent + transport.sent + medications.sent,
  };
}

/** Todos los usuarios — lo llama el cron del servidor. */
export async function runServerReminders() {
  return run({});
}

/** Un usuario — lo llama la app al abrir (respaldo del cron). */
export async function runServerRemindersForUser(userId: string) {
  return run({ userId });
}
