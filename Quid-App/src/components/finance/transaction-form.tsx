"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, formatCurrency, parseLocalDate, getColombiaTodayString, toColombiaDateString } from "@/lib/api";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowUpRight, ArrowDownRight, Repeat, PiggyBank, Plus, X, Check } from "lucide-react";
import { ReceiptUpload } from "./receipt-upload";
import { SubCategorySelector } from "./subcategory-selector";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import type { CategoryData, SubAccount, Account } from "@/lib/types";

const quickAmounts = [10000, 20000, 50000, 100000];

interface TransactionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultAccountId?: string;
  defaultType?: string;
  defaultDescription?: string;
  editTransaction?: {
    id: string;
    type: string;
    amount: number;
    description: string;
    accountId?: string | null;
    subAccountId?: string | null;
    category?: string | null;
    subCategory?: string | null;
    date: string;
    notes?: string | null;
    excludeFromBudget?: boolean | null;
    receiptUrl?: string | null;
  } | null;
  onSuccess?: () => void;
}

export function TransactionForm({
  open,
  onOpenChange,
  defaultAccountId,
  defaultType,
  defaultDescription,
  editTransaction,
  onSuccess,
}: TransactionFormProps) {
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [type, setType] = useState(editTransaction?.type || defaultType || "expense");
  const [amount, setAmount] = useState(editTransaction?.amount?.toString() || "");
  const [description, setDescription] = useState(editTransaction?.description || defaultDescription || "");
  const [accountId, setAccountId] = useState(editTransaction?.accountId || defaultAccountId || "");
  const [subAccountId, setSubAccountId] = useState(editTransaction?.subAccountId || "");
  const [toAccountId, setToAccountId] = useState("");
  const [toSubAccountId, setToSubAccountId] = useState("");
  const [category, setCategory] = useState(editTransaction?.category || "");
  const [subCategory, setSubCategory] = useState(editTransaction?.subCategory || "");
  const [date, setDate] = useState(
    editTransaction?.date ? toColombiaDateString(editTransaction.date) : getColombiaTodayString()
  );
  const [notes, setNotes] = useState(editTransaction?.notes || "");
  const [excludeFromBudget, setExcludeFromBudget] = useState(editTransaction?.excludeFromBudget || false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(editTransaction?.receiptUrl || null);

  // Categories from API
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [customCategory, setCustomCategory] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);

  const isEditing = !!editTransaction;
  const isMobile = useIsMobile();

  // Get sub-accounts for selected account
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const subAccounts = selectedAccount?.subAccounts || [];

  const toAccount = accounts.find((a) => a.id === toAccountId);
  const toSubAccounts = toAccount?.subAccounts || [];

  // Get subcategories for current category
  const currentCategoryData = categories.find((c) => c.name === category);
  const availableSubCategories = currentCategoryData?.subcategories || [];

  useEffect(() => {
    if (editTransaction) {
      setType(editTransaction.type);
      setAmount(editTransaction.amount.toString());
      setDescription(editTransaction.description);
      setAccountId(editTransaction.accountId || "");
      setSubAccountId(editTransaction.subAccountId || "");
      setCategory(editTransaction.category || "");
      setSubCategory(editTransaction.subCategory || "");
      setDate(toColombiaDateString(editTransaction.date));
      setNotes(editTransaction.notes || "");
      setExcludeFromBudget(editTransaction.excludeFromBudget || false);
      setReceiptUrl(editTransaction.receiptUrl || null);
    } else if (defaultDescription) {
      setDescription(defaultDescription);
    }
  }, [editTransaction, defaultDescription]);

  useEffect(() => {
    if (defaultAccountId) setAccountId(defaultAccountId);
    if (defaultType) setType(defaultType);
  }, [defaultAccountId, defaultType]);

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await apiFetch<Account[]>("/api/accounts");
      setAccounts(data);
      if (!defaultAccountId && !editTransaction && data.length > 0) {
        setAccountId(data[0].id);
      }
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  }, [defaultAccountId, editTransaction]);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await apiFetch<Record<string, CategoryData[]>>("/api/categories");
      setCategories(data[type] || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, [type]);

  useEffect(() => {
    if (open) fetchAccounts();
  }, [open, fetchAccounts]);

  useEffect(() => {
    if (open) fetchCategories();
  }, [open, fetchCategories]);

  // When type changes, reset category and subcategory
  useEffect(() => {
    if (!editTransaction) {
      setCategory("");
      setSubCategory("");
    }
    setUseCustomCategory(false);
    setCustomCategory("");
  }, [type, editTransaction]);

  // When category changes, reset subcategory
  useEffect(() => {
    if (!editTransaction) {
      setSubCategory("");
    }
  }, [category, editTransaction]);

  const handleSubmit = async () => {
    if (!amount || !description) return;
    if (type !== "transfer" && !accountId) return;
    if (type === "transfer" && (!accountId || !toAccountId)) return;
    setLoading(true);
    try {
      const finalCategory = useCustomCategory ? customCategory : category;
      if (isEditing) {
        await apiFetch(`/api/transactions/${editTransaction.id}`, {
          method: "PUT",
          body: JSON.stringify({
            type,
            amount: parseFloat(amount),
            description,
            accountId: accountId || null,
            subAccountId: subAccountId || null,
            category: type !== "transfer" ? (finalCategory || "Otros") : null,
            subCategory: type !== "transfer" ? (subCategory || null) : null,
            date,
            notes: notes || null,
            excludeFromBudget,
            receiptUrl,
          }),
        });
      } else {
        const result = await apiFetch<{
          id: string;
          updatedBalances?: Array<{ name: string; balance: number; isSubAccount: boolean }>;
        }>('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            type,
            amount: parseFloat(amount),
            description,
            accountId: accountId || null,
            subAccountId: subAccountId || null,
            category: type !== 'transfer' ? (finalCategory || 'Otros') : null,
            subCategory: type !== 'transfer' ? (subCategory || null) : null,
            date,
            notes: notes || null,
            excludeFromBudget,
            receiptUrl,
            transferToAccountId: type === 'transfer' ? toAccountId : undefined,
            transferToSubAccountId: type === 'transfer' ? (toSubAccountId || undefined) : undefined,
          }),
        });

        // Show floating notification(s) with updated balance(s)
        if (result.updatedBalances && result.updatedBalances.length > 0) {
          for (const ub of result.updatedBalances) {
            const isSource = result.updatedBalances.indexOf(ub) === 0;
            const label = type === 'income'
              ? 'Ingreso registrado'
              : type === 'expense'
              ? 'Gasto registrado'
              : isSource
              ? 'Transferencia enviada'
              : 'Transferencia recibida';
            toast.success(ub.name, {
              description: `${label} · Nuevo saldo: ${formatCurrency(ub.balance)}`,
              duration: 4000,
            });
          }
        }
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving transaction:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setAmount("");
    setDescription("");
    setCategory("");
    setSubCategory("");
    setDate(getColombiaTodayString());
    setType(defaultType || "expense");
    setSubAccountId("");
    setToAccountId("");
    setToSubAccountId("");
    setNotes("");
    setExcludeFromBudget(false);
    setReceiptUrl(null);
    setUseCustomCategory(false);
    setCustomCategory("");
  };

  // Build combined account options (accounts + sub-accounts grouped)
  const renderAccountSelect = (
    value: string,
    onChange: (val: string) => void,
    label: string,
    excludeId?: string
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="rounded-xl">
          <SelectValue placeholder="Seleccionar cuenta" />
        </SelectTrigger>
        <SelectContent>
          {accounts
            .filter((acc) => acc.id !== excludeId)
            .map((acc) => (
              <SelectItem key={acc.id} value={acc.id}>
                <div className="flex items-center gap-2">
                  <div
                    className="size-3 rounded-full shrink-0"
                    style={{ backgroundColor: acc.color }}
                  />
                  <span>{acc.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {formatCurrency(acc.balance)}
                  </span>
                </div>
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  );

  const renderSubAccountSelect = (
    parentAccountId: string,
    value: string,
    onChange: (val: string) => void,
    subs: SubAccount[]
  ) => {
    if (!parentAccountId || subs.length === 0) return null;
    return (
      <div className="space-y-2">
        <Label>Bolsillo (opcional)</Label>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="rounded-xl">
            <SelectValue placeholder="Cuenta principal" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Cuenta principal</SelectItem>
            {subs.map((sub) => (
              <SelectItem key={sub.id} value={sub.id}>
                <div className="flex items-center gap-2">
                  <PiggyBank className="size-3 text-gray-400" />
                  <span>{sub.name}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {formatCurrency(sub.balance)}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  const formContent = (
    <div className="space-y-4 mt-4">
      {/* Type Selector */}
      <div className="flex gap-2">
        {[
          { id: "income", label: "Ingreso", icon: ArrowUpRight, color: "emerald" },
          { id: "expense", label: "Gasto", icon: ArrowDownRight, color: "rose" },
          { id: "transfer", label: "Transferencia", icon: Repeat, color: "blue" },
        ].map((t) => {
          const Icon = t.icon;
          const isActive = type === t.id;
          return (
            <button
              key={t.id}
              onClick={() => {
                setType(t.id);
                setCategory("");
                setSubAccountId("");
                setToAccountId("");
                setToSubAccountId("");
              }}
              className={`flex-1 py-3 rounded-xl text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                isActive
                  ? t.color === "emerald"
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 border-2 border-emerald-300"
                    : t.color === "rose"
                    ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 border-2 border-rose-300"
                    : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 border-2 border-blue-300"
                  : "bg-gray-50 dark:bg-gray-800 text-gray-400 border-2 border-transparent"
              }`}
            >
              <Icon className="size-5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Amount */}
      <div className="space-y-2">
        <Label>Monto</Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
            $
          </span>
          <Input
            type="number"
            step="0.01"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="pl-7 text-xl font-bold rounded-xl h-14"
          />
        </div>
        <div className="flex gap-2">
          {quickAmounts.map((qa) => (
            <button
              key={qa}
              onClick={() => setAmount(qa.toString())}
              className="flex-1 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-[10px] font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {formatCurrency(qa)}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Descripción</Label>
        <Input
          placeholder="Ej: Pago de salario"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="rounded-xl"
        />
      </div>

      {/* Account selection */}
      {type === "transfer" ? (
        <>
          {renderAccountSelect(accountId, setAccountId, "Desde cuenta")}
          {renderSubAccountSelect(accountId, subAccountId, setSubAccountId, subAccounts)}
          {renderAccountSelect(toAccountId, setToAccountId, "Hacia cuenta", accountId)}
          {renderSubAccountSelect(toAccountId, toSubAccountId, setToSubAccountId, toSubAccounts)}
        </>
      ) : (
        <>
          {renderAccountSelect(accountId, setAccountId, "Cuenta")}
          {renderSubAccountSelect(accountId, subAccountId, setSubAccountId, subAccounts)}
        </>
      )}

      {/* Category & SubCategory */}
      {type !== "transfer" && (
        <>
          {/* Category */}
          <div className="space-y-2">
            <Label>Categoría</Label>
            {!useCustomCategory ? (
              <Select
                value={category}
                onValueChange={(val) => {
                  if (val === "__custom__") {
                    setUseCustomCategory(true);
                    setCategory("");
                  } else {
                    setCategory(val);
                  }
                }}
              >
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Seleccionar categoría" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.name} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="__custom__">+ Personalizada...</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Nombre de categoría"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="rounded-xl flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => {
                    setUseCustomCategory(false);
                    setCustomCategory("");
                  }}
                >
                  Lista
                </Button>
              </div>
            )}
          </div>

          {/* SubCategory - shown when a category is selected */}
          <SubCategorySelector
            availableSubCategories={availableSubCategories}
            value={subCategory}
            onChange={setSubCategory}
            visible={!!(category || (useCustomCategory && customCategory))}
            resetKey={category}
          />
        </>
      )}

      {/* Date */}
      <div className="space-y-2">
        <Label>Fecha</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-xl"
        />
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label>Notas (opcional)</Label>
        <Input
          placeholder="Notas adicionales..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-xl"
        />
      </div>

      {/* Receipt */}
      <div className="space-y-2">
        <Label>Recibo / Comprobante (opcional)</Label>
        <ReceiptUpload value={receiptUrl} onChange={setReceiptUrl} />
      </div>

      {/* Exclude from Budget */}
      {type !== "transfer" && (
        <div className="flex items-center justify-between py-2">
          <div>
            <Label className="text-xs">Excluir del presupuesto</Label>
            <p className="text-[10px] text-gray-400">Este movimiento no afectará tu presupuesto</p>
          </div>
          <Switch
            checked={excludeFromBudget}
            onCheckedChange={setExcludeFromBudget}
          />
        </div>
      )}

      {/* Submit */}
      <Button
        onClick={handleSubmit}
        disabled={loading || !amount || !description || (!accountId && type !== "transfer")}
        className={`w-full rounded-xl h-12 text-sm font-semibold ${
          type === "income"
            ? "bg-gradient-to-r from-emerald-600 to-teal-500"
            : type === "expense"
            ? "bg-gradient-to-r from-rose-500 to-pink-500"
            : "bg-gradient-to-r from-blue-500 to-cyan-500"
        }`}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin mr-2" />
        ) : null}
        {isEditing
          ? "Guardar Cambios"
          : type === "income"
          ? "Registrar Ingreso"
          : type === "expense"
          ? "Registrar Gasto"
          : "Registrar Transferencia"}
      </Button>
    </div>
  );

  // Use Dialog for editing, Sheet for creating (better mobile scroll)
  if (isEditing || !isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? "Editar Transacción" : "Nueva Transacción"}
            </DialogTitle>
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nueva Transacción</SheetTitle>
        </SheetHeader>
        {formContent}
      </SheetContent>
    </Sheet>
  );
}
