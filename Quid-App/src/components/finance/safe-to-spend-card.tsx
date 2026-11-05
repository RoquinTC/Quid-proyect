"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useDataEvent } from "@/hooks/use-data-event";
import { useAppStore } from "@/lib/store";
import {
  Sparkles,
  AlertTriangle,
  Info,
  ChevronDown,
  ArrowRight,
} from "lucide-react";

/**
 * F-05 + F-38 · Safe to Spend con anatomía visible.
 *
 * F-05 responde "¿cuánto puedo gastar hoy?".
 * F-38 deja AUDITAR ese número: de dónde sale, qué ya está comprometido y en
 * qué pagos concretos. Una cifra sin anatomía es una cifra en la que no se
 * puede confiar; con anatomía, el usuario puede verificarla en dos segundos.
 *
 * El cálculo lo hace el servidor (`/api/finance/safe-to-spend`), que respeta el
 * período configurado (mensual o quincenal, F-42) y descuenta los pagos
 * pendientes (F-39/F-06). Aquí solo se presenta.
 */

type CommittedPayment = {
  id: string;
  description: string;
  amount: number;
  type: string;
  scheduledDate: string;
};

type SafeToSpendData = {
  hasBudget: boolean;
  periodBudget: number;
  spent: number;
  remaining: number;
  committed: number;
  available: number;
  daysLeft: number;
  safePerDay: number | null;
  overBudget: boolean;
  committedCount: number;
  committedPayments: CommittedPayment[];
  period: { start: string; end: string };
};

const money = (value: number) => formatCurrency(Math.abs(value));
const minus = (value: number) => (value < 0 ? "\u2212" : "");

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    timeZone: "America/Bogota",
  });
}

/** Una fila de la anatomía. */
function Row({
  label,
  value,
  emphasis = false,
  negative = false,
  hint,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  negative?: boolean;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span
        className={`text-[11px] ${
          emphasis
            ? "font-semibold text-gray-700 dark:text-gray-200"
            : "text-gray-500 dark:text-gray-400"
        }`}
      >
        {label}
        {hint && <span className="text-gray-400"> {hint}</span>}
      </span>
      <span
        className={`text-[11px] tabular-nums shrink-0 ${
          negative
            ? "font-semibold text-rose-600 dark:text-rose-400"
            : emphasis
              ? "font-semibold text-gray-900 dark:text-white"
              : "text-gray-600 dark:text-gray-300"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-gray-200/70 dark:bg-gray-700/60 my-1" />;
}

export function SafeToSpendCard() {
  const [data, setData] = useState<SafeToSpendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const setFinanceSubView = useAppStore((s) => s.setFinanceSubView);

  const fetchData = useCallback(() => {
    apiFetch<SafeToSpendData>("/api/finance/safe-to-spend")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Se recalcula cuando cambian transacciones, presupuestos o pagos.
  // Los nombres deben coincidir con el mapa de `lib/data-events.ts`.
  useDataEvent("transactions", fetchData);
  useDataEvent("budgets", fetchData);
  useDataEvent("recurringPayments", fetchData);

  if (loading) {
    return (
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardContent className="p-4">
          <div className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        </CardContent>
      </Card>
    );
  }

  // Sin presupuesto configurado: no se inventa una cifra.
  if (!data || !data.hasBudget || data.safePerDay === null) {
    return (
      <Card className="border border-dashed border-gray-200 dark:border-gray-700 shadow-none rounded-2xl bg-gray-50/50 dark:bg-gray-800/30">
        <CardContent className="p-3 flex items-center gap-2">
          <Info className="size-4 text-gray-400 shrink-0" />
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Configura un presupuesto de gasto para ver cuánto puedes gastar por día.
          </p>
        </CardContent>
      </Card>
    );
  }

  const positive = data.safePerDay >= 0;
  const visibleCommitted = data.committedPayments.slice(0, 5);
  const hiddenCommitted = Math.max(0, data.committedCount - visibleCommitted.length);

  return (
    <Card
      className={`border-0 shadow-md rounded-2xl overflow-hidden ${
        data.overBudget
          ? "bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-950/30 dark:to-orange-950/20"
          : "bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/20"
      }`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {data.overBudget ? (
                <AlertTriangle className="size-3.5 text-rose-500" />
              ) : (
                <Sparkles className="size-3.5 text-blue-500" />
              )}
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Puedes gastar hoy
              </span>
            </div>

            <p
              className={`text-2xl font-bold tracking-tight ${
                data.overBudget
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-gray-900 dark:text-white"
              }`}
            >
              {positive ? money(data.safePerDay) : `-${money(data.safePerDay)}`}
            </p>

            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
              {data.daysLeft === 1
                ? "Último día del período"
                : `Repartido en ${data.daysLeft} días restantes`}
            </p>
          </div>

          {/* Desglose rápido */}
          <div className="text-right shrink-0 space-y-0.5">
            <span className="text-[10px] text-gray-400">
              Comprometido ({data.committedCount})
            </span>
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              {money(data.committed)}
            </p>
            <p className="text-[10px] text-gray-400">
              {data.remaining >= 0
                ? `de ${money(data.remaining)} libres`
                : "de presupuesto excedido"}
            </p>
          </div>
        </div>

        {/* Mensaje preciso: distinguir "gastaste de más" de "ya está comprometido" */}
        {data.remaining < 0 ? (
          <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
            Ya superaste el presupuesto del período por{" "}
            <strong>{money(data.remaining)}</strong>.
          </p>
        ) : (
          data.overBudget && (
            <p className="mt-2 text-[11px] text-rose-600 dark:text-rose-400">
              Lo comprometido supera lo que queda del presupuesto por{" "}
              <strong>{money(data.available)}</strong>.
            </p>
          )
        )}

        {/* ── F-38 · Anatomía ── */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full flex items-center justify-center gap-1 rounded-lg py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:bg-white/50 dark:hover:bg-black/10 transition-colors"
          aria-expanded={expanded}
        >
          {expanded ? "Ocultar anatomía" : "Ver de dónde sale este número"}
          <ChevronDown
            className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {expanded && (
          <div className="mt-2 rounded-xl bg-white/70 dark:bg-black/20 p-3 space-y-1">
            <Row
              label="Presupuesto del período"
              value={money(data.periodBudget)}
            />
            <Row
              label={"\u2212 Gastado"}
              value={`\u2212${money(data.spent)}`}
            />
            <Divider />
            <Row
              label="Restante"
              value={`${minus(data.remaining)}${money(data.remaining)}`}
              emphasis
              negative={data.remaining < 0}
            />
            <Row
              label={"\u2212 Comprometido"}
              value={`\u2212${money(data.committed)}`}
              hint={`(${data.committedCount} ${data.committedCount === 1 ? "pago" : "pagos"})`}
            />
            <Divider />
            <Row
              label="Disponible"
              value={`${minus(data.available)}${money(data.available)}`}
              emphasis
              negative={data.available < 0}
            />
            <Row
              label={"\u00f7 Días restantes"}
              value={`${data.daysLeft}`}
            />
            <Row
              label="= Por día"
              value={`${minus(data.safePerDay)}${money(data.safePerDay)}`}
              emphasis
              negative={data.safePerDay < 0}
            />

            {/* Qué pagos forman el comprometido */}
            {visibleCommitted.length > 0 && (
              <div className="pt-2 mt-2 border-t border-gray-200/70 dark:border-gray-700/60">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Comprometido en
                </p>
                <div className="space-y-1">
                  {visibleCommitted.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="text-[11px] text-gray-600 dark:text-gray-300 truncate">
                        {p.description}
                        <span className="text-gray-400"> · {shortDate(p.scheduledDate)}</span>
                      </span>
                      <span className="text-[11px] tabular-nums text-gray-700 dark:text-gray-200 shrink-0">
                        {money(p.amount)}
                      </span>
                    </div>
                  ))}
                </div>
                {hiddenCommitted > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    +{hiddenCommitted} {hiddenCommitted === 1 ? "pago más" : "pagos más"}
                  </p>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setFinanceSubView("recurring")}
              className="mt-2 w-full flex items-center justify-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 py-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Revisar pagos pendientes
              <ArrowRight className="size-3" />
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
