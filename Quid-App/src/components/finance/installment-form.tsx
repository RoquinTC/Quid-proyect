"use client";

import { useState, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, formatCurrency, getColombiaTodayString, toColombiaDateString } from "@/lib/api";
import { Loader2, Wallet, Info, AlertTriangle } from "lucide-react";
import type { Account, CategoryData, Installment } from "@/lib/types";

interface InstallmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debtId: string;
  editInstallment?: Installment | null;
  onSuccess?: () => void;
}

export function InstallmentForm({ open, onOpenChange, debtId, editInstallment, onSuccess }: InstallmentFormProps) {
  const isEditing = !!editInstallment;
  const hasPayments = editInstallment ? editInstallment.paidAmount > 0 : false;

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [totalInstallments, setTotalInstallments] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(getColombiaTodayString());
  const [accountId, setAccountId] = useState("");
  const [subAccountId, setSubAccountId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Category fields
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [subCategory, setSubCategory] = useState("");
  const [newSubCategory, setNewSubCategory] = useState("");
  const [showNewSubCategory, setShowNewSubCategory] = useState(false);
  const [categories, setCategories] = useState<CategoryData[]>([]);

  // Populate form when editing
  useEffect(() => {
    if (editInstallment && open) {
      setDescription(editInstallment.description);
      setTotalAmount(String(editInstallment.totalAmount));
      setTotalInstallments(String(editInstallment.totalInstallments));
      setPurchaseDate(toColombiaDateString(editInstallment.purchaseDate));
      setAccountId(editInstallment.accountId || "");
      setSubAccountId(editInstallment.subAccountId || "");
      setCategory(editInstallment.category || "");
      setSubCategory(editInstallment.subCategory || "");
      setUseCustomCategory(false);
      setCustomCategory("");
      setShowNewSubCategory(false);
      setNewSubCategory("");
    } else if (!open) {
      resetForm();
      setErrorMsg(null);
    }
  }, [editInstallment, open]);

  useEffect(() => {
    if (open) {
      apiFetch<Account[]>("/api/accounts")
        .then(setAccounts)
        .catch(console.error);
      apiFetch<Record<string, CategoryData[]>>("/api/categories?type=expense")
        .then((data) => setCategories(data.expense || []))
        .catch(console.error);
    }
  }, [open]);

  const selectedAccount = accounts.find((a) => a.id === accountId);
  const hasSubAccounts = selectedAccount && selectedAccount.subAccounts.length > 0;
  const installmentAmount =
    totalAmount && totalInstallments
      ? parseFloat(totalAmount) / parseInt(totalInstallments)
      : 0;

  // Get subcategories for current category
  const currentCategoryData = categories.find((c) => c.name === category);
  const availableSubCategories = currentCategoryData?.subcategories || [];

  const handleAddSubCategory = () => {
    if (newSubCategory.trim()) {
      setSubCategory(newSubCategory.trim());
      setShowNewSubCategory(false);
      setNewSubCategory("");
    }
  };

  const handleSubmit = async () => {
    if (!description || !totalAmount || !totalInstallments) return;
    setLoading(true);
    try {
      const finalCategory = useCustomCategory ? customCategory : category;

      if (isEditing && editInstallment) {
        // EDIT mode
        await apiFetch(`/api/installments/${editInstallment.id}`, {
          method: "PUT",
          body: JSON.stringify({
            description,
            totalAmount: parseFloat(totalAmount),
            totalInstallments: parseInt(totalInstallments),
            purchaseDate,
            accountId: accountId || null,
            subAccountId: subAccountId || null,
            category: finalCategory || null,
            subCategory: subCategory || null,
          }),
        });
      } else {
        // CREATE mode
        await apiFetch(`/api/debts/${debtId}/installments`, {
          method: "POST",
          body: JSON.stringify({
            description,
            totalAmount: parseFloat(totalAmount),
            totalInstallments: parseInt(totalInstallments),
            purchaseDate,
            accountId: accountId || null,
            subAccountId: subAccountId || null,
            category: finalCategory || null,
            subCategory: subCategory || null,
          }),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error(`Error ${isEditing ? "updating" : "creating"} installment:`, error);
      setErrorMsg(error instanceof Error ? error.message : "Error al guardar. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setDescription("");
    setTotalAmount("");
    setTotalInstallments("");
    setPurchaseDate(getColombiaTodayString());
    setAccountId("");
    setSubAccountId("");
    setCategory("");
    setCustomCategory("");
    setUseCustomCategory(false);
    setSubCategory("");
    setNewSubCategory("");
    setShowNewSubCategory(false);
    setErrorMsg(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-t-2xl sm:rounded-2xl max-h-dvh flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <SheetTitle>{isEditing ? "Editar Compra" : "Nueva Compra en Cuotas"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4 overflow-y-auto flex-1 overscroll-contain -webkit-overflow-scrolling-touch pb-4">
          {/* Error message */}
          {errorMsg && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
              <AlertTriangle className="size-4 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-red-700 dark:text-red-400">
                <p className="font-medium">Error</p>
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label>Descripción de la compra</Label>
            <Input
              placeholder="Ej: Nevera, Televisor..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Total Amount */}
          <div className="space-y-2">
            <Label>Monto Total</Label>
            <CurrencyInput value={totalAmount} onChange={setTotalAmount} showPrefix placeholder="0" className="rounded-xl" disabled={hasPayments} />
            {hasPayments && (
              <p className="text-[10px] text-amber-500 flex items-center gap-1">
                <AlertTriangle className="size-3" />
                No se puede modificar: ya hay pagos registrados
              </p>
            )}
          </div>

          {/* Number of Installments */}
          <div className="space-y-2">
            <Label>Número de Cuotas</Label>
            <Input
              type="number"
              min="1"
              placeholder="Ej: 12"
              value={totalInstallments}
              onChange={(e) => setTotalInstallments(e.target.value)}
              className="rounded-xl"
              disabled={hasPayments}
            />
            {hasPayments && (
              <p className="text-[10px] text-amber-500 flex items-center gap-1">
                <AlertTriangle className="size-3" />
                No se puede modificar: ya hay pagos registrados
              </p>
            )}
          </div>

          {/* Purchase Date */}
          <div className="space-y-2">
            <Label>Fecha de Compra</Label>
            <Input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* ============================================ */}
          {/* CATEGORY & SUBCATEGORY */}
          {/* ============================================ */}
          <div className="space-y-3 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl border border-rose-200 dark:border-rose-800">
            <p className="text-[10px] font-medium text-rose-600 dark:text-rose-400 uppercase tracking-wider">
              Categoría de presupuesto
            </p>
            <p className="text-[10px] text-rose-500/70 dark:text-rose-400/70">
              Selecciona la categoría para que las cuotas afecten tu presupuesto de gastos
            </p>

            {/* Category */}
            <div className="space-y-2">
              <Label className="text-xs">Categoría</Label>
              {!useCustomCategory ? (
                <Select
                  value={category}
                  onValueChange={(val) => {
                    if (val === "__custom__") {
                      setUseCustomCategory(true);
                      setCategory("");
                    } else {
                      setCategory(val);
                      setSubCategory("");
                    }
                  }}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecciona una categoría" />
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
                    ✕
                  </Button>
                </div>
              )}
            </div>

            {/* SubCategory */}
            {category && availableSubCategories.length > 0 && !showNewSubCategory && (
              <div className="space-y-2">
                <Label className="text-xs">Subcategoría</Label>
                <div className="flex gap-2">
                  <Select
                    value={subCategory}
                    onValueChange={(val) => {
                      if (val === "__new__") {
                        setShowNewSubCategory(true);
                        setSubCategory("");
                      } else {
                        setSubCategory(val);
                      }
                    }}
                  >
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Selecciona una subcategoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableSubCategories.map((sub) => (
                        <SelectItem key={sub} value={sub}>
                          {sub}
                        </SelectItem>
                      ))}
                      <SelectItem value="__new__">+ Nueva...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* New SubCategory Input */}
            {showNewSubCategory && (
              <div className="flex gap-2">
                <Input
                  placeholder="Nueva subcategoría"
                  value={newSubCategory}
                  onChange={(e) => setNewSubCategory(e.target.value)}
                  className="rounded-xl flex-1"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSubCategory();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  onClick={handleAddSubCategory}
                >
                  ✓
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-xl"
                  onClick={() => {
                    setShowNewSubCategory(false);
                    setNewSubCategory("");
                  }}
                >
                  ✕
                </Button>
              </div>
            )}

            {/* Show selected subcategory if custom */}
            {subCategory && !showNewSubCategory && availableSubCategories.includes(subCategory) === false && category && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Subcategoría:</span>
                <span className="font-medium text-gray-700 dark:text-gray-300">{subCategory}</span>
              </div>
            )}
          </div>

          {/* Account Selector */}
          <div className="space-y-2">
            <Label>Cuenta para pagar las cuotas</Label>
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setSubAccountId("");
              }}
              className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">Seleccionar cuenta (opcional)</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} — {formatCurrency(acc.balance)}
                </option>
              ))}
            </select>
          </div>

          {/* SubAccount Selector */}
          {hasSubAccounts && (
            <div className="space-y-2">
              <Label>Subcuenta (opcional)</Label>
              <select
                value={subAccountId}
                onChange={(e) => setSubAccountId(e.target.value)}
                className="w-full h-10 rounded-xl border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Toda la cuenta</option>
                {selectedAccount.subAccounts.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    🐷 {sub.name} — {formatCurrency(sub.balance)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Info Box */}
          {accountId && selectedAccount && (
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
              <Info className="size-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-400">
                Al generar el pago, se debitará de{" "}
                <strong>
                  {subAccountId
                    ? selectedAccount.subAccounts.find((s) => s.id === subAccountId)?.name ||
                      selectedAccount.name
                    : selectedAccount.name}
                </strong>{" "}
                (saldo:{" "}
                {formatCurrency(
                  subAccountId
                    ? selectedAccount.subAccounts.find((s) => s.id === subAccountId)?.balance || 0
                    : selectedAccount.balance
                )}
                )
              </p>
            </div>
          )}

          {/* Editing info: paid installments */}
          {isEditing && hasPayments && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="size-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-xs text-amber-700 dark:text-amber-400">
                <p className="font-medium">Compra con pagos registrados</p>
                <p>Cuota {editInstallment!.currentInstallment} de {editInstallment!.totalInstallments} — Pagado: {formatCurrency(editInstallment!.paidAmount)}</p>
                <p className="mt-1">Solo puedes editar descripción, categoría, cuenta y fecha.</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {installmentAmount > 0 && (
            <Card className="border-0 shadow-md rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wallet className="size-4 text-gray-500" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    Resumen
                  </span>
                </div>
                <div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>Compra:</span>
                    <span className="font-medium">{description || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Monto total:</span>
                    <span className="font-medium">{formatCurrency(parseFloat(totalAmount))}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cuotas:</span>
                    <span className="font-medium">{totalInstallments}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Valor cuota:</span>
                    <span className="font-medium">{formatCurrency(installmentAmount)}</span>
                  </div>
                  {(category || customCategory) && (
                    <div className="flex justify-between">
                      <span>Categoría:</span>
                      <span className="font-medium">{useCustomCategory ? customCategory : category}</span>
                    </div>
                  )}
                  {subCategory && (
                    <div className="flex justify-between">
                      <span>Subcategoría:</span>
                      <span className="font-medium">{subCategory}</span>
                    </div>
                  )}
                  {accountId && selectedAccount && (
                    <div className="flex justify-between">
                      <span>Cuenta:</span>
                      <span className="font-medium">{selectedAccount.name}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </div>

        {/* Submit — sticky at bottom */}
        <div className="flex-shrink-0 pt-2 border-t">
          <Button
            onClick={handleSubmit}
            disabled={loading || !description || !totalAmount || !totalInstallments}
            className={`w-full rounded-xl h-12 ${
              isEditing
                ? "bg-gradient-to-r from-blue-500 to-indigo-500"
                : "bg-gradient-to-r from-rose-500 to-pink-500"
            }`}
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Guardar Cambios" : "Crear Compra en Cuotas"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
