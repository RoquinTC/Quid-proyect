"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch, formatDate } from "@/lib/api";
import { useDataEvent } from "@/hooks/use-data-event";
import { useAppStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, ChevronRight, ClipboardList, FileClock, Pill, ShieldAlert, ShoppingBag, Stethoscope } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { MedicalAppointment, MedicalOrder, Medication } from "@/lib/types";
import { WaterWidget } from "@/components/health/hydration/water-widget";

interface Authorization {
  id: string;
  type: string;
  specialty: string;
  status: string;
  expirationDate?: string | null;
  appointment?: { id: string; date: string; status: string } | null;
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
  return Math.ceil((target.getTime() - start.getTime()) / 86400000);
};

export function HealthSummaryView() {
  const { setHealthSubView, setHealthMedicationFilter } = useAppStore();
  const [appointments, setAppointments] = useState<MedicalAppointment[]>([]);
  const [orders, setOrders] = useState<MedicalOrder[]>([]);
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
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

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useDataEvent("appointments", fetchSummary);
  useDataEvent("medicalOrders", fetchSummary);
  useDataEvent("medicalAuthorizations", fetchSummary);
  useDataEvent("medications", fetchSummary);

  const today = new Date();

  const nextAppointment = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.status === "scheduled" && new Date(appointment.date) >= today)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0],
    [appointments, today]
  );

  const dueAuthorizations = useMemo(
    () =>
      authorizations
        .filter((auth) => auth.status === "authorized" && auth.expirationDate)
        .map((auth) => ({ ...auth, daysLeft: daysUntil(new Date(auth.expirationDate!)) }))
        .filter((auth) => auth.daysLeft <= 7)
        .sort((a, b) => a.daysLeft - b.daysLeft),
    [authorizations]
  );

  const pendingItems = useMemo(
    () => orders.flatMap((order) => order.items || []).filter((item) => item.pendingQty > 0),
    [orders]
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
    [medications]
  );

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
      .filter((auth) => auth.status === "authorized" && auth.expirationDate)
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
      (a, b) => a.date.getTime() - b.date.getTime()
    );
  }, [appointments, authorizations, orders]);

  const days = useMemo(() => {
    const base = new Date();
    return Array.from({ length: 14 }, (_, index) => {
      const day = new Date(base);
      day.setDate(base.getDate() + index);
      return day;
    });
  }, []);

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        <div className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
          <div className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-safe">
      <Card className="border-0 rounded-2xl bg-gradient-to-br from-rose-600 to-violet-600 text-white shadow-lg">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 text-sm text-rose-100">
            <Stethoscope className="size-4" />
            Radar de Salud
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <Metric label="Citas" value={appointments.filter((a) => a.status === "scheduled").length} />
            <Metric label="EPS" value={authorizations.filter((a) => a.status === "pending_authorization").length} />
            <Metric label="Farmacia" value={pendingItems.length} />
          </div>
        </CardContent>
      </Card>

      {/* Hydration Widget */}
      <WaterWidget />

      <Card className="border border-gray-100 shadow-sm rounded-2xl dark:border-gray-800">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">Calendario rápido</h3>
              <p className="text-xs text-gray-500">Citas, vencimientos y reclamos próximos</p>
            </div>
            <CalendarDays className="size-5 text-rose-500" />
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((day) => {
              const events = calendarEvents.filter((event) => sameDay(event.date, day));
              const isToday = sameDay(day, today);
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-16 rounded-xl border p-1.5 ${
                    isToday
                      ? "border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/20"
                      : "border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/60"
                  }`}
                >
                  <p className={`text-center text-[10px] font-semibold ${isToday ? "text-rose-700 dark:text-rose-300" : "text-gray-500"}`}>
                    {day.toLocaleDateString("es-CO", { weekday: "short" }).slice(0, 3)}
                  </p>
                  <p className="text-center text-xs font-bold text-gray-900 dark:text-white">{day.getDate()}</p>
                  <div className="mt-1 flex justify-center gap-0.5">
                    {events.slice(0, 3).map((event) => (
                      <span key={event.id} className={`size-1.5 rounded-full ${event.color}`} title={`${event.meta}: ${event.title}`} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 space-y-2">
            {calendarEvents.slice(0, 4).map((event) => (
              <div key={event.id} className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2 text-xs dark:bg-gray-900">
                <span className={`size-2 rounded-full ${event.color}`} />
                <span className="font-semibold text-gray-800 dark:text-gray-100">{event.title}</span>
                <span className="ml-auto text-gray-500">{formatDate(event.date.toISOString())}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SummaryAction
          icon={Stethoscope}
          title={nextAppointment ? nextAppointment.specialty || "Próxima cita" : "Sin cita próxima"}
          meta={nextAppointment ? formatDate(nextAppointment.date) : "Agenda desde Citas"}
          badge={nextAppointment && daysUntil(new Date(nextAppointment.date)) <= 1 ? "Atención" : undefined}
          onClick={() => setHealthSubView("appointments")}
        />
        <SummaryAction
          icon={ShieldAlert}
          title={dueAuthorizations[0]?.specialty || "Autorizaciones EPS"}
          meta={dueAuthorizations[0] ? `${dueAuthorizations[0].daysLeft <= 0 ? "Vencida" : `Vence en ${dueAuthorizations[0].daysLeft} día(s)`}` : "Sin vencimientos críticos"}
          badge={dueAuthorizations.length ? `${dueAuthorizations.length}` : undefined}
          onClick={() => setHealthSubView("authorizations")}
        />
        <SummaryAction
          icon={ShoppingBag}
          title="Farmacia"
          meta={`${pendingItems.length} pendiente${pendingItems.length !== 1 ? "s" : ""} por reclamar`}
          badge={pendingItems.length ? `${pendingItems.length}` : undefined}
          onClick={() => setHealthSubView("claims")}
        />
        <SummaryAction
          icon={ClipboardList}
          title="Órdenes"
          meta={`${orders.filter((order) => order.status !== "completed").length} activa${orders.filter((order) => order.status !== "completed").length !== 1 ? "s" : ""}`}
          onClick={() => setHealthSubView("orders")}
        />
        <SummaryAction
          icon={Pill}
          title={medicationSetupPending.length ? "Medicamentos por configurar" : "Medicamentos"}
          meta={
            medicationSetupPending.length
              ? `${medicationSetupPending.length} sin dosis u horario`
              : `${medications.filter((med) => med.isActive).length} activo${medications.filter((med) => med.isActive).length !== 1 ? "s" : ""}`
          }
          badge={medicationSetupPending.length ? `${medicationSetupPending.length}` : undefined}
          onClick={() => {
            setHealthMedicationFilter(medicationSetupPending.length ? "needs_setup" : "all");
            setHealthSubView("medications");
          }}
        />
        <SummaryAction
          icon={FileClock}
          title="Pendientes de la semana"
          meta={`${calendarEvents.filter((event) => daysUntil(event.date) <= 7).length} evento${calendarEvents.filter((event) => daysUntil(event.date) <= 7).length !== 1 ? "s" : ""}`}
          onClick={() => setHealthSubView("summary")}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-bold leading-none">{value}</p>
      <p className="mt-1 text-[11px] text-white/75">{label}</p>
    </div>
  );
}

function SummaryAction({
  icon: Icon,
  title,
  meta,
  badge,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  meta: string;
  badge?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="border border-gray-100 shadow-sm rounded-2xl transition hover:shadow-md dark:border-gray-800">
        <CardContent className="flex items-center gap-3 p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/30 dark:text-rose-300">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{title}</p>
              {badge && <Badge className="h-5 rounded-lg bg-rose-100 px-1.5 text-[10px] text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">{badge}</Badge>}
            </div>
            <p className="truncate text-xs text-gray-500">{meta}</p>
          </div>
          <ChevronRight className="size-4 text-gray-300" />
        </CardContent>
      </Card>
    </button>
  );
}
