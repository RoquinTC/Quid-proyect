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
  ArrowRightLeft,
  PencilLine,
  CirclePlus,
  Eye,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Budget, Transaction } from "@/lib/types";

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
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
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

  // Transaction drill-down state
  const [categoryTransactions, setCategoryTransactions] = useState<Record<string, Transaction[]>>({});
  const [loadingTransactions, setLoadingTransactions] = useState<Record<string, boolean>>({});
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
      toast.success("Presupuesto recalculado desde transacciones");
    } catch (error) {
      console.error("Error recalculating budgets:", error);
      toast.error("Error al recalcular presupuesto");
    } finally {
      setRecalculating(false);
    }
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const newState = { ...prev, [category]: !prev[category] };
      // Fetch transactions when expanding
      if (!prev[category] && !categoryTransactions[category]) {
        fetchCategoryTransactions(category);
      }
      return newState;
    });
  };

  const fetchCategoryTransactions = async (category: string, subCategory?: string | null, type?: string) => {
    setLoadingTransactions((prev) => ({ ...prev, [category]: true }));
    try {
      // Get budget period from settings for date filtering
      const settingsData = await apiFetch<{ currentPeriod: { start: string; end: string } }>("/api/settings");
      const period = settingsData.currentPeriod;

      const params = new URLSearchParams({
        category,
        startDate: period.start.split("T")[0],
        endDate: period.end.split("T")[0],
        type: type || "expense",
      });

      const data = await apiFetch<Transaction[]>(`/api/transactions?${params.toString()}`);
      setCategoryTransactions((prev) => ({ ...prev, [category]: data }));
    } catch (error) {
      console.error("Error fetching category transactions:", error);
    } finally {
      setLoadingTransactions((prev) => ({ ...prev, [category]: false }));
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
    // Refresh budgets and unbudgeted
    fetchBudgets();
    fetchUnbudgeted();
    // Clear cached transactions for all categories
    setCategoryTransactions({});
    setExpandedCategories({});
  };

  const groupBudgetsByCategory = (budgets: Budget[]) => {
    const groups: Record<string, { parent: Budget | null; children: Budget[] }> = {};
    for (const budget of budgets) {
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
          <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  const renderTransactionItem = (tx: Transaction) => {
    const isIncome = tx.type === "income";
    return (
      <div
        key={tx.id}
        className="flex items-center gap-2 py-2 px-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
        onClick={() => handleEditTransaction(tx)}
      >
        <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 ${
          isIncome ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-rose-100 dark:bg-rose-900/30"
        }`}>
          {isIncome ? (
            <TrendingUp className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <TrendingDown className="size-3.5 text-rose-600 dark:text-rose-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
            {tx.description}
          </p>
          <p className="text-[10px] text-gray-400">
            {new Date(tx.date).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
            {tx.subCategory && ` · ${tx.subCategory}`}
            {tx.account && ` · ${tx.account.name}`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-xs font-semibold ${isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {isIncome ? "+" : "-"}{formatCurrency(tx.amount)}
          </p>
        </div>
        <PencilLine className="size-3 text-gray-300 dark:text-gray-600 shrink-0" />
      </div>
    );
  };

  const renderBudgetCard = (budget: Budget, colorType: "emerald" | "rose", isSubItem?: boolean) => {
    const Icon = categoryIcons[budget.category] || DollarSign;
    const pct = calcPercentage(budget.spent, budget.amount);
    const bgColor = colorType === "emerald" ? "bg-emerald-50 dark:bg-emerald-900/30" : "bg-rose-50 dark:bg-rose-900/30";
    const iconColor = colorType === "emerald" ? "text-emerald-500" : "text-rose-500";
    const label = budget.subCategory || budget.category;

    if (isSubItem) {
      return (
        <div key={budget.id} className="ml-6 pl-3 border-l-2 border-gray-200 dark:border-gray-700 py-1.5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className={`size-6 rounded-md ${bgColor} flex items-center justify-center`}>
                <Icon className={`size-3 ${iconColor}`} />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {label}
                </p>
                <p className="text-[9px] text-gray-400">
                  {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Badge
                variant="outline"
                className={`text-[9px] ${getProgressBg(pct)} border-0`}
              >
                {pct}%
              </Badge>
              <button
                onClick={(e) => { e.stopPropagation(); handleEdit(budget); }}
                className="size-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
              >
                <Pencil className="size-2.5 text-gray-400" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteBudgetId(budget.id); }}
                className="size-6 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors"
              >
                <Trash2 className="size-2.5 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          </div>
          <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(pct)}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(pct, 100)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </div>
      );
    }

    return (
      <Card key={budget.id} className="border-0 shadow-sm rounded-2xl">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`size-8 rounded-lg ${bgColor} flex items-center justify-center`}>
                <Icon className={`size-4 ${iconColor}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {budget.category}
                </p>
                <p className="text-[10px] text-gray-400">
                  {formatCurrency(budget.spent)} / {formatCurrency(budget.amount)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className={`text-[10px] ${getProgressBg(pct)} border-0`}
              >
                {pct}%
              </Badge>
              <button
                onClick={() => handleEdit(budget)}
                className="size-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors"
              >
                <Pencil className="size-3 text-gray-400" />
              </button>
              <button
                onClick={() => setDeleteBudgetId(budget.id)}
                className="size-7 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center justify-center transition-colors"
              >
                <Trash2 className="size-3 text-gray-400 hover:text-red-500" />
              </button>
            </div>
          </div>
          <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              className={`h-full rounded-full bg-gradient-to-r ${getProgressColor(pct)}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(pct, 100)}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderGroupedBudgets = (budgetList: Budget[], colorType: "emerald" | "rose") => {
    const groups = groupBudgetsByCategory(budgetList);

    return Object.entries(groups).map(([category, group]) => {
      const hasChildren = group.children.length > 0;
      const isExpanded = expandedCategories[category] ?? false;
      const isTransactionsLoading = loadingTransactions[category] ?? false;
      const transactions = categoryTransactions[category] || [];

      // Calculate totals for the category
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

      return (
        <div key={category} className="space-y-1">
          <Card className="border-0 shadow-sm rounded-2xl">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Expand/collapse toggle */}
                  <button
                    onClick={() => toggleCategory(category)}
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

          {/* Expanded: subcategories + transactions */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                {/* Sub-budget items */}
                {hasChildren && (
                  <div className="space-y-1 mb-1">
                    {group.children.map((child) => renderBudgetCard(child, colorType, true))}
                  </div>
                )}

                {/* Transactions for this category */}
                <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                      <Eye className="size-3 text-gray-400" />
                      <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                        Movimientos del periodo
                      </p>
                    </div>
                    {isTransactionsLoading ? (
                      <div className="flex items-center justify-center py-4">
                        <RefreshCw className="size-4 animate-spin text-gray-400" />
                      </div>
                    ) : transactions.length === 0 ? (
                      <div className="text-center py-3">
                        <p className="text-[10px] text-gray-400">Sin movimientos en este periodo</p>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        {transactions.slice(0, 10).map(renderTransactionItem)}
                        {transactions.length > 10 && (
                          <p className="text-[10px] text-center text-gray-400 py-1">
                            y {transactions.length - 10} movimientos más...
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
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon className={`size-4 ${colorType === "rose" ? "text-amber-500" : "text-emerald-500"}`} />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {typeLabel}
            </h3>
            <Badge variant="secondary" className="text-[9px]">
              {formatCurrency(totalSpent)}
            </Badge>
          </div>
        </div>
        <div className="space-y-1.5">
          {items.map((item) => {
            const CatIcon = categoryIcons[item.category] || DollarSign;
            const catKey = `unbudgeted-${item.type}-${item.category}`;
            const isExpanded = expandedCategories[catKey] ?? false;
            const isTransactionsLoading = loadingTransactions[catKey] ?? false;
            const transactions = categoryTransactions[catKey] || [];
            const bgColor = item.type === "expense"
              ? "bg-amber-50 dark:bg-amber-900/20"
              : "bg-emerald-50 dark:bg-emerald-900/20";
            const iconColor = item.type === "expense"
              ? "text-amber-600 dark:text-amber-400"
              : "text-emerald-600 dark:text-emerald-400";

            return (
              <div key={catKey} className="space-y-1">
                <Card className="border border-amber-200 dark:border-amber-800/40 shadow-none rounded-xl">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <button
                          onClick={() => {
                            toggleCategory(catKey);
                            if (!expandedCategories[catKey] && !categoryTransactions[catKey]) {
                              fetchCategoryTransactions(item.category, undefined, item.type);
                            }
                          }}
                          className="size-7 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center transition-colors shrink-0"
                        >
                          {isExpanded ? (
                            <ChevronDown className="size-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="size-4 text-gray-500" />
                          )}
                        </button>
                        <div className={`size-8 rounded-lg ${bgColor} flex items-center justify-center shrink-0`}>
                          <CatIcon className={`size-4 ${iconColor}`} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                            {item.category}
                          </p>
                          <p className="text-[10px] text-amber-600 dark:text-amber-400">
                            Sin presupuesto · {formatCurrency(item.totalSpent)} gastado
                            {item.transactionCount > 0 && ` · ${item.transactionCount} mov.`}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl text-[10px] gap-1 h-7 px-2 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-900/10 shrink-0"
                        onClick={() => handleCreateBudgetFromUnbudgeted(item)}
                      >
                        <CirclePlus className="size-3" />
                        Crear
                      </Button>
                    </div>

                    {/* Subcategories */}
                    {item.subcategories.length > 0 && (
                      <div className="mt-2 ml-12 space-y-1">
                        {item.subcategories.map((sub) => (
                          <div key={sub.subCategory} className="flex items-center justify-between">
                            <p className="text-[10px] text-gray-500 dark:text-gray-400">
                              {sub.subCategory}: {formatCurrency(sub.totalSpent)}
                            </p>
                            <button
                              onClick={() => handleCreateBudgetFromUnbudgeted(item, sub)}
                              className="text-[9px] text-amber-600 dark:text-amber-400 hover:underline"
                            >
                              + Presupuestar
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Expanded transactions */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                        <CardContent className="p-2">
                          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                            <Eye className="size-3 text-gray-400" />
                            <p className="text-[10px] font-medium text-gray-500 dark:text-gray-400">
                              Movimientos del periodo
                            </p>
                          </div>
                          {isTransactionsLoading ? (
                            <div className="flex items-center justify-center py-4">
                              <RefreshCw className="size-4 animate-spin text-gray-400" />
                            </div>
                          ) : transactions.length === 0 ? (
                            <div className="text-center py-3">
                              <p className="text-[10px] text-gray-400">Sin movimientos en este periodo</p>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              {transactions.slice(0, 10).map(renderTransactionItem)}
                              {transactions.length > 10 && (
                                <p className="text-[10px] text-center text-gray-400 py-1">
                                  y {transactions.length - 10} movimientos más...
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

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-24"
    >
      {/* Monthly Summary */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="size-4 text-emerald-200" />
              <span className="text-sm text-emerald-100">Resumen Mensual</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-1 mb-1">
                  <TrendingUp className="size-3 text-emerald-200" />
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
                  <TrendingDown className="size-3 text-rose-200" />
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

      {/* Income Budgets */}
      {incomeBudgets.length > 0 && (
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="size-4 text-emerald-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Presupuesto de Ingresos
            </h3>
          </div>
          <div className="space-y-2">
            {renderGroupedBudgets(incomeBudgets, "emerald")}
          </div>
        </motion.div>
      )}

      {/* Unbudgeted Incomes */}
      {unbudgetedIncomes.length > 0 && renderUnbudgetedSection(unbudgetedIncomes, "Ingresos sin Presupuesto", "emerald")}

      {/* Expense Budgets */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrendingDown className="size-4 text-rose-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Presupuesto de Gastos
            </h3>
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
          <div className="space-y-2">
            {renderGroupedBudgets(expenseBudgets, "rose")}
          </div>
        )}
      </motion.div>

      {/* Unbudgeted Expenses */}
      {unbudgetedExpenses.length > 0 && renderUnbudgetedSection(unbudgetedExpenses, "Gastos fuera del Presupuesto", "rose")}

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

      {/* Delete Budget Dialog */}
      <AlertDialog open={!!deleteBudgetId} onOpenChange={() => setDeleteBudgetId(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar presupuesto?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará este presupuesto y su seguimiento. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-500 hover:bg-red-600"
              onClick={() => deleteBudgetId && handleDelete(deleteBudgetId)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
