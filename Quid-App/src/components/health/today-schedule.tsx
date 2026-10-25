"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Clock, Pill, Check, X, AlarmClock, MoreVertical, RotateCcw, Loader2, CalendarCog } from "lucide-react";
import type { Medication } from "@/lib/types";
import { DoseOverrideDialog } from "@/components/health/dose-override-dialog";

interface TodayScheduleProps {
  /** Se mantiene por compatibilidad; la lista ahora la manda el servidor. */
  medications?: Medication[];
  onTaken?: () => void;
}

interface DoseItem {
  id: string;
  medicationId: string;
  medicationName: string;
  dosage: string | null;
  scheduledAt: string;
  /** Día lógico al que pertenece la toma ("YYYY-MM-DD"). */
  scheduledDay: string;
  status: string;
  plannedDose: number;
  actualDose: number | null;
  snoozeCount: number;
  lowStock: boolean;
  stockUnit: string | null;
}

const TIME_FORMAT = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Estados que ya no admiten acción. */
const CLOSED = new Set(["taken", "skipped", "missed", "dismissed"]);

export function TodaySchedule({ onTaken }: TodayScheduleProps) {
  const [items, setItems] = useState<DoseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [overrideTarget, setOverrideTarget] = useState<DoseItem | null>(null);

  const load = useCallback(async () => {
    try {
      const data = (await apiFetch("/api/doses")) as { items?: DoseItem[] };
      setItems(data.items ?? []);
    } catch (error) {
      console.error("Error cargando las tomas del día:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (
    id: string,
    action: "take" | "skip" | "snooze" | "reopen",
    minutes?: number,
  ) => {
    setBusyId(id);
    try {
      await apiFetch(`/api/doses/${id}/action`, {
        method: "POST",
        body: JSON.stringify(minutes ? { action, minutes } : { action }),
      });
      await load();
      if (action === "take" || action === "reopen") onTaken?.();
    } catch (error) {
      console.error("Error aplicando la acción:", error);
    } finally {
      setBusyId(null);
    }
  };

  const takenCount = items.filter((item) => item.status === "taken").length;
  const totalDoses = items.length;

  if (loading) {
    return (
      <Card className="border-0 shadow-md rounded-2xl">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="size-4 animate-spin" />
          Cargando las tomas de hoy…
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) return null;

  return (
    <Card className="border-0 shadow-md rounded-2xl overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-rose-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Hoy</span>
          </div>
          <Badge
            variant="secondary"
            className="text-xs bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
          >
            {takenCount}/{totalDoses} tomados
          </Badge>
        </div>

        <div className="space-y-1.5">
          {items.map((item) => {
            const date = new Date(item.scheduledAt);
            const time = TIME_FORMAT.format(date);
            const hour = Number(time.slice(0, 2));
            const isTaken = item.status === "taken";
            const isSkipped = item.status === "skipped";
            const isMissed = item.status === "missed";
            const isPending = !CLOSED.has(item.status);
            const isBusy = busyId === item.id;

            const timeColor =
              hour >= 6 && hour < 12
                ? "text-amber-600 bg-amber-50 dark:bg-amber-900/20"
                : hour >= 12 && hour < 18
                  ? "text-sky-600 bg-sky-50 dark:bg-sky-900/20"
                  : "text-purple-600 bg-purple-50 dark:bg-purple-900/20";

            return (
              <div
                key={item.id}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div
                  className={`px-2 py-1 rounded-lg text-xs font-medium ${timeColor} min-w-[52px] text-center`}
                >
                  {time}
                </div>

                <div
                  className={`size-2.5 rounded-full shrink-0 ${
                    isTaken
                      ? "bg-emerald-500"
                      : isSkipped
                        ? "bg-amber-400"
                        : isMissed
                          ? "bg-gray-400"
                          : "bg-rose-500 animate-pulse"
                  }`}
                />

                <button
                  type="button"
                  onClick={() => isPending && !isBusy && runAction(item.id, "take")}
                  className="flex-1 text-left min-w-0"
                  aria-label={`Marcar ${item.medicationName} como tomada`}
                >
                  <span
                    className={`text-sm ${
                      isTaken
                        ? "line-through text-gray-400"
                        : isSkipped
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-gray-900 dark:text-white"
                    }`}
                  >
                    {item.medicationName}
                  </span>
                  {item.dosage && (
                    <span className="text-xs text-gray-400 ml-1.5">{item.dosage}</span>
                  )}
                  {item.snoozeCount > 0 && isPending && (
                    <span className="text-[10px] text-gray-400 ml-1.5">
                      pospuesta {item.snoozeCount}×
                    </span>
                  )}
                  {item.lowStock && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-1.5">
                      · stock bajo
                    </span>
                  )}
                </button>

                <div
                  className={`size-6 rounded-full flex items-center justify-center shrink-0 ${
                    isTaken
                      ? "bg-emerald-500 text-white"
                      : isSkipped
                        ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30"
                        : isMissed
                          ? "bg-gray-200 text-gray-500 dark:bg-gray-700"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-400"
                  }`}
                >
                  {isBusy ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : isTaken ? (
                    <Check className="size-3.5" />
                  ) : isSkipped ? (
                    <X className="size-3.5" />
                  ) : isMissed ? (
                    <AlarmClock className="size-3.5" />
                  ) : (
                    <Pill className="size-3.5" />
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="size-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                      aria-label="Más acciones"
                    >
                      <MoreVertical className="size-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel className="text-xs">
                      {time} · {item.medicationName}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {isPending ? (
                      <>
                        <DropdownMenuItem onClick={() => runAction(item.id, "take")}>
                          <Check className="size-3.5 mr-2" />
                          Tomar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => runAction(item.id, "snooze", 5)}>
                          <AlarmClock className="size-3.5 mr-2" />
                          En 5 minutos
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => runAction(item.id, "skip")}>
                          <X className="size-3.5 mr-2" />
                          Omitir
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setOverrideTarget(item)}>
                          <CalendarCog className="size-3.5 mr-2" />
                          Ajustar solo este día…
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem onClick={() => runAction(item.id, "reopen")}>
                        <RotateCcw className="size-3.5 mr-2" />
                        Reabrir toma
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      </CardContent>

      {overrideTarget && (
        <DoseOverrideDialog
          open={Boolean(overrideTarget)}
          onOpenChange={(open) => {
            if (!open) setOverrideTarget(null);
          }}
          medicationId={overrideTarget.medicationId}
          medicationName={overrideTarget.medicationName}
          day={overrideTarget.scheduledDay}
          defaultTime={TIME_FORMAT.format(new Date(overrideTarget.scheduledAt))}
          onSaved={() => {
            setOverrideTarget(null);
            void load();
          }}
        />
      )}
    </Card>
  );
}
