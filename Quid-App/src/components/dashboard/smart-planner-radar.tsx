"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  HeartPulse,
  Loader2,
  Package,
  RefreshCw,
  ShieldCheck,
  WalletCards,
  Wrench,
  Fuel,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useSmartPlanner } from "@/hooks/use-smart-planner";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import type { RadarEvent, RadarEventKind, RadarEventSeverity, RadarEventSource } from "@/lib/types";
import { toast } from "sonner";

const iconByKind: Record<RadarEventKind, typeof CalendarClock> = {
  "recurring-payment": WalletCards,
  "scheduled-income": WalletCards,
  "fuel-refill": Fuel,
  "vehicle-document": ShieldCheck,
  maintenance: Wrench,
  "medical-appointment": HeartPulse,
  "pantry-expiration": Package,
  "pantry-low-stock": Package,
};

const colorBySeverity: Record<RadarEventSeverity, string> = {
  critical: "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
  success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
  info: "bg-sky-50 text-sky-700 dark:bg-sky-950/30 dark:text-sky-300",
};

const moduleLabel: Record<RadarEventSource, string> = {
  finance: "Finanzas",
  transport: "Transporte",
  health: "Salud",
  pantry: "Despensa",
};

const moduleTone: Record<RadarEventSource, string> = {
  finance: "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30",
  transport: "text-cyan-700 bg-cyan-50 dark:text-cyan-300 dark:bg-cyan-950/30",
  health: "text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/30",
  pantry: "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30",
};

type PlannerPeriod = "all" | "today" | "week" | "month";

const periodOptions: Array<{ value: PlannerPeriod; label: string }> = [
  { value: "all", label: "Todo" },
  { value: "today", label: "Hoy" },
  { value: "week", label: "7 días" },
  { value: "month", label: "Mes" },
];

function formatEventDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysFromToday(value: string) {
  const today = startOfDay(new Date());
  const target = startOfDay(new Date(value));
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function buildGroups(events: RadarEvent[]) {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const todayEvents: RadarEvent[] = [];
  const nextDays: RadarEvent[] = [];
  const monthEvents: RadarEvent[] = [];

  for (const event of events) {
    const date = new Date(event.date);
    const delta = daysFromToday(event.date);

    if (delta <= 0) {
      todayEvents.push(event);
    } else if (delta <= 7) {
      nextDays.push(event);
    } else if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
      monthEvents.push(event);
    }
  }

  return [
    { key: "today", title: "Para hoy", subtitle: "Lo que merece atención inmediata", events: todayEvents.slice(0, 4) },
    { key: "next", title: "Próximos días", subtitle: "La semana que viene en camino", events: nextDays.slice(0, 4) },
    { key: "month", title: "Dentro de este mes", subtitle: "Compromisos para anticipar", events: monthEvents.slice(0, 5) },
  ];
}

export function SmartPlannerRadar() {
  const { events, loading, syncing, error, refresh } = useSmartPlanner();
  const [actingId, setActingId] = useState<string | null>(null);
  const [period, setPeriod] = useState<PlannerPeriod>("all");
  const [confirmEvent, setConfirmEvent] = useState<RadarEvent | null>(null);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const {
    setActiveModule,
    setFinanceSubView,
    setTransportSubView,
    setHealthSubView,
    setPantrySubView,
  } = useAppStore();

  const filteredEvents = useMemo(() => {
    if (period === "all") return events;
    return events.filter((event) => {
      const delta = daysFromToday(event.date);
      const date = new Date(event.date);
      const now = new Date();

      if (period === "today") return delta <= 0;
      if (period === "week") return delta <= 7;
      return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
    });
  }, [events, period]);

  const groups = useMemo(() => buildGroups(filteredEvents), [filteredEvents]);
  const totalVisible = groups.reduce((sum, group) => sum + group.events.length, 0);

  const openEvent = (event: RadarEvent) => {
    if (event.source === "finance") {
      setActiveModule("finance");
      setFinanceSubView("recurring");
    } else if (event.source === "transport") {
      setActiveModule("transport");
      setTransportSubView(event.kind === "maintenance" ? "maintenance" : "vehicles");
    } else if (event.source === "health") {
      setActiveModule("health");
      setHealthSubView("appointments");
    } else if (event.source === "pantry") {
      setActiveModule("pantry");
      setPantrySubView("items");
    }
  };

  const runAction = async (event: RadarEvent, overrideBody?: Record<string, unknown>) => {
    if (!event.action) return;
    setActingId(event.id);
    try {
      await apiFetch(event.action.endpoint, {
        method: event.action.method,
        body: JSON.stringify({ ...(event.action.body ?? {}), ...(overrideBody ?? {}) }),
      });
      toast.success("Acción confirmada");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo confirmar");
    } finally {
      setActingId(null);
    }
  };

  const requestConfirm = (event: RadarEvent) => {
    if (!event.action) return;
    if (event.source !== "finance" || !["recurring-payment", "scheduled-income"].includes(event.kind)) {
      void runAction(event);
      return;
    }

    setConfirmEvent(event);
    setConfirmAmount(String(event.amount ?? event.action.body?.actualAmount ?? ""));
    setConfirmError(null);
  };

  const submitConfirm = async () => {
    if (!confirmEvent) return;
    const parsedAmount = Number(confirmAmount);
    if (!confirmAmount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setConfirmError("Ingresa un valor válido antes de confirmar.");
      return;
    }

    await runAction(confirmEvent, { actualAmount: parsedAmount });
    setConfirmEvent(null);
    setConfirmAmount("");
    setConfirmError(null);
  };

  return (
    <>
    <Card className="border-0 shadow-md rounded-2xl overflow-hidden bg-white dark:bg-gray-900">
      <CardContent className="p-0">
        <div className="bg-gradient-to-br from-gray-950 via-emerald-950 to-teal-900 p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] text-emerald-100">
                <CalendarClock className="size-3.5" />
                Smart Planner
              </div>
              <h3 className="mt-3 text-xl font-semibold tracking-normal">
                Radar de Quid
              </h3>
              <p className="mt-1 text-sm text-emerald-100/80">
                Tu línea de tiempo para decidir qué atender primero.
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-xl bg-white/10 text-white hover:bg-white/15 hover:text-white"
              onClick={refresh}
              disabled={syncing}
              title="Actualizar radar"
            >
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        <div className="p-5">
        <div className="flex items-center justify-between gap-3 mb-5">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Línea de tiempo
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Hoy, próximos días y resto del mes
            </p>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
            {filteredEvents.length} evento{filteredEvents.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mb-5 grid grid-cols-4 gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`h-8 rounded-lg text-xs font-medium transition-colors ${
                period === option.value
                  ? "bg-white text-gray-950 shadow-sm dark:bg-gray-950 dark:text-gray-100"
                  : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-700 dark:text-amber-300">
            {error}
          </div>
        ) : totalVisible === 0 ? (
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-5 text-center">
            <CheckCircle2 className="size-6 mx-auto text-emerald-600 dark:text-emerald-400 mb-2" />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Sin alertas cercanas</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Cuando tengas pagos, citas o mantenimientos próximos, aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <section key={group.key} className="space-y-3">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{group.title}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{group.subtitle}</p>
                  </div>
                  <span className="text-xs font-medium text-gray-400 dark:text-gray-500">{group.events.length}</span>
                </div>
                {group.events.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 p-3 text-xs text-gray-400 dark:border-gray-800 dark:text-gray-500">
                    Nada programado en esta franja.
                  </div>
                ) : (
                  <div className="relative space-y-3 pl-5 before:absolute before:left-[0.55rem] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-gray-200 dark:before:bg-gray-800">
                    {group.events.map((event) => {
                      const Icon = iconByKind[event.kind];
                      const isActing = actingId === event.id;
              return (
                <div
                  key={event.id}
                          className="relative rounded-xl bg-gray-50 p-3 shadow-sm dark:bg-gray-800/60"
                >
                          <span className={`absolute -left-5 top-4 size-4 rounded-full border-2 border-white dark:border-gray-900 ${colorBySeverity[event.severity]}`} />
                  <button
                    type="button"
                    onClick={() => openEvent(event)}
                            className="block w-full min-w-0 text-left"
                  >
                            <div className="flex items-center justify-between gap-3">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${moduleTone[event.source]}`}>
                                <Icon className="size-3.5" />
                        {moduleLabel[event.source]}
                      </span>
                      <span className="text-[11px] text-gray-400 dark:text-gray-500">
                        {formatEventDate(event.date)}
                      </span>
                    </div>
                            <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                      {event.title}
                    </p>
                    {event.description && (
                              <p className="mt-0.5 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">
                        {event.description}
                      </p>
                    )}
                    {event.amount !== undefined && (
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1">
                        {formatCurrency(event.amount)}
                      </p>
                    )}
                  </button>
                  {event.action ? (
                    <Button
                      size="sm"
                      variant="outline"
                              className="mt-3 h-8 rounded-xl px-2 text-xs"
                      onClick={() => requestConfirm(event)}
                      disabled={isActing}
                    >
                      {isActing ? <Loader2 className="size-3.5 animate-spin" /> : event.action.label}
                    </Button>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                              className="absolute right-2 top-2 size-8 rounded-xl"
                      onClick={() => openEvent(event)}
                      title="Ver detalle"
                    >
                      <ChevronRight className="size-4" />
                    </Button>
                  )}
                </div>
              );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
        </div>
      </CardContent>
    </Card>
    <Dialog open={!!confirmEvent} onOpenChange={(open) => !open && setConfirmEvent(null)}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            {confirmEvent?.kind === "scheduled-income" ? "Confirmar ingreso" : "Confirmar pago"}
          </DialogTitle>
          <DialogDescription>
            Revisa el valor real antes de registrar el movimiento.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/70">
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{confirmEvent?.title}</p>
            {confirmEvent?.description && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{confirmEvent.description}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Valor a confirmar</Label>
            <CurrencyInput
              value={confirmAmount}
              onChange={setConfirmAmount}
              showPrefix
              className="rounded-xl"
              placeholder="Valor real"
            />
            <p className="text-xs text-gray-400">
              Si el valor cambió frente a lo programado, ajústalo aquí.
            </p>
          </div>
          {confirmError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-800 dark:bg-red-950/20 dark:text-red-300">
              {confirmError}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 rounded-xl"
              onClick={() => setConfirmEvent(null)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="flex-1 rounded-xl"
              onClick={submitConfirm}
              disabled={actingId === confirmEvent?.id}
            >
              {actingId === confirmEvent?.id ? <Loader2 className="size-4 animate-spin" /> : "Confirmar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
