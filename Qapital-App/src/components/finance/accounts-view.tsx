"use client";

import { useState, useEffect, useCallback, useRef, ReactNode, useMemo } from "react";
import { apiFetch, formatCurrency, calcPercentage, getColombiaNow, parseLocalDate } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { AccountForm } from "./account-form";
import { TransactionForm } from "./transaction-form";
import { YieldManager } from "./yield-manager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import {
  Plus,
  Wallet,
  TrendingUp,
  TrendingDown,
  Banknote,
  Smartphone,
  CircleDollarSign,
  CreditCard,
  Receipt,
  PiggyBank,
  Clock,
  Landmark,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Activity,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Settings2,
  Eye,
  EyeOff,
  ChevronUp,
  ChevronDown,
  GripVertical,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  TouchSensor,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

// ============================================
// INTERFACES
// ============================================

interface SubAccount {
  id: string;
  name: string;
  balance: number;
  isHighYield: boolean;
  yieldPercentage?: number | null;
  color?: string | null;
  excludeFromAvailable?: boolean;
}

interface Account {
  id: string;
  name: string;
  type: string;
  color: string;
  icon?: string | null;
  balance: number;
  isHighYield: boolean;
  yieldPercentage?: number | null;
  isShared: boolean;
  excludeFromAvailable?: boolean;
  subAccounts: SubAccount[];
  sharedUsers: Array<{
    id: string;
    user: { name: string; email: string };
  }>;
}

interface Budget {
  id: string;
  type: string;
  category: string;
  amount: number;
  spent: number;
}

interface Debt {
  id: string;
  name: string;
  currentBalance: number;
  color: string;
}

interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  icon?: string | null;
  color: string;
}

interface RecurringPayment {
  id: string;
  description: string;
  amount: number;
  status: string;
  scheduledDate: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  description: string;
  category?: string | null;
  date: string;
  account?: { id: string; name: string; color: string } | null;
}

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
  balance: number;
}

interface MonthlySummaryResponse {
  historical: MonthlyData[];
  projection: MonthlyData[];
  averages: {
    monthlyIncome: number;
    monthlyExpenses: number;
    monthlySavings: number;
  };
}

// Widget configuration types
export type WidgetId = "balance" | "quickActions" | "evolution" | "expenses" | "accounts" | "transactions" | "yields";

interface WidgetConfig {
  id: WidgetId;
  label: string;
  icon: typeof Wallet;
  visible: boolean;
  order: number;
}

const DEFAULT_WIDGET_ORDER: WidgetConfig[] = [
  { id: "balance", label: "Disponible", icon: Wallet, visible: true, order: 0 },
  { id: "quickActions", label: "Acciones Rápidas", icon: Plus, visible: true, order: 1 },
  { id: "evolution", label: "Evolución Financiera", icon: Activity, visible: true, order: 2 },
  { id: "expenses", label: "Tus Gastos", icon: BarChart3, visible: true, order: 3 },
  { id: "accounts", label: "Mis Cuentas", icon: Landmark, visible: true, order: 4 },
  { id: "transactions", label: "Transacciones", icon: Receipt, visible: true, order: 5 },
  { id: "yields", label: "Rendimientos", icon: TrendingUp, visible: true, order: 6 },
];

// ============================================
// CONSTANTS
// ============================================

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
  "01": "Ene", "02": "Feb", "03": "Mar", "04": "Abr",
  "05": "May", "06": "Jun", "07": "Jul", "08": "Ago",
  "09": "Sep", "10": "Oct", "11": "Nov", "12": "Dic",
};

const FULL_MONTH_NAMES: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};

const typeIcons: Record<string, typeof Wallet> = {
  checking: Banknote,
  savings: Wallet,
  cash: CircleDollarSign,
  digital_wallet: Smartphone,
  credit_card: CreditCard,
  other: Wallet,
};

const typeLabels: Record<string, string> = {
  checking: "Cuenta Corriente",
  savings: "Ahorros",
  cash: "Efectivo",
  digital_wallet: "Billetera Digital",
  credit_card: "Tarjeta de Crédito",
  other: "Otra",
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

// ============================================
// LOCAL STORAGE HELPERS
// ============================================

const WIDGET_STORAGE_KEY = "qapital-accounts-widgets";

function loadWidgetConfig(): WidgetConfig[] {
  if (typeof window === "undefined") return DEFAULT_WIDGET_ORDER;
  try {
    const saved = localStorage.getItem(WIDGET_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as WidgetConfig[];
      const savedIds = new Set(parsed.map((w) => w.id));
      const merged = [...parsed];
      for (const def of DEFAULT_WIDGET_ORDER) {
        if (!savedIds.has(def.id)) {
          merged.push({ ...def, order: merged.length });
        }
      }
      return merged.sort((a, b) => a.order - b.order);
    }
  } catch {
    // ignore
  }
  return DEFAULT_WIDGET_ORDER;
}

function saveWidgetConfig(widgets: WidgetConfig[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(WIDGET_STORAGE_KEY, JSON.stringify(widgets));
  } catch {
    // ignore
  }
}

function loadAccountOrder(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const saved = localStorage.getItem("qapital-account-order");
    if (saved) return JSON.parse(saved) as string[];
  } catch {
    // ignore
  }
  return [];
}

function saveAccountOrder(order: string[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem("qapital-account-order", JSON.stringify(order));
  } catch {
    // ignore
  }
}

function sortAccountsByOrder(accounts: Account[], order: string[]): Account[] {
  if (!order.length) return accounts;
  const ordered = order
    .map((id) => accounts.find((a) => a.id === id))
    .filter(Boolean) as Account[];
  const remaining = accounts.filter((a) => !order.includes(a.id));
  return [...ordered, ...remaining];
}

// ============================================
// CUSTOM TOOLTIP
// ============================================

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

// ============================================
// WIDGET CUSTOMIZATION DIALOG
// ============================================

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
  const toggleVisibility = (id: WidgetId) => {
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
    setWidgetConfig(DEFAULT_WIDGET_ORDER.map((w) => ({ ...w })));
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
            const WidgetIcon = widget.icon;
            return (
              <div
                key={widget.id}
                className={`flex items-center gap-2 p-2.5 rounded-xl transition-colors ${
                  widget.visible
                    ? "bg-gray-50 dark:bg-gray-800/60"
                    : "bg-gray-50/50 dark:bg-gray-800/30 opacity-60"
                }`}
              >
                <WidgetIcon className="size-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                <span className={`flex-1 text-sm font-medium ${
                  widget.visible
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-400 dark:text-gray-500"
                }`}>
                  {widget.label}
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

// ============================================
// SORTABLE WRAPPER COMPONENTS
// ============================================

function SortableWidgetItem({ id, children }: { id: WidgetId; children: ReactNode }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : "auto",
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="relative group">
        <div
          {...attributes}
          {...listeners}
          className="absolute -left-0.5 top-1/2 -translate-y-1/2 z-20 cursor-grab active:cursor-grabbing
            opacity-60 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 transition-opacity
            touch-none"
        >
          <div className="size-7 rounded-lg bg-white dark:bg-gray-800 shadow-md border border-gray-100 dark:border-gray-700 flex items-center justify-center active:bg-emerald-50 dark:active:bg-emerald-900/20 transition-colors">
            <GripVertical className="size-3.5 text-gray-400" />
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function SortableAccountCard({
  account,
  onNavigate,
}: {
  account: Account;
  onNavigate: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: account.id });

  const Icon = typeIcons[account.type] || Wallet;
  const typeLabel = typeLabels[account.type] || "Cuenta";
  const isNegative = account.balance < 0;
  const hasSubAccounts = account.subAccounts.length > 0;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style} className="shrink-0 snap-start">
      <button
        onClick={() => onNavigate(account.id)}
        className="block text-left"
      >
        <div
          className="w-[140px] rounded-2xl p-3 shadow-md relative overflow-hidden"
          style={{
            background: `linear-gradient(145deg, ${account.color}, ${account.color}cc)`,
            ...(isDragging ? { boxShadow: "0 12px 28px rgba(0,0,0,0.25)" } : {}),
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.08),transparent_50%)] pointer-events-none" />

          <div
            {...attributes}
            {...listeners}
            className="absolute top-1 right-1 z-30 cursor-grab active:cursor-grabbing touch-none"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="size-5 rounded-md bg-white/25 backdrop-blur-sm flex items-center justify-center
              opacity-70 active:opacity-100 transition-opacity
              shadow-sm border border-white/20">
              <GripVertical className="size-3 text-white" />
            </div>
          </div>

          <div className="relative z-10">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="size-6 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                <Icon className="size-3 text-white" />
              </div>
              <p className="text-[11px] font-medium text-white/90 truncate leading-tight">
                {account.name}
              </p>
            </div>
            <p className="text-[9px] text-white/50 mb-1.5 leading-tight">
              {typeLabel}
            </p>
            <p className="text-[15px] font-bold text-white tracking-tight leading-tight">
              {isNegative ? "-" : ""}{formatCurrency(Math.abs(account.balance))}
            </p>
            {hasSubAccounts && (
              <div className="flex items-center gap-1 mt-1">
                <div className="flex -space-x-0.5">
                  {account.subAccounts.slice(0, 3).map((sub, i) => (
                    <div
                      key={sub.id}
                      className="size-2.5 rounded-full border border-white/30"
                      style={{ backgroundColor: sub.color || "#fff", zIndex: 3 - i }}
                    />
                  ))}
                </div>
                <span className="text-[8px] text-white/50">
                  {account.subAccounts.length} bolsillo{account.subAccounts.length > 1 ? "s" : ""}
                </span>
              </div>
            )}
            <div className="flex items-center gap-1 mt-1.5">
              <div className={`size-1.5 rounded-full ${isNegative ? "bg-rose-300" : "bg-emerald-300"}`} />
              <span className="text-[8px] text-white/40">
                {isNegative ? "Negativo" : "Positivo"}
              </span>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

function SortableSheetItem({
  widget,
  index,
  onToggle,
}: {
  widget: WidgetConfig;
  index: number;
  onToggle: (id: WidgetId) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: widget.id });

  const WidgetIcon = widget.icon;

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : "auto",
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
          isDragging
            ? "bg-emerald-50 dark:bg-emerald-900/20 shadow-lg border-2 border-emerald-300 dark:border-emerald-600"
            : widget.visible
              ? "bg-gray-50 dark:bg-gray-800/50"
              : "bg-gray-50/50 dark:bg-gray-800/20 opacity-60"
        }`}
      >
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing shrink-0 touch-none"
        >
          <div className="size-8 rounded-lg bg-white dark:bg-gray-700 shadow-sm border border-gray-200 dark:border-gray-600 flex items-center justify-center active:bg-emerald-50 dark:active:bg-emerald-900/20 transition-colors">
            <GripVertical className="size-4 text-gray-400" />
          </div>
        </div>

        <div
          className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
            widget.visible
              ? "bg-emerald-100 dark:bg-emerald-900/30"
              : "bg-gray-100 dark:bg-gray-800"
          }`}
        >
          <WidgetIcon
            className={`size-4 ${
              widget.visible
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-gray-400"
            }`}
          />
        </div>

        <span
          className={`flex-1 text-sm font-medium ${
            widget.visible
              ? "text-gray-900 dark:text-white"
              : "text-gray-400 dark:text-gray-500"
          }`}
        >
          {widget.label}
        </span>

        <span className="text-[10px] text-gray-400 font-mono shrink-0">
          #{index + 1}
        </span>

        <Switch
          checked={widget.visible}
          onCheckedChange={() => onToggle(widget.id)}
          disabled={widget.id === "balance"}
        />
      </div>
    </div>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export function AccountsView() {
  const { setFinanceSubView } = useAppStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [recurringPending, setRecurringPending] = useState<RecurringPayment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [widgetConfig, setWidgetConfig] = useState<WidgetConfig[]>(DEFAULT_WIDGET_ORDER);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [tempConfig, setTempConfig] = useState<WidgetConfig[]>([]);
  const [accountOrder, setAccountOrder] = useState<string[]>([]);
  const [evolutionRange, setEvolutionRange] = useState<"6M" | "12M">("6M");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Drag overlay state
  const [activeWidgetId, setActiveWidgetId] = useState<WidgetId | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);

  // Month selector state
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = getColombiaNow();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  });

  const fetchAll = useCallback(async () => {
    try {
      const [accs, budgs, dbts, savs, recs, txs, summary] = await Promise.allSettled([
        apiFetch<Account[]>("/api/accounts"),
        apiFetch<Budget[]>("/api/budgets"),
        apiFetch<Debt[]>("/api/debts"),
        apiFetch<SavingsGoal[]>("/api/savings"),
        apiFetch<RecurringPayment[]>("/api/recurring"),
        apiFetch<Transaction[]>("/api/transactions"),
        apiFetch<MonthlySummaryResponse>("/api/dashboard/monthly-summary?months=12"),
      ]);

      if (accs.status === "fulfilled") setAccounts(accs.value);
      if (budgs.status === "fulfilled") setBudgets(budgs.value);
      if (dbts.status === "fulfilled") setDebts(dbts.value);
      if (savs.status === "fulfilled") setSavingsGoals(savs.value);
      if (recs.status === "fulfilled")
        setRecurringPending(recs.value.filter((r) => r.status === "pending"));
      if (txs.status === "fulfilled") setTransactions(txs.value);
      if (summary.status === "fulfilled") setMonthlySummary(summary.value);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    setWidgetConfig(loadWidgetConfig());
    setAccountOrder(loadAccountOrder());
  }, []);

  // Save widget config on change
  useEffect(() => {
    saveWidgetConfig(widgetConfig);
  }, [widgetConfig]);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalSubAccountBalance = accounts.reduce(
    (sum, a) => sum + a.subAccounts.reduce((s, sa) => s + sa.balance, 0),
    0
  );
  const grandTotal = totalBalance + totalSubAccountBalance;

  const availableBalance = accounts.reduce((sum, a) => {
    const accountPortion = a.excludeFromAvailable ? 0 : a.balance;
    const subAccountPortion = a.subAccounts.reduce(
      (s, sa) => (sa.excludeFromAvailable ? s : s + sa.balance),
      0
    );
    return sum + accountPortion + subAccountPortion;
  }, 0);

  const excludedBalance = grandTotal - availableBalance;

  const highYieldAccounts = accounts.filter((a) => a.isHighYield);

  const incomeBudgets = budgets.filter((b) => b.type === "income");
  const expenseBudgets = budgets.filter((b) => b.type === "expense");
  const monthlyIncome = incomeBudgets.reduce((sum, b) => sum + b.spent, 0);
  const monthlyExpenses = expenseBudgets.reduce((sum, b) => sum + b.spent, 0);

  // Evolution chart data
  const evolutionData = useMemo(() => {
    if (!monthlySummary?.historical) return [];
    const months = evolutionRange === "6M" ? 6 : 12;
    const data = monthlySummary.historical.slice(-months);
    return data.map((d) => ({
      ...d,
      monthLabel: d.month,
    }));
  }, [monthlySummary, evolutionRange]);

  // Expense breakdown (Tus Gastos)
  const expenseByCategory = useMemo(() => {
    const categoryMap = new Map<string, { name: string; amount: number; color: string; emoji: string }>();
    for (const b of expenseBudgets) {
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

  // Recent transactions with date grouping (last 10)
  const groupedTransactions = useMemo(() => {
    const recent = transactions.slice(0, 10);
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
  }, [transactions]);

  // Month display
  const selectedMonthName = FULL_MONTH_NAMES[String(selectedDate.month).padStart(2, "0")];
  const selectedMonthYear = `${selectedMonthName} ${selectedDate.year}`;

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
    if (selectedDate.year === currentYear && selectedDate.month === currentMonth) return;
    setSelectedDate((prev) => {
      const newMonth = prev.month === 12 ? 1 : prev.month + 1;
      const newYear = prev.month === 12 ? prev.year + 1 : prev.year;
      return { year: newYear, month: newMonth };
    });
  };

  // Format month label for charts
  const formatMonthLabel = (monthStr: string) => {
    const [, mm] = monthStr.split("-");
    return MONTH_NAMES[mm] || monthStr;
  };

  const handleAccountClick = (accountId: string) => {
    sessionStorage.setItem("selectedAccountId", accountId);
    setFinanceSubView("account-detail");
  };

  const scrollCarousel = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 160;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  const sortedAccounts = sortAccountsByOrder(accounts, accountOrder);

  const persistAccountOrder = async (newOrder: string[]) => {
    saveAccountOrder(newOrder);
    for (let i = 0; i < newOrder.length; i++) {
      try {
        await apiFetch(`/api/accounts/${newOrder[i]}`, {
          method: "PUT",
          body: JSON.stringify({ order: i }),
        });
      } catch {
        // Silently fail
      }
    }
  };

  // ============================================
  // WIDGET CUSTOMIZATION
  // ============================================

  const openCustomize = () => {
    setTempConfig(widgetConfig.map((w) => ({ ...w })));
    setCustomizeOpen(true);
  };

  const handleToggleWidget = (id: WidgetId) => {
    setTempConfig((prev) =>
      prev.map((w) => (w.id === id ? { ...w, visible: !w.visible } : w))
    );
  };

  const saveCustomization = () => {
    const newConfig = tempConfig.map((w, i) => ({ ...w, order: i }));
    setWidgetConfig(newConfig);
    setCustomizeOpen(false);
  };

  const resetCustomization = () => {
    setTempConfig(DEFAULT_WIDGET_ORDER.map((w) => ({ ...w })));
  };

  // ============================================
  // DND SENSORS
  // ============================================

  const handleSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // ============================================
  // WIDGET DRAG HANDLERS
  // ============================================

  const handleWidgetDragStart = (event: DragStartEvent) => {
    setActiveWidgetId(event.active.id as WidgetId);
  };

  const handleWidgetDragEnd = (event: DragEndEvent) => {
    setActiveWidgetId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const visibleWidgets = widgetConfig
      .sort((a, b) => a.order - b.order)
      .filter((w) => w.visible);
    const oldIndex = visibleWidgets.findIndex((w) => w.id === active.id);
    const newIndex = visibleWidgets.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(visibleWidgets, oldIndex, newIndex);
    const newConfig = reordered.map((w, i) => ({ ...w, order: i }));
    const hiddenWidgets = widgetConfig.filter((w) => !w.visible);
    const merged = [
      ...newConfig,
      ...hiddenWidgets.map((w, i) => ({ ...w, order: newConfig.length + i })),
    ];
    setWidgetConfig(merged);
  };

  // ============================================
  // ACCOUNT DRAG HANDLERS
  // ============================================

  const handleAccountDragStart = (event: DragStartEvent) => {
    setActiveAccountId(event.active.id as string);
  };

  const handleAccountDragEnd = (event: DragEndEvent) => {
    setActiveAccountId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sortedAccounts.findIndex((a) => a.id === active.id);
    const newIndex = sortedAccounts.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortedAccounts, oldIndex, newIndex);
    const newOrder = reordered.map((a) => a.id);
    setAccountOrder(newOrder);
    setAccounts(reordered);
    persistAccountOrder(newOrder);
  };

  // ============================================
  // SHEET DRAG HANDLERS
  // ============================================

  const handleSheetDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sorted = [...tempConfig].sort((a, b) => a.order - b.order);
    const oldIndex = sorted.findIndex((w) => w.id === active.id);
    const newIndex = sorted.findIndex((w) => w.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sorted, oldIndex, newIndex);
    setTempConfig(reordered.map((w, i) => ({ ...w, order: i })));
  };

  // ============================================
  // WIDGET RENDER FUNCTIONS
  // ============================================

  const renderWidgetContent = (id: WidgetId) => {
    switch (id) {
      case "balance":
        return (
          <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
            <CardContent className="p-5 relative z-10">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="size-4 text-emerald-200" />
                <span className="text-sm text-emerald-100">
                  Disponible para Gastar
                </span>
              </div>
              <p className="text-3xl font-bold tracking-tight">
                {formatCurrency(availableBalance)}
              </p>
              <div className="mt-3 flex items-center gap-4">
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
              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="size-3 text-emerald-300/60" />
                  <span className="text-[10px] text-emerald-200/60">
                    Balance Total
                  </span>
                </div>
                <span className="text-xs font-medium text-emerald-100/70">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
              {excludedBalance > 0 && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] text-emerald-200/50">
                    Excluidos
                  </span>
                  <span className="text-[10px] text-emerald-200/50">
                    {formatCurrency(excludedBalance)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        );

      case "quickActions":
        return (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1 h-11 rounded-xl border-dashed border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/10"
              onClick={() => setShowTransactionForm(true)}
            >
              <TrendingUp className="size-4 mr-1" />
              Ingreso
            </Button>
            <Button
              variant="outline"
              className="flex-1 h-11 rounded-xl border-dashed border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/10"
              onClick={() => setShowTransactionForm(true)}
            >
              <TrendingDown className="size-4 mr-1" />
              Gasto
            </Button>
          </div>
        );

      case "evolution":
        return (
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
                </>
              )}
            </CardContent>
          </Card>
        );

      case "expenses":
        return expenseByCategory.length > 0 ? (
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
        ) : null;

      case "accounts":
        return accounts.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Mis Cuentas
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => scrollCarousel("left")}
                  className="size-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <ChevronLeft className="size-3.5 text-gray-500" />
                </button>
                <button
                  onClick={() => scrollCarousel("right")}
                  className="size-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  <ChevronRight className="size-3.5 text-gray-500" />
                </button>
              </div>
            </div>

            <DndContext
              sensors={handleSensors}
              collisionDetection={closestCenter}
              onDragStart={handleAccountDragStart}
              onDragEnd={handleAccountDragEnd}
            >
              <SortableContext
                items={sortedAccounts.map((a) => a.id)}
                strategy={horizontalListSortingStrategy}
              >
                <div
                  ref={scrollRef}
                  data-carousel
                  className="flex gap-2.5 overflow-x-auto pb-2 snap-x snap-mandatory"
                  style={{
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                    WebkitOverflowScrolling: "touch",
                  }}
                >
                  {sortedAccounts.map((account) => (
                    <SortableAccountCard
                      key={account.id}
                      account={account}
                      onNavigate={handleAccountClick}
                    />
                  ))}

                  {/* Add account card */}
                  <motion.button
                    onClick={() => setShowAccountForm(true)}
                    className="shrink-0 snap-start"
                    whileTap={{ scale: 0.97 }}
                  >
                    <div className="w-[140px] h-[130px] rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex flex-col items-center justify-center gap-1 hover:border-emerald-300 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors">
                      <Plus className="size-4 text-gray-400" />
                      <span className="text-[9px] text-gray-400 font-medium">
                        Nueva Cuenta
                      </span>
                    </div>
                  </motion.button>
                </div>
              </SortableContext>
              <DragOverlay>
                {activeAccountId ? (
                  <div className="w-[140px] rounded-2xl p-3 shadow-2xl opacity-90">
                    {(() => {
                      const acc = sortedAccounts.find(
                        (a) => a.id === activeAccountId
                      );
                      if (!acc) return null;
                      const Icon = typeIcons[acc.type] || Wallet;
                      const isNegative = acc.balance < 0;
                      return (
                        <div
                          className="rounded-2xl p-3"
                          style={{
                            background: `linear-gradient(145deg, ${acc.color}, ${acc.color}cc)`,
                          }}
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <div className="size-6 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center shrink-0">
                              <Icon className="size-3 text-white" />
                            </div>
                            <p className="text-[11px] font-medium text-white/90 truncate leading-tight">
                              {acc.name}
                            </p>
                          </div>
                          <p className="text-[15px] font-bold text-white tracking-tight">
                            {isNegative ? "-" : ""}
                            {formatCurrency(Math.abs(acc.balance))}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>

            <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-1.5 text-center flex items-center justify-center gap-1">
              <GripVertical className="size-3" />
              Arrastra el ícono para reordenar
            </p>
          </div>
        ) : (
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg mb-4">
                <Wallet className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                Sin cuentas aún
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Agrega tu primera cuenta para empezar a gestionar tus finanzas
              </p>
              <Button
                onClick={() => setShowAccountForm(true)}
                className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500"
              >
                <Plus className="size-4 mr-1" />
                Crear Cuenta
              </Button>
            </CardContent>
          </Card>
        );

      case "transactions":
        return (
          <Card className="border-0 shadow-md rounded-2xl">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="size-4 text-emerald-500" />
                  Transacciones Recientes
                </CardTitle>
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
                                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {tx.category
                                    ? `${CATEGORY_ICONS[tx.category] || "📦"} ${tx.category}`
                                    : "Sin categoría"}
                                  {tx.account && ` · ${tx.account.name}`}
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
        );

      case "yields":
        return highYieldAccounts.length > 0 ? (
          <YieldManager accounts={highYieldAccounts} />
        ) : null;

      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const visibleWidgets = widgetConfig
    .sort((a, b) => a.order - b.order)
    .filter((w) => w.visible);

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
        className="p-4 space-y-4 pb-24"
      >
        {/* Header with month selector and settings */}
        <motion.div variants={itemVariants} className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Cuentas
          </h2>
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

        {/* Dashboard Widgets - Draggable via grip handle */}
        <DndContext
          sensors={handleSensors}
          collisionDetection={closestCenter}
          onDragStart={handleWidgetDragStart}
          onDragEnd={handleWidgetDragEnd}
        >
          <SortableContext
            items={visibleWidgets.map((w) => w.id)}
            strategy={verticalListSortingStrategy}
          >
            {visibleWidgets.map((widget) => (
              <SortableWidgetItem key={widget.id} id={widget.id}>
                <motion.div variants={itemVariants}>
                  {renderWidgetContent(widget.id)}
                </motion.div>
              </SortableWidgetItem>
            ))}
          </SortableContext>
          <DragOverlay>
            {activeWidgetId ? (
              <div className="opacity-80 shadow-2xl rounded-2xl">
                {renderWidgetContent(activeWidgetId)}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {/* Hint text for widget drag */}
        <p className="text-[9px] text-gray-400 dark:text-gray-500 text-center flex items-center justify-center gap-1">
          <GripVertical className="size-3" />
          Arrastra el ícono para reordenar secciones
        </p>

        {/* Customize Dashboard Button */}
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-sm rounded-2xl border-dashed">
            <CardContent className="p-3">
              <Button
                variant="ghost"
                className="w-full rounded-xl text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/10"
                onClick={openCustomize}
              >
                <Settings2 className="size-4 mr-2" />
                Personalizar vista
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Sheet-based customization (secondary option) */}
      <Sheet open={customizeOpen} onOpenChange={setCustomizeOpen}>
        <SheetContent className="w-[340px] sm:w-[400px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Settings2 className="size-5 text-emerald-500" />
              Personalizar Widgets
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <DndContext
              sensors={handleSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSheetDragEnd}
            >
              <SortableContext
                items={tempConfig.map((w) => w.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {tempConfig
                    .sort((a, b) => a.order - b.order)
                    .map((widget, index) => (
                      <SortableSheetItem
                        key={widget.id}
                        widget={widget}
                        index={index}
                        onToggle={handleToggleWidget}
                      />
                    ))}
                </div>
              </SortableContext>
            </DndContext>
            <div className="mt-4 space-y-2">
              <Button
                onClick={saveCustomization}
                className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500"
              >
                Guardar cambios
              </Button>
              <Button
                variant="ghost"
                onClick={resetCustomization}
                className="w-full rounded-xl text-gray-500"
              >
                <RotateCcw className="size-3.5 mr-1.5" />
                Restablecer
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Account Form Modal */}
      <AccountForm
        open={showAccountForm}
        onOpenChange={setShowAccountForm}
      />

      {/* Transaction Form Modal */}
      <TransactionForm
        open={showTransactionForm}
        onOpenChange={setShowTransactionForm}
      />
    </>
  );
}
