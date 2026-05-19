"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Bar,
  BarChart,
} from "recharts";
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  BarChart3,
  AreaChart as AreaChartIcon,
} from "lucide-react";
import { motion } from "framer-motion";

interface DailyData {
  date: string;
  income: number;
  expense: number;
}

interface CategoryBreakdown {
  category: string;
  subCategory: string | null;
  amount: number;
  type: string;
}

interface SpendingIncomeData {
  periodStart: string;
  periodEnd: string;
  totalIncome: number;
  totalExpense: number;
  dailyData: DailyData[];
  categoryBreakdown: CategoryBreakdown[];
}

const chartConfig = {
  income: {
    label: "Ingresos",
    color: "#10b981",
  },
  expense: {
    label: "Gastos",
    color: "#f43f5e",
  },
} satisfies ChartConfig;

function formatPeriodLabel(startStr: string, endStr: string): string {
  const start = new Date(startStr);
  const end = new Date(endStr);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
  const startLabel = start.toLocaleDateString("es-CO", opts);
  const endLabel = end.toLocaleDateString("es-CO", opts);
  return `${startLabel} — ${endLabel}`;
}

function formatShortDay(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export function SpendingIncomeChart() {
  const [data, setData] = useState<SpendingIncomeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodOffset, setPeriodOffset] = useState(0);
  const [chartType, setChartType] = useState<"area" | "bar">("bar");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch<SpendingIncomeData>(
        `/api/budgets/spending-income?periodOffset=${periodOffset}`
      );
      setData(result);
    } catch (error) {
      console.error("Error fetching spending/income data:", error);
    } finally {
      setLoading(false);
    }
  }, [periodOffset]);

  useEffect(() => {
    let cancelled = false;
    fetchData().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchData]);

  // Aggregate daily data into weekly chunks for better readability
  const aggregatedData = (() => {
    if (!data?.dailyData) return [];

    // For bar chart, group by week
    if (chartType === "bar") {
      const weeks: { date: string; income: number; expense: number }[] = [];
      let currentWeek: { date: string; income: number; expense: number } | null = null;

      for (const day of data.dailyData) {
        const d = new Date(day.date);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay()); // Sunday
        const weekKey = weekStart.toISOString().split("T")[0];

        if (!currentWeek || currentWeek.date !== weekKey) {
          if (currentWeek) weeks.push(currentWeek);
          currentWeek = { date: weekKey, income: 0, expense: 0 };
        }
        currentWeek.income += day.income;
        currentWeek.expense += day.expense;
      }
      if (currentWeek) weeks.push(currentWeek);
      return weeks;
    }

    // For area chart, use cumulative data
    let cumIncome = 0;
    let cumExpense = 0;
    return data.dailyData.map((day) => {
      cumIncome += day.income;
      cumExpense += day.expense;
      return {
        date: day.date,
        income: cumIncome,
        expense: cumExpense,
      };
    });
  })();

  const balance = data ? data.totalIncome - data.totalExpense : 0;
  const isPositive = balance >= 0;

  return (
    <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
      <CardContent className="p-4">
        {/* Header with period navigation */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 className="size-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Gastos vs Ingresos
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg"
              onClick={() => setPeriodOffset((p) => p - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="text-[10px] text-gray-500 min-w-[140px] text-center">
              {data
                ? formatPeriodLabel(data.periodStart, data.periodEnd)
                : "Cargando..."}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 rounded-lg"
              onClick={() => setPeriodOffset((p) => p + 1)}
              disabled={periodOffset >= 0}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        {/* Chart type toggle & Balance */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              onClick={() => setChartType("bar")}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                chartType === "bar"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <BarChart3 className="size-3" />
              Barras
            </button>
            <button
              onClick={() => setChartType("area")}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-colors ${
                chartType === "area"
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <AreaChartIcon className="size-3" />
              Acumulado
            </button>
          </div>
          <div className="text-right">
            <p className="text-[9px] text-gray-400">Balance del periodo</p>
            <p
              className={`text-sm font-bold ${
                isPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {isPositive ? "+" : ""}
              {formatCurrency(balance)}
            </p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-2.5">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingUp className="size-3 text-emerald-500" />
              <span className="text-[9px] text-emerald-600 dark:text-emerald-400">
                Ingresos
              </span>
            </div>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
              {formatCurrency(data?.totalIncome || 0)}
            </p>
          </div>
          <div className="bg-rose-50 dark:bg-rose-900/20 rounded-xl p-2.5">
            <div className="flex items-center gap-1 mb-0.5">
              <TrendingDown className="size-3 text-rose-500" />
              <span className="text-[9px] text-rose-600 dark:text-rose-400">
                Gastos
              </span>
            </div>
            <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
              {formatCurrency(data?.totalExpense || 0)}
            </p>
          </div>
        </div>

        {/* Chart */}
        {loading ? (
          <div className="h-[200px] flex items-center justify-center">
            <div className="size-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : aggregatedData.length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-gray-400 text-xs">
            No hay datos para este periodo
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            {chartType === "bar" ? (
              <BarChart data={aggregatedData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDay}
                  tick={{ fontSize: 9 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9 }}
                  tickFormatter={(v: number) => {
                    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                    if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                    return `${v}`;
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => {
                        const num = Number(value);
                        return (
                          <span className="font-mono font-medium">
                            {formatCurrency(num)}
                          </span>
                        );
                      }}
                      labelFormatter={(label) => formatShortDay(String(label))}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Bar
                  dataKey="income"
                  fill="var(--color-income)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
                <Bar
                  dataKey="expense"
                  fill="var(--color-expense)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={32}
                />
              </BarChart>
            ) : (
              <AreaChart data={aggregatedData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <defs>
                  <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-income)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-income)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-expense)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--color-expense)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatShortDay}
                  tick={{ fontSize: 9 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 9 }}
                  tickFormatter={(v: number) => {
                    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                    if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                    return `${v}`;
                  }}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span className="font-mono font-medium">
                          {formatCurrency(Number(value))}
                        </span>
                      )}
                      labelFormatter={(label) => formatShortDay(String(label))}
                    />
                  }
                />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="var(--color-income)"
                  fill="url(#incomeGradient)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="var(--color-expense)"
                  fill="url(#expenseGradient)"
                  strokeWidth={2}
                />
              </AreaChart>
            )}
          </ChartContainer>
        )}

        {/* Category breakdown mini-list */}
        {data?.categoryBreakdown && data.categoryBreakdown.length > 0 && (
          <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
            <p className="text-[10px] font-medium text-gray-500 mb-2">
              Desglose por categoría
            </p>
            <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
              {data.categoryBreakdown.map((cat, i) => {
                const maxAmount = Math.max(
                  ...data.categoryBreakdown
                    .filter((c) => c.type === cat.type)
                    .map((c) => c.amount),
                  1
                );
                const pct = (cat.amount / maxAmount) * 100;
                const isIncome = cat.type === "income";
                const label = cat.subCategory
                  ? `${cat.category} · ${cat.subCategory}`
                  : cat.category;

                return (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className={`size-2 rounded-full shrink-0 ${
                        isIncome ? "bg-emerald-500" : "bg-rose-500"
                      }`}
                    />
                    <span className="text-[10px] text-gray-600 dark:text-gray-400 flex-1 truncate">
                      {label}
                    </span>
                    <span
                      className={`text-[10px] font-medium ${
                        isIncome
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      }`}
                    >
                      {formatCurrency(cat.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
