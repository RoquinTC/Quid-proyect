"use client";

import { useEffect } from "react";
import { App } from "@capacitor/app";
import { LocalNotifications } from "@capacitor/local-notifications";
import { isNativeAndroid } from "@/lib/native/biometric";
import { syncHydrationReminders } from "@/lib/native/hydration-reminders";
import {
  type ReminderDose,
  cancelDoseNotification,
  syncDoseNotifications,
  snoozeLocalReminder,
} from "@/lib/native/medication-reminders";

function openQuidRoute(route?: string) {
  if (!route || typeof window === "undefined") return;
  window.location.href = route;
}

/** Aplica una acción de la notificación contra la API (misma lógica que la UI). */
async function postDoseAction(
  occurrenceId: string,
  action: "take" | "skip" | "snooze",
  minutes = 5,
): Promise<boolean> {
  try {
    const response = await fetch(`/api/doses/${occurrenceId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "snooze" ? { action, minutes } : { action }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Trae las tomas abiertas y programa sus notificaciones nativas. */
async function syncReminders(): Promise<void> {
  try {
    const response = await fetch("/api/doses?status=pending,snoozed");
    if (!response.ok) return;
    const payload = (await response.json()) as { items?: ReminderDose[] };
    if (payload.items?.length) {
      await syncDoseNotifications(payload.items);
    }
  } catch {
    // Sin red o sin sesión: se reintenta en el próximo arranque.
  }
}

export function NativeDeviceBridge() {
  useEffect(() => {
    if (!isNativeAndroid()) return;

    // Sincroniza al abrir la app y cada vez que vuelve a primer plano.
    void syncReminders();
    // Los avisos de agua se recalculan con la ventana despierta actual.
    void syncHydrationReminders();
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncReminders();
        void syncHydrationReminders();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const listeners = [
      LocalNotifications.addListener(
        "localNotificationActionPerformed",
        async ({ notification, actionId }) => {
          const occurrenceId = notification.extra?.occurrenceId as string | undefined;
          const storedDose = notification.extra?.dose as ReminderDose | undefined;
          const isDose = Boolean(occurrenceId);

          if (isDose && (actionId === "take" || actionId === "skip" || actionId === "snooze")) {
            const ok = await postDoseAction(
              occurrenceId as string,
              actionId,
              typeof notification.extra?.snoozeMinutes === "number"
                ? (notification.extra.snoozeMinutes as number)
                : 5,
            );

            // El snooze se reprograma en el dispositivo para que llegue aunque
            // la petición haya fallado o no haya red.
            if (actionId === "snooze" && storedDose) {
              await snoozeLocalReminder(storedDose, 5);
            }
            if (actionId !== "snooze" && ok) {
              // tomada/omitida: el aviso ya no debe existir
              await cancelDoseNotification(occurrenceId as string);
            }
          }

          // En todos los casos se abre la pantalla de salud para dar feedback.
          openQuidRoute(notification.extra?.route);
        },
      ),
      App.addListener("appUrlOpen", ({ url }) => {
        try {
          const parsed = new URL(url);
          openQuidRoute(`${parsed.pathname}${parsed.search}${parsed.hash}`);
        } catch {
          // Ignore malformed external links.
        }
      }),
    ];

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      listeners.forEach((listener) => {
        listener.then((handle) => handle.remove());
      });
    };
  }, []);

  return null;
}
