/**
 * Notificaciones nativas de medicación (Android, vía Capacitor).
 *
 * Objetivo de producto: que el recordatorio sea una **notificación real del
 * teléfono** (no un aviso dentro de la app), con sonido distintivo tipo
 * pastillero y **acciones** para resolver la toma sin abrir la app:
 *
 *   [ Tomar ]  [ Omitir ]  [ En 5 min ]
 *
 * Al tocar el cuerpo de la notificación se abre la pantalla de confirmación
 * (`extra.route`), y al usar un botón se aplica la acción directamente contra la
 * API (misma lógica que la UI: `/api/doses/[id]/action`).
 *
 * Notas Android:
 *   - Desde Android 8 el sonido pertenece al **canal**, no a la notificación.
 *     Por eso se crea el canal `quid-doses` con el sonido propio.
 *   - El sonido debe existir en `android/app/src/main/res/raw/pillbox.wav`.
 *   - Android 13+ exige el permiso POST_NOTIFICATIONS en runtime.
 */

import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeAndroid } from "./biometric";
import {
  applyDoseSound,
  channelIdFor,
  getDoseSoundChoice,
  type DoseSoundChoice,
} from "./notification-sound";

export const DOSE_ACTION_TYPE_ID = "quid-dose-actions";
/** Ruta de la app a la que lleva tocar la notificación. */
export const DOSE_ROUTE = "/?tab=health&healthView=medications";

/** Archivo en res/raw por preajuste (solo para Android < 8, que ignora canales). */
const LEGACY_SOUND_FILE_BY_KEY: Record<string, string> = {
  pill_rattle: "pill_rattle.wav",
  pill_shake: "pill_shake.wav",
  soft_chime: "soft_chime.wav",
};

export interface ReminderDose {
  id: string;
  medicationName: string;
  dosage?: string | null;
  plannedDose: number;
  stockUnit?: string | null;
  scheduledAt: string;
  status: string;
  snoozeCount: number;
}

/**
 * Id numérico estable y distinto del que usan las citas
 * (`notificationIdFor("appointment:…")`): se hashea con prefijo propio.
 */
function notificationIdForDose(occurrenceId: string): number {
  const value = `dose:${occurrenceId}`;
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.max(1, hash & 0x7fffffff);
}

/** Crea (o recrea) el canal con el sonido elegido y devuelve su id. */
export async function ensureDoseChannel(
  choice: DoseSoundChoice = getDoseSoundChoice(),
): Promise<string> {
  if (!isNativeAndroid()) return channelIdFor(choice);
  return applyDoseSound(choice);
}

/** Registra los botones de acción de la notificación (idempotente). */
export async function registerDoseActionTypes(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: DOSE_ACTION_TYPE_ID,
          actions: [
            { id: "take", title: "Tomar" },
            { id: "skip", title: "Omitir", destructive: true },
            { id: "snooze", title: "En 5 min" },
          ],
        },
      ],
    });
  } catch (error) {
    console.warn("No se pudieron registrar las acciones de medicación:", error);
  }
}

/** Pide permiso de notificaciones (Android 13+) y devuelve si quedó concedido. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isNativeAndroid()) return false;
  const current = await LocalNotifications.checkPermissions();
  if (current.display === "granted") return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === "granted";
}

function bodyFor(dose: ReminderDose): string {
  const amount = dose.dosage
    ? `${dose.plannedDose} × ${dose.dosage}`
    : `${dose.plannedDose} ${dose.stockUnit ?? "dosis"}`;
  return dose.snoozeCount > 0
    ? `${dose.medicationName} · ${amount} (pospuesta ${dose.snoozeCount}×)`
    : `${dose.medicationName} · ${amount}`;
}

/** Programa (o reprograma) el aviso de una toma. */
export async function scheduleDoseNotification(
  dose: ReminderDose,
  options: { at?: Date; channelId?: string; choice?: DoseSoundChoice } = {},
): Promise<void> {
  if (!isNativeAndroid()) return;

  const choice = options.choice ?? getDoseSoundChoice();
  const channelId = options.channelId ?? channelIdFor(choice);

  const id = notificationIdForDose(dose.id);
  await LocalNotifications.cancel({ notifications: [{ id }] });

  const at = options.at ?? new Date(dose.scheduledAt);
  // Si la hora ya pasó, se dispara de inmediato (1 s) en vez de perderse.
  const when = at.getTime() > Date.now() ? at : new Date(Date.now() + 1000);

  // Android 8+ toma el sonido del canal; el campo `sound` solo aplica a versiones
  // anteriores y exige un archivo de res/raw (una URI no sirve ahí).
  const legacySound = LEGACY_SOUND_FILE_BY_KEY[choice.key];

  await LocalNotifications.schedule({
    notifications: [
      {
        id,
        title: "Hora de tu medicamento",
        body: bodyFor(dose),
        channelId,
        actionTypeId: DOSE_ACTION_TYPE_ID,
        ...(legacySound ? { sound: legacySound } : {}),
        schedule: { at: when, allowWhileIdle: true },
        extra: {
          route: DOSE_ROUTE,
          occurrenceId: dose.id,
          medicationName: dose.medicationName,
          // Se guarda la toma completa para que el botón "En 5 min" funcione
          // aunque no haya red al momento de tocarlo.
          dose,
          snoozeMinutes: 5,
        },
      },
    ],
  });
}

/** Cancela el aviso de una toma (cuando ya se tomó, omitió o se borró). */
export async function cancelDoseNotification(occurrenceId: string): Promise<void> {
  if (!isNativeAndroid()) return;
  await LocalNotifications.cancel({
    notifications: [{ id: notificationIdForDose(occurrenceId) }],
  });
}

/**
 * Sincroniza el estado local con una lista de tomas: programa las abiertas y
 * cancela las que ya no lo están. Idempotente.
 */
export async function syncDoseNotifications(doses: ReminderDose[]): Promise<void> {
  if (!isNativeAndroid()) return;
  if (!(await ensureNotificationPermission())) return;

  const choice = getDoseSoundChoice();
  const channelId = await ensureDoseChannel(choice);
  await registerDoseActionTypes();

  for (const dose of doses) {
    if (dose.status === "pending" || dose.status === "snoozed") {
      await scheduleDoseNotification(dose, { channelId, choice });
    } else {
      await cancelDoseNotification(dose.id);
    }
  }
}

/**
 * Reprograma un aviso en `minutes` a partir de ahora (botón "En 5 min").
 * Se hace en el cliente para que funcione incluso sin red.
 */
export async function snoozeLocalReminder(
  dose: ReminderDose,
  minutes: number,
): Promise<void> {
  await scheduleDoseNotification(dose, {
    at: new Date(Date.now() + minutes * 60 * 1000),
  });
}
