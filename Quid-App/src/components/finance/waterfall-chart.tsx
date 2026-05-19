"use client";

import { useMemo } from "react";
import { formatCurrency } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";

// ============================================================
// WATERFALL CHART COMPONENT
// ============================================================

interface WaterfallChartProps {
  initialBalance: number;
  income: number;
  fixedExpenses: number;
  variableExpenses: number;
  debtPayments?: number; // Loan payments only (CC purchases already counted in categories)
}

interface WaterfallDataPoint {
  name: string;
  base: number;   // invisible offset (where the bar starts)
  value: number;  // visible bar height (always positive)
  color: string;
  rawValue: number; // original signed value for tooltip display
  isResult?: boolean; // flag for the final "saldo" bar
}

// ── Custom Waterfall Tooltip ──

function WaterfallTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: WaterfallDataPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-xs">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
        {data.name}
      </p>
      <div className="flex items-center gap-2">
        <div
          className="size-2.5 rounded-full"
          style={{ backgroundColor: data.color }}
        />
        <span className="text-gray-500 dark:text-gray-400">
          {data.isResult ? "Saldo" : "Monto"}:
        </span>
        <span className="font-semibold text-gray-900 dark:text-gray-100">
          {data.isResult
            ? formatCurrency(data.rawValue)
            : data.rawValue >= 0
              ? `+${formatCurrency(data.rawValue)}`
              : formatCurrency(data.rawValue)}
        </span>
      </div>
    </div>
  );
}

// ── Main Component ──

export function WaterfallChart({
  initialBalance,
  income,
  fixedExpenses,
  variableExpenses,
  debtPayments = 0,
}: WaterfallChartProps) {
  const finalBalance = initialBalance + income - fixedExpenses - variableExpenses - debtPayments;

  // Build waterfall data points
  const data = useMemo<WaterfallDataPoint[]>(() => {
    const points: WaterfallDataPoint[] = [];

    // 1. Saldo Inicial — full bar from 0
    points.push({
      name: "Saldo Inicial",
      base: 0,
      value: Math.abs(initialBalance),
      color: "#3B82F6",
      rawValue: initialBalance,
      isResult: false,
    });

    // 2. + Ingresos — bar goes UP from previous total
    const afterIncome = initialBalance + income;
    if (income >= 0) {
      points.push({
        name: "+ Ingresos",
        base: initialBalance,
        value: income,
        color: "#10B981",
        rawValue: income,
      });
    } else {
      points.push({
        name: "+ Ingresos",
        base: afterIncome,
        value: Math.abs(income),
        color: "#10B981",
        rawValue: income,
      });
    }

    // 3. - Gastos Fijos — bar goes DOWN from previous total
    const afterFixed = afterIncome - fixedExpenses;
    if (fixedExpenses >= 0) {
      points.push({
        name: "- Gastos Fijos",
        base: afterFixed,
        value: fixedExpenses,
        color: "#F43F5E",
        rawValue: -fixedExpenses,
      });
    } else {
      points.push({
        name: "- Gastos Fijos",
        base: afterIncome,
        value: Math.abs(fixedExpenses),
        color: "#F43F5E",
        rawValue: -fixedExpenses,
      });
    }

    // 4. - Gastos Variables — bar goes DOWN from previous total
    const afterVariable = afterFixed - variableExpenses;
    if (variableExpenses >= 0) {
      points.push({
        name: "- Gastos Variables",
        base: afterVariable,
        value: variableExpenses,
        color: "#F59E0B",
        rawValue: -variableExpenses,
      });
    } else {
      points.push({
        name: "- Gastos Variables",
        base: afterFixed,
        value: Math.abs(variableExpenses),
        color: "#F59E0B",
        rawValue: -variableExpenses,
      });
    }

    // 5. - Pago Deudas (loan payments) — only if there are debt payments
    const afterDebt = afterVariable - debtPayments;
    if (debtPayments > 0) {
      points.push({
        name: "- Pago Deudas",
        base: afterDebt,
        value: debtPayments,
        color: "#A855F7",
        rawValue: -debtPayments,
      });
    }

    // 6. = Saldo Final — full bar from 0 (result)
    if (finalBalance >= 0) {
      points.push({
        name: "= Saldo Final",
        base: 0,
        value: finalBalance,
        color: "#8B5CF6",
        rawValue: finalBalance,
        isResult: true,
      });
    } else {
      points.push({
        name: "= Saldo Final",
        base: finalBalance,
        value: Math.abs(finalBalance),
        color: "#EF4444",
        rawValue: finalBalance,
        isResult: true,
      });
    }

    return points;
  }, [initialBalance, income, fixedExpenses, variableExpenses, debtPayments, finalBalance]);

  // Compute Y axis domain
  const allValues = data.flatMap((d) => [d.base, d.base + d.value]);
  const minY = Math.min(0, ...allValues);
  const maxY = Math.max(0, ...allValues);
  const padding = (maxY - minY) * 0.1 || 1;

  // Y-axis tick formatter
  const formatYTick = (v: number) => {
    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
    return String(Math.round(v));
  };

  // Legend items
  const legendItems = [
    { name: "Saldo Inicial", color: "#3B82F6" },
    { name: "Ingresos", color: "#10B981" },
    { name: "Gastos Fijos", color: "#F43F5E" },
    { name: "Gastos Variables", color: "#F59E0B" },
    ...(debtPayments > 0 ? [{ name: "Pago Deudas", color: "#A855F7" }] : []),
    {
      name: "Saldo Final",
      color: finalBalance >= 0 ? "#8B5CF6" : "#EF4444",
    },
  ];

  return (
    <div>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
            barCategoryGap="20%"
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#f0f0f0"
              vertical={false}
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 9, fill: "#9CA3AF" }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              domain={[minY - padding, maxY + padding]}
              tick={{ fontSize: 9, fill: "#9CA3AF" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={formatYTick}
            />
            <Tooltip
              content={<WaterfallTooltip />}
              cursor={{ fill: "rgba(0,0,0,0.03)" }}
            />
            {/* Invisible base bar (stacked offset) */}
            <Bar
              dataKey="base"
              stackId="waterfall"
              fill="transparent"
              isAnimationActive={false}
            />
            {/* Visible value bar */}
            <Bar
              dataKey="value"
              stackId="waterfall"
              isAnimationActive={true}
              animationDuration={800}
              animationEasing="ease-out"
              radius={[4, 4, 0, 0]}
            >
              {data.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-2">
        {legendItems.map((item) => (
          <div key={item.name} className="flex items-center gap-1">
            <div
              className="size-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[9px] text-gray-500 dark:text-gray-400">
              {item.name}
            </span>
          </div>
        ))}
      </div>
      {/* Summary pill */}
      <div className="mt-2 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-3 py-2 flex items-center justify-between">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          Resultado del mes
        </span>
        <span
          className={`text-xs font-bold ${
            finalBalance >= 0
              ? "text-violet-600 dark:text-violet-400"
              : "text-red-500 dark:text-red-400"
          }`}
        >
          {finalBalance >= 0 ? "+" : ""}
          {formatCurrency(finalBalance)}
        </span>
      </div>
    </div>
  );
}
