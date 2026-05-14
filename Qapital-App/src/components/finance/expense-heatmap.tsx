"use client";

import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Flame } from "lucide-react";
import { formatCurrency, parseLocalDate } from "@/lib/api";
import { motion } from "framer-motion";
import type { Transaction } from "@/lib/types/finance";

// ─── Constants ───

const CATEGORY_ICONS: Record<string, string> = {
  Vivienda: "🏠",
  Alimentación: "🍕",
  Supermercado: "🛒",
  Transporte: "🚗",
  Entretenimiento: "🎮",
  Ahorros: "💰",
  Suscripciones: "📱",
  Salud: "🏥",
  Inversiones: "📈",
  Educación: "📚",
  Otros: "📦",
};

const FULL_MONTH_NAMES: Record<string, string> = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
};

const WEEKDAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ─── Types ───

interface ExpenseHeatmapProps {
  transactions: Transaction[];
  year: number;
  month: number; // 1-12
}

interface DayCell {
  day: number | null;
  amount: number;
  intensity: 0 | 1 | 2 | 3 | 4; // 0=none, 1=low, 2=medium, 3=high, 4=very high
  expenses: Transaction[];
}

// ─── Color classes by intensity ───

const INTENSITY_CLASSES: Record<number, { bg: string; text: string }> = {
  0: {
    bg: "bg-gray-50 dark:bg-gray-800/40",
    text: "text-gray-400 dark:text-gray-500",
  },
  1: {
    bg: "bg-emerald-100 dark:bg-emerald-900/20",
    text: "text-gray-600 dark:text-emerald-300",
  },
  2: {
    bg: "bg-emerald-200 dark:bg-emerald-900/30",
    text: "text-gray-700 dark:text-emerald-200",
  },
  3: {
    bg: "bg-amber-200 dark:bg-amber-900/30",
    text: "text-gray-700 dark:text-amber-200",
  },
  4: {
    bg: "bg-rose-200 dark:bg-rose-900/30",
    text: "text-gray-700 dark:text-rose-200",
  },
};

const LEGEND_COLORS = [
  "bg-gray-50 dark:bg-gray-800/40",
  "bg-emerald-100 dark:bg-emerald-900/20",
  "bg-emerald-200 dark:bg-emerald-900/30",
  "bg-amber-200 dark:bg-amber-900/30",
  "bg-rose-200 dark:bg-rose-900/30",
];

// ─── Helper: compute percentile thresholds ───

function computeThresholds(amounts: number[]): {
  p25: number;
  p50: number;
  p75: number;
} {
  if (amounts.length === 0) return { p25: 0, p50: 0, p75: 0 };
  const sorted = [...amounts].sort((a, b) => a - b);
  const p25 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p75 = sorted[Math.floor(sorted.length * 0.75)] ?? 0;
  return { p25, p50, p75 };
}

function getIntensity(amount: number, thresholds: { p25: number; p50: number; p75: number }): 0 | 1 | 2 | 3 | 4 {
  if (amount <= 0) return 0;
  if (amount <= thresholds.p25) return 1;
  if (amount <= thresholds.p50) return 2;
  if (amount <= thresholds.p75) return 3;
  return 4;
}

// ─── Day Detail Popover ───

function DayDetailPopover({
  day,
  month,
  year,
  expenses,
  totalAmount,
  children,
}: {
  day: number;
  month: number;
  year: number;
  expenses: Transaction[];
  totalAmount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const dateLabel = useMemo(() => {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const d = parseLocalDate(dateStr);
    return d.toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }, [day, month, year]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        className="w-72 p-0 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700"
        align="center"
        side="top"
        sideOffset={4}
      >
        <div className="px-3 pt-3 pb-2 border-b border-gray-100 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 capitalize">
            {dateLabel}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            Total: <span className="font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(totalAmount)}</span>
          </p>
        </div>
        <div className="max-h-48 overflow-y-auto p-2 space-y-1.5">
          {expenses.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">Sin gastos</p>
          ) : (
            expenses.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-gray-50 dark:bg-gray-800/50"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs shrink-0">
                    {tx.category ? CATEGORY_ICONS[tx.category] || "📦" : "📦"}
                  </span>
                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate">
                    {tx.description}
                  </span>
                </div>
                <span className="text-xs font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                  -{formatCurrency(Math.abs(tx.amount))}
                </span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Component ───

export function ExpenseHeatmap({ transactions, year, month }: ExpenseHeatmapProps) {
  const monthKey = String(month).padStart(2, "0");
  const monthName = FULL_MONTH_NAMES[monthKey] || "";

  // 1. Filter expense transactions for the selected month
  const monthExpenses = useMemo(() => {
    return transactions.filter((tx) => {
      if (tx.type !== "expense") return false;
      const dateStr = typeof tx.date === "string" ? tx.date.split("T")[0] : "";
      if (!dateStr) return false;
      const [y, m] = dateStr.split("-").map(Number);
      return y === year && m === month;
    });
  }, [transactions, year, month]);

  // 2. Group by day and sum amounts
  const dailyMap = useMemo(() => {
    const map = new Map<number, { amount: number; expenses: Transaction[] }>();
    for (const tx of monthExpenses) {
      const dateStr = typeof tx.date === "string" ? tx.date.split("T")[0] : "";
      const d = parseLocalDate(dateStr);
      const day = d.getDate();
      const existing = map.get(day);
      if (existing) {
        existing.amount += Number(tx.amount);
        existing.expenses.push(tx);
      } else {
        map.set(day, { amount: Number(tx.amount), expenses: [tx] });
      }
    }
    return map;
  }, [monthExpenses]);

  // 3. Calculate percentile thresholds
  const thresholds = useMemo(() => {
    const amounts = Array.from(dailyMap.values())
      .map((d) => d.amount)
      .filter((a) => a > 0);
    return computeThresholds(amounts);
  }, [dailyMap]);

  // 4. Build calendar grid
  const calendarCells = useMemo(() => {
    const firstDay = new Date(year, month - 1, 1);
    const totalDays = new Date(year, month, 0).getDate();
    // getDay(): 0=Sunday, 1=Monday, ..., 6=Saturday
    // We want Monday=0, so: (getDay() + 6) % 7
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells: DayCell[] = [];

    // Empty cells before the first day
    for (let i = 0; i < startOffset; i++) {
      cells.push({ day: null, amount: 0, intensity: 0, expenses: [] });
    }

    // Day cells
    for (let d = 1; d <= totalDays; d++) {
      const data = dailyMap.get(d);
      const amount = data?.amount ?? 0;
      const expenses = data?.expenses ?? [];
      cells.push({
        day: d,
        amount,
        intensity: getIntensity(amount, thresholds),
        expenses,
      });
    }

    // Fill to complete last row (make it a multiple of 7)
    const remainder = cells.length % 7;
    if (remainder > 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        cells.push({ day: null, amount: 0, intensity: 0, expenses: [] });
      }
    }

    return cells;
  }, [year, month, dailyMap, thresholds]);

  // Total spent this month
  const totalSpent = useMemo(() => {
    return Array.from(dailyMap.values()).reduce((sum, d) => sum + d.amount, 0);
  }, [dailyMap]);

  // Legend threshold labels
  const legendLabels = useMemo(() => {
    if (thresholds.p25 === 0 && thresholds.p50 === 0 && thresholds.p75 === 0) {
      return null;
    }
    return {
      p25: formatCurrency(thresholds.p25),
      p50: formatCurrency(thresholds.p50),
      p75: formatCurrency(thresholds.p75),
    };
  }, [thresholds]);

  return (
    <Card className="border-0 shadow-md rounded-2xl">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Flame className="size-4 text-orange-500" />
              Mapa de Gastos
            </CardTitle>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {monthName} {year}
            </p>
          </div>
          <Badge
            variant="secondary"
            className="bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 text-[10px] px-2"
          >
            {formatCurrency(totalSpent)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              className="text-center text-[9px] font-medium text-gray-400 dark:text-gray-500 py-0.5"
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, idx) => {
            if (cell.day === null) {
              return (
                <div
                  key={`empty-${idx}`}
                  className="aspect-square rounded-lg"
                />
              );
            }

            const colorClass = INTENSITY_CLASSES[cell.intensity];
            const hasExpenses = cell.expenses.length > 0;

            const cellContent = (
              <motion.div
                key={`day-${cell.day}`}
                className={`aspect-square rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors ${colorClass.bg} ${
                  hasExpenses
                    ? "hover:ring-2 hover:ring-gray-300 dark:hover:ring-gray-600"
                    : ""
                }`}
                whileHover={hasExpenses ? { scale: 1.08 } : {}}
                whileTap={hasExpenses ? { scale: 0.95 } : {}}
              >
                <span className={`text-[9px] leading-none ${colorClass.text}`}>
                  {cell.day}
                </span>
                {cell.amount > 0 && (
                  <span className={`text-[7px] leading-none mt-0.5 font-medium ${colorClass.text}`}>
                    {(cell.amount >= 1000
                      ? `${(cell.amount / 1000).toFixed(0)}k`
                      : cell.amount.toFixed(0))}
                  </span>
                )}
              </motion.div>
            );

            if (hasExpenses) {
              return (
                <DayDetailPopover
                  key={`day-${cell.day}`}
                  day={cell.day}
                  month={month}
                  year={year}
                  expenses={cell.expenses}
                  totalAmount={cell.amount}
                >
                  {cellContent}
                </DayDetailPopover>
              );
            }

            return cellContent;
          })}
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="text-[9px] text-gray-400 dark:text-gray-500">Menos</span>
          {LEGEND_COLORS.map((colorClass, i) => (
            <div
              key={`legend-${i}`}
              className={`size-3.5 rounded-sm ${colorClass}`}
            />
          ))}
          <span className="text-[9px] text-gray-400 dark:text-gray-500">Más</span>
        </div>

        {/* Legend amounts */}
        {legendLabels && (
          <div className="mt-1 flex items-center justify-center gap-2">
            <span className="text-[8px] text-gray-300 dark:text-gray-600">
              0
            </span>
            <span className="text-[8px] text-gray-300 dark:text-gray-600">
              ≤{legendLabels.p25}
            </span>
            <span className="text-[8px] text-gray-300 dark:text-gray-600">
              ≤{legendLabels.p50}
            </span>
            <span className="text-[8px] text-gray-300 dark:text-gray-600">
              ≤{legendLabels.p75}
            </span>
            <span className="text-[8px] text-gray-300 dark:text-gray-600">
              &gt;{legendLabels.p75}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
