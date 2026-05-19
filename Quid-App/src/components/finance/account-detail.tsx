"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import { apiFetch, formatCurrency, formatDate, parseLocalDate, toColombiaDateString, calculateProportionalYield, getDaysInMonth } from "@/lib/api";
import { useLocalSingleQuery } from "@/lib/local/hooks/queries";
import { AccountCard } from "./account-card";
import { AccountForm } from "./account-form";
import { SubAccountForm } from "./sub-account-form";
import { TransactionForm } from "./transaction-form";
import { CategoryBreakdown } from "./category-breakdown";
import { SharedAccountManager } from "./shared-account-manager";
import { TransactionNotes } from "./transaction-notes";
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
  Plus,
  ArrowLeft,
  TrendingUp,
  Users,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  Repeat,
  ChevronDown,
  X,
  Check,
  Loader2,
  DollarSign,
  Filter,
  SlidersHorizontal,
  LayoutList,
  FolderTree,
  Receipt,
  User as UserIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
import type { Account, SubAccount, Transaction, CategoryData, UserSettings } from "@/lib/types";

// Color config per transaction type
const typeConfig = {
  income: {
    color: "#10B981",
    bgLight: "#ECFDF5",
    bgDark: "rgba(16,185,129,0.1)",
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
    textClass: "text-blue-500",
    badgeBg: "bg-blue-50 dark:bg-blue-900/30",
    badgeText: "text-blue-500 dark:text-blue-400",
    label: "Transferencia",
    icon: Repeat,
  },
} as const;



const subTypeLabels: Record<string, string> = {
  pocket: "Bolsillo",
  piggy_bank: "Alcancía",
  savings_box: "Cajita",
  other: "Otro",
};

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

export function AccountDetail() {
  const { data: session } = useSession();
  const { setFinanceSubView } = useAppStore();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [showSubAccountForm, setShowSubAccountForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSubDeleteDialog, setShowSubDeleteDialog] = useState<string | null>(null);
  const [showTxDeleteDialog, setShowTxDeleteDialog] = useState<string | null>(null);
  const [editingSubAccount, setEditingSubAccount] = useState<SubAccount | null>(null);
  const [expandedSubAccount, setExpandedSubAccount] = useState<string | null>(null);
  const [subTransactions, setSubTransactions] = useState<Record<string, Transaction[]>>({});
  const [cashbackMode, setCashbackMode] = useState(false);

  // Inline edit state
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editType, setEditType] = useState("expense");
  const [editAmount, setEditAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editSubCategory, setEditSubCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");

  // Categories from API
  const [categories, setCategories] = useState<CategoryData[]>([]);

  // Cycle navigator
  const [cycleOffset, setCycleOffset] = useState(0);
  const [budgetCutoffDay, setBudgetCutoffDay] = useState(1);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Pagination
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterMinAmount, setFilterMinAmount] = useState("");
  const [filterMaxAmount, setFilterMaxAmount] = useState("");

  // View mode
  const [viewMode, setViewMode] = useState<"list" | "category">("list");

  const [selectedAccountId] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("selectedAccountId");
    }
    return null;
  });

  const { data: account, refetch: fetchAccount } = useLocalSingleQuery<Account>(
    selectedAccountId ? `/api/accounts/${selectedAccountId}` : "",
    selectedAccountId,
    "accounts"
  );

  // Fetch user settings for budgetCutoffDay
  useEffect(() => {
    apiFetch<UserSettings>("/api/settings")
      .then((data) => setBudgetCutoffDay(data.budgetCutoffDay || 1))
      .catch(console.error)
      .finally(() => setSettingsLoaded(true));
  }, []);

  // Fetch transactions with cycle + pagination
  const fetchTransactions = useCallback(async (cursor?: string, append = false) => {
    if (!selectedAccountId) return;
    if (!append) setLoadingMore(false);
    else setLoadingMore(true);

    const cycle = getCycleDates(budgetCutoffDay, cycleOffset);
    const params = new URLSearchParams();
    params.set("accountId", selectedAccountId);
    params.set("startDate", toColombiaDateString(cycle.start));
    params.set("endDate", toColombiaDateString(cycle.end));
    if (cursor) params.set("cursor", cursor);
    params.set("pageSize", "50");

    try {
      const data = await apiFetch<{ transactions: Transaction[]; nextCursor: string | null }>(
        `/api/transactions?${params}`
      );
      if (append) {
        setTransactions((prev) => [...prev, ...data.transactions]);
      } else {
        setTransactions(data.transactions);
      }
      setNextCursor(data.nextCursor);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    }
  }, [selectedAccountId, budgetCutoffDay, cycleOffset]);

  // Fetch transactions when settings are loaded or cycle changes
  useEffect(() => {
    if (settingsLoaded && selectedAccountId) {
      fetchTransactions();
    }
  }, [fetchTransactions, settingsLoaded, selectedAccountId]);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await apiFetch<Record<string, CategoryData[]>>(`/api/categories?type=${editType}`);
      setCategories(data[editType] || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, [editType]);

  useEffect(() => {
    let cancelled = false;
    fetchCategories().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchCategories]);

  const fetchSubTransactions = useCallback(async (subAccountId: string) => {
    try {
      const cycle = getCycleDates(budgetCutoffDay, cycleOffset);
      const params = new URLSearchParams();
      params.set("subAccountId", subAccountId);
      params.set("startDate", toColombiaDateString(cycle.start));
      params.set("endDate", toColombiaDateString(cycle.end));
      const data = await apiFetch<{ transactions: Transaction[]; nextCursor: string | null }>(`/api/transactions?${params}`);
      setSubTransactions((prev) => ({ ...prev, [subAccountId]: data.transactions ?? [] }));
    } catch (error) {
      console.error("Error fetching sub-account transactions:", error);
    }
  }, [budgetCutoffDay, cycleOffset]);

  // Re-fetch sub-account transactions when cycle changes
  useEffect(() => {
    if (expandedSubAccount) {
      fetchSubTransactions(expandedSubAccount);
    }
  }, [fetchSubTransactions, expandedSubAccount]);

  const handleExpandSubAccount = (subId: string) => {
    if (expandedSubAccount === subId) {
      setExpandedSubAccount(null);
    } else {
      setExpandedSubAccount(subId);
      fetchSubTransactions(subId);
    }
  };

  const handleDeleteSubAccount = async (subId: string) => {
    try {
      await apiFetch(`/api/accounts/${account!.id}/sub-accounts/${subId}`, {
        method: "DELETE",
      });
      toast.success("Bolsillo eliminado");
      fetchAccount();
    } catch (error) {
      console.error("Error deleting sub-account:", error);
      toast.error("Error al eliminar bolsillo");
    }
    setShowSubDeleteDialog(null);
  };

  const handleDeleteTransaction = async (txId: string) => {
    try {
      await apiFetch(`/api/transactions/${txId}`, { method: "DELETE" });
      toast.success("Transacción eliminada");
      fetchAccount();
      // Refresh transactions list
      fetchTransactions();
      // Refresh sub-transactions for any expanded sub-account
      if (expandedSubAccount) {
        fetchSubTransactions(expandedSubAccount);
      }
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Error al eliminar transacción");
    }
    setShowTxDeleteDialog(null);
  };

  // Inline edit handlers
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
      setEditCategory(tx.category || "");
      setEditSubCategory(tx.subCategory || "");
      setEditDate(tx.date ? toColombiaDateString(tx.date) : "");
      setEditNotes(tx.notes || "");
    }
  };

  // Helper: find a transaction across main and sub-account lists
  const findTransactionById = (id: string | null) => {
    if (!id) return null;
    return transactions.find((t) => t.id === id)
      || Object.values(subTransactions).flat().find((t) => t.id === id);
  };

  const handleCancelEdit = () => {
    setEditingTxId(null);
    const tx = findTransactionById(expandedTxId);
    if (tx) {
      setEditType(tx.type);
      setEditAmount(tx.amount.toString());
      setEditDescription(tx.description);
      setEditCategory(tx.category || "");
      setEditSubCategory(tx.subCategory || "");
      setEditDate(tx.date ? toColombiaDateString(tx.date) : "");
    }
  };

  const handleSaveEdit = async () => {
    if (!expandedTxId || !editAmount || !editDescription) return;
    setSaving(true);
    try {
      const originalTx = findTransactionById(expandedTxId);
      await apiFetch(`/api/transactions/${expandedTxId}`, {
        method: "PUT",
        body: JSON.stringify({
          type: editType,
          amount: parseFloat(editAmount),
          description: editDescription,
          accountId: originalTx?.accountId || account?.id || null,
          subAccountId: originalTx?.subAccountId || null,
          category: editType !== "transfer" ? (editCategory || "Otros") : null,
          subCategory: editType !== "transfer" ? (editSubCategory || null) : null,
          date: editDate,
          notes: editNotes || null,
        }),
      });
      toast.success("Transacción actualizada");
      setEditingTxId(null);
      setExpandedTxId(null);
      fetchAccount();
      fetchTransactions();
      // Refresh sub-transactions if editing a sub-account tx
      if (expandedSubAccount) {
        fetchSubTransactions(expandedSubAccount);
      }
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast.error("Error al actualizar");
    } finally {
      setSaving(false);
    }
  };

  // Client-side filtering for main transactions
  const mainTransactions = useMemo(() => {
    return transactions.filter((tx) => !tx.subAccountId);
  }, [transactions]);

  const filteredMainTransactions = useMemo(() => {
    return mainTransactions.filter((tx) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!tx.description.toLowerCase().includes(q) &&
            !(tx.category || "").toLowerCase().includes(q) &&
            !(tx.subCategory || "").toLowerCase().includes(q) &&
            !(!isNaN(Number(q)) && Math.abs(tx.amount) === Number(q))) return false;
      }
      if (filterType !== "all" && tx.type !== filterType) return false;
      if (filterCategory !== "all" && tx.category !== filterCategory) return false;
      if (filterMinAmount && tx.amount < parseFloat(filterMinAmount)) return false;
      if (filterMaxAmount && tx.amount > parseFloat(filterMaxAmount)) return false;
      return true;
    });
  }, [mainTransactions, searchQuery, filterType, filterCategory, filterMinAmount, filterMaxAmount]);

  // Client-side filtering for sub-account transactions
  const filteredSubTransactions = useMemo(() => {
    const result: Record<string, Transaction[]> = {};
    for (const [subId, txs] of Object.entries(subTransactions)) {
      result[subId] = txs.filter((tx) => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          if (!tx.description.toLowerCase().includes(q) &&
              !(tx.category || "").toLowerCase().includes(q) &&
              !(tx.subCategory || "").toLowerCase().includes(q) &&
              !(!isNaN(Number(q)) && Math.abs(tx.amount) === Number(q))) return false;
        }
        if (filterType !== "all" && tx.type !== filterType) return false;
        if (filterCategory !== "all" && tx.category !== filterCategory) return false;
        if (filterMinAmount && tx.amount < parseFloat(filterMinAmount)) return false;
        if (filterMaxAmount && tx.amount > parseFloat(filterMaxAmount)) return false;
        return true;
      });
    }
    return result;
  }, [subTransactions, searchQuery, filterType, filterCategory, filterMinAmount, filterMaxAmount]);

  // Available categories for filter
  const filterCategoryOptions = useMemo(() => {
    const catSet = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.category) catSet.add(tx.category);
    });
    return Array.from(catSet).sort();
  }, [transactions]);

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterType !== "all") count++;
    if (filterCategory !== "all") count++;
    if (filterMinAmount) count++;
    if (filterMaxAmount) count++;
    return count;
  }, [filterType, filterCategory, filterMinAmount, filterMaxAmount]);

  const cycle = getCycleDates(budgetCutoffDay, cycleOffset);
  const currentCategoryData = categories.find((c) => c.name === editCategory);
  const availableSubCategories = currentCategoryData?.subcategories || [];

  if (!account) {
    return (
      <div className="p-4 pb-safe">
        <Button
          variant="ghost"
          onClick={() => setFinanceSubView("accounts")}
          className="mb-4"
        >
          <ArrowLeft className="size-4 mr-2" />
          Volver
        </Button>
        <p className="text-gray-500 text-center mt-8">Cargando...</p>
      </div>
    );
  }

  const now = new Date();
  const daysInMonth = getDaysInMonth(now.getFullYear(), now.getMonth());
  const daysRemaining = daysInMonth - now.getDate() + 1;
  const projectedYield = account.isHighYield && account.yieldPercentage
    ? calculateProportionalYield(account.balance, account.yieldPercentage, daysRemaining)
    : 0;

  return (
    <div className="p-4 space-y-4 pb-safe">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFinanceSubView("accounts")}
          className="rounded-xl"
        >
          <ArrowLeft className="size-4 mr-1" />
          Volver
        </Button>
        <div className="flex items-center gap-2">
          {!account.isSharedWithMe && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl"
                onClick={() => setShowAccountForm(true)}
              >
                <Pencil className="size-4 text-emerald-600" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-xl"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="size-4 text-red-500" />
              </Button>
            </>
          )}
          {account.isSharedWithMe && (
            <Badge variant="outline" className="text-[10px] rounded-lg border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400">
              {account.myRole === "editor" ? "Editor" : "Visualizador"}
            </Badge>
          )}
        </div>
      </div>

      {/* Account Card */}
      <AccountCard account={account} />

      {/* Yield Info */}
      {account.isHighYield && projectedYield > 0 && (
        <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="size-4 text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                Rendimiento Proyectado
              </span>
            </div>
            <p className="text-2xl font-bold text-emerald-600">
              {formatCurrency(projectedYield)}
              <span className="text-xs font-normal text-emerald-500 ml-1">/mes</span>
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Basado en {account.yieldPercentage}% anual
            </p>
          </CardContent>
        </Card>
      )}

      {/* Shared Account Manager */}
      {account.isShared && (
        <SharedAccountManager
          accountId={account.id}
          accountName={account.name}
          sharedUsers={account.sharedUsers || []}
          onUpdate={fetchAccount}
          isOwner={!account.isSharedWithMe}
        />
      )}

      {/* Sub-Accounts - ONLY show when there are sub-accounts */}
      {account.subAccounts.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Bolsillos ({account.subAccounts.length})
            </h3>
            {(!account.isSharedWithMe || account.myRole === "editor") && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl text-xs"
                onClick={() => {
                  setEditingSubAccount(null);
                  setShowSubAccountForm(true);
                }}
              >
                <Plus className="size-3 mr-1" />
                Agregar
              </Button>
            )}
          </div>

          <div className="space-y-2">
            {account.subAccounts.map((sub) => {
              const subColor = sub.color || "#10B981";
              const isExpanded = expandedSubAccount === sub.id;
              const subTxs = filteredSubTransactions[sub.id] || [];
              const subYield = sub.isHighYield && sub.yieldPercentage
                ? calculateProportionalYield(sub.balance, sub.yieldPercentage, daysRemaining)
                : 0;

              return (
                <motion.div key={sub.id} layout initial={false} animate={{ opacity: 1 }}>
                  <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                    <CardContent className="p-3 cursor-pointer" onClick={() => handleExpandSubAccount(sub.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${subColor}20` }}>
                            <PiggyBank className="size-5" style={{ color: subColor }} />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{sub.name}</p>
                            <span className="text-[10px] text-gray-400">
                              {subTypeLabels[sub.type] || "Otro"}
                              {sub.isHighYield && ` · ${sub.yieldPercentage}% anual`}
                            </span>
                            {subYield > 0 && (
                              <span className="block text-[10px] text-emerald-500 font-medium">
                                +{formatCurrency(subYield)}/mes rendimiento estimado
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {formatCurrency(sub.balance)}
                          </span>
                          <motion.div animate={{ rotate: isExpanded ? 90 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronRight className="size-4 text-gray-400" />
                          </motion.div>
                        </div>
                      </div>
                    </CardContent>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 pb-3 space-y-2">
                            <div className="flex items-center gap-2 pt-1 pb-2 border-t border-gray-100 dark:border-gray-700">
                              {(!account.isSharedWithMe || account.myRole === "editor") && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl text-[11px] h-7 flex-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingSubAccount(sub);
                                      setShowSubAccountForm(true);
                                    }}
                                  >
                                    <Pencil className="size-3 mr-1" /> Editar
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl text-[11px] h-7 flex-1 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setShowSubDeleteDialog(sub.id);
                                    }}
                                  >
                                    <Trash2 className="size-3 mr-1" /> Eliminar
                                  </Button>
                                </>
                              )}
                            </div>

                            {subTxs.length > 0 ? (
                              <div className="space-y-1.5">
                                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">Movimientos</span>
                                {subTxs.map((tx) => {
                                  const txType = (tx.type as keyof typeof typeConfig) || "expense";
                                  const config = typeConfig[txType] || typeConfig.expense;
                                  const TxIcon = config.icon;
                                  const isExpanded = expandedTxId === tx.id;
                                  const isEditing = editingTxId === tx.id;
                                  const { day, month } = formatDayMonth(tx.date);

                                  return (
                                    <motion.div
                                      key={tx.id}
                                      layout
                                      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden"
                                      style={{ borderLeft: `4px solid ${config.color}` }}
                                    >
                                      {/* Main Row */}
                                      <button
                                        onClick={() => handleExpandTx(tx)}
                                        className="w-full flex items-center justify-between p-2.5 text-left"
                                      >
                                        <div className="flex items-center gap-2.5 min-w-0">
                                          {/* Date Column */}
                                          <div className="w-8 shrink-0 flex flex-col items-center justify-center mr-1">
                                            <span className="text-[11px] font-bold text-gray-700 dark:text-gray-300 leading-none">
                                              {day}
                                            </span>
                                            <span className="text-[8px] text-gray-400 leading-none mt-0.5">
                                              {month}
                                            </span>
                                          </div>
                                          <div
                                            className="size-8 rounded-lg flex items-center justify-center shrink-0"
                                            style={{ backgroundColor: config.bgLight }}
                                          >
                                            <TxIcon className="size-3.5" style={{ color: config.color }} />
                                          </div>
                                          <div className="min-w-0">
                                            <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                                              {tx.description}
                                            </p>
                                            <div className="flex items-center gap-1.5">
                                              <span
                                                className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${config.badgeBg} ${config.badgeText}`}
                                              >
                                                {config.label}
                                              </span>
                                              {tx.category && (
                                                <span className="text-[9px] text-gray-400">
                                                  {tx.category}
                                                </span>
                                              )}
                                              {tx.user && tx.user.name && tx.userId && tx.userId !== session?.user?.id && (
                                                <>
                                                  <span className="text-[9px] text-gray-300">·</span>
                                                  <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-0.5">
                                                    <UserIcon className="size-2.5" />
                                                    {tx.user.name}
                                                  </span>
                                                </>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                                          <span
                                            className="text-xs font-bold"
                                            style={{ color: config.color }}
                                          >
                                            {tx.type === "income" ? "+" : tx.type === "transfer" ? "↔" : "-"}
                                            {formatCurrency(Math.abs(tx.amount))}
                                          </span>
                                          <motion.div
                                            animate={{ rotate: isExpanded ? 180 : 0 }}
                                            transition={{ duration: 0.2 }}
                                          >
                                            <ChevronDown className="size-3 text-gray-300" />
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
                                                <div className="p-3 space-y-2">
                                                  <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                      <span className="text-[9px] text-gray-400 uppercase tracking-wider">Tipo</span>
                                                      <span className={`block text-[11px] font-medium ${config.badgeText}`}>
                                                        {config.label}
                                                      </span>
                                                    </div>
                                                    <div>
                                                      <span className="text-[9px] text-gray-400 uppercase tracking-wider">Monto</span>
                                                      <span className="block text-[11px] font-bold" style={{ color: config.color }}>
                                                        {tx.type === "income" ? "+" : "-"}
                                                        {formatCurrency(Math.abs(tx.amount))}
                                                      </span>
                                                    </div>
                                                    <div>
                                                      <span className="text-[9px] text-gray-400 uppercase tracking-wider">Categoría</span>
                                                      <span className="block text-[11px] text-gray-700 dark:text-gray-300">
                                                        {tx.category || "Sin categoría"}
                                                      </span>
                                                    </div>
                                                    <div>
                                                      <span className="text-[9px] text-gray-400 uppercase tracking-wider">Fecha</span>
                                                      <span className="block text-[11px] text-gray-700 dark:text-gray-300">
                                                        {formatDate(tx.date)}
                                                      </span>
                                                    </div>
                                                    {tx.notes && (
                                                      <TransactionNotes notes={tx.notes} size="sm" />
                                                    )}
                                                    {tx.user && tx.user.name && tx.userId && tx.userId !== session?.user?.id && (
                                                      <div>
                                                        <span className="text-[9px] text-gray-400 uppercase tracking-wider">Creado por</span>
                                                        <span className="block text-[11px] text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
                                                          <UserIcon className="size-3" />
                                                          {tx.user.name}
                                                        </span>
                                                      </div>
                                                    )}
                                                  </div>

                                                  <div className="flex gap-2 pt-1">
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="flex-1 rounded-xl text-[10px] h-8"
                                                      onClick={() => setEditingTxId(expandedTxId)}
                                                    >
                                                      <Pencil className="size-3 mr-1" />
                                                      Editar
                                                    </Button>
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="flex-1 rounded-xl text-[10px] h-8 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300 hover:bg-red-50"
                                                      onClick={() => setShowTxDeleteDialog(tx.id)}
                                                    >
                                                      <Trash2 className="size-3 mr-1" />
                                                      Eliminar
                                                    </Button>
                                                  </div>
                                                </div>
                                              ) : (
                                                /* Inline Edit Form */
                                                <div className="p-3 space-y-2 bg-gray-50/50 dark:bg-gray-800/50">
                                                  <div className="flex items-center justify-between mb-1">
                                                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                                                      Editar
                                                    </span>
                                                    <button
                                                      onClick={handleCancelEdit}
                                                      className="size-5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center justify-center"
                                                    >
                                                      <X className="size-3 text-gray-400" />
                                                    </button>
                                                  </div>

                                                  {/* Type Selector */}
                                                  <div className="flex gap-1">
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
                                                          className={`flex-1 py-1.5 rounded-lg text-[9px] font-medium flex items-center justify-center gap-1 transition-all ${
                                                            isActive
                                                              ? `${tConfig.badgeBg} ${tConfig.badgeText} border`
                                                              : "bg-white dark:bg-gray-800 text-gray-400 border border-transparent"
                                                          }`}
                                                          style={isActive ? { borderColor: tConfig.color } : {}}
                                                        >
                                                          <TIcon className="size-2.5" />
                                                          {tConfig.label}
                                                        </button>
                                                      );
                                                    })}
                                                  </div>

                                                  {/* Amount */}
                                                  <div className="space-y-1">
                                                    <Label className="text-[9px]">Monto</Label>
                                                    <CurrencyInput
                                                      value={editAmount}
                                                      onChange={setEditAmount}
                                                      showPrefix
                                                      placeholder="0"
                                                      className="text-xs font-bold rounded-lg h-8"
                                                    />
                                                  </div>

                                                  {/* Description */}
                                                  <div className="space-y-1">
                                                    <Label className="text-[9px]">Descripción</Label>
                                                    <Input
                                                      value={editDescription}
                                                      onChange={(e) => setEditDescription(e.target.value)}
                                                      className="rounded-lg h-8 text-xs"
                                                    />
                                                  </div>

                                                  {/* Category */}
                                                  {editType !== "transfer" && (
                                                    <div className="space-y-1">
                                                      <Label className="text-[9px]">Categoría</Label>
                                                      <Select value={editCategory} onValueChange={(v) => { setEditCategory(v); setEditSubCategory(""); }}>
                                                        <SelectTrigger className="rounded-lg h-8 text-xs">
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
                                                      <Label className="text-[9px]">Subcategoría</Label>
                                                      {availableSubCategories.length > 0 && (
                                                        <div className="flex flex-wrap gap-1 mb-1">
                                                          {availableSubCategories.map((sub) => (
                                                            <button
                                                              key={sub}
                                                              onClick={() => setEditSubCategory(sub === editSubCategory ? "" : sub)}
                                                              className={`px-1.5 py-0.5 rounded-md text-[8px] font-medium transition-all ${
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
                                                        className="rounded-lg h-7 text-[10px]"
                                                      />
                                                    </div>
                                                  )}

                                                  {/* Date */}
                                                  <div className="space-y-1">
                                                    <Label className="text-[9px]">Fecha</Label>
                                                    <Input
                                                      type="date"
                                                      value={editDate}
                                                      onChange={(e) => setEditDate(e.target.value)}
                                                      className="rounded-lg h-8 text-xs"
                                                    />
                                                  </div>

                                                  {/* Notes */}
                                                  <div className="space-y-1">
                                                    <Label className="text-[9px]">Notas</Label>
                                                    <Input
                                                      value={editNotes}
                                                      onChange={(e) => setEditNotes(e.target.value)}
                                                      placeholder="Opcional..."
                                                      className="rounded-lg h-8 text-xs"
                                                    />
                                                  </div>

                                                  {/* Save / Cancel */}
                                                  <div className="flex gap-2 pt-1">
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      className="flex-1 rounded-xl text-[10px] h-8"
                                                      onClick={handleCancelEdit}
                                                      disabled={saving}
                                                    >
                                                      Cancelar
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      className="flex-1 rounded-xl text-[10px] h-8 text-white"
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
                            ) : (
                              <p className="text-[11px] text-gray-400 text-center py-2">Sin movimientos registrados</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Sub-Account mini button - only when no sub-accounts exist */}
      {account.subAccounts.length === 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="w-full rounded-xl text-xs text-gray-400 hover:text-emerald-600"
          onClick={() => {
            setEditingSubAccount(null);
            setShowSubAccountForm(true);
          }}
        >
          <PiggyBank className="size-3.5 mr-1" />
          Crear bolsillo
        </Button>
      )}

      <Separator />

      {/* Cycle Navigator + View Mode Toggle */}
      <div className="flex items-center justify-between gap-2">
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

      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Transacciones Recientes
          </h3>
          <div className="flex items-center gap-2">
            {(!account.isSharedWithMe || account.myRole === "editor") && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-300"
                  onClick={() => {
                    setCashbackMode(true);
                    setEditingTransaction(null);
                    setShowTransactionForm(true);
                  }}
                >
                  <DollarSign className="size-3 mr-1" />
                  Cashback
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl text-xs"
                  onClick={() => {
                    setCashbackMode(false);
                    setEditingTransaction(null);
                    setShowTransactionForm(true);
                  }}
                >
                  <Plus className="size-3 mr-1" />
                  Agregar
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Category Breakdown View */}
        {viewMode === "category" ? (
          filteredMainTransactions.length === 0 ? (
            <Card className="border-0 shadow-sm rounded-2xl bg-gray-50 dark:bg-gray-800/50">
              <CardContent className="p-6 text-center">
                <Receipt className="size-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  {searchQuery || activeFilterCount > 0
                    ? "Sin resultados para los filtros aplicados"
                    : "Sin transacciones en este ciclo"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <CategoryBreakdown transactions={filteredMainTransactions} />
          )
        ) : (
          <>
            {/* Search & Filters */}
            <div className="space-y-2 mb-3">
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
            {filteredMainTransactions.length === 0 ? (
              <Card className="border-0 shadow-sm rounded-2xl bg-gray-50 dark:bg-gray-800/50">
                <CardContent className="p-6 text-center">
                  <Receipt className="size-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">
                    {searchQuery || activeFilterCount > 0
                      ? "Sin resultados para los filtros aplicados"
                      : "Sin transacciones en este ciclo"}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filteredMainTransactions.map((tx) => {
                  const txType = (tx.type as keyof typeof typeConfig) || "expense";
                  const config = typeConfig[txType] || typeConfig.expense;
                  const TxIcon = config.icon;
                  const isExpanded = expandedTxId === tx.id;
                  const isEditing = editingTxId === tx.id;
                  const { day, month } = formatDayMonth(tx.date);

                  return (
                    <motion.div
                      key={tx.id}
                      layout
                      className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden"
                      style={{ borderLeft: `4px solid ${config.color}` }}
                    >
                      {/* Main Row */}
                      <button
                        onClick={() => handleExpandTx(tx)}
                        className="w-full flex items-center justify-between p-3 text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Date Column */}
                          <div className="w-10 shrink-0 flex flex-col items-center justify-center mr-2">
                            <span className="text-sm font-bold text-gray-700 dark:text-gray-300 leading-none">
                              {day}
                            </span>
                            <span className="text-[10px] text-gray-400 leading-none mt-0.5">
                              {month}
                            </span>
                          </div>
                          <div
                            className="size-9 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: config.bgLight }}
                          >
                            <TxIcon className="size-4" style={{ color: config.color }} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {tx.description}
                            </p>
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.badgeBg} ${config.badgeText}`}
                              >
                                {config.label}
                              </span>
                              {tx.category && (
                                <span className="text-[10px] text-gray-400">
                                  {tx.category}
                                </span>
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
                                    {tx.notes && (
                                      <TransactionNotes notes={tx.notes} size="md" />
                                    )}
                                  </div>

                                  <div className="flex gap-2 pt-1">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 rounded-xl text-xs h-9"
                                      onClick={() => setEditingTxId(expandedTxId)}
                                    >
                                      <Pencil className="size-3 mr-1" />
                                      Editar
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="flex-1 rounded-xl text-xs h-9 text-red-500 hover:text-red-600 border-red-200 hover:border-red-300 hover:bg-red-50"
                                      onClick={() => setShowTxDeleteDialog(tx.id)}
                                    >
                                      <Trash2 className="size-3 mr-1" />
                                      Eliminar
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                /* Inline Edit Form */
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

                {/* Load More Button */}
                {nextCursor && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-xs"
                      onClick={() => fetchTransactions(nextCursor, true)}
                      disabled={loadingMore}
                    >
                      {loadingMore ? (
                        <Loader2 className="size-3 animate-spin mr-1" />
                      ) : (
                        <ChevronDown className="size-3 mr-1" />
                      )}
                      Cargar más
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Forms */}
      <AccountForm
        open={showAccountForm}
        onOpenChange={setShowAccountForm}
        account={account}
        onSuccess={fetchAccount}
      />

      <TransactionForm
        open={showTransactionForm}
        onOpenChange={(open) => {
          setShowTransactionForm(open);
          if (!open) {
            setEditingTransaction(null);
            setCashbackMode(false);
          }
        }}
        defaultAccountId={account.id}
        defaultType={cashbackMode ? "income" : undefined}
        defaultDescription={cashbackMode ? "Cashback" : undefined}
        editTransaction={editingTransaction}
        onSuccess={() => {
          fetchAccount();
          fetchTransactions();
        }}
      />

      <SubAccountForm
        open={showSubAccountForm}
        onOpenChange={(open) => {
          setShowSubAccountForm(open);
          if (!open) setEditingSubAccount(null);
        }}
        accountId={account.id}
        subAccount={editingSubAccount}
        onSuccess={fetchAccount}
      />

      {/* Delete Account Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cuenta?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todas las transacciones y bolsillos asociados. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-500 hover:bg-red-600"
              onClick={async () => {
                try {
                  await apiFetch(`/api/accounts/${account.id}`, { method: "DELETE" });
                  setFinanceSubView("accounts");
                } catch (error) {
                  console.error("Error deleting account:", error);
                }
              }}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Sub-Account Dialog */}
      <AlertDialog open={!!showSubDeleteDialog} onOpenChange={() => setShowSubDeleteDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar bolsillo?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán todos los movimientos asociados a este bolsillo. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-red-500 hover:bg-red-600"
              onClick={() => showSubDeleteDialog && handleDeleteSubAccount(showSubDeleteDialog)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Transaction Dialog */}
      <AlertDialog open={!!showTxDeleteDialog} onOpenChange={() => setShowTxDeleteDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar transacción?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const tx = findTransactionById(showTxDeleteDialog);
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
              onClick={() => showTxDeleteDialog && handleDeleteTransaction(showTxDeleteDialog)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
