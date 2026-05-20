"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Wallet,
  TrendingUp,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  ChevronLeft,
  Calendar,
  PiggyBank,
  Receipt,
  Activity,
  BarChart3,
  Settings2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  GripVertical,
  RotateCcw,
  User as UserIcon,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { formatCurrency, calcPercentage, getColombiaNow, parseLocalDate } from "@/lib/api";
import { useMultiQuery } from "@/lib/local/hooks/queries";
import { motion } from "framer-motion";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Account, SubAccount, Transaction, Budget, Debt, RecurringPayment, MonthlyData, MonthlySummaryResponse } from "@/lib/types";
import { ExpenseHeatmap } from "./expense-heatmap";
import { WaterfallChart } from "./waterfall-chart";
import { HealthScoreWidget } from "./health-score-widget";

// ============================================================
// WIDGET CONFIGURATION
// ============================================================

interface WidgetConfig {
  id: string;
  title: string;
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "balance", title: "Balance", visible: true, order: 0 },
  { id: "health-score", title: "Salud Financiera", visible: true, order: 1 },
  { id: "waterfall", title: "Gráfico de Cascada", visible: true, order: 2 },
  { id: "evolution", title: "Evolución Financiera", visible: true, order: 3 },
  { id: "cashflow", title: "Proyección de Flujo de Caja", visible: true, order: 4 },
  { id: "expenses", title: "Tus Gastos", visible: true, order: 5 },
  { id: "heatmap", title: "Mapa de Gastos", visible: true, order: 6 },
  { id: "budgets", title: "Progreso de Presupuestos", visible: true, order: 7 },
  { id: "transactions", title: "Transacciones Recientes", visible: true, order: 8 },
  { id: "bills", title: "Próximos Pagos", visible: true, order: 9 },
];

const WIDGET_STORAGE_KEY = "quid-finance-widgets";

// ============================================================
// CONSTANTS
// ============================================================

const CATEGORY_COLORS: Record<string, string> = {
  Vivienda: "#10B981",
  Alimentación: "#F59E0B",
  Supermercado: "#F59E0B",
  Transporte: "#3B82F6",
  Entretenimiento: "#8B5CF6",
  Ahorros: "#8B5CF6",
  Suscripciones: "#EC4899",
  Salud: "#EF4444",
  Inversiones: "#06B6D4",
  Educación: "#14B8A6",
  Otros: "#6B7280",
};

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

const MONTH_NAMES: Record<string, string> = {
  "01": "Ene",
  "02": "Feb",
  "03": "Mar",
  "04": "Abr",
  "05": "May",
  "06": "Jun",
  "07": "Jul",
  "08": "Ago",
  "09": "Sep",
  "10": "Oct",
  "11": "Nov",
  "12": "Dic",
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

// ============================================================
// ANIMATION VARIANTS
// ============================================================

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

// ============================================================
// CIRCULAR PROGRESS COMPONENT
// ============================================================

function CircularProgress({
  percentage,
  size = 64,
  strokeWidth = 6,
  color,
  children,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clampedPct = Math.min(percentage, 999);
  const offset = circumference - (clampedPct / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================
// CUSTOM TOOLTIPS FOR CHARTS
// ============================================================

function FinancialEvolutionTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
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

function CashFlowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
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
            {entry.dataKey === "historical" ? "Histórico" : "Proyectado"}:
          </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// WIDGET CUSTOMIZATION DIALOG
// ============================================================

function WidgetCustomizationDialog({
  open,
  onOpenChange,
  widgetConfig,
  setWidgetConfig,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetConfig: WidgetConfig[];
  setWidgetConfig: (config: WidgetConfig[]) => void;
}) {
  const toggleVisibility = (id: string) => {
    // Balance widget cannot be hidden
    if (id === "balance") return;
    setWidgetConfig(
      widgetConfig.map((w) =>
        w.id === id ? { ...w, visible: !w.visible } : w
      )
    );
  };

  const moveUp = (order: number) => {
    const sorted = [...widgetConfig].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((w) => w.order === order);
    if (idx <= 0) return;
    const prev = sorted[idx - 1];
    const curr = sorted[idx];
    setWidgetConfig(
      widgetConfig.map((w) => {
        if (w.id === prev.id) return { ...w, order: curr.order };
        if (w.id === curr.id) return { ...w, order: prev.order };
        return w;
      })
    );
  };

  const moveDown = (order: number) => {
    const sorted = [...widgetConfig].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((w) => w.order === order);
    if (idx >= sorted.length - 1) return;
    const curr = sorted[idx];
    const next = sorted[idx + 1];
    setWidgetConfig(
      widgetConfig.map((w) => {
        if (w.id === curr.id) return { ...w, order: next.order };
        if (w.id === next.id) return { ...w, order: curr.order };
        return w;
      })
    );
  };

  const resetToDefaults = () => {
    setWidgetConfig(DEFAULT_WIDGETS.map((w) => ({ ...w })));
  };

  const sorted = [...widgetConfig].sort((a, b) => a.order - b.order);
  const maxOrder = sorted.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-5 text-emerald-500" />
            Personalizar Widgets
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2 max-h-[60vh] overflow-y-auto">
          {sorted.map((widget) => {
            const isBalance = widget.id === "balance";
            return (
              <div
                key={widget.id}
                className={`flex items-center gap-2 p-2.5 rounded-xl transition-colors ${
                  widget.visible
                    ? "bg-gray-50 dark:bg-gray-800/60"
                    : "bg-gray-50/50 dark:bg-gray-800/30 opacity-60"
                }`}
              >
                <GripVertical className="size-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                <span className={`flex-1 text-sm font-medium ${
                  widget.visible
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-400 dark:text-gray-500"
                }`}>
                  {widget.title}
                  {isBalance && (
                    <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-1.5">
                      (siempre visible)
                    </span>
                  )}
                </span>
                <button
                  onClick={() => toggleVisibility(widget.id)}
                  disabled={isBalance}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isBalance
                      ? "text-emerald-500 cursor-default"
                      : "hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {widget.visible ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                </button>
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveUp(widget.order)}
                    disabled={widget.order === 0}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 disabled:opacity-30 disabled:cursor-default transition-colors"
                  >
                    <ChevronUp className="size-3" />
                  </button>
                  <button
                    onClick={() => moveDown(widget.order)}
                    disabled={widget.order === maxOrder}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 disabled:opacity-30 disabled:cursor-default transition-colors"
                  >
                    <ChevronDown className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToDefaults}
            className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Restablecer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// MAIN FINANCE OVERVIEW COMPONENT
// ============================================================

export function FinanceOverview() {
  const { data: session } = useSession();
  const { setFinanceSubView, isOnline } = useAppStore();

  // ── Local-first data fetching via useMultiQuery ──
  const { data: multiData, loading, syncing } = useMultiQuery({
    accounts: "/api/accounts",
    transactions: "/api/transactions",
    budgets: "/api/budgets",
    debts: "/api/debts",
    recurring: "/api/recurring",
    monthlySummary: "/api/dashboard/monthly-summary?months=12",
  });

  // Extract and cast data from useMultiQuery results
  const accounts = (multiData.accounts || []) as Account[];
  const txRaw = multiData.transactions as unknown as { transactions: Transaction[]; nextCursor: string | null } | undefined;
  const transactions = txRaw?.transactions ?? (Array.isArray(multiData.transactions) ? multiData.transactions as unknown as Transaction[] : []);
  const budgets = (multiData.budgets || []) as Budget[];
  const debts = (multiData.debts || []) as Debt[];
  const recurringPayments = (multiData.recurring || []) as RecurringPayment[];
  const monthlySummary = (multiData.monthlySummary as unknown as MonthlySummaryResponse | undefined) ?? null;

  const [evolutionRange, setEvolutionRange] = useState<"6M" | "12M">("6M");
  const [customizeOpen, setCustomizeOpen] = useState(false);

  // Widget configuration with localStorage persistence
  // Merges new default widgets into saved config so new features appear automatically
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig[]>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(WIDGET_STORAGE_KEY);
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as WidgetConfig[];
          // Merge: add any new widgets from DEFAULT_WIDGETS that aren't in saved config
          const savedIds = new Set(parsed.map((w) => w.id));
          const maxOrder = parsed.reduce((max, w) => Math.max(max, w.order), -1);
          const newWidgets = DEFAULT_WIDGETS
            .filter((dw) => !savedIds.has(dw.id))
            .map((dw, i) => ({ ...dw, order: maxOrder + 1 + i }));
          if (newWidgets.length > 0) {
            return [...parsed, ...newWidgets];
          }
          return parsed;
        } catch { /* fall through */ }
      }
    }
    return DEFAULT_WIDGETS;
  });

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(widgetConfig));
  }, [widgetConfig]);

  // Month selector state
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = getColombiaNow();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  // ============================================================
  // COMPUTED VALUES
  // ============================================================

  const totalAccountBalance = accounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalSubAccountBalance = accounts.reduce(
    (sum, a) => sum + (a.subAccounts || []).reduce((s, sa) => s + Number(sa.balance), 0),
    0
  );
  const totalBalance = totalAccountBalance + totalSubAccountBalance;

  const incomeBudgets = budgets.filter((b) => b.type === "income");
  const expenseBudgets = budgets.filter((b) => b.type === "expense");

  // ── Month-aware income/expenses from monthly-summary API ──
  // The monthly-summary API provides historical income/expenses per month.
  // Use this to show the correct values for the SELECTED month.
  // Defensive: Number() wrapping ensures valid numbers even with stale cache data
  const selectedMonthKey = `${selectedDate.year}-${String(selectedDate.month).padStart(2, "0")}`;
  const selectedMonthData = monthlySummary?.historical?.find((d) => d.month === selectedMonthKey);
  // Fallback to budget totals if monthly-summary doesn't have data for the selected month
  const monthlyIncome = selectedMonthData
    ? Number(selectedMonthData.income) || 0
    : incomeBudgets.reduce((sum, b) => sum + Number(b.spent), 0);
  const monthlyExpenses = selectedMonthData
    ? Number(selectedMonthData.expenses) || 0
    : expenseBudgets.reduce((sum, b) => sum + Number(b.spent), 0);

  // Month display name
  const selectedMonthName = FULL_MONTH_NAMES[String(selectedDate.month).padStart(2, "0")];
  const selectedMonthYear = `${selectedMonthName} ${selectedDate.year}`;

  // Navigation helpers
  const goToPrevMonth = () => {
    setSelectedDate((prev) => {
      const newMonth = prev.month === 1 ? 12 : prev.month - 1;
      const newYear = prev.month === 1 ? prev.year - 1 : prev.year;
      return { year: newYear, month: newMonth };
    });
  };

  const goToNextMonth = () => {
    const now = getColombiaNow();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    if (
      selectedDate.year === currentYear &&
      selectedDate.month === currentMonth
    ) {
      return;
    }
    setSelectedDate((prev) => {
      const newMonth = prev.month === 12 ? 1 : prev.month + 1;
      const newYear = prev.month === 12 ? prev.year + 1 : prev.year;
      return { year: newYear, month: newMonth };
    });
  };

  // Financial Evolution chart data
  // Defensive: Number() wrapping ensures values are valid numbers even if
  // the API returns strings or NaN from stale caches or edge cases
  const evolutionData = useMemo(() => {
    if (!monthlySummary?.historical) return [];
    const months = evolutionRange === "6M" ? 6 : 12;
    const data = monthlySummary.historical.slice(-months);
    return data.map((d) => ({
      ...d,
      income: Number(d.income) || 0,
      expenses: Number(d.expenses) || 0,
      balance: Number(d.balance) || 0,
      monthLabel: d.month,
    }));
  }, [monthlySummary, evolutionRange]);

  // Cash Flow Projection chart data
  const cashFlowData = useMemo(() => {
    if (!monthlySummary?.historical || !monthlySummary?.projection) return [];
    const historical = monthlySummary.historical.map((d) => ({
      month: d.month,
      historical: Number(d.balance) || 0,
      projected: null as number | null,
    }));
    const lastHistBalance = historical.length > 0 ? historical[historical.length - 1].historical : 0;
    const projected = monthlySummary.projection.map((d, i) => ({
      month: d.month,
      historical: i === 0 ? lastHistBalance : null,
      projected: Number(d.balance) || 0,
    }));
    return [...historical, ...projected];
  }, [monthlySummary]);

  // Expense breakdown (Tus Gastos)
  // Excludes "Deudas" category — loan payments are shown separately in the Waterfall
  // chart and Health Score. Including them here would double-count because CC purchases
  // already appear under their own categories (Alimentación, Transporte, etc.) and
  // loan payments are tracked as "Deudas" budget which is handled separately.
  const expenseByCategory = useMemo(() => {
    const categoryMap = new Map<string, { name: string; amount: number; color: string; emoji: string }>();
    for (const b of expenseBudgets) {
      // Skip "Deudas" — it's shown separately in Waterfall and Health Score
      if (b.category === "Deudas") continue;
      const existing = categoryMap.get(b.category);
      if (existing) {
        existing.amount += b.spent;
      } else {
        categoryMap.set(b.category, {
          name: b.category,
          amount: b.spent,
          color: CATEGORY_COLORS[b.category] || "#6B7280",
          emoji: CATEGORY_ICONS[b.category] || "📦",
        });
      }
    }
    const totalSpent = Array.from(categoryMap.values()).reduce((s, c) => s + c.amount, 0);
    return Array.from(categoryMap.values())
      .filter((cat) => cat.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .map((cat) => ({
        ...cat,
        percentage: totalSpent > 0 ? calcPercentage(cat.amount, totalSpent) : 0,
      }));
  }, [expenseBudgets]);

  const totalSpentOnCategories = expenseByCategory.reduce((s, c) => s + c.amount, 0);

  // Recent transactions with date grouping — filtered by selected month
  const groupedTransactions = useMemo(() => {
    // Filter transactions by the selected month
    const filtered = transactions.filter((tx) => {
      const dateStr = typeof tx.date === "string" ? tx.date.split("T")[0] : "";
      if (!dateStr) return false;
      const [year, month] = dateStr.split("-").map(Number);
      return year === selectedDate.year && month === selectedDate.month;
    });
    const recent = filtered.slice(0, 10);
    const groups: Record<string, Transaction[]> = {};
    for (const tx of recent) {
      const dateStr = typeof tx.date === "string" ? tx.date.split("T")[0] : "";
      const d = parseLocalDate(dateStr);
      const key = d.toLocaleDateString("es-CO", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
      if (!groups[key]) groups[key] = [];
      groups[key].push(tx);
    }
    return Object.entries(groups);
  }, [transactions, selectedDate]);

  // Upcoming recurring payments (next 7 days, Colombia timezone)
  const upcomingRecurring = useMemo(() => {
    const now = getColombiaNow();
    const in7Days = new Date(now);
    in7Days.setDate(in7Days.getDate() + 7);
    return recurringPayments
      .filter((r) => {
        if (r.status !== "pending") return false;
        const dateStr = typeof r.scheduledDate === "string" ? r.scheduledDate.split("T")[0] : "";
        const d = parseLocalDate(dateStr);
        return d >= now && d <= in7Days;
      })
      .sort((a, b) => {
        const da = parseLocalDate(typeof a.scheduledDate === "string" ? a.scheduledDate.split("T")[0] : "");
        const db = parseLocalDate(typeof b.scheduledDate === "string" ? b.scheduledDate.split("T")[0] : "");
        return da.getTime() - db.getTime();
      });
  }, [recurringPayments]);

  // Active debts with progress
  const activeDebts = debts.filter((d) => d.currentBalance > 0);

  // Budget progress data for circles — aggregated by category (not subcategory)
  const budgetProgress = useMemo(() => {
    // Group budgets by category, summing spent and amount
    const categoryMap = new Map<string, { spent: number; amount: number }>();
    for (const b of expenseBudgets) {
      if (b.amount <= 0) continue;
      const existing = categoryMap.get(b.category);
      if (existing) {
        existing.spent += b.spent;
        existing.amount += b.amount;
      } else {
        categoryMap.set(b.category, { spent: b.spent, amount: b.amount });
      }
    }

    return Array.from(categoryMap.entries())
      .map(([category, { spent, amount }]) => ({
        id: category,
        category,
        spent,
        amount,
        percentage: calcPercentage(spent, amount),
        color: CATEGORY_COLORS[category] || "#6B7280",
        emoji: CATEGORY_ICONS[category] || "📦",
        isOverBudget: spent > amount,
      }))
      .sort((a, b) => b.percentage - a.percentage);
  }, [expenseBudgets]);

  // ── Waterfall chart computed values ──
  // NOTE: "Deudas" is EXCLUDED from FIXED_CATEGORIES because CC purchases are already
  // counted in their own categories (Alimentación, Transporte, etc.) via budget installments.
  // Only LOAN payments create actual "Deudas" expense transactions, and those are
  // measured separately in the Health Score as monthlyDebtPayments.
  // Including "Deudas" here would double-count: once in the purchase category, once here.
  const FIXED_CATEGORIES = new Set(["Vivienda", "Servicios", "Suscripciones"]);

  const fixedExpenses = useMemo(() =>
    expenseBudgets
      .filter((b) => FIXED_CATEGORIES.has(b.category))
      .reduce((sum, b) => sum + Number(b.spent), 0),
    [expenseBudgets]
  );

  const variableExpenses = useMemo(() =>
    expenseBudgets
      .filter((b) => !FIXED_CATEGORIES.has(b.category) && b.category !== "Deudas")
      .reduce((sum, b) => sum + Number(b.spent), 0),
    [expenseBudgets]
  );

  // ── Monthly debt payments (loan payments only) ──
  // CC purchases are already counted in their own budget categories via installments.
  // Loan payments create "expense" transactions with category "Deudas".
  // We extract this separately so the Health Score can use livingExpenses (without loan payments)
  // for the Savings Ratio, and include them for the Runway Days calculation.
  const monthlyDebtPayments = useMemo(() =>
    expenseBudgets
      .filter((b) => b.category === "Deudas")
      .reduce((sum, b) => sum + Number(b.spent), 0),
    [expenseBudgets]
  );

  const waterfallInitialBalance = useMemo(() => {
    if (!monthlySummary?.historical || monthlySummary.historical.length < 2) return 0;
    // Find the previous month's ending balance
    const selectedIdx = monthlySummary.historical.findIndex(
      (d) => d.month === selectedMonthKey
    );
    if (selectedIdx > 0) {
      return Number(monthlySummary.historical[selectedIdx - 1].balance) || 0;
    }
    // If the selected month is the first in history or not found, use 0
    return 0;
  }, [monthlySummary, selectedMonthKey]);

  // Format month label for charts
  const formatMonthLabel = (monthStr: string) => {
    const [, mm] = monthStr.split("-");
    return MONTH_NAMES[mm] || monthStr;
  };

  // Visible widgets in order
  const visibleWidgets = widgetConfig
    .filter((w) => w.visible)
    .sort((a, b) => a.order - b.order);

  // ============================================================
  // LOADING STATE
  // ============================================================

  if (loading) {
    return (
      <div className="p-4 space-y-4 pb-safe">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-40 bg-gradient-to-br from-emerald-600/20 to-teal-500/20 rounded-2xl" />
          <div className="h-56 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-56 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-40 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <>
      <WidgetCustomizationDialog
        open={customizeOpen}
        onOpenChange={setCustomizeOpen}
        widgetConfig={widgetConfig}
        setWidgetConfig={setWidgetConfig}
      />

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="p-4 pb-safe"
      >
        {/* ============================================================ */}
        {/* HEADER WITH MONTH SELECTOR & SETTINGS */}
        {/* ============================================================ */}
        <motion.div variants={itemVariants} className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Resumen Financiero
            </h2>
            {!isOnline && (
              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                Sin conexión
              </span>
            )}
            {syncing && (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full animate-pulse">
                Sincronizando...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-1 py-1">
              <button
                onClick={goToPrevMonth}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <ChevronLeft className="size-4 text-gray-600 dark:text-gray-300" />
              </button>
              <div className="flex items-center gap-1.5 px-2">
                <Calendar className="size-3.5 text-emerald-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 min-w-[100px] text-center">
                  {selectedMonthYear}
                </span>
              </div>
              <button
                onClick={goToNextMonth}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30"
              >
                <ChevronRight className="size-4 text-gray-600 dark:text-gray-300" />
              </button>
            </div>
            <button
              onClick={() => setCustomizeOpen(true)}
              className="p-2 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <Settings2 className="size-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </motion.div>

        {/* ============================================================ */}
        {/* DYNAMIC WIDGETS */}
        {/* ============================================================ */}
        <div className="space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
        {visibleWidgets.map((w) => {
          switch (w.id) {
            // ============================================================
            // BALANCE CARD
            // ============================================================
            case "balance":
              return (
                <motion.div key="balance" variants={itemVariants} className="md:col-span-2">
                  <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white overflow-hidden relative">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
                    <CardContent className="p-5 relative z-10">
                      <div className="flex items-center gap-2 mb-1">
                        <Wallet className="size-4 text-emerald-200" />
                        <span className="text-sm text-emerald-100">Balance Total</span>
                      </div>
                      <p className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
                        {formatCurrency(totalBalance)}
                      </p>
                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-1.5">
                          <div className="size-6 rounded-full bg-white/20 flex items-center justify-center">
                            <ArrowUpRight className="size-3.5 text-emerald-200" />
                          </div>
                          <div>
                            <p className="text-[10px] text-emerald-200">Ingresos</p>
                            <p className="text-sm font-semibold">
                              {formatCurrency(monthlyIncome)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="size-6 rounded-full bg-white/20 flex items-center justify-center">
                            <ArrowDownRight className="size-3.5 text-rose-200" />
                          </div>
                          <div>
                            <p className="text-[10px] text-emerald-200">Gastos</p>
                            <p className="text-sm font-semibold">
                              {formatCurrency(monthlyExpenses)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );

            // ============================================================
            // HEALTH SCORE
            // ============================================================
            case "health-score":
              return (
                <motion.div key="health-score" variants={itemVariants}>
                  <HealthScoreWidget
                    monthlyIncome={monthlyIncome}
                    monthlyExpenses={monthlyExpenses}
                    monthlyDebtPayments={monthlyDebtPayments}
                    totalDebt={debts.reduce((sum, d) => sum + d.currentBalance, 0)}
                    totalBalance={totalBalance}
                  />
                </motion.div>
              );

            // ============================================================
            // WATERFALL CHART
            // ============================================================
            case "waterfall":
              return (
                <motion.div key="waterfall" variants={itemVariants}>
                  <Card className="border-0 shadow-md rounded-2xl">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <BarChart3 className="size-4 text-blue-500" />
                        Gráfico de Cascada
                      </CardTitle>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        Saldo inicial → Ingresos → Gastos → Deudas → Saldo final
                      </p>
                    </CardHeader>
                    <CardContent className="px-3 pb-4">
                      <WaterfallChart
                        initialBalance={waterfallInitialBalance}
                        income={monthlyIncome}
                        fixedExpenses={fixedExpenses}
                        variableExpenses={variableExpenses}
                        debtPayments={monthlyDebtPayments}
                      />
                    </CardContent>
                  </Card>
                </motion.div>
              );

            // ============================================================
            // FINANCIAL EVOLUTION CHART
            // ============================================================
            case "evolution":
              return (
                <motion.div key="evolution" variants={itemVariants} className="md:col-span-2">
                  <Card className="border-0 shadow-md rounded-2xl">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Activity className="size-4 text-emerald-500" />
                          Evolución Financiera
                        </CardTitle>
                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                          <button
                            onClick={() => setEvolutionRange("6M")}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                              evolutionRange === "6M"
                                ? "bg-emerald-500 text-white shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                            }`}
                          >
                            6M
                          </button>
                          <button
                            onClick={() => setEvolutionRange("12M")}
                            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                              evolutionRange === "12M"
                                ? "bg-emerald-500 text-white shadow-sm"
                                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                            }`}
                          >
                            12M
                          </button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="px-3 pb-4">
                      {evolutionData.length === 0 ? (
                        <div className="h-48 flex items-center justify-center">
                          <p className="text-sm text-gray-400">
                            Sin datos históricos aún
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={evolutionData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                  dataKey="month"
                                  tickFormatter={formatMonthLabel}
                                  tick={{ fontSize: 10, fill: "#9CA3AF" }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis
                                  tick={{ fontSize: 10, fill: "#9CA3AF" }}
                                  axisLine={false}
                                  tickLine={false}
                                  tickFormatter={(v: number) => {
                                    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                                    if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                                    return String(v);
                                  }}
                                />
                                <Tooltip content={<FinancialEvolutionTooltip />} />
                                <Line
                                  type="monotone"
                                  dataKey="income"
                                  stroke="#10B981"
                                  strokeWidth={2.5}
                                  dot={{ r: 3, fill: "#10B981", strokeWidth: 0 }}
                                  activeDot={{ r: 5, fill: "#10B981", strokeWidth: 2, stroke: "#fff" }}
                                  name="Ingresos"
                                />
                                <Line
                                  type="monotone"
                                  dataKey="expenses"
                                  stroke="#EF4444"
                                  strokeWidth={2.5}
                                  dot={{ r: 3, fill: "#EF4444", strokeWidth: 0 }}
                                  activeDot={{ r: 5, fill: "#EF4444", strokeWidth: 2, stroke: "#fff" }}
                                  name="Gastos"
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          {/* Legend */}
                          <div className="flex items-center justify-center gap-4 mt-2">
                            <div className="flex items-center gap-1.5">
                              <div className="size-2.5 rounded-full bg-emerald-500" />
                              <span className="text-[10px] text-gray-500">Ingresos</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="size-2.5 rounded-full bg-red-500" />
                              <span className="text-[10px] text-gray-500">Gastos</span>
                            </div>
                          </div>
                          {/* Current month summary pill */}
                          {monthlySummary?.historical && monthlySummary.historical.length > 0 && (
                            <div className="mt-3 bg-gray-50 dark:bg-gray-800/60 rounded-xl px-3 py-2 flex items-center justify-between">
                              <span className="text-xs text-gray-500 dark:text-gray-400">
                                {selectedMonthName} {selectedDate.year}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  +{formatCurrency(monthlySummary.averages.monthlyIncome)}
                                </span>
                                <span className="text-xs font-medium text-red-500 dark:text-red-400">
                                  -{formatCurrency(monthlySummary.averages.monthlyExpenses)}
                                </span>
                                <span className={`text-xs font-bold ${
                                  monthlySummary.averages.monthlySavings >= 0
                                    ? "text-emerald-600 dark:text-emerald-400"
                                    : "text-red-500 dark:text-red-400"
                                }`}>
                                  {monthlySummary.averages.monthlySavings >= 0 ? "+" : ""}
                                  {formatCurrency(monthlySummary.averages.monthlySavings)}
                                </span>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );

            // ============================================================
            // CASH FLOW PROJECTION
            // ============================================================
            case "cashflow":
              return (
                <motion.div key="cashflow" variants={itemVariants} className="md:col-span-2">
                  <Card className="border-0 shadow-md rounded-2xl">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <div>
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <TrendingUp className="size-4 text-blue-500" />
                          Proyección de Flujo de Caja
                        </CardTitle>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          12 meses histórico + 12 meses proyección
                        </p>
                      </div>
                    </CardHeader>
                    <CardContent className="px-3 pb-4">
                      {cashFlowData.length === 0 ? (
                        <div className="h-48 flex items-center justify-center">
                          <p className="text-sm text-gray-400">
                            Sin datos de flujo de caja aún
                          </p>
                        </div>
                      ) : (
                        <>
                          <div className="h-48">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={cashFlowData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                                <defs>
                                  <linearGradient id="histGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15} />
                                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                  </linearGradient>
                                  <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis
                                  dataKey="month"
                                  tickFormatter={formatMonthLabel}
                                  tick={{ fontSize: 10, fill: "#9CA3AF" }}
                                  axisLine={false}
                                  tickLine={false}
                                />
                                <YAxis
                                  tick={{ fontSize: 10, fill: "#9CA3AF" }}
                                  axisLine={false}
                                  tickLine={false}
                                  tickFormatter={(v: number) => {
                                    if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                                    if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                                    return String(v);
                                  }}
                                />
                                <Tooltip content={<CashFlowTooltip />} />
                                <Area
                                  type="monotone"
                                  dataKey="historical"
                                  stroke="#3B82F6"
                                  strokeWidth={2.5}
                                  fill="url(#histGrad)"
                                  dot={false}
                                  activeDot={{ r: 4, fill: "#3B82F6", strokeWidth: 2, stroke: "#fff" }}
                                  name="Histórico"
                                  connectNulls={false}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="projected"
                                  stroke="#8B5CF6"
                                  strokeWidth={2}
                                  strokeDasharray="6 4"
                                  fill="url(#projGrad)"
                                  dot={false}
                                  activeDot={{ r: 4, fill: "#8B5CF6", strokeWidth: 2, stroke: "#fff" }}
                                  name="Proyectado"
                                  connectNulls={false}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                          {/* Legend */}
                          <div className="flex items-center justify-center gap-4 mt-2">
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 bg-blue-500 rounded" />
                              <span className="text-[10px] text-gray-500">Histórico</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <div className="w-4 h-0.5 border-t-2 border-dashed border-purple-500" />
                              <span className="text-[10px] text-gray-500">Proyectado</span>
                            </div>
                          </div>
                        </>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );

            // ============================================================
            // EXPENSE BREAKDOWN - TUS GASTOS
            // ============================================================
            case "expenses":
              return expenseByCategory.length > 0 ? (
                <motion.div key="expenses" variants={itemVariants}>
                  <Card className="border-0 shadow-md rounded-2xl">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <BarChart3 className="size-4 text-amber-500" />
                          Tus Gastos
                        </CardTitle>
                        <Badge
                          variant="secondary"
                          className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-[10px] px-2"
                        >
                          {formatCurrency(totalSpentOnCategories)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                      {/* Horizontal stacked bar */}
                      <div className="flex h-5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800 mb-3">
                        {expenseByCategory.map((cat, i) => (
                          <motion.div
                            key={`bar-${cat.name}-${i}`}
                            className="h-full first:rounded-l-full last:rounded-r-full"
                            style={{
                              width: `${cat.percentage}%`,
                              backgroundColor: cat.color,
                              minWidth: cat.percentage > 0 ? "4px" : "0",
                            }}
                            initial={{ width: 0 }}
                            animate={{ width: `${cat.percentage}%` }}
                            transition={{ delay: 0.08 * i, duration: 0.6, ease: "easeOut" }}
                          />
                        ))}
                      </div>
                      {/* Category pills */}
                      <div className="flex flex-wrap gap-1.5">
                        {expenseByCategory.map((cat, i) => (
                          <div
                            key={`pill-${cat.name}-${i}`}
                            className="flex items-center gap-1 bg-gray-50 dark:bg-gray-800/60 rounded-full px-2 py-1"
                          >
                            <span className="text-[10px]">{cat.emoji}</span>
                            <span className="text-[10px] text-gray-600 dark:text-gray-300 whitespace-nowrap">
                              {cat.name}
                            </span>
                            <span
                              className="text-[10px] font-semibold"
                              style={{ color: cat.color }}
                            >
                              {cat.percentage}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : null;

            // ============================================================
            // EXPENSE HEATMAP
            // ============================================================
            case "heatmap":
              return (
                <motion.div key="heatmap" variants={itemVariants}>
                  <ExpenseHeatmap
                    transactions={transactions}
                    year={selectedDate.year}
                    month={selectedDate.month}
                  />
                </motion.div>
              );

            // ============================================================
            // BUDGET PROGRESS CIRCLES
            // ============================================================
            case "budgets":
              return budgetProgress.length > 0 ? (
                <motion.div key="budgets" variants={itemVariants}>
                  <Card className="border-0 shadow-md rounded-2xl">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <PiggyBank className="size-4 text-purple-500" />
                        Progreso de Presupuestos
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-3 pb-4">
                      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
                        {budgetProgress.map((budget) => (
                          <motion.div
                            key={budget.id}
                            className="flex flex-col items-center min-w-[90px] bg-gray-50 dark:bg-gray-800/60 rounded-2xl p-3"
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.97 }}
                          >
                            <CircularProgress
                              percentage={budget.percentage}
                              size={56}
                              strokeWidth={5}
                              color={budget.isOverBudget ? "#EF4444" : budget.color}
                            >
                              <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200">
                                {budget.percentage > 999 ? "999+" : `${budget.percentage}%`}
                              </span>
                            </CircularProgress>
                            <span className="text-[10px] mt-1.5">{budget.emoji}</span>
                            <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300 text-center leading-tight mt-0.5">
                              {budget.category}
                            </span>
                            <span className="text-[9px] text-gray-400 mt-0.5 text-center">
                              {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : null;

            // ============================================================
            // RECENT TRANSACTIONS
            // ============================================================
            case "transactions":
              return (
                <motion.div key="transactions" variants={itemVariants} className="md:col-span-2">
                  <Card className="border-0 shadow-md rounded-2xl">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-semibold flex items-center gap-2">
                          <Receipt className="size-4 text-emerald-500" />
                          Transacciones Recientes
                        </CardTitle>
                        <button
                          onClick={() => setFinanceSubView("accounts")}
                          className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-0.5"
                        >
                          Ver todo <ChevronRight className="size-3" />
                        </button>
                      </div>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                      {groupedTransactions.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">
                          Sin transacciones aún
                        </p>
                      ) : (
                        <div className="space-y-4">
                          {groupedTransactions.map(([dateHeader, txs]) => (
                            <div key={dateHeader}>
                              <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                                {dateHeader}
                              </p>
                              <div className="space-y-2.5">
                                {txs.map((tx) => (
                                  <div
                                    key={tx.id}
                                    className="flex items-center justify-between"
                                  >
                                    <div className="flex items-center gap-3">
                                      <div
                                        className={`size-9 rounded-xl flex items-center justify-center ${
                                          tx.type === "income"
                                            ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600"
                                            : "bg-rose-50 dark:bg-rose-900/20 text-rose-600"
                                        }`}
                                      >
                                        {tx.type === "income" ? (
                                          <ArrowUpRight className="size-4" />
                                        ) : (
                                          <ArrowDownRight className="size-4" />
                                        )}
                                      </div>
                                      <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                          {tx.description}
                                        </p>
                                        <p className="text-[10px] text-gray-400 dark:text-gray-500 flex items-center gap-1 flex-wrap">
                                          <span>
                                            {tx.category
                                              ? `${CATEGORY_ICONS[tx.category] || "📦"} ${tx.category}`
                                              : "Sin categoría"}
                                          </span>
                                          {tx.account && (
                                            <span className="inline-flex items-center gap-0.5 bg-gray-100 dark:bg-gray-700/50 rounded px-1 py-px">
                                              <span
                                                className="size-1.5 rounded-full inline-block"
                                                style={{ backgroundColor: tx.account.color }}
                                              />
                                              <span className="text-[9px] text-gray-500 dark:text-gray-400">
                                                {tx.account.name}
                                              </span>
                                            </span>
                                          )}
                                          {tx.subAccount && (
                                            <span className="inline-flex items-center gap-0.5 bg-violet-50 dark:bg-violet-900/20 rounded px-1 py-px">
                                              <span
                                                className="size-1.5 rounded-full inline-block"
                                                style={{ backgroundColor: tx.subAccount.color || "#8B5CF6" }}
                                              />
                                              <span className="text-[9px] text-violet-500 dark:text-violet-400">
                                                {tx.subAccount.name}
                                              </span>
                                            </span>
                                          )}
                                          {tx.user && tx.user.name && tx.userId && tx.userId !== session?.user?.id && (
                                            <span className="inline-flex items-center gap-0.5 bg-emerald-50 dark:bg-emerald-900/20 rounded px-1 py-px">
                                              <UserIcon className="size-2" />
                                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">
                                                {tx.user.name}
                                              </span>
                                            </span>
                                          )}
                                        </p>
                                      </div>
                                    </div>
                                    <span
                                      className={`text-sm font-semibold whitespace-nowrap ml-2 ${
                                        tx.type === "income"
                                          ? "text-emerald-600 dark:text-emerald-400"
                                          : "text-gray-900 dark:text-gray-100"
                                      }`}
                                    >
                                      {tx.type === "income" ? "+" : "-"}
                                      {formatCurrency(Math.abs(tx.amount))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );

            // ============================================================
            // UPCOMING BILLS
            // ============================================================
            case "bills":
              return (upcomingRecurring.length > 0 || activeDebts.length > 0) ? (
                <motion.div key="bills" variants={itemVariants} className="md:col-span-2">
                  <Card className="border-0 shadow-md rounded-2xl">
                    <CardHeader className="pb-2 pt-4 px-5">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <Calendar className="size-4 text-rose-500" />
                        Próximos Pagos
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-4 space-y-4">
                      {/* Sub-section 1: Próximos Pagos Recurrentes */}
                      {upcomingRecurring.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                            Pagos Recurrentes Próximos
                          </p>
                          <div className="space-y-2">
                            {upcomingRecurring.map((rec) => {
                              const dateStr = typeof rec.scheduledDate === "string" ? rec.scheduledDate.split("T")[0] : "";
                              const d = parseLocalDate(dateStr);
                              const isExpense = rec.type === "expense";
                              return (
                                <div
                                  key={rec.id}
                                  className="flex items-center justify-between p-3 bg-amber-50/60 dark:bg-amber-900/10 rounded-xl cursor-pointer"
                                  onClick={() => setFinanceSubView("recurring")}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`size-9 rounded-xl flex items-center justify-center ${
                                      isExpense
                                        ? "bg-gradient-to-br from-amber-400 to-orange-400"
                                        : "bg-gradient-to-br from-emerald-400 to-teal-400"
                                    }`}>
                                      <Calendar className="size-4 text-white" />
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {rec.description}
                                      </p>
                                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                        {d.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                                        {rec.category && ` · ${rec.category}`}
                                      </p>
                                    </div>
                                  </div>
                                  <span className={`text-sm font-semibold ${
                                    isExpense ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                                  }`}>
                                    {isExpense ? "-" : "+"}{formatCurrency(rec.amount)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Sub-section 2: Progreso de Deudas */}
                      {activeDebts.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                            Progreso de Deudas
                          </p>
                          <div className="space-y-2.5">
                            {activeDebts.map((debt) => {
                              const original = (debt as Debt & { originalAmount?: number | null }).originalAmount || debt.currentBalance * 1.5;
                              const paid = original - debt.currentBalance;
                              const progressPct = original > 0 ? calcPercentage(paid, original) : 0;
                              return (
                                <div
                                  key={debt.id}
                                  className="p-3 bg-rose-50/40 dark:bg-rose-900/10 rounded-xl cursor-pointer"
                                  onClick={() => setFinanceSubView("debts")}
                                >
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="flex items-center gap-2">
                                      <div
                                        className="size-7 rounded-lg flex items-center justify-center"
                                        style={{ backgroundColor: (debt as Debt & { color?: string }).color || "#F43F5E" + "20" }}
                                      >
                                        <CreditCard className="size-3.5" style={{ color: (debt as Debt & { color?: string }).color || "#F43F5E" }} />
                                      </div>
                                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {debt.name}
                                      </span>
                                    </div>
                                    <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                                      {formatCurrency(debt.currentBalance)}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-rose-400 rounded-full transition-all"
                                        style={{ width: `${Math.min(progressPct, 100)}%` }}
                                      />
                                    </div>
                                    <span className="text-[10px] text-gray-400 font-medium">
                                      {progressPct}%
                                    </span>
                                  </div>
                                  {debt.monthlyPayment && (
                                    <p className="text-[10px] text-gray-400 mt-1">
                                      Cuota: {formatCurrency(debt.monthlyPayment)}
                                      {debt.paymentDate ? ` · Día ${debt.paymentDate}` : ""}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Empty state */}
                      {upcomingRecurring.length === 0 && activeDebts.length === 0 && (
                        <p className="text-sm text-gray-400 text-center py-4">
                          Sin pagos próximos
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ) : null;

            default:
              return null;
          }
        })}
        </div>
      </motion.div>
    </>
  );
}
