/**
 * Sonido de las notificaciones de medicación.
 *
 * Regla de Android que manda aquí: el sonido vive en el **canal** y un canal es
 * inmutable una vez creado. Por eso, cada cambio de sonido estrena un canal
 * (`quid-doses-<hash>`) y se borran los anteriores.
 *
 * Preferencia: es **por dispositivo**, no por cuenta (el sonido del teléfono de
 * la oficina no tiene por qué ser el del teléfono personal), así que se guarda en
 * `localStorage`.
 *
 * Orígenes posibles del sonido:
 *   - preajustes incluidos en la app (`res/raw`),
 *   - "predeterminado" del sistema,
 *   - cualquier tono elegido con el **selector del teléfono** (plugin nativo).
 */

import { LocalNotifications } from "@capacitor/local-notifications";
import { registerPlugin } from "@capacitor/core";
import { isNativeAndroid } from "./biometric";

interface QuidDoseSoundPlugin {
  pickSound(options: { type?: string; currentUri?: string }): Promise<{
    uri: string;
    title: string;
    silent: boolean;
  }>;
  applyChannel(options: {
    channelId: string;
    name?: string;
    description?: string;
    soundUri?: string;
  }): Promise<{ channelId: string; soundUri: string }>;
  deleteChannel(options: { channelId: string }): Promise<void>;
  listChannels(options: { prefix?: string }): Promise<{ channels: string[] }>;
  preview(options: { soundUri?: string }): Promise<void>;
  stopPreview(): Promise<void>;
}

const QuidDoseSound = registerPlugin<QuidDoseSoundPlugin>("QuidDoseSound");

const PACKAGE_NAME = "app.quid.finance";
const STORAGE_KEY = "quid:dose-sound:v1";
const CHANNEL_PREFIX = "quid-doses-";

export const DOSE_CHANNEL_NAME = "Recordatorios de medicación";
const DOSE_CHANNEL_DESCRIPTION = "Avisos para tomar tus medicamentos";

export type SoundSource = "preset" | "system" | "custom" | "silent";

export interface DoseSoundChoice {
  /** Identificador estable de la elección (también alimenta el id del canal). */
  key: string;
  source: SoundSource;
  /** URI que entiende Android (`android.resource://`, `content://` o "default"). */
  uri: string;
  /** Nombre legible para la UI. */
  title: string;
}

/** Preajustes incluidos en la app. */
export const BUNDLED_SOUNDS: DoseSoundChoice[] = [
  {
    key: "pill_rattle",
    source: "preset",
    uri: `android.resource://${PACKAGE_NAME}/raw/pill_rattle`,
    title: "Pastillero",
  },
  {
    key: "pill_shake",
    source: "preset",
    uri: `android.resource://${PACKAGE_NAME}/raw/pill_shake`,
    title: "Pastillero (sacudida)",
  },
  {
    key: "soft_chime",
    source: "preset",
    uri: `android.resource://${PACKAGE_NAME}/raw/soft_chime`,
    title: "Campana suave",
  },
];

/** Opción por defecto hasta que el usuario elija otra cosa. */
export const DEFAULT_SOUND_CHOICE: DoseSoundChoice = BUNDLED_SOUNDS[0];

export const SYSTEM_DEFAULT_CHOICE: DoseSoundChoice = {
  key: "system_default",
  source: "system",
  uri: "default",
  title: "Sonido del sistema",
};

export const SILENT_CHOICE: DoseSoundChoice = {
  key: "silent",
  source: "silent",
  uri: "",
  title: "Silencio",
};

/** Mapa nombre de archivo (res/raw) por si el plugin nativo no está disponible. */
const BUNDLED_FILE_BY_KEY: Record<string, string> = {
  pill_rattle: "pill_rattle.wav",
  pill_shake: "pill_shake.wav",
  soft_chime: "soft_chime.wav",
};

function hash(value: string): string {
  let out = 0;
  for (let index = 0; index < value.length; index += 1) {
    out = ((out << 5) - out + value.charCodeAt(index)) | 0;
  }
  return (out >>> 0).toString(36);
}

/** Id de canal estable para una elección de sonido. */
export function channelIdFor(choice: DoseSoundChoice): string {
  return `${CHANNEL_PREFIX}${hash(choice.key + "|" + choice.uri).slice(0, 8)}`;
}

export function getDoseSoundChoice(): DoseSoundChoice {
  if (typeof localStorage === "undefined") return DEFAULT_SOUND_CHOICE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SOUND_CHOICE;
    const parsed = JSON.parse(raw) as Partial<DoseSoundChoice>;
    if (!parsed?.key || typeof parsed.uri !== "string") return DEFAULT_SOUND_CHOICE;
    return {
      key: parsed.key,
      source: (parsed.source as SoundSource) ?? "custom",
      uri: parsed.uri,
      title: parsed.title ?? "Sonido personalizado",
    };
  } catch {
    return DEFAULT_SOUND_CHOICE;
  }
}

function persist(choice: DoseSoundChoice): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice));
  } catch {
    // Sin almacenamiento: el canal igual queda aplicado en esta sesión.
  }
}

/**
 * Crea el canal del sonido elegido y borra los anteriores.
 *
 * Devuelve el id de canal que deben usar las notificaciones.
 */
export async function applyDoseSound(
  choice: DoseSoundChoice = getDoseSoundChoice(),
): Promise<string> {
  const channelId = channelIdFor(choice);

  if (!isNativeAndroid()) {
    // PWA / navegador: solo se persiste la preferencia.
    persist(choice);
    return channelId;
  }

  try {
    await QuidDoseSound.applyChannel({
      channelId,
      name: DOSE_CHANNEL_NAME,
      description: DOSE_CHANNEL_DESCRIPTION,
      soundUri: choice.uri,
    });

    // Limpieza: los canales viejos no se pueden modificar, así que se borran.
    const { channels } = await QuidDoseSound.listChannels({ prefix: CHANNEL_PREFIX });
    for (const old of channels ?? []) {
      if (old !== channelId) {
        await QuidDoseSound.deleteChannel({ channelId: old });
      }
    }
  } catch (error) {
    // APK viejo sin el plugin: se cae al canal de Capacitor con archivo incluido.
    console.warn("Canal nativo no disponible, usando el plugin:", error);
    const file = BUNDLED_FILE_BY_KEY[choice.key] ?? BUNDLED_FILE_BY_KEY.pill_rattle;
    try {
      await LocalNotifications.createChannel({
        id: channelId,
        name: DOSE_CHANNEL_NAME,
        description: DOSE_CHANNEL_DESCRIPTION,
        importance: 5,
        visibility: 1,
        sound: file,
        vibration: true,
        lights: true,
        lightColor: "#10b981",
      });
    } catch (fallbackError) {
      console.warn("No se pudo crear el canal de medicación:", fallbackError);
    }
  }

  persist(choice);
  return channelId;
}

/** Abre el selector de tonos del teléfono y devuelve la elección (sin guardarla). */
export async function pickSoundFromDevice(): Promise<DoseSoundChoice | null> {
  if (!isNativeAndroid()) return null;
  const current = getDoseSoundChoice();
  const result = await QuidDoseSound.pickSound({
    type: "notification",
    currentUri: current.uri.startsWith("content://") ? current.uri : undefined,
  });
  if (result.silent) return SILENT_CHOICE;
  return {
    key: `custom:${hash(result.uri).slice(0, 10)}`,
    source: "custom",
    uri: result.uri,
    title: result.title,
  };
}

/** Reproduce una elección para que el usuario la escuche. */
export async function previewSound(choice: DoseSoundChoice): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await QuidDoseSound.preview({ soundUri: choice.uri });
  } catch (error) {
    console.warn("No se pudo previsualizar el sonido:", error);
  }
}

export async function stopSoundPreview(): Promise<void> {
  if (!isNativeAndroid()) return;
  try {
    await QuidDoseSound.stopPreview();
  } catch {
    // Sin plugin nativo no hay nada que detener.
  }
}

/** Aplica y guarda una elección. */
export async function saveDoseSound(choice: DoseSoundChoice): Promise<string> {
  return applyDoseSound(choice);
}
