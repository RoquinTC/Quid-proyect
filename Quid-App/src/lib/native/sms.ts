/**
 * F-01 · Lectura de SMS en Android.
 *
 * Envuelve el plugin nativo `QuidSms` y **degrada con elegancia**: en web, en
 * iOS o si el plugin no está disponible, devuelve una lista vacía con un
 * mensaje claro en vez de lanzar. La captura por SMS es opt-in: el llamador
 * solo debe invocarla cuando el usuario la activó en ajustes.
 *
 * El plugin solo LEE la bandeja de entrada. La interpretación del texto la
 * hace el servidor con el mismo parser de la bandeja (F-49), así que la
 * lógica vive en un solo lugar y se prueba sin dispositivo.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";

export type RawSms = {
  address: string | null;
  body: string;
  /** Milisegundos desde epoch (hora del teléfono). */
  date: number;
};

interface QuidSmsPlugin {
  readRecent(options: { limit?: number; sinceDays?: number }): Promise<{ messages: RawSms[] }>;
}

const QuidSms = registerPlugin<QuidSmsPlugin>("QuidSms");

/** ¿Estamos en la app Android (único lugar donde se pueden leer SMS)? */
export function isSmsReadingAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

export type ReadSmsResult =
  | { ok: true; messages: RawSms[] }
  | { ok: false; reason: "unsupported" | "permission" | "error"; message: string };

/**
 * Lee los SMS recientes del teléfono.
 *
 * @param limit      máximo de mensajes (1..500)
 * @param sinceDays  ventana hacia atrás en días (1..90)
 */
export async function readRecentSms(
  limit = 50,
  sinceDays = 7
): Promise<ReadSmsResult> {
  if (!isSmsReadingAvailable()) {
    return {
      ok: false,
      reason: "unsupported",
      message: "La lectura de SMS solo está disponible en la app de Android.",
    };
  }

  try {
    const result = await QuidSms.readRecent({ limit, sinceDays });
    return { ok: true, messages: result?.messages ?? [] };
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    // El plugin rechaza con un texto propio cuando el usuario niega el permiso.
    const isPermission = /permiso|permission/i.test(raw);
    return {
      ok: false,
      reason: isPermission ? "permission" : "error",
      message: isPermission
        ? "Sin permiso para leer SMS. Actívalo en los ajustes de Android."
        : raw || "No se pudieron leer los SMS.",
    };
  }
}
