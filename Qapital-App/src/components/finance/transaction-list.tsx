"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency, formatDate, parseLocalDate, toColombiaDateString } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
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
  X,
  Check,
  Loader2,
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
import type { Transaction, SubAccount, Account, CategoryData } from "@/lib/types";

// Color config per transaction type
const typeConfig = {
  income: {
    color: "#10B981", // emerald-500
    bgLight: "#ECFDF5", // emerald-50
    bgDark: "rgba(16,185,129,0.1)",
    borderClass: "border-l-emerald-500",
    textClass: "text-emerald-600",
    badgeBg: "bg-emerald-50 dark:bg-emerald-900/30",
    badgeText: "text-emerald-600 dark:text-emerald-400",
    label: "Ingreso",
    icon: ArrowUpRight,
  },
  expense: {
    color: "#EF4444", // red-500
    bgLight: "#FEF2F2", // red-50
    bgDark: "rgba(239,68,68,0.1)",
    borderClass: "border-l-red-500",
    textClass: "text-red-500",
    badgeBg: "bg-red-50 dark:bg-red-900/30",
    badgeText: "text-red-500 dark:text-red-400",
    label: "Gasto",
    icon: ArrowDownRight,
  },
  transfer: {
    color: "#3B82F6", // blue-500
    bgLight: "#EFF6FF", // blue-50
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

interface TransactionListProps {
  accountId?: string;
  limit?: number;
}

export function TransactionList({ accountId, limit }: TransactionListProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTxId, setExpandedTxId] = useState<string | null>(null);
  const [editingTxId, setEditingTxId] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Helper: check if a transaction is a CC payment (expandable with installment details)
  const isCcPayment = (tx: Transaction) =>
    tx.type === "transfer" && tx.category === "Pago Tarjeta de Crédito";

  // Helper: parse CC payment notes JSON into installment details
  const parseCcPaymentDetails = (notes: string): {
    description: string;
    amount: number;
    category: string | null;
    subCategory: string | null;
    currentInstallment: number;
    totalInstallments: number;
  }[] => {
    try {
      return JSON.parse(notes);
    } catch {
      return [];
    }
  };

  const fetchTransactions = useCallback(async () => {
    try {
      let url = "/api/transactions";
      const params = new URLSearchParams();
      if (accountId) params.set("accountId", accountId);
      if (params.toString()) url += `?${params.toString()}`;

      const data = await apiFetch<Transaction[]>(url);
      setTransactions(limit ? data.slice(0, limit) : data);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  }, [accountId, limit]);

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
      const data = await apiFetch<Record<string, CategoryData[]>>(`/api/categories?type=${editType}`);
      setCategories(data[editType] || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, [editType]);

  useEffect(() => {
    let cancelled = false;
    fetchTransactions().then(() => { if (cancelled) return; });
    fetchAccounts().then(() => { if (cancelled) return; });
    fetchCategories().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchTransactions, fetchAccounts, fetchCategories]);

  const handleExpandTx = (tx: Transaction) => {
    if (expandedTxId === tx.id) {
      setExpandedTxId(null);
      setEditingTxId(null);
    } else {
      setExpandedTxId(tx.id);
      setEditingTxId(null);
      // Populate edit form with current values
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
    // Reset to original values
    const tx = transactions.find((t) => t.id === expandedTxId);
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

  if (loading) {
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

  if (transactions.length === 0) {
    return (
      <Card className="border-0 shadow-sm rounded-2xl bg-gray-50 dark:bg-gray-800/50">
        <CardContent className="p-6 text-center">
          <Receipt className="size-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Sin transacciones</p>
        </CardContent>
      </Card>
    );
  }

  const filteredTransactions = transactions.filter((tx) => {
    const query = searchQuery.toLowerCase();
    return (
      tx.description.toLowerCase().includes(query) ||
      (tx.category || "").toLowerCase().includes(query) ||
      (tx.subCategory || "").toLowerCase().includes(query)
    );
  });

  const groups = groupByDate(filteredTransactions);
  const selectedAccount = accounts.find((a) => a.id === editAccountId);
  const subAccounts = selectedAccount?.subAccounts || [];
  const currentCategoryData = categories.find((c) => c.name === editCategory);
  const availableSubCategories = currentCategoryData?.subcategories || [];

  return (
    <div className="space-y-4">
      {/* Search Box */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Filter className="size-4 text-gray-400" />
        </div>
        <Input
          placeholder="Buscar descripción, categoría..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 rounded-xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
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
                    <div className="flex items-center gap-3 min-w-0">
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
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${config.badgeBg} ${config.badgeText}`}
                          >
                            {config.label}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {tx.category || ""}
                          </span>
                          <span className="text-[10px] text-gray-300">·</span>
                          <span className="text-[10px] text-gray-400">
                            {new Date(tx.date).toLocaleDateString("es-CO", { day: 'numeric', month: 'short' })}
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
                                  <div className="col-span-2">
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider">Notas</span>
                                    <span className="block text-xs text-gray-700 dark:text-gray-300">
                                      {tx.notes}
                                    </span>
                                  </div>
                                )}
                              </div>

                              {/* CC Payment Installment Details */}
                              {isCcPayment(tx) && tx.notes && (
                                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                                    Cuotas pagadas
                                  </span>
                                  <div className="mt-1.5 space-y-1">
                                    {parseCcPaymentDetails(tx.notes).map((detail, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center justify-between py-1 px-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                                      >
                                        <div className="min-w-0 flex-1">
                                          <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate block">
                                            {detail.description}
                                          </span>
                                          <span className="text-[10px] text-gray-400">
                                            Cuota {detail.currentInstallment}/{detail.totalInstallments}
                                            {detail.category && ` · ${detail.category}`}
                                          </span>
                                        </div>
                                        <span className="text-xs font-bold text-gray-600 dark:text-gray-400 ml-2 shrink-0">
                                          {formatCurrency(detail.amount)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
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

      {/* Delete Transaction Dialog */}
      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar transacción?</AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const tx = transactions.find((t) => t.id === showDeleteDialog);
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
