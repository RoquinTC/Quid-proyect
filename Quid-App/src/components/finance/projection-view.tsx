"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, formatCurrency } from "@/lib/api";
import { toast } from "sonner";
import { LineChart, TrendingDown, TrendingUp, AlertTriangle, Loader2, CalendarDays } from "lucide-react";

/**
 * F-41 · Proyección del saldo.
 *
 * No muestra un número solo: muestra **cuándo** el saldo se pone más
 * ajustado, que es la pregunta real ("¿me alcanza para el 15?").
 */

type ProjectionDay = {
  date: string;
  balance: number;
  events: Array<{ date: string; amount: number; type: string; description: string }>;
};

type ProjectionResponse = {
  startBalance: number;
  endBalance: number;
  lowest: ProjectionDay | null;
  daysInRed: number;
  totalIn: number;
  totalOut: number;
  days: ProjectionDay[];
  paymentsInWindow: number;
};

const RANGES = [
  { days: 30, label: "30 días" },
  { days: 60, label: "60 días" },
  { days: 90, label: "90 días" },
];

function formatDay(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("es-CO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "America/Bogota",
  });
}

export function ProjectionView() {
  const [range, setRange] = useState(60);
  const [data, setData] = useState<ProjectionResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const res = await apiFetch<ProjectionResponse>(`/api/finance/projection?days=${days}`);
      setData(res);
    } catch {
      toast.error("No se pudo calcular la proyección");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  // Solo se listan los días con movimiento: una lista de 60 días vacíos no
  // dice nada. El saldo del resto se entiende por el día siguiente.
  const relevantDays = (data?.days ?? []).filter((day) => day.events.length > 0);
  const lowestIsLow = data?.lowest ? data.lowest.balance < 0 : false;

  return (
    <div className="p-4 space-y-4 pb-safe">
      <div className="flex items-center gap-2">
        <LineChart className="size-5 text-emerald-500" />
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">Proyección</h2>
      </div>

      {/* Rango */}
      <div className="flex gap-1.5">
        {RANGES.map((option) => (
          <button
            key={option.days}
            type="button"
            onClick={() => setRange(option.days)}
            className={`flex-1 h-8 rounded-lg text-[11px] font-medium transition-colors ${
              range === option.days
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          <div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
          <div className="h-20 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
        </div>
      ) : !data ? null : (
        <>
          {/* El punto más ajustado */}
          <Card
            className={`border-0 rounded-2xl ${
              lowestIsLow ? "bg-red-50 dark:bg-red-950/30" : "bg-emerald-50 dark:bg-emerald-950/20"
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-1.5 mb-1">
                {lowestIsLow ? (
                  <AlertTriangle className="size-3.5 text-red-600 dark:text-red-400" />
                ) : (
                  <TrendingDown className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                )}
                <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Tu punto más ajustado
                </p>
              </div>
              <p
                className={`text-2xl font-bold ${
                  lowestIsLow ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300"
                }`}
              >
                {data.lowest ? formatCurrency(data.lowest.balance) : "—"}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                {data.lowest ? formatDay(data.lowest.date) : ""}
                {lowestIsLow
                  ? ` · ${data.daysInRed} día${data.daysInRed === 1 ? "" : "s"} en negativo`
                  : " · nunca queda en negativo"}
              </p>
            </CardContent>
          </Card>

          {/* Resumen */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border border-gray-100 dark:border-gray-700/50 p-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-400">Hoy</p>
              <p className="text-xs font-bold text-gray-900 dark:text-white mt-0.5">
                {formatCurrency(data.startBalance)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-gray-700/50 p-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 flex items-center justify-center gap-0.5">
                <TrendingUp className="size-2.5" /> Entra
              </p>
              <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatCurrency(data.totalIn)}
              </p>
            </div>
            <div className="rounded-xl border border-gray-100 dark:border-gray-700/50 p-2 text-center">
              <p className="text-[10px] uppercase tracking-wider text-gray-400 flex items-center justify-center gap-0.5">
                <TrendingDown className="size-2.5" /> Sale
              </p>
              <p className="text-xs font-bold text-red-600 dark:text-red-400 mt-0.5">
                {formatCurrency(data.totalOut)}
              </p>
            </div>
          </div>

          {/* Días con movimiento */}
          {relevantDays.length === 0 ? (
            <div className="rounded-2xl border border-gray-100 dark:border-gray-700/50 p-6 text-center">
              <CalendarDays className="size-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
                Sin pagos programados
              </p>
              <p className="text-[11px] text-gray-400 mt-1">
                Cuando registres pagos recurrentes o nómina, aparecerán aquí con el saldo de cada día.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 px-1">
                Días con movimiento
              </p>
              {relevantDays.map((day) => (
                <div
                  key={day.date}
                  className={`rounded-xl border p-2.5 ${
                    day.balance < 0
                      ? "border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/20"
                      : "border-gray-100 dark:border-gray-700/50"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-medium text-gray-700 dark:text-gray-200">
                      {formatDay(day.date)}
                    </p>
                    <p
                      className={`text-[11px] font-bold ${
                        day.balance < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-gray-900 dark:text-white"
                      }`}
                    >
                      {formatCurrency(day.balance)}
                    </p>
                  </div>
                  {day.events.map((event, index) => (
                    <div
                      key={`${day.date}-${index}`}
                      className="flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400"
                    >
                      <span className="truncate pr-2">{event.description}</span>
                      <span className={event.type === "income" ? "text-emerald-600" : ""}>
                        {event.type === "income" ? "+" : "−"}
                        {formatCurrency(event.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
