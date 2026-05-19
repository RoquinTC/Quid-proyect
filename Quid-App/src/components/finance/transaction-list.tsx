"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch, formatCurrency, formatDate, parseLocalDate, toColombiaDateString } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpRight,
  ArrowDownRight,
  Repeat,
  Filter,
  Utensils,
  Car,
  Home,
  Heart,
  Gamepad2,
  GraduationCap,
  Shirt,
  Receipt,
  CreditCard,
  PiggyBank,
  Briefcase,
  MoreHorizontal,
  DollarSign,
  Trash2,
  Pencil,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  Loader2,
  LayoutList,
  FolderTree,
  SlidersHorizontal,
  User as UserIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import type { Transaction, SubAccount, Account, CategoryData, UserSettings } from "@/lib/types";
import { CategoryBreakdown } from "./category-breakdown";
import { TransactionNotes, parseCcPaymentDetails, isCcPaymentNotes } from "./transaction-notes";

// Color config per transaction type
const typeConfig = {
  income: {
    color: "#10B981",
    bgLight: "#ECFDF5",
    bgDark: "rgba(16,185,129,0.1)",
    borderClass: "border-l-emerald-500",
    textClass: "text-emerald-600",
    badgeBg: "bg-emerald-50 dark:bg-emerald-900/30",
    badgeText: "text-emerald-600 dark:text-emerald-400",
    label: "Ingreso",
    icon: ArrowUpRight,
  },
  expense: {
    color: "#EF4444",
    bgLight: "#FEF2F2",
    bgDark: "rgba(239,68,68,0.1)",
    borderClass: "border-l-red-500",
    textClass: "text-red-500",
    badgeBg: "bg-red-50 dark:bg-red-900/30",
    badgeText: "text-red-500 dark:text-red-400",
    label: "Gasto",
    icon: ArrowDownRight,
  },
  transfer: {
    color: "#3B82F6",
    bgLight: "#EFF6FF",
    bgDark: "rgba(59,130,246,0.1)",
    borderClass: "border-l-blue-500",
    textClass: "text-blue-500",
    badgeBg: "bg-blue-50 dark:bg-blue-900/30",
    badgeText: "text-blue-500 dark:text-blue-400",
    label: "Transferencia",
    icon: Repeat,
  },
} as const;

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

function groupByDate(transactions: Transaction[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: { label: string; transactions: Transaction[] }[] = [
    { label: "Hoy", transactions: [] },
    { label: "Ayer", transactions: [] },
    { label: "Esta Semana", transactions: [] },
    { label: "Anterior", transactions: [] },
  ];

  for (const tx of transactions) {
    const txDay = parseLocalDate(tx.date);
    const txLocal = new Date(txDay.getFullYear(), txDay.getMonth(), txDay.getDate());

    if (txLocal.getTime() === today.getTime()) {
      groups[0].transactions.push(tx);
    } else if (txLocal.getTime() === yesterday.getTime()) {
      groups[1].transactions.push(tx);
    } else if (txLocal >= weekAgo) {
      groups[2].transactions.push(tx);
    } else {
      groups[3].transactions.push(tx);
    }
  }

  return groups.filter((g) => g.transactions.length > 0);
}

// Cycle date calculator — all dates in Colombia timezone (UTC-5)
// Creates Date objects at midnight Colombia (05:00 UTC) so that
// toColombiaDateString() returns the correct date regardless of browser timezone
function getCycleDates(cutoffDay: number, offset: number = 0) {
  const now = new Date();
  // Get current date in Colombia as numbers (colMonth is 1-based)
  const colombiaDateStr = now.toLocaleDateString("sv-SE", { timeZone: "America/Bogota" });
  const [colYear, colMonth, colDay] = colombiaDateStr.split("-").map(Number);

  // Reference month with offset (1-based)
  let refYear = colYear;
  let refMonth = colMonth + offset;
  while (refMonth > 12) { refMonth -= 12; refYear++; }
  while (refMonth < 1) { refMonth += 12; refYear--; }

  // Determine the actual start month
  let startYear = refYear;
  let startMonth = refMonth; // 1-based
  const refMaxDay = new Date(refYear, refMonth, 0).getDate();
  const startDay = Math.min(cutoffDay, refMaxDay);

  // If current Colombia day is before cutoff and no offset, go to previous month
  if (offset <= 0 && colDay < startDay) {
    startMonth--;
    if (startMonth < 1) { startMonth = 12; startYear--; }
  }

  // Compute start date
  const startMaxDay = new Date(startYear, startMonth, 0).getDate();
  const actualStartDay = Math.min(cutoffDay, startMaxDay);

  // Compute end date = day before cutoff of next month
  let endMonth = startMonth + 1;
  let endYear = startYear;
  if (endMonth > 12) { endMonth = 1; endYear++; }
  const endMaxDay = new Date(endYear, endMonth, 0).getDate();
  const endCutoffDay = Math.min(cutoffDay, endMaxDay);
  // Use JS day arithmetic (day 0 = last day of previous month) to handle cutoffDay=1
  const endDateObj = new Date(endYear, endMonth - 1, endCutoffDay - 1);
  const endYearActual = endDateObj.getFullYear();
  const endMonthActual = endDateObj.getMonth() + 1;
  const endDayActual = endDateObj.getDate();

  // Create as midnight Colombia (05:00 UTC) for correct timezone conversion
  const start = new Date(Date.UTC(startYear, startMonth - 1, actualStartDay, 5, 0, 0, 0));
  const end = new Date(Date.UTC(endYearActual, endMonthActual - 1, endDayActual, 5, 0, 0, 0));

  return { start, end };
}

function formatCycleLabel(start: Date, end: Date): string {
  const startStr = start.toLocaleDateString("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });
  const endStr = end.toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Bogota" });
  return `${startStr} - ${endStr}`;
}

function formatDayMonth(dateStr: string): { day: string; month: string } {
  const d = parseLocalDate(dateStr);
  return {
    day: d.getDate().toString(),
    month: d.toLocaleDateString("es-CO", { month: "short" }),
  };
}

interface TransactionListProps {
  accountId?: string;
}

type ViewMode = "list" | "category";

export function TransactionList({ accountId }: TransactionListProps) {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Cycle navigator
  const [cycleOffset, setCycleOffset] = useState(0);
  const [budgetCutoffDay, setBudgetCutoffDay] = useState(1);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Pagination
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [allTransactions, setAllTransactions] = useState<Transaction[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  // Enhanced search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterAccountId, setFilterAccountId] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterMinAmount, setFilterMinAmount] = useState("");
  const [filterMaxAmount, setFilterMaxAmount] = useState("");

  // Edit form state
  const [editType, setEditType] = useState<string>("expense");
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAccountId, setEditAccountId] = useState("");
  const [editSubAccountId, setEditSubAccountId] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Categories from API
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [allCategories, setAllCategories] = useState<Record<string, CategoryData[]>>({ income: [], expense: [] });

  // Helper: check if a transaction is a CC payment (expandable with installment details)
  const isCcPayment = (tx: Transaction) =>
    tx.type === "transfer" && (tx.category === "Pago Tarjeta de Crédito" || isCcPaymentNotes(tx.notes));

  // Fetch user settings for budgetCutoffDay
  const fetchSettings = useCallback(async () => {
    try {
      const data = await apiFetch<UserSettings>("/api/settings");
      setBudgetCutoffDay(data.budgetCutoffDay || 1);
    } catch (error) {
      console.error("Error fetching settings:", error);
    } finally {
      setSettingsLoaded(true);
    }
  }, []);

  const fetchTransactions = useCallback(async (cursor?: string, append: boolean = false) => {
    try {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      const cycle = getCycleDates(budgetCutoffDay, cycleOffset);
      const startDateStr = toColombiaDateString(cycle.start);
      const endDateStr = toColombiaDateString(cycle.end);

      const params = new URLSearchParams();
      params.set("startDate", startDateStr);
      params.set("endDate", endDateStr);
      if (accountId) params.set("accountId", accountId);
      if (cursor) params.set("cursor", cursor);
      params.set("pageSize", "50");

      const data = await apiFetch<{ transactions: Transaction[]; nextCursor: string | null }>(
        `/api/transactions?${params.toString()}`
      );

      if (append) {
        setAllTransactions((prev) => [...prev, ...data.transactions]);
      } else {
        setAllTransactions(data.transactions);
      }
      setNextCursor(data.nextCursor);
      setTransactions(data.transactions);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [accountId, budgetCutoffDay, cycleOffset]);

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await apiFetch<Account[]>("/api/accounts");
      setAccounts(data);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await apiFetch<Record<string, CategoryData[]>>(`/api/categories`);
      setAllCategories(data);
      setCategories(data[editType] || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, [editType]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settingsLoaded) {
      fetchTransactions();
    }
  }, [fetchTransactions, settingsLoaded]);

  useEffect(() => {
    fetchAccounts();
    fetchCategories();
  }, [fetchAccounts, fetchCategories]);

  // When editType changes, update categories
  useEffect(() => {
    setCategories(allCategories[editType] || []);
  }, [editType, allCategories]);

  const handleLoadMore = () => {
    if (nextCursor) {
      fetchTransactions(nextCursor, true);
    }
  };

  const handleExpandTx = (tx: Transaction) => {
    if (expandedTxId === tx.id) {
      setExpandedTxId(null);
      setEditingTxId(null);
    } else {
      setExpandedTxId(tx.id);
      setEditingTxId(null);
      setEditType(tx.type);
      setEditAmount(tx.amount.toString());
      setEditDescription(tx.description);
      setEditAccountId(tx.accountId || "");
      setEditSubAccountId(tx.subAccountId || "");
      setEditCategory(tx.category || "");
      setEditSubCategory(tx.subCategory || "");
      setEditDate(tx.date ? toColombiaDateString(tx.date) : "");
      setEditNotes(tx.notes || "");
    }
  };

  const handleStartEdit = () => {
    setEditingTxId(expandedTxId);
  };

  const handleCancelEdit = () => {
    setEditingTxId(null);
    const tx = allTransactions.find((t) => t.id === expandedTxId);
    if (tx) {
      setEditType(tx.type);
      setEditAmount(tx.amount.toString());
      setEditDescription(tx.description);
      setEditAccountId(tx.accountId || "");
      setEditSubAccountId(tx.subAccountId || "");
      setEditCategory(tx.category || "");
      setEditSubCategory(tx.subCategory || "");
      setEditDate(tx.date ? toColombiaDateString(tx.date) : "");
      setEditNotes(tx.notes || "");
    }
  };

  const handleSaveEdit = async () => {
    if (!expandedTxId || !editAmount || !editDescription) return;
    setSaving(true);
    try {
      await apiFetch(`/api/transactions/${expandedTxId}`, {
        method: "PUT",
        body: JSON.stringify({
          type: editType,
          amount: parseFloat(editAmount),
          description: editDescription,
          accountId: editAccountId || null,
          subAccountId: editSubAccountId || null,
          category: editType !== "transfer" ? (editCategory || "Otros") : null,
          subCategory: editType !== "transfer" ? (editSubCategory || null) : null,
          date: editDate,
          notes: editNotes || null,
        }),
      });
      toast.success("Transacción actualizada");
      setEditingTxId(null);
      fetchTransactions();
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast.error("Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTx = async (txId: string) => {
    try {
      await apiFetch(`/api/transactions/${txId}`, { method: "DELETE" });
      toast.success("Transacción eliminada");
      setExpandedTxId(null);
      fetchTransactions();
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Error al eliminar");
    }
    setShowDeleteDialog(null);
  };

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterType !== "all") count++;
    if (filterAccountId !== "all") count++;
    if (filterCategory !== "all") count++;
    if (filterMinAmount) count++;
    if (filterMaxAmount) count++;
    return count;
  }, [filterType, filterAccountId, filterCategory, filterMinAmount, filterMaxAmount]);

  // Client-side filtering
  const filteredTransactions = useMemo(() => {
    return allTransactions.filter((tx) => {
      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesDesc = tx.description.toLowerCase().includes(query);
        const matchesCat = (tx.category || "").toLowerCase().includes(query);
        const matchesSub = (tx.subCategory || "").toLowerCase().includes(query);
        const matchesAmount = !isNaN(Number(query)) && Math.abs(tx.amount) === Number(query);
        if (!matchesDesc && !matchesCat && !matchesSub && !matchesAmount) return false;
      }

      // Type filter
      if (filterType !== "all" && tx.type !== filterType) return false;

      // Account filter
      if (filterAccountId !== "all" && tx.accountId !== filterAccountId) return false;

      // Category filter
      if (filterCategory !== "all" && tx.category !== filterCategory) return false;

      // Amount range
      if (filterMinAmount && tx.amount < parseFloat(filterMinAmount)) return false;
      if (filterMaxAmount && tx.amount > parseFloat(filterMaxAmount)) return false;

      return true;
    });
  }, [allTransactions, searchQuery, filterType, filterAccountId, filterCategory, filterMinAmount, filterMaxAmount]);

  // Available categories for filter
  const filterCategoryOptions = useMemo(() => {
    const catSet = new Set<string>();
    allTransactions.forEach((tx) => {
      if (tx.category) catSet.add(tx.category);
    });
    return Array.from(catSet).sort();
  }, [allTransactions]);

  const cycle = getCycleDates(budgetCutoffDay, cycleOffset);
  const groups = groupByDate(filteredTransactions);
  const selectedAccount = accounts.find((a) => a.id === editAccountId);
  const subAccounts = selectedAccount?.subAccounts || [];
  const currentCategoryData = categories.find((c) => c.name === editCategory);
  const availableSubCategories = currentCategoryData?.subcategories || [];

  if (loading || !settingsLoaded) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (allTransactions.length === 0 && !searchQuery) {
    return (
      <Card className="border-0 shadow-sm rounded-2xl bg-gray-50 dark:bg-gray-800/50">
        <CardContent className="p-6 text-center">
          <Receipt className="size-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Sin transacciones en este ciclo</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cycle Navigator + View Mode Toggle */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-1 py-1">
          <button
            onClick={() => setCycleOffset((prev) => prev - 1)}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeft className="size-4 text-gray-600 dark:text-gray-300" />
          </button>
          <span className="text-xs font-medium text-gray-900 dark:text-gray-100 min-w-[140px] text-center px-1">
            {formatCycleLabel(cycle.start, cycle.end)}
          </span>
          <button
            onClick={() => setCycleOffset((prev) => Math.min(prev + 1, 0))}
            disabled={cycleOffset >= 0}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-30"
          >
            <ChevronRight className="size-4 text-gray-600 dark:text-gray-300" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm px-1 py-1">
            <button
              onClick={() => setViewMode("list")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "list"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <LayoutList className="size-3" />
              Lista
            </button>
            <button
              onClick={() => setViewMode("category")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                viewMode === "category"
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <FolderTree className="size-3" />
              Por Categoría
            </button>
          </div>

        </div>
      </div>

      {/* Category Breakdown View */}
      {viewMode === "category" ? (
        <CategoryBreakdown transactions={filteredTransactions} />
      ) : (
        <>
          {/* Enhanced Search & Filters */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Filter className="size-4 text-gray-400" />
                </div>
                <Input
                  placeholder="Buscar descripción, categoría, monto..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 rounded-xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <X className="size-4 text-gray-400" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className={`rounded-xl relative ${
                  showFilters
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-900/20"
                    : "border-gray-200 dark:border-gray-700"
                }`}
                onClick={() => setShowFilters(!showFilters)}
              >
                <SlidersHorizontal className="size-4" />
                {activeFilterCount > 0 && (
                  <Badge className="absolute -top-1.5 -right-1.5 size-4 p-0 flex items-center justify-center text-[8px] bg-emerald-500 text-white border-0">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
            </div>

            {/* Advanced Filters Panel */}
            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <Card className="border border-gray-200 dark:border-gray-700 shadow-none rounded-xl">
                    <CardContent className="p-3 space-y-2.5">
                      {/* Type filter buttons */}
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">Tipo</Label>
                        <div className="flex gap-1">
                          {[
                            { value: "all", label: "Todos" },
                            { value: "income", label: "Ingreso" },
                            { value: "expense", label: "Gasto" },
                            { value: "transfer", label: "Transferencia" },
                          ].map((opt) => (
                            <button
                              key={opt.value}
                              onClick={() => setFilterType(opt.value)}
                              className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                                filterType === opt.value
                                  ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700"
                                  : "bg-gray-50 dark:bg-gray-800 text-gray-400 border border-transparent"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Account filter */}
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">Cuenta</Label>
                        <Select value={filterAccountId} onValueChange={setFilterAccountId}>
                          <SelectTrigger className="rounded-lg h-8 text-xs">
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas las cuentas</SelectItem>
                            {accounts.map((acc) => (
                              <SelectItem key={acc.id} value={acc.id}>
                                <div className="flex items-center gap-2">
                                  <div className="size-2.5 rounded-full" style={{ backgroundColor: acc.color }} />
                                  <span>{acc.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Category filter */}
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">Categoría</Label>
                        <Select value={filterCategory} onValueChange={setFilterCategory}>
                          <SelectTrigger className="rounded-lg h-8 text-xs">
                            <SelectValue placeholder="Todas" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Todas las categorías</SelectItem>
                            {filterCategoryOptions.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Amount range */}
                      <div className="space-y-1">
                        <Label className="text-[10px] text-gray-500">Rango de monto</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder="Mín"
                            value={filterMinAmount}
                            onChange={(e) => setFilterMinAmount(e.target.value)}
                            className="rounded-lg h-8 text-xs"
                          />
                          <Input
                            type="number"
                            placeholder="Máx"
                            value={filterMaxAmount}
                            onChange={(e) => setFilterMaxAmount(e.target.value)}
                            className="rounded-lg h-8 text-xs"
                          />
                        </div>
                      </div>

                      {/* Clear filters */}
                      {activeFilterCount > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full rounded-xl text-xs text-gray-500"
                          onClick={() => {
                            setFilterType("all");
                            setFilterAccountId("all");
                            setFilterCategory("all");
                            setFilterMinAmount("");
                            setFilterMaxAmount("");
                          }}
                        >
                          <X className="size-3 mr-1" />
                          Limpiar filtros ({activeFilterCount})
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Transaction List */}
          {filteredTransactions.length === 0 ? (
            <Card className="border-0 shadow-sm rounded-2xl bg-gray-50 dark:bg-gray-800/50">
              <CardContent className="p-6 text-center">
                <Receipt className="size-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  {searchQuery || activeFilterCount > 0
                    ? "Sin resultados para los filtros aplicados"
                    : "Sin transacciones"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {groups.map((group) => (
                <div key={group.label}>
                  <h4 className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                    {group.label}
                  </h4>
                  <div className="space-y-2">
                    {group.transactions.map((tx) => {
                      const txType = (tx.type as keyof typeof typeConfig) || "expense";
                      const config = typeConfig[txType] || typeConfig.expense;
                      const Icon = categoryIcons[tx.category || ""] || config.icon;
                      const isExpanded = expandedTxId === tx.id;
                      const isEditing = editingTxId === tx.id;
                      const { day, month } = formatDayMonth(tx.date);

                      return (
                        <motion.div
                          key={tx.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden"
                          style={{
                            borderLeft: `4px solid ${config.color}`,
                          }}
                        >
                          {/* Main Row - Clickable */}
                          <button
                            onClick={() => handleExpandTx(tx)}
                            className="w-full flex items-center justify-between p-3 text-left"
                          >
                            {/* Date Column */}
                            <div className="w-10 shrink-0 flex flex-col items-center justify-center mr-2">
                              <span className="text-sm font-bold text-gray-700 dark:text-gray-300 leading-none">
                                {day}
                              </span>
                              <span className="text-[10px] text-gray-400 leading-none mt-0.5">
                                {month}
                              </span>
                            </div>

                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className="size-9 rounded-xl flex items-center justify-center shrink-0"
                                style={{ backgroundColor: config.bgLight }}
                              >
                                <Icon
                                  className="size-4"
                                  style={{ color: config.color }}
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {tx.description}
                                </p>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.badgeBg} ${config.badgeText}`}
                                  >
                                    {config.label}
                                  </span>
                                  <span className="text-[10px] text-gray-400">
                                    {tx.category || ""}
                                  </span>
                                  {tx.account && (
                                    <>
                                      <span className="text-[10px] text-gray-300">·</span>
                                      <div className="flex items-center gap-0.5">
                                        <div
                                          className="size-1.5 rounded-full"
                                          style={{ backgroundColor: tx.account.color }}
                                        />
                                        <span className="text-[10px] text-gray-400">
                                          {tx.account.name}
                                        </span>
                                      </div>
                                    </>
                                  )}
                                  {tx.user && tx.user.name && tx.userId && tx.userId !== session?.user?.id && (
                                    <>
                                      <span className="text-[10px] text-gray-300">·</span>
                                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-0.5">
                                        <UserIcon className="size-2.5" />
                                        {tx.user.name}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 ml-2">
                              <span
                                className="text-sm font-bold"
                                style={{ color: config.color }}
                              >
                                {tx.type === "income" ? "+" : tx.type === "transfer" ? "↔" : "-"}
                                {formatCurrency(Math.abs(tx.amount))}
                              </span>
                              <motion.div
                                animate={{ rotate: isExpanded ? 180 : 0 }}
                                transition={{ duration: 0.2 }}
                              >
                                <ChevronDown className="size-4 text-gray-300" />
                              </motion.div>
                            </div>
                          </button>

                          {/* Expanded Detail */}
                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="border-t border-gray-100 dark:border-gray-700">
                                  {!isEditing ? (
                                    /* Detail View */
                                    <div className="p-4 space-y-3">
                                      {/* Detail Grid */}
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Tipo</span>
                                          <span className={`block text-xs font-medium ${config.badgeText}`}>
                                            {config.label}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Monto</span>
                                          <span className="block text-xs font-bold" style={{ color: config.color }}>
                                            {tx.type === "income" ? "+" : "-"}
                                            {formatCurrency(Math.abs(tx.amount))}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Categoría</span>
                                          <span className="block text-xs text-gray-700 dark:text-gray-300">
                                            {tx.category || "Sin categoría"}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-[10px] text-gray-400 uppercase tracking-wider">Fecha</span>
                                          <span className="block text-xs text-gray-700 dark:text-gray-300">
                                            {formatDate(tx.date)}
                                          </span>
                                        </div>
                                        {tx.account && (
                                          <div>
                                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Cuenta</span>
                                            <div className="flex items-center gap-1.5">
                                              <div className="size-2 rounded-full" style={{ backgroundColor: tx.account.color }} />
                                              <span className="text-xs text-gray-700 dark:text-gray-300">{tx.account.name}</span>
                                            </div>
                                          </div>
                                        )}
                                        {tx.subAccount && (
                                          <div>
                                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Bolsillo</span>
                                            <span className="text-xs text-gray-700 dark:text-gray-300">
                                              {tx.subAccount.name}
                                            </span>
                                          </div>
                                        )}
                                        {tx.user && tx.user.name && tx.userId && tx.userId !== session?.user?.id && (
                                          <div>
                                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Creado por</span>
                                            <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                                              <UserIcon className="size-3" />
                                              {tx.user.name}
                                            </span>
                                          </div>
                                        )}
                                        {tx.type === "transfer" && tx.transferToAccount && (
                                          <div>
                                            <span className="text-[10px] text-gray-400 uppercase tracking-wider">Hacia</span>
                                            <div className="flex items-center gap-1.5">
                                              <div className="size-2 rounded-full" style={{ backgroundColor: tx.transferToAccount.color }} />
                                              <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                                                {tx.transferToAccount.name}
                                              </span>
                                            </div>
                                          </div>
                                        )}
                                        {tx.notes && !isCcPayment(tx) && (
                                          <TransactionNotes notes={tx.notes} size="md" />
                                        )}
                                      </div>

                                      {/* CC Payment Installment Details */}
                                      {isCcPayment(tx) && tx.notes && (
                                        <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                          <TransactionNotes notes={tx.notes} isCcPayment size="md" />
                                        </div>
                                      )}

                                      {/* Action Buttons */}
                                      <div className="flex gap-2 pt-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="flex-1 rounded-xl text-xs h-9"
                                          onClick={handleStartEdit}
                                        >
                                          <Pencil className="size-3 mr-1" />
                                          Editar
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="flex-1 rounded-xl text-xs h-9 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300 hover:bg-red-50"
                                          onClick={() => setShowDeleteDialog(tx.id)}
                                        >
                                          <Trash2 className="size-3 mr-1" />
                                          Eliminar
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Edit Form */
                                    <div className="p-4 space-y-3 bg-gray-50/50 dark:bg-gray-800/50">
                                      <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                          Editar Transacción
                                        </span>
                                        <button
                                          onClick={handleCancelEdit}
                                          className="size-6 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center"
                                        >
                                          <X className="size-3.5 text-gray-400" />
                                        </button>
                                      </div>

                                      {/* Type Selector */}
                                      <div className="flex gap-1.5">
                                        {(["income", "expense", "transfer"] as const).map((t) => {
                                          const tConfig = typeConfig[t];
                                          const TIcon = tConfig.icon;
                                          const isActive = editType === t;
                                          return (
                                            <button
                                              key={t}
                                              onClick={() => {
                                                setEditType(t);
                                                setEditCategory("");
                                              }}
                                              className={`flex-1 py-2 rounded-lg text-[10px] font-medium flex items-center justify-center gap-1 transition-all ${
                                                isActive
                                                  ? `${tConfig.badgeBg} ${tConfig.badgeText} border`
                                                  : "bg-white dark:bg-gray-800 text-gray-400 border border-transparent"
                                              }`}
                                              style={isActive ? { borderColor: tConfig.color } : {}}
                                            >
                                              <TIcon className="size-3" />
                                              {tConfig.label}
                                            </button>
                                          );
                                        })}
                                      </div>

                                      {/* Amount */}
                                      <div className="space-y-1">
                                        <Label className="text-[10px]">Monto</Label>
                                        <CurrencyInput
                                          value={editAmount}
                                          onChange={setEditAmount}
                                          showPrefix
                                          placeholder="0"
                                          className="text-sm font-bold rounded-lg h-10"
                                        />
                                      </div>

                                      {/* Description */}
                                      <div className="space-y-1">
                                        <Label className="text-[10px]">Descripción</Label>
                                        <Input
                                          value={editDescription}
                                          onChange={(e) => setEditDescription(e.target.value)}
                                          className="rounded-lg h-9 text-sm"
                                        />
                                      </div>

                                      {/* Account */}
                                      <div className="space-y-1">
                                        <Label className="text-[10px]">Cuenta</Label>
                                        <Select value={editAccountId} onValueChange={(v) => { setEditAccountId(v); setEditSubAccountId(""); }}>
                                          <SelectTrigger className="rounded-lg h-9 text-sm">
                                            <SelectValue placeholder="Seleccionar" />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {accounts.map((acc) => (
                                              <SelectItem key={acc.id} value={acc.id}>
                                                <div className="flex items-center gap-2">
                                                  <div className="size-2.5 rounded-full" style={{ backgroundColor: acc.color }} />
                                                  <span>{acc.name}</span>
                                                </div>
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>

                                      {/* Sub-account (if available) */}
                                      {subAccounts.length > 0 && (
                                        <div className="space-y-1">
                                          <Label className="text-[10px]">Bolsillo</Label>
                                          <Select value={editSubAccountId || "none"} onValueChange={(v) => setEditSubAccountId(v === "none" ? "" : v)}>
                                            <SelectTrigger className="rounded-lg h-9 text-sm">
                                              <SelectValue placeholder="Principal" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="none">Cuenta principal</SelectItem>
                                              {subAccounts.map((sub) => (
                                                <SelectItem key={sub.id} value={sub.id}>
                                                  {sub.name}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      )}

                                      {/* Category */}
                                      {editType !== "transfer" && (
                                        <div className="space-y-1">
                                          <Label className="text-[10px]">Categoría</Label>
                                          <Select value={editCategory} onValueChange={(v) => { setEditCategory(v); setEditSubCategory(""); }}>
                                            <SelectTrigger className="rounded-lg h-9 text-sm">
                                              <SelectValue placeholder="Seleccionar" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {categories.map((cat) => (
                                                <SelectItem key={cat.name} value={cat.name}>
                                                  {cat.name}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      )}

                                      {/* SubCategory */}
                                      {editType !== "transfer" && editCategory && (
                                        <div className="space-y-1">
                                          <Label className="text-[10px]">Subcategoría</Label>
                                          {availableSubCategories.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mb-1">
                                              {availableSubCategories.map((sub) => (
                                                <button
                                                  key={sub}
                                                  onClick={() => setEditSubCategory(sub === editSubCategory ? "" : sub)}
                                                  className={`px-2 py-0.5 rounded-md text-[9px] font-medium transition-all ${
                                                    sub === editSubCategory
                                                      ? "bg-emerald-100 text-emerald-700 border border-emerald-300"
                                                      : "bg-gray-100 text-gray-500 border border-transparent hover:bg-gray-200"
                                                  }`}
                                                >
                                                  {sub}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                          <Input
                                            value={editSubCategory}
                                            onChange={(e) => setEditSubCategory(e.target.value)}
                                            placeholder="Opcional..."
                                            className="rounded-lg h-8 text-xs"
                                          />
                                        </div>
                                      )}

                                      {/* Date */}
                                      <div className="space-y-1">
                                        <Label className="text-[10px]">Fecha</Label>
                                        <Input
                                          type="date"
                                          value={editDate}
                                          onChange={(e) => setEditDate(e.target.value)}
                                          className="rounded-lg h-9 text-sm"
                                        />
                                      </div>

                                      {/* Notes */}
                                      <div className="space-y-1">
                                        <Label className="text-[10px]">Notas</Label>
                                        <Input
                                          value={editNotes}
                                          onChange={(e) => setEditNotes(e.target.value)}
                                          placeholder="Opcional..."
                                          className="rounded-lg h-9 text-sm"
                                        />
                                      </div>

                                      {/* Save / Cancel */}
                                      <div className="flex gap-2 pt-1">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="flex-1 rounded-xl text-xs h-9"
                                          onClick={handleCancelEdit}
                                          disabled={saving}
                                        >
                                          Cancelar
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="flex-1 rounded-xl text-xs h-9 text-white"
                                          style={{ backgroundColor: config.color }}
                                          onClick={handleSaveEdit}
                                          disabled={saving || !editAmount || !editDescription}
                                        >
                                          {saving ? (
                                            <Loader2 className="size-3 animate-spin mr-1" />
                                          ) : (
                                            <Check className="size-3 mr-1" />
                                          )}
                                          Guardar
                                        </Button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Load More Button */}
              {nextCursor && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl text-xs"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <Loader2 className="size-3.5 animate-spin mr-1.5" />
                    ) : null}
                    Cargar más
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Delete Transaction Dialog */}
      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar transacción?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const tx = allTransactions.find((t) => t.id === showDeleteDialog);
                if (tx?.isTransferCounterpart) {
                  return "Esta transacción es parte de una transferencia. Al eliminarla, también se eliminará la transacción en la cuenta origen y se ajustarán ambos balances. Esta acción no se puede deshacer.";
                }
                if (tx?.type === "transfer") {
                  return "Esta es una transferencia. Al eliminarla, también se eliminará el registro en la cuenta destino y se ajustarán ambos balances. Esta acción no se puede deshacer.";
                }
                return "Se eliminará esta transacción y se ajustará el balance de la cuenta. Esta acción no se puede deshacer.";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-500 hover:bg-red-600"
              onClick={() => showDeleteDialog && handleDeleteTx(showDeleteDialog)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
