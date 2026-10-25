"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDataEvent } from "@/hooks/use-data-event";
import { Flame, Info, Loader2, Pill, RefreshCw, TrendingUp, XCircle } from "lucide-react";

interface AdherenceSummary {
  fromDay: string;
  toDay: string;
  evaluable: number;
  taken: number;
  skipped: number;
  missed: number;
  adherenceRate: number | null;
  skipRate: number | null;
  missRate: number | null;
  averageDelayMinutes: number | null;
  snoozedCount: number;
  currentStreak: number;
  pendingToday: number;
}

const RANGES = [
  { days: 7, label: "7 días" },
  { days: 30, label: "30 días" },
];

/** Anillo de progreso sin dependencias. */
function AdherenceRing({ rate }: { rate: number }) {
  const size = 92;
  const stroke = 9;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, rate));
  const offset = circumference * (1 - clamped);

  const color =
    clamped >= 0.9 ? "#10b981" : clamped >= 0.75 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-gray-100 dark:stroke-gray-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-gray-900 dark:text-white">
          {Math.round(clamped * 100)}%
        </span>
        <span className="text-[9px] uppercase tracking-wide text-gray-400">adherencia</span>
      </div>
    </div>
  );
}

function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/**
 * Tarjeta de adherencia del módulo Salud.
 *
 * "Adherencia" = de las tomas que tocaban, cuántas se confirmaron. Se separan
 * dos fracasos distintos porque se corrigen distinto:
 *   - omisión (`skipped`): el usuario decidió no tomarla;
 *   - olvido (`missed`): nadie tocó nada y venció el día lógico.
 */
export function AdherenceCard() {
  const [days, setDays] = useState(7);
  const [summary, setSummary] = useState<AdherenceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<AdherenceSummary>(`/api/health/adherence?days=${days}`);
      setSummary(data);
    } catch (loadError) {
      console.error("Error cargando la adherencia:", loadError);
      setError("No se pudo calcular la adherencia");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  useDataEvent("medications", load);
  useDataEvent("doseOccurrences", load);

  if (loading && !summary) {
    return (
      <Card className="border border-gray-100 shadow-sm rounded-2xl dark:border-gray-800">
        <CardContent className="p-4 flex items-center gap-2 text-sm text-gray-400">
          <Loader2 className="size-4 animate-spin" />
          Calculando adherencia…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border border-gray-100 shadow-sm rounded-2xl dark:border-gray-800">
        <CardContent className="p-4 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-500">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="text-xs font-semibold text-rose-600 flex items-center gap-1"
          >
            <RefreshCw className="size-3.5" /> Reintentar
          </button>
        </CardContent>
      </Card>
    );
  }

  if (!summary) return null;

  const hasData = summary.evaluable > 0 || summary.pendingToday > 0;
  const rate = summary.adherenceRate ?? 0;
  const skipRate = summary.skipRate ?? 0;
  const missRate = summary.missRate ?? 0;

  return (
    <Card className="border border-gray-100 shadow-sm rounded-2xl dark:border-gray-800">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Adherencia al tratamiento</h3>
            <p className="text-xs text-gray-500">
              {summary.fromDay} → {summary.toDay}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-0.5 dark:bg-gray-800 shrink-0">
            {RANGES.map((range) => (
              <button
                key={range.days}
                type="button"
                onClick={() => setDays(range.days)}
                className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                  days === range.days
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                    : "text-gray-500"
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {!hasData ? (
          <div className="flex items-start gap-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-900">
            <Info className="mt-0.5 size-4 shrink-0 text-gray-400" />
            <p className="text-xs leading-relaxed text-gray-500">
              Todavía no hay tomas registradas en este periodo. La adherencia se calcula
              en cuanto confirmes u omitas tomas desde la lista del día o la notificación.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <AdherenceRing rate={rate} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span className="size-2 rounded-full bg-emerald-500" />
                  <span className="text-gray-600 dark:text-gray-300">
                    {summary.taken} tomadas
                  </span>
                  <span className="ml-auto font-semibold text-gray-900 dark:text-white">
                    {summary.evaluable} evaluables
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="size-2 rounded-full bg-amber-400" />
                  <span className="text-gray-600 dark:text-gray-300">
                    {summary.skipped} omitidas
                  </span>
                  <span className="ml-auto text-[10px] text-gray-400">decisión</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="size-2 rounded-full bg-gray-400" />
                  <span className="text-gray-600 dark:text-gray-300">
                    {summary.missed} no registradas
                  </span>
                  <span className="ml-auto text-[10px] text-gray-400">olvido</span>
                </div>
                {summary.pendingToday > 0 && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="size-2 rounded-full bg-rose-500 animate-pulse" />
                    <span className="text-gray-600 dark:text-gray-300">
                      {summary.pendingToday} pendientes hoy
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Omisión vs olvido */}
            <div className="mt-3">
              <div className="mb-1 flex items-center justify-between text-[10px] text-gray-400">
                <span>omisión {Math.round(skipRate * 100)}%</span>
                <span>olvido {Math.round(missRate * 100)}%</span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="bg-amber-400" style={{ width: `${skipRate * 100}%` }} />
                <div className="bg-gray-400" style={{ width: `${missRate * 100}%` }} />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge
                variant="secondary"
                className="gap-1 bg-amber-50 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              >
                <Flame className="size-3" />
                Racha: {summary.currentStreak} {summary.currentStreak === 1 ? "día" : "días"}
              </Badge>
              {summary.averageDelayMinutes != null && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <TrendingUp className="size-3" />
                  Retraso medio: {formatDelay(summary.averageDelayMinutes)}
                </Badge>
              )}
              {summary.snoozedCount > 0 && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Pill className="size-3" />
                  Pospuestas: {summary.snoozedCount}
                </Badge>
              )}
              {summary.evaluable > 0 && rate < 0.75 && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-rose-50 text-[10px] text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                >
                  <XCircle className="size-3" />
                  Por debajo del 75%
                </Badge>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
