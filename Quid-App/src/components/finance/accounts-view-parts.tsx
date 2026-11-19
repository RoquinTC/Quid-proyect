"use client";

/**
 * F-57 · Piezas visuales de la vista de Cuentas.
 *
 * El tooltip de la gráfica, la mini-línea de tendencia y el cálculo del
 * historial de saldo. Separadas de `accounts-view.tsx` para que la vista se
 * quede con los datos y el layout.
 */

import { formatCurrency } from "@/lib/api";
import { FULL_MONTH_NAMES } from "@/components/finance/overview-widgets";
import type { Transaction } from "@/lib/types";

export function FinancialEvolutionTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const monthLabel = label || "";
  const [, mm] = monthLabel.split("-");
  const displayMonth = mm ? FULL_MONTH_NAMES[mm] || monthLabel : monthLabel;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-xs">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{displayMonth}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 mb-0.5">
          <div className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500 dark:text-gray-400">
            {entry.dataKey === "income" ? "Ingresos" : "Gastos"}:
          </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MiniSparkline({
  data,
  width = 60,
  height = 18,
  color = "rgba(255,255,255,0.6)",
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function computeBalanceHistory(
  accountId: string,
  allTransactions: Transaction[],
  currentBalance: number
): { date: string; balance: number }[] {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Filtrar transacciones de esta cuenta en los últimos 30 días
  const accountTxs = allTransactions
    .filter((tx) => {
      if (tx.isTransferCounterpart) return false;
      const txDate = new Date(tx.date);
      if (txDate > now) return false;
      const belongsToAccount =
        tx.accountId === accountId || tx.subAccountId === accountId;
      return belongsToAccount && txDate >= thirtyDaysAgo;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (accountTxs.length < 2) return [];

  // Calcular balance corriendo hacia atrás desde el balance actual
  // Estimamos el balance de hace 30 días restando todas las transacciones
  const history: { date: string; balance: number }[] = [];

  let balanceBefore = currentBalance;
  for (const tx of accountTxs) {
    const amount = Number(tx.amount);
    if (tx.type === "income" || tx.type === "transfer_in") {
      balanceBefore -= amount;
    } else if (tx.type === "expense" || tx.type === "transfer_out") {
      balanceBefore += amount;
    }
  }

  // Ahora reconstruimos hacia adelante
  let current = balanceBefore;
  for (const tx of accountTxs) {
    const amount = Number(tx.amount);
    if (tx.type === "income" || tx.type === "transfer_in") {
      current += amount;
    } else if (tx.type === "expense" || tx.type === "transfer_out") {
      current -= amount;
    }
    const dateStr = typeof tx.date === "string" ? tx.date.split("T")[0] : tx.date;
    history.push({ date: dateStr, balance: current });
  }

  return history;
}
