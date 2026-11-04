"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, formatDate } from "@/lib/api";
import { useDataEvent } from "@/hooks/use-data-event";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  FileClock,
  Pill,
  ShieldAlert,
  ShoppingBag,
  Stethoscope,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MedicalAppointment, MedicalOrder, Medication } from "@/lib/types";
import { HydrationCard } from "@/components/health/hydration/hydration-card";
import {
  describeAuthorizations,
  resolveAuthorizationState,
  summarizeAuthorizations,
} from "@/lib/health/authorization-status";
import { ActionTile, HealthCard, SectionHeader } from "@/components/health/ui/health-ui";
import { AdherenceCard } from "@/components/health/adherence-card";

interface Authorization {
  id: string;
  type: string;
  specialty: string;
  status: string;
  expirationDate?: string | null;
  appointment?: { id: string; date: string; status: string } | null;
}

interface DoseItem {
  id: string;
  medicationName: string;
  scheduledAt: string;
  status: string;
  snoozeCount: number;
}

type CalendarEvent = {
  id: string;
  date: Date;
  title: string;
  meta: string;
  color: string;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

const daysUntil = (date: Date) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
};

const TIME_FORMAT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function greetingFor(date: Date): string {
  const hour = Number(new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", hour12: false }).format(date));
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/**
 * Resumen de Salud.
 *
 * Rediseño: antes era una pila de tarjetas donde lo urgente (la próxima toma) no
 * aparecía y los contadores se repetían entre el hero y las acciones. Ahora el
 * orden es el de las preguntas reales del paciente:
 *   1. ¿Qué toca ahora?  (hero "Hoy")
 *   2. ¿Cómo voy?        (adherencia)
 *   3. ¿Bebí agua?       (hidratación)
 *   4. ¿Qué viene?       (calendario 7 días)
 *   5. ¿A dónde voy?     (accesos compactos)
 */
export function HealthSummaryView() {
  const { setHealthSubView, setHealthMedicationFilter } = useAppStore();
  const [appointments, setAppointments] = useState<MedicalAppointment[]>([]);
  const [orders, setOrders] = useState<MedicalOrder[]>([]);
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [doses, setDoses] = useState<DoseItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    try {
      const [appointmentsData, ordersData, authorizationsData, medicationsData] = await Promise.all([
        apiFetch<MedicalAppointment[]>("/api/appointments"),
        apiFetch<MedicalOrder[]>("/api/medical-orders"),
        apiFetch<Authorization[]>("/api/health/authorizations"),
        apiFetch<Medication[]>("/api/medications"),
      ]);
      setAppointments(appointmentsData);
      setOrders(ordersData);
      setAuthorizations(authorizationsData);
      setMedications(medicationsData);
    } catch (error) {
      console.error("Error loading health summary:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Tomas de hoy: es lo único que puede ser urgente en este instante. */
  const fetchDoses = useCallback(async () => {
    try {
      const data = await apiFetch<{ items?: DoseItem[] }>("/api/doses");
      setDoses(data.items ?? []);
    } catch {
      // Sin backend o sin sesión: el resumen sigue funcionando sin tomas.
      setDoses([]);
    }
  }, []);

  useEffect(() => {
    void fetchSummary();
    void fetchDoses();
  }, [fetchSummary, fetchDoses]);

  useDataEvent("appointments", fetchSummary);
  useDataEvent("medicalOrders", fetchSummary);
  useDataEvent("medicalAuthorizations", fetchSummary);
  useDataEvent("medications", fetchSummary);
  useDataEvent("doseOccurrences", fetchDoses);

  const today = new Date();

  const nextAppointment = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.status === "scheduled" && new Date(appointment.date) >= today)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0],
    [appointments, today],
  );

  const dueAuthorizations = useMemo(
    () =>
      authorizations
        // Solo lo que de verdad requiere acción: una autorización cuya cita ya
        // se cumplió no vuelve a alarmar al vencer.
        .map((auth) => ({ ...auth, state: resolveAuthorizationState(auth) }))
        .filter((auth) => auth.state.alarm)
        .map((auth) => ({ ...auth, daysLeft: auth.state.daysLeft ?? 0 }))
        .sort((a, b) => a.daysLeft - b.daysLeft),
    [authorizations],
  );

  /**
   * Autorizaciones con algo por hacer, separando dos cosas distintas:
   *  - `pending`: trámite en curso con la EPS (no vence: aún no existe).
   *  - `expiring`: ya vence o venció sin usarse.
   *
   * "Al día" solo se muestra cuando ambas cuentas son cero.
   */
  const authorizationCounts = useMemo(() => summarizeAuthorizations(authorizations), [authorizations]);

  const pendingItems = useMemo(
    () => orders.flatMap((order) => order.items || []).filter((item) => item.pendingQty > 0),
    [orders],
  );

  const medicationSetupPending = useMemo(
    () =>
      medications.filter((med) => {
        const hasDose = Boolean(med.dosage && med.dosage.trim() && med.dosage !== "Por definir");
        let times: string[] = [];
        try {
          times = med.reminderTimes ? JSON.parse(med.reminderTimes) : [];
        } catch {
          times = [];
        }
        const needsSchedule = med.reminderEnabled && med.frequency !== "asNeeded";
        return med.isActive && (!hasDose || (needsSchedule && times.length === 0));
      }),
    [medications],
  );

  /** Próxima toma abierta del día (por hora programada). */
  const nextDose = useMemo(() => {
    const open = doses
      .filter((dose) => dose.status === "pending" || dose.status === "snoozed")
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return open[0];
  }, [doses]);

  const dosesToday = doses.length;
  const dosesTaken = doses.filter((dose) => dose.status === "taken").length;
  const dosesPending = doses.filter(
    (dose) => dose.status === "pending" || dose.status === "snoozed",
  ).length;

  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    const appointmentEvents = appointments
      .filter((appointment) => appointment.status === "scheduled")
      .map((appointment) => ({
        id: `appointment-${appointment.id}`,
        date: new Date(appointment.date),
        title: appointment.specialty || appointment.doctorName || "Cita médica",
        meta: "Cita",
        color: "bg-violet-500",
      }));

    const authorizationEvents = authorizations
      .filter((auth) => auth.expirationDate && resolveAuthorizationState(auth).alarm)
      .map((auth) => ({
        id: `auth-${auth.id}`,
        date: new Date(auth.expirationDate!),
        title: auth.specialty,
        meta: "Vence autorización",
        color: "bg-amber-500",
      }));

    const claimEvents = orders
      .filter((order) => order.nextClaimDate && order.status !== "completed")
      .map((order) => ({
        id: `claim-${order.id}`,
        date: new Date(order.nextClaimDate!),
        title: order.title,
        meta: "Farmacia",
        color: "bg-emerald-500",
      }));

    return [...appointmentEvents, ...authorizationEvents, ...claimEvents].sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );
  }, [appointments, authorizations, orders]);

  const week = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 7 }, (_, index) => {
      const day = new Date(base);
      day.setDate(base.getDate() + index);
      return day;
    });
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3 pb-safe">
      {/* 1. ¿Qué toca ahora? */}
      <Card className="border-0 rounded-2xl bg-gradient-to-br from-emerald-600 via-emerald-600 to-teal-600 text-white shadow-lg overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-50/80">
                {greetingFor(today)}
              </p>
              <h2 className="mt-0.5 text-lg font-black leading-tight">Tu día de salud</h2>
            </div>
            <Stethoscope className="mt-0.5 size-5 shrink-0 text-emerald-100/70" />
          </div>

          {/* La acción más urgente, en grande */}
          {nextDose ? (
            <button
              type="button"
              onClick={() => setHealthSubView("medications")}
              className="mt-3 flex w-full items-center gap-3 rounded-xl bg-white/15 p-3 text-left backdrop-blur transition hover:bg-white/20"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/20">
                <Pill className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{nextDose.medicationName}</p>
                <p className="text-[11px] text-white/80">
                  Próxima toma a las {TIME_FORMAT.format(new Date(nextDose.scheduledAt))}
                  {nextDose.snoozeCount > 0 ? ` · pospuesta ${nextDose.snoozeCount}×` : ""}
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-white/70" />
            </button>
          ) : dosesToday > 0 ? (
            <div className="mt-3 flex items-center gap-3 rounded-xl bg-white/15 p-3 backdrop-blur">
              <CheckCircle2 className="size-5 shrink-0" />
              <p className="text-sm font-semibold">
                {dosesPending === 0
                  ? "Tomas de hoy completadas"
                  : `${dosesPending} toma${dosesPending !== 1 ? "s" : ""} pendiente${dosesPending !== 1 ? "s" : ""}`}
              </p>
            </div>
          ) : nextAppointment ? (
            <button
              type="button"
              onClick={() => setHealthSubView("appointments")}
              className="mt-3 flex w-full items-center gap-3 rounded-xl bg-white/15 p-3 text-left backdrop-blur transition hover:bg-white/20"
            >
              <CalendarDays className="size-5 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">
                  {nextAppointment.specialty || nextAppointment.doctorName || "Próxima cita"}
                </p>
                <p className="text-[11px] text-white/80">
                  {daysUntil(new Date(nextAppointment.date)) <= 0
                    ? "Es hoy"
                    : `En ${daysUntil(new Date(nextAppointment.date))} día(s)`}
                </p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-white/70" />
            </button>
          ) : (
            <p className="mt-3 rounded-xl bg-white/15 p-3 text-xs text-white/85 backdrop-blur">
              Sin tomas ni citas programadas. Agrega tu primer medicamento para empezar.
            </p>
          )}

          {/* Tres cifras que resumen el estado */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <HeroStat label="Tomas hoy" value={`${dosesTaken}/${dosesToday}`} />
            <HeroStat
              label="Próxima cita"
              value={
                nextAppointment
                  ? daysUntil(new Date(nextAppointment.date)) <= 0
                    ? "Hoy"
                    : `${daysUntil(new Date(nextAppointment.date))}d`
                  : "—"
              }
            />
            <HeroStat label="Farmacia" value={String(pendingItems.length)} />
          </div>
        </CardContent>
      </Card>

      {/* 2. ¿Cómo voy? */}
      <AdherenceCard />

      {/* 3. ¿Bebí agua? */}
      <HydrationCard />

      {/* 4. ¿Qué viene? — 7 días, sin ruido */}
      <HealthCard>
        <div className="p-4">
          <SectionHeader
            icon={CalendarDays}
            title="Próximos 7 días"
            hint="Citas, vencimientos y reclamos"
            tone="violet"
          />

          <div className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const events = calendarEvents.filter((event) => sameDay(event.date, day));
              const isToday = sameDay(day, today);
              return (
                <div
                  key={day.toISOString()}
                  className={`rounded-xl border py-1.5 text-center ${
                    isToday
                      ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20"
                      : "border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60"
                  }`}
                >
                  <p
                    className={`text-[9px] font-semibold uppercase ${
                      isToday ? "text-rose-700 dark:text-rose-300" : "text-gray-400"
                    }`}
                  >
                    {day.toLocaleDateString("es-CO", { weekday: "short" }).slice(0, 3)}
                  </p>
                  <p className="text-xs font-bold text-gray-900 dark:text-white">{day.getDate()}</p>
                  <div className="mt-0.5 flex justify-center gap-0.5">
                    {events.slice(0, 3).map((event) => (
                      <span key={event.id} className={`size-1 rounded-full ${event.color}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {calendarEvents.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              {calendarEvents.slice(0, 3).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs dark:bg-gray-900"
                >
                  <span className={`size-2 shrink-0 rounded-full ${event.color}`} />
                  <span className="truncate font-semibold text-gray-800 dark:text-gray-100">
                    {event.title}
                  </span>
                  <span className="ml-auto shrink-0 text-gray-400">
                    {formatDate(event.date.toISOString())}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-gray-400">Nada programado esta semana.</p>
          )}
        </div>
      </HealthCard>

      {/* 5. ¿A dónde voy? — accesos compactos */}
      <div className="grid grid-cols-2 gap-2">
        <ActionTile
          icon={Pill}
          label="Medicamentos"
          meta={
            medicationSetupPending.length
              ? `${medicationSetupPending.length} por configurar`
              : `${medications.filter((med) => med.isActive).length} activos`
          }
          alert={medicationSetupPending.length > 0}
          onClick={() => {
            setHealthMedicationFilter(medicationSetupPending.length ? "needs_setup" : "all");
            setHealthSubView("medications");
          }}
        />
        <ActionTile
          icon={Stethoscope}
          label="Citas"
          meta={nextAppointment ? formatDate(nextAppointment.date) : "Sin agendar"}
          tone="violet"
          onClick={() => setHealthSubView("appointments")}
        />
        <ActionTile
          icon={ShieldAlert}
          label="Autorizaciones"
          meta={describeAuthorizations(authorizationCounts)}
          tone="sky"
          alert={authorizationCounts.total > 0}
          onClick={() => setHealthSubView("authorizations")}
        />
        <ActionTile
          icon={ShoppingBag}
          label="Farmacia"
          meta={`${pendingItems.length} por reclamar`}
          tone="amber"
          onClick={() => setHealthSubView("claims")}
        />
        <ActionTile
          icon={ClipboardList}
          label="Órdenes"
          meta={`${orders.filter((order) => order.status !== "completed").length} activas`}
          tone="sky"
          onClick={() => setHealthSubView("orders")}
        />
        <ActionTile
          icon={FileClock}
          label="Pendientes"
          meta={`${calendarEvents.filter((event) => {
            const left = daysUntil(event.date);
            return left >= 0 && left <= 7;
          }).length} esta semana`}
          tone="violet"
          onClick={() => setHealthSubView("summary")}
        />
      </div>
    </div>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 px-2 py-1.5 backdrop-blur">
      <p className="text-base font-black leading-none">{value}</p>
      <p className="mt-0.5 text-[10px] text-white/70">{label}</p>
    </div>
  );
}

