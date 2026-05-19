"use client";

import { useEffect, useCallback, useRef } from "react";
import { getColombiaTodayString } from "@/lib/api";

interface MedicationReminder {
  id: string;
  name: string;
  dosage: string;
  reminderTimes: string | null;
  isActive: boolean;
  reminderEnabled: boolean;
}

interface AppointmentReminder {
  id: string;
  doctorName: string | null;
  specialty: string | null;
  date: string;
  status: string;
  reminderEnabled: boolean;
}

interface VehicleWithReminders {
  id: string;
  name: string;
  type: string;
  currentKm: number;
  tankCapacity?: number | null;
  fuelType?: string | null;
  maintenanceRecords: Array<{
    id: string;
    type: string;
    description: string;
    nextDueKm: number | null;
    nextDueDate: string | null;
    reminderEnabled: boolean;
  }>;
  documents: Array<{
    id: string;
    type: string;
    expiryDate: string;
    reminderDays: number;
    reminderEnabled: boolean;
  }>;
}

interface FuelLevelResult {
  fuelLevel: number;
}

// Simple audio tone for reminders
function playReminderTone() {
  try {
    const audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";
    gainNode.gain.value = 0.3;

    oscillator.start();

    setTimeout(() => {
      oscillator.frequency.value = 1000;
    }, 200);
    setTimeout(() => {
      oscillator.frequency.value = 800;
    }, 400);
    setTimeout(() => {
      oscillator.stop();
      audioContext.close();
    }, 600);
  } catch {
    // Audio not available
  }
}

// ─── Maintenance type labels ───
const MAINTENANCE_LABELS: Record<string, string> = {
  oil_change: "Cambio de aceite",
  tire_change: "Cambio de llantas",
  brake_service: "Servicio de frenos",
  general: "Revisión general",
  parts_replacement: "Cambio de repuestos",
  alignment: "Alineación/Balanceo",
  suspension: "Suspensión",
  transmission: "Transmisión",
  electrical: "Sistema eléctrico",
  cooling: "Enfriamiento",
  ac: "Aire acondicionado",
  battery: "Batería",
  inspection: "Inspección",
  wash: "Lavado",
  aesthetics: "Estética",
  other: "Mantenimiento",
};

const DOCUMENT_LABELS: Record<string, string> = {
  soat: "SOAT",
  tecnomecanica: "Tecnomecánica",
  seguro: "Seguro",
  impuesto: "Impuesto",
  otro: "Documento",
};

export function useReminders() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());

  const requestPermission = useCallback(async () => {
    if ("Notification" in window && Notification.permission === "default") {
      await Notification.requestPermission();
    }
  }, []);

  const checkMedications = useCallback(async () => {
    try {
      const res = await fetch("/api/medications");
      if (!res.ok) return;
      const medications: MedicationReminder[] = await res.json();

      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

      for (const med of medications) {
        if (!med.isActive || !med.reminderEnabled || !med.reminderTimes) continue;

        try {
          const times: string[] = JSON.parse(med.reminderTimes);
          for (const time of times) {
            const notifKey = `${med.id}-${time}-${getColombiaTodayString()}`;
            if (time === currentTime && !notifiedRef.current.has(notifKey)) {
              notifiedRef.current.add(notifKey);
              playReminderTone();

              if ("Notification" in window && Notification.permission === "granted") {
                new Notification("💊 Hora de tu medicamento", {
                  body: `${med.name} - ${med.dosage}`,
                  icon: "/favicon.ico",
                  tag: notifKey,
                });
              }
            }
          }
        } catch {
          // Invalid reminder times format
        }
      }
    } catch {
      // Failed to fetch medications
    }
  }, []);

  const checkAppointments = useCallback(async () => {
    try {
      const res = await fetch("/api/appointments");
      if (!res.ok) return;
      const appointments: AppointmentReminder[] = await res.json();

      const now = new Date();

      for (const apt of appointments) {
        if (apt.status !== "scheduled" || !apt.reminderEnabled) continue;

        const aptDate = new Date(apt.date);
        const diffMs = aptDate.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        // 1 day before reminder
        const oneDayKey = `${apt.id}-1day-${getColombiaTodayString()}-${now.getHours()}`;
        if (diffHours > 23 && diffHours <= 24 && !notifiedRef.current.has(oneDayKey)) {
          notifiedRef.current.add(oneDayKey);
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("📋 Cita médica mañana", {
              body: `${apt.doctorName || "Cita médica"}${apt.specialty ? ` - ${apt.specialty}` : ""}`,
              icon: "/favicon.ico",
              tag: oneDayKey,
            });
          }
        }

        // 1 hour before reminder
        const oneHourKey = `${apt.id}-1hour-${getColombiaTodayString()}-${now.getHours()}-${now.getMinutes()}`;
        if (diffHours > 0.9 && diffHours <= 1.1 && !notifiedRef.current.has(oneHourKey)) {
          notifiedRef.current.add(oneHourKey);
          playReminderTone();
          if ("Notification" in window && Notification.permission === "granted") {
            new Notification("⏰ Cita médica en 1 hora", {
              body: `${apt.doctorName || "Cita médica"}${apt.specialty ? ` - ${apt.specialty}` : ""}`,
              icon: "/favicon.ico",
              tag: oneHourKey,
            });
          }
        }
      }
    } catch {
      // Failed to fetch appointments
    }
  }, []);

  // ─── NEW: Check transport maintenance reminders ───
  const checkTransportReminders = useCallback(async () => {
    try {
      const res = await fetch("/api/vehicles");
      if (!res.ok) return;
      const vehicles: VehicleWithReminders[] = await res.json();

      const now = new Date();

      for (const vehicle of vehicles) {
        // ── Check maintenance records ──
        for (const record of vehicle.maintenanceRecords || []) {
          if (!record.reminderEnabled) continue;

          // Date-based reminder
          if (record.nextDueDate) {
            const dueDate = new Date(record.nextDueDate);
            const diffMs = dueDate.getTime() - now.getTime();
            const diffDays = diffMs / (1000 * 60 * 60 * 24);

            // 7 days before
            const key7d = `${record.id}-7days-${getColombiaTodayString()}`;
            if (diffDays > 6 && diffDays <= 7 && !notifiedRef.current.has(key7d)) {
              notifiedRef.current.add(key7d);
              const label = MAINTENANCE_LABELS[record.type] || "Mantenimiento";
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`🔧 Mantenimiento en 7 días`, {
                  body: `${label} - ${vehicle.name} (${record.description})`,
                  icon: "/favicon.ico",
                  tag: key7d,
                });
              }
            }

            // 1 day before / overdue
            const key1d = `${record.id}-1day-${getColombiaTodayString()}`;
            if (diffDays > 0 && diffDays <= 1 && !notifiedRef.current.has(key1d)) {
              notifiedRef.current.add(key1d);
              playReminderTone();
              const label = MAINTENANCE_LABELS[record.type] || "Mantenimiento";
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`⚠️ Mantenimiento mañana`, {
                  body: `${label} - ${vehicle.name}`,
                  icon: "/favicon.ico",
                  tag: key1d,
                });
              }
            }

            // Overdue
            const keyOverdue = `${record.id}-overdue-${getColombiaTodayString()}`;
            if (diffDays < 0 && !notifiedRef.current.has(keyOverdue)) {
              notifiedRef.current.add(keyOverdue);
              playReminderTone();
              const label = MAINTENANCE_LABELS[record.type] || "Mantenimiento";
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`🚨 Mantenimiento vencido`, {
                  body: `${label} - ${vehicle.name} (vencido hace ${Math.abs(Math.round(diffDays))} días)`,
                  icon: "/favicon.ico",
                  tag: keyOverdue,
                });
              }
            }
          }

          // KM-based reminder (within 500km of nextDueKm)
          if (record.nextDueKm && vehicle.currentKm) {
            const kmRemaining = record.nextDueKm - vehicle.currentKm;
            const keyKm = `${record.id}-km500-${getColombiaTodayString()}`;

            if (kmRemaining > 0 && kmRemaining <= 500 && !notifiedRef.current.has(keyKm)) {
              notifiedRef.current.add(keyKm);
              const label = MAINTENANCE_LABELS[record.type] || "Mantenimiento";
              if ("Notification" in window && Notification.permission === "granted") {
                new Notification(`📏 Mantenimiento próximo por KM`, {
                  body: `${label} - ${vehicle.name}: faltan ${Math.round(kmRemaining)} km`,
                  icon: "/favicon.ico",
                  tag: keyKm,
                });
              }
            }
          }
        }

        // ── Check vehicle documents (SOAT, Tecnomecánica, etc.) ──
        for (const doc of vehicle.documents || []) {
          if (!doc.reminderEnabled) continue;

          const expiryDate = new Date(doc.expiryDate);
          const diffMs = expiryDate.getTime() - now.getTime();
          const diffDays = diffMs / (1000 * 60 * 60 * 24);
          const reminderDays = doc.reminderDays || 30;

          const docLabel = DOCUMENT_LABELS[doc.type] || "Documento";

          // At reminder threshold
          const keyRemind = `${doc.id}-remind-${getColombiaTodayString()}`;
          if (diffDays > 0 && diffDays <= reminderDays && !notifiedRef.current.has(keyRemind)) {
            notifiedRef.current.add(keyRemind);
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`📄 ${docLabel} por vencer`, {
                body: `${vehicle.name}: vence en ${Math.round(diffDays)} días`,
                icon: "/favicon.ico",
                tag: keyRemind,
              });
            }
          }

          // Overdue
          const keyOverdue = `${doc.id}-overdue-${getColombiaTodayString()}`;
          if (diffDays < 0 && !notifiedRef.current.has(keyOverdue)) {
            notifiedRef.current.add(keyOverdue);
            playReminderTone();
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification(`🚨 ${docLabel} vencido`, {
                body: `${vehicle.name}: vencido hace ${Math.abs(Math.round(diffDays))} días`,
                icon: "/favicon.ico",
                tag: keyOverdue,
              });
            }
          }
        }

        // ── Check fuel level low ──
        if (vehicle.tankCapacity && vehicle.tankCapacity > 0) {
          try {
            const fuelRes = await fetch(`/api/vehicles/${vehicle.id}/fuel-level`);
            if (fuelRes.ok) {
              const fuelData: FuelLevelResult = await fuelRes.json();

              if (fuelData.fuelLevel <= 20) {
                const keyFuel = `${vehicle.id}-fuel-low-${getColombiaTodayString()}`;
                if (!notifiedRef.current.has(keyFuel)) {
                  notifiedRef.current.add(keyFuel);
                  if ("Notification" in window && Notification.permission === "granted") {
                    new Notification(`⛽ Combustible bajo`, {
                      body: `${vehicle.name}: ${Math.round(fuelData.fuelLevel)}% de combustible`,
                      icon: "/favicon.ico",
                      tag: keyFuel,
                    });
                  }
                }
              }
            }
          } catch {
            // Fuel level check failed for this vehicle
          }
        }
      }
    } catch {
      // Failed to fetch vehicles for transport reminders
    }
  }, []);

  useEffect(() => {
    requestPermission();

    // Check every minute
    intervalRef.current = setInterval(() => {
      checkMedications();
      checkAppointments();
      checkTransportReminders();
    }, 60 * 1000);

    // Initial check
    checkMedications();
    checkAppointments();
    checkTransportReminders();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [requestPermission, checkMedications, checkAppointments, checkTransportReminders]);

  return { requestPermission };
}
