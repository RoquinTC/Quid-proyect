"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, Check, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/api";
import type { RecurringPayment } from "@/lib/types";
import {
  splitUpcomingPayments,
  daysUntilDate,
  dueLabel,
  PERIOD_LABELS,
  type UpcomingPeriod,
  type Totals,
} from "@/lib/finance/payment-dates";

/**
 * F-06 · Bandeja de pagos: **Vencidos** vs **Próximos**.
 *
 * El punto de esta pantalla es que un pago vencido no se pueda "perder":
 * los vencidos se muestran SIEMPRE completos, sin importar el período elegido,
 * y con su propio total. Los próximos se filtran por ventana (hoy, mañana,
 * esta semana, este mes).
 *
 * Los totales separan lo que SALE (gastos y transferencias) de lo que ENTRA
 * (ingresos): sumarlos juntos daría un número que no significa nada.
 */

type UpcomingPaymentsProps = {
  payments: RecurringPayment[];
  /** Confirmar un pago (abre el diálogo de confirmación del módulo). */
  onConfirm: (payment: RecurringPayment) => void;
  /** Cuántos mostrar por sección antes de resumir el resto. */
  maxRows?: number;
  className?: string;
};

const PERIODS: UpcomingPeriod[] = ["today", "tomorrow", "week", "month"];

function TotalsLine({ totals }: { totals: Totals }) {
  if (totals.count === 0) return null;
  return (
    <span className="text-[11px] text-gray-500 dark:text-gray-400">
      {totals.out > 0 && (
        <span className="font-semibold text-gray-700 dark:text-gray-200">
          {formatCurrency(totals.out)}
        </span>
      )}
      {totals.out > 0 && totals.income > 0 && " · "}
      {totals.income > 0 && (
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
          +{formatCurrency(totals.income)}
        </span>
      )}
    </span>
  );
}

export function UpcomingPayments({
  payments,
  onConfirm,
  maxRows = 5,
  className = "",
}: UpcomingPaymentsProps) {
  const [period, setPeriod] = useState<UpcomingPeriod>("week");
  const [showAllOverdue, setShowAllOverdue] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);

  const { overdue, upcoming, overdueTotals, upcomingTotals } = useMemo(
    () => splitUpcomingPayments(payments, period),
    [payments, period]
  );

  const visibleOverdue = showAllOverdue ? overdue : overdue.slice(0, maxRows);
  const visibleUpcoming = showAllUpcoming ? upcoming : upcoming.slice(0, maxRows);

  // Si no hay nada que mostrar, la bandeja no ocupa espacio.
  if (overdue.length === 0 && upcoming.length === 0) return null;

  const renderRow = (payment: RecurringPayment, overdueStyle: boolean) => {
    const days = daysUntilDate(payment.scheduledDate);
    const accountName = payment.account?.name;
    return (
      <button
        key={payment.id}
        type="button"
        onClick={() => onConfirm(payment)}
        className="w-full flex items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/60"
        title="Confirmar este pago"
      >
        <span
          className={`size-1.5 rounded-full shrink-0 ${
            overdueStyle ? "bg-rose-500" : "bg-blue-400"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
            {payment.description}
          </p>
          <p className="text-[11px] text-gray-400 truncate">
            <span className={overdueStyle ? "text-rose-500 dark:text-rose-400" : ""}>
              {dueLabel(days)}
            </span>
            {accountName && ` · ${accountName}`}
            {payment.category && ` · ${payment.category}`}
          </p>
        </div>
        <span
          className={`text-xs font-bold shrink-0 ${
            payment.type === "income"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-gray-700 dark:text-gray-200"
          }`}
        >
          {formatCurrency(payment.amount)}
        </span>
        <span className="shrink-0 size-6 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        </span>
      </button>
    );
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* ── Vencidos: siempre completos ── */}
      {overdue.length > 0 && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 dark:border-rose-900/40 dark:bg-rose-950/20 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2">
            <AlertTriangle className="size-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span className="text-xs font-semibold text-rose-700 dark:text-rose-300">
              Vencidos
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-200/70 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300">
              {overdueTotals.count}
            </span>
            <span className="ml-auto">
              <TotalsLine totals={overdueTotals} />
            </span>
          </div>
          <div className="px-1 pb-1">
            {visibleOverdue.map((p) => renderRow(p, true))}
            {overdue.length > maxRows && (
              <button
                type="button"
                onClick={() => setShowAllOverdue((v) => !v)}
                className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400 hover:underline"
              >
                {showAllOverdue ? "Ver menos" : `Ver los ${overdue.length}`}
                <ChevronDown
                  className={`size-3 transition-transform ${showAllOverdue ? "rotate-180" : ""}`}
                />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Próximos: filtrados por ventana ── */}
      <div className="rounded-xl border border-gray-100 bg-white dark:border-gray-700/50 dark:bg-gray-800/40 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <CalendarClock className="size-3.5 text-blue-500 shrink-0" />
          <span className="text-xs font-semibold text-gray-900 dark:text-white">Próximos</span>
          {upcomingTotals.count > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {upcomingTotals.count}
            </span>
          )}
          <span className="ml-auto">
            <TotalsLine totals={upcomingTotals} />
          </span>
        </div>

        {/* Ventanas */}
        <div className="flex gap-1 px-3 pb-2 flex-wrap">
          {PERIODS.map((p) => {
            const active = period === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                  active
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                    : "bg-gray-50 text-gray-500 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700"
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            );
          })}
        </div>

        <div className="px-1 pb-1">
          {upcoming.length === 0 ? (
            <p className="px-2 py-2 text-[11px] text-gray-400">
              Sin pagos pendientes en esta ventana.
            </p>
          ) : (
            <>
              {visibleUpcoming.map((p) => renderRow(p, false))}
              {upcoming.length > maxRows && (
                <button
                  type="button"
                  onClick={() => setShowAllUpcoming((v) => !v)}
                  className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {showAllUpcoming ? "Ver menos" : `Ver los ${upcoming.length}`}
                  <ChevronDown
                    className={`size-3 transition-transform ${showAllUpcoming ? "rotate-180" : ""}`}
                  />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
