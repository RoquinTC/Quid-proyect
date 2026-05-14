"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency, calcPercentage } from "@/lib/api";
import { BudgetForm } from "./budget-form";
import { TransactionForm } from "./transaction-form";
import { SpendingIncomeChart } from "./spending-income-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Receipt,
  Utensils,
  Car,
  Home,
  Heart,
  Gamepad2,
  GraduationCap,
  Shirt,
  CreditCard,
  PiggyBank,
  Briefcase,
  DollarSign,
  Target,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  PencilLine,
  CirclePlus,
  Eye,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  CreditCard as TCCard,
  Filter,
  LayoutGrid,
  List,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Budget, Transaction } from "@/lib/types";

// ── Types ──

interface UnbudgetedCategory {
  category: string;
  type: string;
  totalSpent: number;
  transactionCount: number;
  subcategories: Array<{
    subCategory: string | null;
    totalSpent: number;
    transactionCount: number;
  }>;
}

interface BudgetMovement {
  id: string;
  source: "transaction" | "installment";
  type: string;
  amount: number;
  description: string;
  category: string | null;
  subCategory: string | null;
  date: string;
  accountName?: string | null;
  accountId?: string | null;
  debtId?: string | null;
  debtName?: string | null;
  debtColor?: string | null;
  isPaid?: boolean | null;
  currentInstallment?: number | null;
  totalInstallments?: number | null;
}

// ── Constants ──

const categoryIcons: Record<string, typeof DollarSign> = {
  Alimentación: Utensils,
  Transporte: Car,
  Vivienda: Home,
  Salud: Heart,
  Entretenimiento: Gamepad2,
  Educación: GraduationCap,
  Ropa: Shirt,
  Servicios: Receipt,
  Deudas: CreditCard,
  Ahorros: PiggyBank,
  Salario: Briefcase,
  Freelance: Briefcase,
  Inversiones: DollarSign,
  Ventas: DollarSign,
  Mercado: Receipt,
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0 },
};

function getProgressColor(percentage: number): string {
  if (percentage >= 90) return "from-red-500 to-rose-500";
  if (percentage >= 75) return "from-amber-500 to-orange-500";
  return "from-emerald-500 to-teal-500";
}

function getProgressBg(percentage: number): string {
  if (percentage >= 90) return "bg-red-100 dark:bg-red-900/30";
  if (percentage >= 75) return "bg-amber-100 dark:bg-amber-900/30";
  return "bg-emerald-100 dark:bg-emerald-900/30";
}

function getProgressText(percentage: number): string {
  if (percentage >= 90) return "text-red-600 dark:text-red-400";
  if (percentage >= 75) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

// ── Filter types ──
type BudgetFilter = "all" | "risk" | "ok";
type ViewMode = "compact" | "cards";
type BudgetTab = "expenses" | "income";

// ── Main Component ──

export function BudgetsView() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [unbudgeted, setUnbudgeted] = useState<UnbudgetedCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [prefilledBudgetCategory, setPrefilledBudgetCategory] = useState<{
    category: string;
    subCategory?: string | null;
    type: string;
    suggestedAmount?: number;
  } | null>(null);
  const [deleteBudgetId, setDeleteBudgetId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [recalculating, setRecalculating] = useState(false);
  const [activeTab, setActiveTab] = useState<BudgetTab>("expenses");
  const [budgetFilter, setBudgetFilter] = useState<BudgetFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");

  // Movement drill-down state
  const [categoryMovements, setCategoryMovements] = useState<Record<string, BudgetMovement[]>>({});
  const [loadingMovements, setLoadingMovements] = useState<Record<string, boolean>>({});
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showTransactionForm, setShowTransactionForm] = useState(false);

  const fetchBudgets = useCallback(async () => {
    try {
      const data = await apiFetch<Budget[]>("/api/budgets");
      setBudgets(data);
    } catch (error) {
      console.error("Error fetching budgets:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUnbudgeted = useCallback(async () => {
    try {
      const data = await apiFetch<UnbudgetedCategory[]>("/api/budgets/unbudgeted");
      setUnbudgeted(data);
    } catch (error) {
      console.error("Error fetching unbudgeted:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchBudgets(), fetchUnbudgeted()]).then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchBudgets, fetchUnbudgeted]);

  const incomeBudgets = budgets.filter((b) => b.type === "income");
  const expenseBudgets = budgets.filter((b) => b.type === "expense");

  const totalIncomeBudget = incomeBudgets.reduce((sum, b) => sum + b.amount, 0);
  const totalIncomeSpent = incomeBudgets.reduce((sum, b) => sum + b.spent, 0);
  const totalExpenseBudget = expenseBudgets.reduce((sum, b) => sum + b.amount, 0);
  const totalExpenseSpent = expenseBudgets.reduce((sum, b) => sum + b.spent, 0);
  const totalUnbudgetedExpense = unbudgeted
    .filter((u) => u.type === "expense")
    .reduce((sum, u) => sum + u.totalSpent, 0);
  const totalUnbudgetedIncome = unbudgeted
    .filter((u) => u.type === "income")
    .reduce((sum, u) => sum + u.totalSpent, 0);

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setPrefilledBudgetCategory(null);
    setShowBudgetForm(true);
  };

  const handleCreateBudgetFromUnbudgeted = (item: UnbudgetedCategory, sub?: { subCategory: string | null; totalSpent: number } | null) => {
    setEditingBudget(null);
    setPrefilledBudgetCategory({
      category: item.category,
      subCategory: sub?.subCategory || null,
      type: item.type,
      suggestedAmount: sub?.totalSpent || item.totalSpent,
    });
    setShowBudgetForm(true);
  };

  const handleDelete = async (budgetId: string) => {
    try {
      await apiFetch(`/api/budgets/${budgetId}`, { method: "DELETE" });
      toast.success("Presupuesto eliminado");
      fetchBudgets();
      fetchUnbudgeted();
    } catch (error) {
      console.error("Error deleting budget:", error);
      toast.error("Error al eliminar presupuesto");
    }
    setDeleteBudgetId(null);
  };

  const handleRecalculate = async () => {
    setRecalculating(true);
    try {
      const data = await apiFetch<Budget[]>("/api/budgets/recalculate", {
        method: "POST",
      });
      setBudgets(data);
      fetchUnbudgeted();
      setCategoryMovements({});
      setExpandedCategories({});
      toast.success("Presupuestos recalculados");
    } catch (error) {
      console.error("Error recalculating budgets:", error);
      toast.error("Error al recalcular presupuestos");
    } finally {
      setRecalculating(false);
    }
  };

  const movKey = (category: string, type?: string) => `${type || "expense"}:${category}`;

  const toggleCategory = (category: string, type?: "income" | "expense", subCategory?: string | null) => {
    const key = movKey(category, type);
    setExpandedCategories((prev) => {
      const newState = { ...prev, [key]: !prev[key] };
      if (!prev[key] && !categoryMovements[key]) {
        fetchCategoryMovements(category, subCategory, type);
      }
      return newState;
    });
  };

  const fetchCategoryMovements = async (category: string, subCategory?: string | null, type?: string) => {
    const key = movKey(category, type);
    setLoadingMovements((prev) => ({ ...prev, [key]: true }));
    try {
      const params = new URLSearchParams({
        category,
        type: type || "expense",
      });
      if (subCategory) params.set("subCategory", subCategory);

      const data = await apiFetch<{ movements: BudgetMovement[]; total: number; totalAmount: number }>(
        `/api/budgets/movements?${params.toString()}`
      );
      setCategoryMovements((prev) => ({ ...prev, [key]: data.movements || [] }));
    } catch (error) {
      console.error("Error fetching category movements:", error);
      setCategoryMovements((prev) => ({ ...prev, [key]: [] }));
    } finally {
      setLoadingMovements((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleEditTransaction = (tx: Transaction) => {
    setEditingTransaction({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      subCategory: tx.subCategory,
      date: tx.date,
      notes: tx.notes,
      accountId: tx.accountId,
      subAccountId: tx.subAccountId,
    });
    setShowTransactionForm(true);
  };

  const handleTransactionSuccess = () => {
    fetchBudgets();
    fetchUnbudgeted();
    setCategoryMovements({});
    setExpandedCategories({});
  };

  const groupBudgetsByCategory = (budgetList: Budget[]) => {
    const groups: Record<string, { parent: Budget | null; children: Budget[] }> = {};
    for (const budget of budgetList) {
      const key = budget.category;
      if (!groups[key]) {
        groups[key] = { parent: null, children: [] };
      }
      if (!budget.subCategory) {
        groups[key].parent = budget;
      } else {
        groups[key].children.push(budget);
      }
    }
    return groups;
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  // ── Render a movement item (transaction or installment) ──
  const renderMovementItem = (movement: BudgetMovement) => {
    const isIncome = movement.type === "income";
    const isInstallment = movement.source === "installment";

    return (
      <div
        key={`${movement.source}-${movement.id}`}
        className={`flex items-center gap-2 py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${
          isInstallment ? "cursor-default" : "cursor-pointer"
        }`}
        onClick={() => {
          if (!isInstallment) {
            handleEditTransaction(movement as unknown as Transaction);
          }
        }}
      >
        <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
          isInstallment
            ? "bg-violet-100 dark:bg-violet-900/30"
            : isIncome
            ? "bg-emerald-100 dark:bg-emerald-900/30"
            : "bg-rose-100 dark:bg-rose-900/30"
        }`}>
          {isInstallment ? (
            <TCCard className="size-3.5 text-violet-600 dark:text-violet-400" />
          ) : isIncome ? (
            <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <TrendingDown className="size-3.5 text-rose-600 dark:text-rose-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
            {movement.description}
          </p>
          <p className="text-[10px] text-gray-400">
            {new Date(movement.date).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
            {isInstallment && movement.debtName && (
              <span style={{ color: movement.debtColor || "#8B5CF6" }}>
                {" "}· {movement.debtName}
              </span>
            )}
            {isInstallment && movement.totalInstallments && movement.totalInstallments > 1 && (
              <span> · Cuota {movement.currentInstallment}/{movement.totalInstallments}</span>
            )}
            {!isInstallment && movement.accountName && (
              <span> · {movement.accountName}</span>
            )}
            {movement.subCategory && (
              <span> · {movement.subCategory}</span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-xs font-semibold ${
            isIncome
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-rose-600 dark:text-rose-400"
          }`}>
            {isIncome ? "+" : "-"}{formatCurrency(movement.amount)}
          </p>
          {isInstallment && (
            <p className="text-[8px] text-violet-500 dark:text-violet-400">
              TC {movement.isPaid ? "pagada" : "pend."}
            </p>
          )}
        </div>
        {!isInstallment && (
          <PencilLine className="size-3 text-gray-300 dark:text-gray-600 shrink-0" />
        )}
      </div>
    );
  };

  // ── Compact budget row ──
  const renderCompactBudgetRow = (budget: Budget, colorType: "emerald" | "rose") => {
    const Icon = categoryIcons[budget.category] || DollarSign;
    const pct = calcPercentage(budget.spent, budget.amount);
    const bgColor = colorType === "emerald" ? "bg-emerald-50 dark:bg-emerald-900/30" : "bg-rose-50 dark:bg-rose-900/30";
    const iconColor = colorType === "emerald" ? "text-emerald-500" : "text-rose-500";

    return (
      <div
        key={budget.id}
        className="flex items-center gap-2.5 py-2 px-1 group"
      >
        <div className={`size-7 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
          <Icon className={`size-3.5 ${iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
              {budget.subCategory || budget.category}
            </p>
            <div className="flex items-center gap-1.5 shrink-0 ml-2">
              <span className={`text-[10px] font-semibold ${getProgressText(pct)}`}>
                {formatCurrency(budget.spent)}
              </span>
              <span className="text-[10px] text-gray-400">/ {formatCurrency(budget.amount)}</span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => handleEdit(budget)}
                  className="size-5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
                >
                  <Pencil className="size-2.5 text-gray-400" />
                </button>
                <button
                  onClick={() => setDeleteBudgetId(budget.id)}
                  className="size-5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
                >
                  <Trash2 className="size-2.5 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            </div>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(pct)}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(pct, 100)}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            />
          </div>
        </div>
      </div>
    );
  };

  // ── Grouped budgets with expand/collapse + status filtering ──
  const renderGroupedBudgets = (budgetList: Budget[], colorType: "emerald" | "rose") => {
    const groups = groupBudgetsByCategory(budgetList);
    const budgetType = colorType === "emerald" ? "income" : "expense";

    // Apply filter
    const filteredGroups = Object.entries(groups).filter(([, group]) => {
      const totalSpent = group.children.length > 0
        ? group.children.reduce((s, c) => s + c.spent, 0)
        : (group.parent?.spent || 0);
      const totalAmount = group.children.length > 0
        ? group.children.reduce((s, c) => s + c.amount, 0)
        : (group.parent?.amount || 0);
      const pct = calcPercentage(totalSpent, totalAmount);

      if (budgetFilter === "risk") return pct >= 75;
      if (budgetFilter === "ok") return pct < 75;
      return true;
    });

    if (filteredGroups.length === 0) {
      return (
        <div className="text-center py-6">
          <p className="text-xs text-gray-400">
            {budgetFilter === "risk" ? "Todos los presupuestos están en control" :
             budgetFilter === "ok" ? "No hay presupuestos en control" :
             "Sin presupuestos"}
          </p>
        </div>
      );
    }

    // Sort: risk items first (highest %), then ok items
    const sortedGroups = filteredGroups.sort(([, a], [, b]) => {
      const pctA = calcPercentage(
        a.children.length > 0 ? a.children.reduce((s, c) => s + c.spent, 0) : (a.parent?.spent || 0),
        a.children.length > 0 ? a.children.reduce((s, c) => s + c.amount, 0) : (a.parent?.amount || 0)
      );
      const pctB = calcPercentage(
        b.children.length > 0 ? b.children.reduce((s, c) => s + c.spent, 0) : (b.parent?.spent || 0),
        b.children.length > 0 ? b.children.reduce((s, c) => s + c.amount, 0) : (b.parent?.amount || 0)
      );
      return pctB - pctA; // Highest risk first
    });

    return sortedGroups.map(([category, group]) => {
      const hasChildren = group.children.length > 0;
      const key = movKey(category, budgetType);
      const isExpanded = expandedCategories[key] ?? false;
      const isLoading = loadingMovements[key] ?? false;
      const movements = categoryMovements[key] || [];

      const totalSpent = hasChildren
        ? group.children.reduce((s, c) => s + c.spent, 0)
        : (group.parent?.spent || 0);
      const totalAmount = hasChildren
        ? group.children.reduce((s, c) => s + c.amount, 0)
        : (group.parent?.amount || 0);
      const totalPct = calcPercentage(totalSpent, totalAmount);

      const Icon = categoryIcons[category] || DollarSign;
      const bgColor = colorType === "emerald" ? "bg-emerald-50 dark:bg-emerald-900/30" : "bg-rose-50 dark:bg-rose-900/30";
      const iconColor = colorType === "emerald" ? "text-emerald-500" : "text-rose-500";

      // Compact mode: just show rows without card wrapper
      if (viewMode === "compact" && !hasChildren) {
        return (
          <div key={category}>
            <div
              className="flex items-center gap-2.5 py-2.5 px-1 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors group"
              onClick={() => toggleCategory(category, budgetType, undefined)}
            >
              <div className="shrink-0">
                {isExpanded ? (
                  <ChevronDown className="size-3.5 text-gray-400" />
                ) : (
                  <ChevronRight className="size-3.5 text-gray-400" />
                )}
              </div>
              <div className={`size-7 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
                <Icon className={`size-3.5 ${iconColor}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                    {category}
                  </p>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <Badge variant="outline" className={`text-[8px] h-4 px-1 ${getProgressBg(totalPct)} border-0`}>
                      {totalPct}%
                    </Badge>
                    <span className={`text-[10px] font-semibold ${getProgressText(totalPct)}`}>
                      {formatCurrency(totalSpent)}
                    </span>
                    <span className="text-[10px] text-gray-400">/ {formatCurrency(totalAmount)}</span>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); group.parent && handleEdit(group.parent); }}
                        className="size-5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
                      >
                        <Pencil className="size-2.5 text-gray-400" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); group.parent && setDeleteBudgetId(group.parent.id); }}
                        className="size-5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center"
                      >
                        <Trash2 className="size-2.5 text-gray-400 hover:text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(totalPct)}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(totalPct, 100)}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
              </div>
            </div>

            {/* Expanded movements */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl ml-8">
                    <CardContent className="p-2">
                      <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                        <Eye className="size-3 text-gray-400" />
                        <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                          Movimientos del periodo
                        </p>
                      </div>
                      {isLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <RefreshCw className="size-4 animate-spin text-gray-400" />
                        </div>
                      ) : movements.length === 0 ? (
                        <div className="text-center py-3">
                          <p className="text-[10px] text-gray-400">Sin movimientos en este periodo</p>
                        </div>
                      ) : (
                        <div className="space-y-0.5">
                          {movements.slice(0, 15).map(renderMovementItem)}
                          {movements.length > 15 && (
                            <p className="text-[10px] text-center text-gray-400 py-1">
                              y {movements.length - 15} movimientos más...
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      }

      // Cards mode or grouped budgets with subcategories
      return (
        <div key={category} className="space-y-1">
          <Card className="border-0 shadow-sm rounded-2xl">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button
                    onClick={() => toggleCategory(category, budgetType, undefined)}
                    className="size-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="size-4 text-gray-500" />
                    )}
                  </button>
                  <div className={`size-8 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
                    <Icon className={`size-4 ${iconColor}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {category}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {formatCurrency(totalSpent)} / {formatCurrency(totalAmount)}
                      {hasChildren && (
                        <span className="text-gray-300 dark:text-gray-600 ml-1">
                          · {group.children.length} {group.children.length === 1 ? 'sub' : 'subs'}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${getProgressBg(totalPct)} border-0`}
                  >
                    {totalPct}%
                  </Badge>
                  {group.parent && !hasChildren && (
                    <>
                      <button
                        onClick={() => group.parent && handleEdit(group.parent)}
                        className="size-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
                      >
                        <Pencil className="size-3 text-gray-400" />
                      </button>
                      <button
                        onClick={() => group.parent && setDeleteBudgetId(group.parent.id)}
                        className="size-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="size-3 text-gray-400 hover:text-red-500" />
                      </button>
                    </>
                  )}
                </div>
              </div>
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(totalPct)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(totalPct, 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>
            </CardContent>
          </Card>

          {/* Expanded: subcategories + movements */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {hasChildren && (
                  <div className="space-y-0.5 mb-1">
                    {group.children.map((child) => {
                      const childPct = calcPercentage(child.spent, child.amount);
                      const ChildIcon = categoryIcons[child.category] || DollarSign;
                      return (
                        <div key={child.id} className="ml-6 pl-3 border-l-2 border-gray-200 dark:border-gray-700 py-1.5">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className={`size-6 rounded-md ${bgColor} flex items-center justify-center`}>
                                <ChildIcon className={`size-3 ${iconColor}`} />
                              </div>
                              <div>
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                  {child.subCategory}
                                </p>
                                <p className="text-[9px] text-gray-400">
                                  {formatCurrency(child.spent)} / {formatCurrency(child.amount)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className={`text-[9px] ${getProgressBg(childPct)} border-0`}>
                                {childPct}%
                              </Badge>
                              <button onClick={(e) => { e.stopPropagation(); handleEdit(child); }} className="size-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors">
                                <Pencil className="size-2.5 text-gray-400" />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteBudgetId(child.id); }} className="size-6 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors">
                                <Trash2 className="size-2.5 text-gray-400 hover:text-red-500" />
                              </button>
                            </div>
                          </div>
                          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                            <motion.div
                              className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(childPct)}`}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(childPct, 100)}%` }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                      <Eye className="size-3 text-gray-400" />
                      <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                        Movimientos del periodo
                      </p>
                    </div>
                    {isLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="size-4 animate-spin text-gray-400" />
                      </div>
                    ) : movements.length === 0 ? (
                      <div className="text-center py-3">
                        <p className="text-[10px] text-gray-400">Sin movimientos en este periodo</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {movements.slice(0, 15).map(renderMovementItem)}
                        {movements.length > 15 && (
                          <p className="text-[10px] text-center text-gray-400 py-1">
                            y {movements.length - 15} movimientos más...
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      );
    });
  };

  // Render unbudgeted categories
  const renderUnbudgetedSection = (items: UnbudgetedCategory[], typeLabel: string, colorType: "emerald" | "rose") => {
    if (items.length === 0) return null;

    const totalSpent = items.reduce((s, u) => s + u.totalSpent, 0);
    const Icon = colorType === "rose" ? AlertTriangle : TrendingUp;

    return (
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className={`size-3.5 ${colorType === "rose" ? "text-amber-500" : "text-emerald-500"}`} />
            <h3 className="text-xs font-semibold text-gray-900 dark:text-white">
              {typeLabel}
            </h3>
            <Badge variant="secondary" className="text-[8px]">
              {formatCurrency(totalSpent)}
            </Badge>
          </div>
        </div>
        <div className="space-y-1">
          {items.map((item) => {
            const CatIcon = categoryIcons[item.category] || DollarSign;
            const catKey = `unbudgeted-${item.type}-${item.category}`;
            const mKey = movKey(item.category, item.type);
            const isExpanded = expandedCategories[mKey] ?? false;
            const isLoading = loadingMovements[mKey] ?? false;
            const movements = categoryMovements[mKey] || [];
            const bgColor = item.type === "expense"
              ? "bg-amber-50 dark:bg-amber-900/20"
              : "bg-emerald-50 dark:bg-emerald-900/20";
            const iconColor = item.type === "expense"
              ? "text-amber-600 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400";

            return (
              <div key={catKey} className="space-y-1">
                <div className="flex items-center gap-2 py-1.5 px-1 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <button
                    onClick={() => {
                      const mKey = movKey(item.category, item.type);
                      setExpandedCategories((prev) => {
                        const newState = { ...prev, [mKey]: !prev[mKey] };
                        if (!prev[mKey] && !categoryMovements[mKey]) {
                          fetchCategoryMovements(item.category, undefined, item.type);
                        }
                        return newState;
                      });
                    }}
                    className="shrink-0"
                  >
                    {isExpanded ? (
                      <ChevronDown className="size-3.5 text-gray-400" />
                    ) : (
                      <ChevronRight className="size-3.5 text-gray-400" />
                    )}
                  </button>
                  <div className={`size-7 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
                    <CatIcon className={`size-3.5 ${iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {item.category}
                    </p>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      Sin presupuesto · {formatCurrency(item.totalSpent)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-[9px] gap-1 h-6 px-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/10 shrink-0"
                    onClick={() => handleCreateBudgetFromUnbudgeted(item)}
                  >
                    <CirclePlus className="size-2.5" />
                    Crear
                  </Button>
                </div>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl ml-8">
                        <CardContent className="p-2">
                          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                            <Eye className="size-3 text-gray-400" />
                            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                              Movimientos del periodo
                            </p>
                          </div>
                          {isLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <RefreshCw className="size-4 animate-spin text-gray-400" />
                            </div>
                          ) : movements.length === 0 ? (
                            <div className="text-center py-3">
                              <p className="text-[10px] text-gray-400">Sin movimientos en este periodo</p>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              {movements.slice(0, 10).map(renderMovementItem)}
                              {movements.length > 10 && (
                                <p className="text-[10px] text-center text-gray-400 py-1">
                                  y {movements.length - 10} movimientos más...
                                </p>
                              )}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  };

  const unbudgetedExpenses = unbudgeted.filter((u) => u.type === "expense");
  const unbudgetedIncomes = unbudgeted.filter((u) => u.type === "income");

  const incomePct = totalIncomeBudget > 0 ? calcPercentage(totalIncomeSpent, totalIncomeBudget) : 0;
  const expensePct = totalExpenseBudget > 0 ? calcPercentage(totalExpenseSpent, totalExpenseBudget) : 0;

  // Count at-risk budgets for the current tab
  const currentBudgetList = activeTab === "expenses" ? expenseBudgets : incomeBudgets;
  const riskCount = currentBudgetList.filter((b) => {
    const pct = calcPercentage(b.spent, b.amount);
    return pct >= 75;
  }).length;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-3 pb-24"
    >
      {/* Monthly Summary — compact */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-4 relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="size-4 text-emerald-200" />
              <span className="text-sm text-emerald-100">Resumen Mensual</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <ArrowUpRight className="size-3 text-emerald-200" />
                  <span className="text-[10px] text-emerald-200">Ingresos</span>
                </div>
                <p className="text-lg font-bold">{formatCurrency(totalIncomeSpent + totalUnbudgetedIncome)}</p>
                <p className="text-[10px] text-emerald-200">
                  de {formatCurrency(totalIncomeBudget)}
                  {totalUnbudgetedIncome > 0 && (
                    <span className="text-amber-200 ml-1">
                      (+{formatCurrency(totalUnbudgetedIncome)} sin presup.)
                    </span>
                  )}
                </p>
              </div>
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <ArrowDownRight className="size-3 text-rose-200" />
                  <span className="text-[10px] text-emerald-200">Gastos</span>
                </div>
                <p className="text-lg font-bold">{formatCurrency(totalExpenseSpent + totalUnbudgetedExpense)}</p>
                <p className="text-[10px] text-emerald-200">
                  de {formatCurrency(totalExpenseBudget)}
                  {totalUnbudgetedExpense > 0 && (
                    <span className="text-amber-200 ml-1">
                      (+{formatCurrency(totalUnbudgetedExpense)} sin presup.)
                    </span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Spending vs Income Chart */}
      <motion.div variants={itemVariants}>
        <SpendingIncomeChart />
      </motion.div>

      {/* Tabs: Gastos / Ingresos */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          <button
            onClick={() => { setActiveTab("expenses"); setBudgetFilter("all"); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "expenses"
                ? "bg-white dark:bg-gray-700 text-rose-600 dark:text-rose-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <TrendingDown className="size-3.5" />
            Gastos
            <Badge variant="secondary" className={`text-[8px] h-4 px-1 ${
              activeTab === "expenses" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" : ""
            }`}>
              {expensePct}%
            </Badge>
          </button>
          <button
            onClick={() => { setActiveTab("income"); setBudgetFilter("all"); }}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
              activeTab === "income"
                ? "bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <TrendingUp className="size-3.5" />
            Ingresos
            <Badge variant="secondary" className={`text-[8px] h-4 px-1 ${
              activeTab === "income" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : ""
            }`}>
              {incomePct}%
            </Badge>
          </button>
        </div>
      </motion.div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        {activeTab === "expenses" ? (
          <motion.div
            key="expenses"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {/* Toolbar: Recalculate + Filter + View Mode */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {/* Status Filter */}
                <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setBudgetFilter("all")}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                      budgetFilter === "all"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setBudgetFilter("risk")}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all flex items-center gap-0.5 ${
                      budgetFilter === "risk"
                        ? "bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    <AlertTriangle className="size-2.5" />
                    Riesgo{riskCount > 0 && ` (${riskCount})`}
                  </button>
                  <button
                    onClick={() => setBudgetFilter("ok")}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                      budgetFilter === "ok"
                        ? "bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    OK
                  </button>
                </div>
                {/* View Mode Toggle */}
                <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode("compact")}
                    className={`p-1 rounded-md transition-all ${
                      viewMode === "compact"
                        ? "bg-white dark:bg-gray-700 shadow-sm"
                        : "text-gray-400"
                    }`}
                    title="Vista compacta"
                  >
                    <List className="size-3" />
                  </button>
                  <button
                    onClick={() => setViewMode("cards")}
                    className={`p-1 rounded-md transition-all ${
                      viewMode === "cards"
                        ? "bg-white dark:bg-gray-700 shadow-sm"
                        : "text-gray-400"
                    }`}
                    title="Vista tarjetas"
                  >
                    <LayoutGrid className="size-3" />
                  </button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRecalculate}
                disabled={recalculating}
                className="rounded-xl text-xs gap-1.5 h-7 px-2.5 text-gray-500 hover:text-emerald-600"
                title="Recalcular gastos desde transacciones"
              >
                <RefreshCw className={`size-3 ${recalculating ? "animate-spin" : ""}`} />
                {recalculating ? "Calculando..." : "Recalcular"}
              </Button>
            </div>

            {expenseBudgets.length === 0 && unbudgetedExpenses.length === 0 ? (
              <Card className="border-0 shadow-sm rounded-2xl bg-gray-50 dark:bg-gray-800/50">
                <CardContent className="p-6 text-center">
                  <Target className="size-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    Crea un presupuesto para controlar tus gastos
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-0.5">
                {renderGroupedBudgets(expenseBudgets, "rose")}
              </div>
            )}

            {unbudgetedExpenses.length > 0 && renderUnbudgetedSection(unbudgetedExpenses, "Gastos sin Presupuesto", "rose")}
          </motion.div>
        ) : (
          <motion.div
            key="income"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-3"
          >
            {/* Toolbar: Recalculate + Filter */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setBudgetFilter("all")}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                      budgetFilter === "all"
                        ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setBudgetFilter("risk")}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all flex items-center gap-0.5 ${
                      budgetFilter === "risk"
                        ? "bg-white dark:bg-gray-700 text-amber-600 dark:text-amber-400 shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    <AlertTriangle className="size-2.5" />
                    Bajo
                  </button>
                  <button
                    onClick={() => setBudgetFilter("ok")}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                      budgetFilter === "ok"
                        ? "bg-white dark:bg-gray-700 text-emerald-600 dark:text-emerald-400 shadow-sm"
                        : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    Cumplido
                  </button>
                </div>
                <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setViewMode("compact")}
                    className={`p-1 rounded-md transition-all ${
                      viewMode === "compact"
                        ? "bg-white dark:bg-gray-700 shadow-sm"
                        : "text-gray-400"
                    }`}
                    title="Vista compacta"
                  >
                    <List className="size-3" />
                  </button>
                  <button
                    onClick={() => setViewMode("cards")}
                    className={`p-1 rounded-md transition-all ${
                      viewMode === "cards"
                        ? "bg-white dark:bg-gray-700 shadow-sm"
                        : "text-gray-400"
                    }`}
                    title="Vista tarjetas"
                  >
                    <LayoutGrid className="size-3" />
                  </button>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRecalculate}
                disabled={recalculating}
                className="rounded-xl text-xs gap-1.5 h-7 px-2.5 text-gray-500 hover:text-emerald-600"
                title="Recalcular ingresos desde transacciones"
              >
                <RefreshCw className={`size-3 ${recalculating ? "animate-spin" : ""}`} />
                {recalculating ? "Calculando..." : "Recalcular"}
              </Button>
            </div>

            {incomeBudgets.length === 0 && unbudgetedIncomes.length === 0 ? (
              <Card className="border-0 shadow-sm rounded-2xl bg-gray-50 dark:bg-gray-800/50">
                <CardContent className="p-6 text-center">
                  <Target className="size-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    Crea un presupuesto para hacer seguimiento a tus ingresos
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-0.5">
                {renderGroupedBudgets(incomeBudgets, "emerald")}
              </div>
            )}

            {unbudgetedIncomes.length > 0 && renderUnbudgetedSection(unbudgetedIncomes, "Ingresos sin Presupuesto", "emerald")}
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB - Add Budget */}
      <motion.div
        className="fixed bottom-24 right-4 z-40"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: "spring" }}
      >
        <Button
          onClick={() => {
            setEditingBudget(null);
            setPrefilledBudgetCategory(null);
            setShowBudgetForm(true);
          }}
          className="size-14 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 shadow-lg shadow-emerald-500/30"
          size="icon"
        >
          <Plus className="size-6 text-white" />
        </Button>
      </motion.div>

      <BudgetForm
        open={showBudgetForm}
        onOpenChange={(open) => {
          setShowBudgetForm(open);
          if (!open) {
            setEditingBudget(null);
            setPrefilledBudgetCategory(null);
          }
        }}
        budget={editingBudget}
        prefilledCategory={prefilledBudgetCategory}
        onSuccess={() => {
          fetchBudgets();
          fetchUnbudgeted();
        }}
      />

      {/* Transaction Edit Form */}
      <TransactionForm
        open={showTransactionForm}
        onOpenChange={(open) => {
          setShowTransactionForm(open);
          if (!open) setEditingTransaction(null);
        }}
        editTransaction={editingTransaction}
        onSuccess={handleTransactionSuccess}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteBudgetId} onOpenChange={() => setDeleteBudgetId(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar presupuesto</AlertDialogTitle>
            <AlertDialogDescription>
              Este presupuesto será eliminado permanentemente. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteBudgetId && handleDelete(deleteBudgetId)}
              className="rounded-xl bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
