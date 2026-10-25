/**
 * Recordatorios de agua.
 *
 * Se reparten equitativamente entre la hora de despertar y la de dormir
 * (`computeReminderSlots`) y se programan como **notificaciones reales** del
 * sistema, igual que las tomas: si solo fueran avisos dentro de la app, no
 * servirían de nada.
 *
 * Decisiones:
 *  - Canal propio `quid-water` con sonido suave (la toma de agua no debe sonar
 *    como una alarma de medicación).
 *  - Ids en un rango reservado (`WATER_ID_BASE`) para poder cancelar solo los
 *    avisos de agua sin tocar los de medicación.
 *  - Se programan 7 días de una vez, así el recordatorio sobrevive aunque la
 *    persona no abra la app en varios días.
 *  - Si ya cumplió la meta de hoy, se omiten los avisos que quedan del día (los
 *    de mañana sí se programan).
 */

import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeAndroid } from "./biometric";
import {
  computeHydrationPlan,
  DEFAULT_HYDRATION_PROFILE,
  type HydrationProfile,
} from "@/lib/health/hydration-plan";
import { upcomingReminderTimes } from "@/lib/health/hydration-schedule";

export const WATER_CHANNEL_ID = "quid-water";
export const WATER_ROUTE = "/?tab=health&healthView=summary";

/** Rango de ids reservado para agua (no choca con los hashes de medicación). */
const WATER_ID_BASE = 1_500_000_000;
const MAX_WATER_NOTIFICATIONS = 200;
const SCHEDULE_DAYS = 7;

const PROFILE_KEY = "quid-hydration-plan";
const STORE_KEY = "quid-hydration-storage";

interface HydrationSnapshot {
  profile: HydrationProfile;
  currentMl: number;
  goalMl: number;
}

/** Lee perfil y progreso desde el almacenamiento local (sin React). */
export function readHydrationSnapshot(now: Date = new Date()): HydrationSnapshot {
  let profile: HydrationProfile = DEFAULT_HYDRATION_PROFILE;
  let currentMl = 0;

  try {
    const rawProfile = localStorage.getItem(PROFILE_KEY);
    if (rawProfile) {
      profile = { ...profile, ...(JSON.parse(rawProfile) as Partial<HydrationProfile>) };
    }
  } catch {
    // Perfil por defecto.
  }

  try {
    const rawStore = localStorage.getItem(STORE_KEY);
    if (rawStore) {
      const parsed = JSON.parse(rawStore) as {
        state?: { logs?: { amountMl: number; timestamp: number }[] };
      };
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      currentMl = (parsed.state?.logs ?? [])
        .filter((log) => log.timestamp >= startOfDay)
        .reduce((total, log) => total + (Number(log.amountMl) || 0), 0);
    }
  } catch {
    // Sin progreso: se asume 0.
  }

  const plan = computeHydrationPlan(profile);
  return { profile, currentMl, goalMl: plan.goalMl };
}

async function ensureWaterChannel(): Promise<void> {
  try {
    await LocalNotifications.createChannel({
      id: WATER_CHANNEL_ID,
      name: "Recordatorios de agua",
      description: "Avisos para tomar agua a lo largo del día",
      importance: 4,
      visibility: 1,
      sound: "soft_chime.wav",
      vibration: false,
      lights: true,
      lightColor: "#0ea5e9",
    });
  } catch (error) {
    console.warn("No se pudo crear el canal de agua:", error);
  }
}

async function ensurePermission(): Promise<boolean> {
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

/** Cancela solo los avisos de agua. */
export async function cancelHydrationReminders(): Promise<number> {
  if (!isNativeAndroid()) return 0;
  try {
    const pending = await LocalNotifications.getPending();
    const waterIds = (pending.notifications ?? [])
      .map((notification) => notification.id)
      .filter((id) => id >= WATER_ID_BASE && id < WATER_ID_BASE + MAX_WATER_NOTIFICATIONS);
    if (waterIds.length === 0) return 0;
    await LocalNotifications.cancel({
      notifications: waterIds.map((id) => ({ id })),
    });
    return waterIds.length;
  } catch {
    return 0;
  }
}

/**
 * Recalcula y reprograma todos los avisos de agua.
 *
 * Idempotente: cancela los anteriores y vuelve a crear los que correspondan.
 */
export async function syncHydrationReminders(
  options: { now?: Date; snapshot?: HydrationSnapshot } = {},
): Promise<{ scheduled: number; cancelled: number }> {
  if (!isNativeAndroid()) return { scheduled: 0, cancelled: 0 };
  if (!(await ensurePermission())) return { scheduled: 0, cancelled: 0 };

  const now = options.now ?? new Date();
  const snapshot = options.snapshot ?? readHydrationSnapshot(now);
  const plan = computeHydrationPlan(snapshot.profile);

  const cancelled = await cancelHydrationReminders();

  if (snapshot.profile.remindersEnabled === false) {
    return { scheduled: 0, cancelled };
  }

  await ensureWaterChannel();

  // Si ya cumplió la meta de hoy, hoy no se avisa más.
  const goalReachedToday = snapshot.currentMl >= plan.goalMl;
  const times = upcomingReminderTimes(snapshot.profile, plan.glasses, {
    now,
    days: SCHEDULE_DAYS,
    alignment: snapshot.profile.reminderAlignment ?? "centered",
  }).filter((item) => {
    if (!goalReachedToday) return true;
    const isToday =
      item.at.getFullYear() === now.getFullYear() &&
      item.at.getMonth() === now.getMonth() &&
      item.at.getDate() === now.getDate();
    return !isToday;
  });

  const limited = times.slice(0, MAX_WATER_NOTIFICATIONS);
  if (limited.length === 0) return { scheduled: 0, cancelled };

  const body =
    plan.isManual && snapshot.profile.manualGoalMl
      ? `Meta de hoy: ${plan.goalMl.toLocaleString("es-CO")} ml (${plan.glasses} vasos)`
      : `${plan.glasses} vasos de ${plan.glassMl} ml al día · ${plan.goalMl.toLocaleString("es-CO")} ml`;

  await LocalNotifications.schedule({
    notifications: limited.map((item, index) => ({
      id: WATER_ID_BASE + index,
      title: "Un vaso de agua",
      body,
      channelId: WATER_CHANNEL_ID,
      sound: "soft_chime.wav",
      schedule: { at: item.at, allowWhileIdle: true },
      extra: {
        route: WATER_ROUTE,
        kind: "hydration",
        slot: item.label,
      },
    })),
  });

  return { scheduled: limited.length, cancelled };
}
