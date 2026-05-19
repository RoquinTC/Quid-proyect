"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Line, LineChart, XAxis, YAxis, CartesianGrid } from "recharts";
import { TrendingUp, TrendingDown, PiggyBank } from "lucide-react";
import { useAppStore } from "@/lib/store";

interface MonthlyData {
  period: string;
  periodStart: string;
  periodEnd: string;
  income: number;
  expense: number;
  savings: number;
}

interface HistoryData {
  monthlyData: MonthlyData[];
  currentNetWorth: number;
  previousNetWorth: number;
  yieldHistory: Array<{ month: string; projected: number; actual: number | null }>;
}

const chartConfig = {
  income: { label: "Ingresos", color: "#10b981", icon: TrendingUp },
  expense: { label: "Gastos", color: "#f43f5e", icon: TrendingDown },
  savings: { label: "Ahorros", color: "#a855f7", icon: PiggyBank },
} satisfies ChartConfig;

export function FinanceMiniChart() {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const { setFinanceSubView } = useAppStore();

  const fetchData = useCallback(async () => {
    try {
      const result = await apiFetch<HistoryData>("/api/finance/history");
      setData(result);
    } catch (error) {
      console.error("Error fetching finance history:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchData().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchData]);

  if (loading) {
    return (
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardContent className="p-4">
          <div className="h-[160px] flex items-center justify-center">
            <div className="size-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.monthlyData.length === 0) return null;

  const chartData = [...data.monthlyData].reverse().map((m) => ({
    period: m.period,
    income: Math.round(m.income),
    expense: Math.round(m.expense),
    savings: Math.round(m.savings),
  }));

  const latestMonth = data.monthlyData[data.monthlyData.length - 1];
  const balance = latestMonth ? latestMonth.income - latestMonth.expense : 0;
  const isPositive = balance >= 0;

  return (
    <Card
      className="border-0 shadow-sm rounded-2xl cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => setFinanceSubView("budgets")}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="size-7 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <TrendingUp className="size-3.5 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-900 dark:text-white">
                Tendencia Financiera
              </p>
              <p className="text-[9px] text-gray-400">Últimos 6 periodos</p>
            </div>
          </div>
          <div className="text-right">
            <p
              className={`text-xs font-bold ${
                isPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {isPositive ? "+" : ""}
              {formatCurrency(balance)}
            </p>
            <p className="text-[9px] text-gray-400">Balance del periodo</p>
          </div>
        </div>

        {/* Chart */}
        <ChartContainer config={chartConfig} className="h-[110px] w-full">
          <LineChart data={chartData} margin={{ top: 5, right: 5, left: -30, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="period"
              tick={{ fontSize: 8 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fontSize: 8 }}
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
                />
              }
            />
            <Line
              type="monotone"
              dataKey="income"
              stroke="var(--color-income)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="expense"
              stroke="var(--color-expense)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="savings"
              stroke="var(--color-savings)"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 4 }}
              strokeDasharray="5 3"
            />
          </LineChart>
        </ChartContainer>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-2">
          <div className="flex items-center gap-1">
            <div className="size-2 rounded-full bg-emerald-500" />
            <span className="text-[9px] text-gray-500">Ingresos</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="size-2 rounded-full bg-rose-500" />
            <span className="text-[9px] text-gray-500">Gastos</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="size-2 rounded-full bg-purple-500" />
            <span className="text-[9px] text-gray-500">Ahorros</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
