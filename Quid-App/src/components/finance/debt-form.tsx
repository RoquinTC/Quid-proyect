"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogStickyFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DaySelect } from "@/components/ui/day-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Loader2, Trash2, Pipette, Info, Plus, X, Check } from "lucide-react";
import type { CategoryData, Account } from "@/lib/types";

const colorPalette = [
  // Reds / Pinks
  "#EF4444", "#F43F5E", "#EC4899", "#BE185D",
  // Oranges / Ambers
  "#F59E0B", "#D97706", "#854D0E",
  // Greens
  "#22C55E", "#16A34A", "#166534", "#365314",
  // Teals / Cyans
  "#14B8A6", "#0D9488", "#0F766E", "#164E63",
  // Blues
  "#3B82F6", "#2563EB", "#1E3A5F",
  // Purples / Violets
  "#8B5CF6", "#7C3AED", "#6D28D9", "#312E81", "#4C1D95",
  // Two-tone spectrum
  "#A855F7", "#0EA5E9", "#10B981", "#84CC16",
  // Darks
  "#1E293B", "#581C87", "#831843", "#7C2D12",
  "#64748B",
];

const debtTypes = [
  { value: "credit_card", label: "Tarjeta de Crédito" },
  { value: "loan", label: "Préstamo" },
  { value: "other", label: "Otro" },
];

const paymentTypes = [
  { value: "fixed", label: "Cuota Fija", description: "Amortización francesa — mismo valor cada mes" },
  { value: "variable", label: "Cuota Variable", description: "El valor de la cuota cambia cada periodo" },
];

interface DebtFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  editDebt?: {
    id: string;
    type: string;
    name: string;
    color: string;
    bank?: string | null;
    totalAmount: number;
    currentBalance: number;
    interestRate?: number | null;
    cutoffDate?: number | null;
    paymentDate?: number | null;
    monthlyPayment?: number | null;
    remainingPayments?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    paymentType?: string | null;
    otherCharges?: number | null;
    category?: string | null;
    subCategory?: string | null;
    accountId?: string | null;
    subAccountId?: string | null;
  };
}

export function DebtForm({ open, onOpenChange, onSuccess, editDebt }: DebtFormProps) {
  const isEditing = !!editDebt;
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [type, setType] = useState("credit_card");
  const [name, setName] = useState("");
  const [color, setColor] = useState("#EF4444");
  const [bank, setBank] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [interestRate, setInterestRate] = useState("");
  const [cutoffDate, setCutoffDate] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [monthlyPayment, setMonthlyPayment] = useState("");
  const [remainingPayments, setRemainingPayments] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showCustomColor, setShowCustomColor] = useState(false);
  const [customColorHex, setCustomColorHex] = useState("");
  // ── Loan-specific state ──
  const [paymentType, setPaymentType] = useState("fixed");
  const [otherCharges, setOtherCharges] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [subCategory, setSubCategory] = useState("");
  const [loanAccountId, setLoanAccountId] = useState("");
  const [loanSubAccountId, setLoanSubAccountId] = useState("");
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [newSubCategory, setNewSubCategory] = useState("");
  const [showNewSubCategory, setShowNewSubCategory] = useState(false);

  // Pre-populate form when editing
  useEffect(() => {
    if (editDebt) {
      setType(editDebt.type || "credit_card");
      setName(editDebt.name || "");
      setColor(editDebt.color || "#EF4444");
      setBank(editDebt.bank || "");
      setTotalAmount(editDebt.totalAmount?.toString() || "");
      setCurrentBalance(editDebt.currentBalance?.toString() || "");
      setInterestRate(editDebt.interestRate?.toString() || "");
      setCutoffDate(editDebt.cutoffDate?.toString() || "");
      setPaymentDate(editDebt.paymentDate?.toString() || "");
      setMonthlyPayment(editDebt.monthlyPayment?.toString() || "");
      setRemainingPayments(editDebt.remainingPayments?.toString() || "");
      setStartDate(editDebt.startDate ? editDebt.startDate.split("T")[0] : "");
      setEndDate(editDebt.endDate ? editDebt.endDate.split("T")[0] : "");
      setPaymentType(editDebt.paymentType || "fixed");
      setOtherCharges(editDebt.otherCharges?.toString() || "");
      setCategory(editDebt.category || "");
      setSubCategory(editDebt.subCategory || "");
      setLoanAccountId(editDebt.accountId || "");
      setLoanSubAccountId(editDebt.subAccountId || "");
    } else {
      resetForm();
    }
  }, [editDebt, open]);

  const resetForm = () => {
    setType("credit_card");
    setName("");
    setColor("#EF4444");
    setBank("");
    setTotalAmount("");
    setCurrentBalance("0");
    setInterestRate("");
    setCutoffDate("");
    setPaymentDate("");
    setMonthlyPayment("");
    setRemainingPayments("");
    setStartDate("");
    setEndDate("");
    setShowCustomColor(false);
    setCustomColorHex("");
    setPaymentType("fixed");
    setOtherCharges("");
    setCategory("");
    setCustomCategory("");
    setUseCustom(false);
    setSubCategory("");
    setLoanAccountId("");
    setLoanSubAccountId("");
    setNewSubCategory("");
    setShowNewSubCategory(false);
  };

  const isCreditCard = type === "credit_card";
  const isLoan = type === "loan";
  const isFixedCuota = isLoan && paymentType === "fixed";
  const totalNum = parseFloat(totalAmount) || 0;
  const balanceNum = parseFloat(currentBalance) || 0;
  const cupoDisponible = Math.max(totalNum - balanceNum, 0);

  // ── Auto-calculate for loan fixed cuota ──
  const rateNum = parseFloat(interestRate) || 0;
  const monthlyPaymentNum = parseFloat(monthlyPayment) || 0;
  const otherChargesNum = parseFloat(otherCharges) || 0;

  // For loans: interestRate is NMV (annual nominal), monthly rate = NMV / 12
  const monthlyRateNum = isLoan && rateNum > 0 ? rateNum / 12 : rateNum;
  // Estimated capital = cuota fija - intereses estimados - otros gastos
  const estimatedInterest = isFixedCuota && monthlyRateNum > 0 ? balanceNum * (monthlyRateNum / 100) : 0;
  const estimatedCapital = isFixedCuota && monthlyPaymentNum > 0
    ? Math.max(monthlyPaymentNum - estimatedInterest - otherChargesNum, 0)
    : 0;

  // ── Category helpers ──
  const currentCategoryData = categories.find((c) => c.name === category);
  const availableSubCategories = currentCategoryData?.subcategories || [];
  const effectiveCategory = useCustom ? customCategory : category;
  const selectedAccount = accounts.find(a => a.id === loanAccountId);
  const availableSubAccounts = selectedAccount?.subAccounts || [];

  // Fetch categories and accounts when form opens
  useEffect(() => {
    if (open) {
      apiFetch<Record<string, CategoryData[]>>(`/api/categories?type=expense`).then(data => {
        setCategories(data.expense || []);
      }).catch(console.error);
      apiFetch<Account[]>('/api/accounts').then(data => {
        setAccounts(data || []);
      }).catch(console.error);
    }
  }, [open]);

  const handleAddSubCategory = () => {
    if (newSubCategory.trim()) {
      setSubCategory(newSubCategory.trim());
      setShowNewSubCategory(false);
      setNewSubCategory("");
    }
  };

  const handleSubmit = async () => {
    if (!name || !totalAmount) return;
    if (isLoan && !paymentDate) return; // Need payment day for loans
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        type,
        name,
        color,
        bank: bank || null,
        totalAmount: parseFloat(totalAmount),
        currentBalance: parseFloat(currentBalance) || 0,
        interestRate: interestRate ? parseFloat(interestRate) : null,
        cutoffDate: isCreditCard && cutoffDate ? parseInt(cutoffDate) : null,
        paymentDate: paymentDate ? parseInt(paymentDate) : null,
        monthlyPayment: isLoan && monthlyPayment ? parseFloat(monthlyPayment) : null,
        remainingPayments: isLoan && remainingPayments ? parseInt(remainingPayments) : null,
        startDate: startDate || null,
        endDate: endDate || null,
        paymentType: isLoan ? paymentType : null,
        otherCharges: isLoan && otherCharges ? parseFloat(otherCharges) : null,
        category: isLoan ? (effectiveCategory || null) : null,
        subCategory: isLoan ? (subCategory || null) : null,
        accountId: isLoan ? (loanAccountId || null) : null,
        subAccountId: isLoan ? (loanSubAccountId || null) : null,
      };

      if (isEditing && editDebt) {
        await apiFetch(`/api/debts/${editDebt.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/debts", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving debt:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editDebt) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/debts/${editDebt.id}`, { method: "DELETE" });
      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error deleting debt:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleCustomColorChange = (hex: string) => {
    setCustomColorHex(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      setColor(hex);
    }
  };

  const handleColorPickerChange = (picked: string) => {
    setColor(picked);
    setCustomColorHex(picked);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl" scrollable>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>
            {isEditing ? "Editar Deuda" : "Nueva Deuda"}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Type */}
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => {
              setType(v);
              if (v === "credit_card" && !isEditing) {
                setCurrentBalance("0");
                setPaymentType("fixed");
              }
              if (v === "loan" && !isEditing) {
                setPaymentType("fixed");
                setCurrentBalance(totalAmount || "0");
              }
            }}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {debtTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label>Nombre</Label>
            <Input
              placeholder={isCreditCard ? "Ej: Visa Gold" : isLoan ? "Ej: Crédito Libre Inversión" : "Ej: Deuda personal"}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Bank */}
          <div className="space-y-2">
            <Label>Banco (opcional)</Label>
            <Input
              placeholder="Ej: Bancolombia"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* ── Loan: Payment Type Selection ── */}
          {isLoan && (
            <div className="space-y-2">
              <Label>Tipo de Cuota</Label>
              <div className="grid grid-cols-2 gap-2">
                {paymentTypes.map((pt) => (
                  <button
                    key={pt.value}
                    type="button"
                    onClick={() => setPaymentType(pt.value)}
                    className={`rounded-xl p-3 text-left border-2 transition-all ${
                      paymentType === pt.value
                        ? "border-rose-500 bg-rose-50 dark:bg-rose-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                    }`}
                  >
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      {pt.label}
                    </div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {pt.description}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Total Amount */}
          <div className="space-y-2">
            <Label>{isCreditCard ? "Cupo Total (límite de crédito)" : isLoan ? "Monto Total del Préstamo" : "Monto Total"}</Label>
            <CurrencyInput
              value={totalAmount}
              onChange={(val) => {
                setTotalAmount(val);
                // Auto-set currentBalance for loans on creation
                if (isLoan && !isEditing) {
                  setCurrentBalance(val);
                }
              }}
              showPrefix
              placeholder="0"
              className="rounded-xl"
            />
            {isLoan && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Incluye todo lo que te prestaron (seguros, comisiones incluidas en el crédito). Ej: recibiste $7M pero el préstamo fue por $7.8M
              </p>
            )}
          </div>

          {/* Current Balance */}
          <div className="space-y-2">
            <Label>
              {isCreditCard ? "Saldo en Deuda (dinero utilizado)" : "Saldo Actual (lo que debes hoy)"}
            </Label>
            <CurrencyInput
              value={currentBalance}
              onChange={setCurrentBalance}
              showPrefix
              placeholder="0"
              className="rounded-xl"
            />
            {isCreditCard && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Este es el dinero que ya has utilizado de la tarjeta, no el saldo disponible
              </p>
            )}
          </div>

          {/* Cupo Disponible live calculation — only credit card */}
          {isCreditCard && totalNum > 0 && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-700 dark:text-emerald-400">Cupo Disponible</span>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(cupoDisponible)}
                </span>
              </div>
            </div>
          )}

          {/* Interest Rate */}
          <div className="space-y-2">
            <Label>
              Tasa de Interés % {isLoan ? "(NMV anual — nominal mes vencido)" : "(opcional)"}
            </Label>
            <Input
              type="number"
              step="0.01"
              placeholder={isLoan ? "Ej: 17.98" : "Ej: 24.5"}
              value={interestRate}
              onChange={(e) => setInterestRate(e.target.value)}
              className="rounded-xl"
            />
            {isLoan && (
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                La tasa NMV anual que aparece en tu extracto. Se divide entre 12 para obtener la tasa mensual. Ej: 17.98% NMV → 1.4983% mensual
              </p>
            )}
          </div>

          {/* Credit card specific fields */}
          {isCreditCard && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Día de Corte</Label>
                <DaySelect
                  value={cutoffDate ? parseInt(cutoffDate) : 1}
                  onValueChange={(d) => setCutoffDate(d.toString())}
                  placeholder="Día de corte"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Día de Pago</Label>
                <DaySelect
                  value={paymentDate ? parseInt(paymentDate) : 1}
                  onValueChange={(d) => setPaymentDate(d.toString())}
                  placeholder="Día de pago"
                  className="rounded-xl"
                />
              </div>
            </div>
          )}

          {/* ── Loan specific fields ── */}
          {isLoan && (
            <>
              {/* Day of payment */}
              <div className="space-y-2">
                <Label>Día de Pago Mensual</Label>
                <DaySelect
                  value={paymentDate ? parseInt(paymentDate) : 1}
                  onValueChange={(d) => setPaymentDate(d.toString())}
                  placeholder="Día de Pago"
                  className="rounded-xl"
                />
              </div>

              {/* Fixed cuota fields */}
              {paymentType === "fixed" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Valor Cuota Fija</Label>
                      <CurrencyInput
                        value={monthlyPayment}
                        onChange={setMonthlyPayment}
                        showPrefix
                        placeholder="0"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Plazo (meses)</Label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={remainingPayments}
                        onChange={(e) => setRemainingPayments(e.target.value)}
                        className="rounded-xl"
                      />
                    </div>
                  </div>

                  {/* Other charges */}
                  <div className="space-y-2">
                    <Label>Otros Gastos Mensuales (seguro, papelería, IVA)</Label>
                    <CurrencyInput
                      value={otherCharges}
                      onChange={setOtherCharges}
                      showPrefix
                      placeholder="0"
                      className="rounded-xl"
                    />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Gastos fijos que vienen en el extracto aparte de capital e intereses. Ej: seguro de vida $7,213 + papelería $200 + IVA $38
                    </p>
                  </div>

                  {/* Live calculation preview */}
                  {monthlyPaymentNum > 0 && rateNum > 0 && (
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800 space-y-2">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Info className="size-3.5 text-blue-500" />
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Estimación del Pago</span>
                      </div>
                      <div className="text-xs space-y-1">
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                          <span>Saldo actual:</span>
                          <span>{formatCurrency(balanceNum)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                          <span>Intereses estimados ({monthlyRateNum.toFixed(4)}% mensual):</span>
                          <span className="text-amber-600 font-medium">{formatCurrency(estimatedInterest)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                          <span>Otros gastos:</span>
                          <span>{formatCurrency(otherChargesNum)}</span>
                        </div>
                        <div className="flex justify-between text-gray-600 dark:text-gray-400">
                          <span>Capital estimado:</span>
                          <span className="text-emerald-600 font-medium">{formatCurrency(estimatedCapital)}</span>
                        </div>
                        <div className="flex justify-between text-gray-900 dark:text-white font-medium pt-1 border-t">
                          <span>Cuota total:</span>
                          <span>{formatCurrency(monthlyPaymentNum)}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-blue-500 dark:text-blue-400 mt-1">
                        Al pagar podrás confirmar los valores exactos del extracto bancario
                      </p>
                    </div>
                  )}
                </>
              )}

              {/* Variable cuota fields */}
              {paymentType === "variable" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Cuotas Restantes</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={remainingPayments}
                      onChange={(e) => setRemainingPayments(e.target.value)}
                      className="rounded-xl"
                    />
                  </div>
                </div>
              )}

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Fecha Inicio</Label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Fecha Fin</Label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="rounded-xl"
                  />
                </div>
              </div>

              {/* ── Category / SubCategory for Budget ── */}
              <div className="space-y-2">
                <Label>Categoría de Presupuesto</Label>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  La cuota se registrará como gasto en esta categoría del presupuesto
                </p>
                {!useCustom ? (
                  <Select
                    value={category}
                    onValueChange={(val) => {
                      if (val === "__custom__") {
                        setUseCustom(true);
                        setCategory("");
                      } else {
                        setCategory(val);
                        setSubCategory("");
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
                        setUseCustom(false);
                        setCustomCategory("");
                      }}
                    >
                      Lista
                    </Button>
                  </div>
                )}
              </div>

              {/* Sub-category */}
              {(category || (useCustom && customCategory)) && (
                <div className="space-y-2">
                  <Label>Subcategoría (opcional)</Label>
                  {availableSubCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {availableSubCategories.map((sub) => (
                        <button
                          key={sub}
                          onClick={() => setSubCategory(sub === subCategory ? "" : sub)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                            sub === subCategory
                              ? "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-300"
                              : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-transparent hover:bg-gray-200 dark:hover:bg-gray-600"
                          }`}
                        >
                          {sub}
                        </button>
                      ))}
                    </div>
                  )}
                  {showNewSubCategory ? (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nueva subcategoría..."
                        value={newSubCategory}
                        onChange={(e) => setNewSubCategory(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddSubCategory();
                        }}
                        className="rounded-xl flex-1 text-sm h-9"
                      />
                      <Button variant="outline" size="sm" className="rounded-xl h-9" onClick={handleAddSubCategory} disabled={!newSubCategory.trim()}>
                        <Check className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" className="rounded-xl h-9" onClick={() => { setShowNewSubCategory(false); setNewSubCategory(""); }}>
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        placeholder={subCategory || "Ej: Préstamo personal, Vehículo..."}
                        value={subCategory}
                        onChange={(e) => setSubCategory(e.target.value)}
                        className="rounded-xl flex-1 text-sm h-9"
                      />
                      <Button variant="outline" size="sm" className="rounded-xl h-9 text-xs gap-1" onClick={() => setShowNewSubCategory(true)}>
                        <Plus className="size-3" />
                        Nueva
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ── Account from which cuotas are paid ── */}
              <div className="space-y-2">
                <Label>Cuenta de Pago</Label>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  La cuenta desde donde se debitará el pago de cada cuota
                </p>
                <Select value={loanAccountId} onValueChange={(val) => { setLoanAccountId(val); setLoanSubAccountId(""); }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Seleccionar cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({formatCurrency(acc.balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sub-account selection (if account has sub-accounts) */}
              {loanAccountId && availableSubAccounts.length > 0 && (
                <div className="space-y-2">
                  <Label>Subcuenta (opcional)</Label>
                  <Select value={loanSubAccountId} onValueChange={setLoanSubAccountId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Seleccionar subcuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Cuenta principal</SelectItem>
                      {availableSubAccounts.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          {sub.name} ({formatCurrency(sub.balance)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}

          {/* Other type fields */}
          {type === "other" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Cuota Mensual</Label>
                <CurrencyInput
                  value={monthlyPayment}
                  onChange={setMonthlyPayment}
                  showPrefix
                  placeholder="0"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Cuotas Restantes</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={remainingPayments}
                  onChange={(e) => setRemainingPayments(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
          )}

          {/* Color Palette */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Color</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[10px]"
                onClick={() => setShowCustomColor(!showCustomColor)}
              >
                <Pipette className="size-3 mr-1" />
                Personalizado
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {colorPalette.map((c) => (
                <button
                  key={c}
                  onClick={() => {
                    setColor(c);
                    setCustomColorHex(c);
                  }}
                  className={`size-7 rounded-full transition-transform border border-white/30 ${
                    color === c ? "scale-125 ring-2 ring-offset-2 ring-gray-400" : ""
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Custom Color Picker */}
          {showCustomColor && (
            <div className="space-y-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => handleColorPickerChange(e.target.value)}
                  className="size-10 rounded-lg cursor-pointer border-0 p-0"
                />
                <div className="flex-1">
                  <Label className="text-[10px]">Código Hex</Label>
                  <Input
                    value={customColorHex}
                    onChange={(e) => handleCustomColorChange(e.target.value)}
                    placeholder="#FF5500"
                    className="rounded-xl h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Color Preview */}
          <div className="rounded-xl overflow-hidden h-12 relative" style={{ backgroundColor: color }}>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-medium text-white/90 drop-shadow-sm">
                {name || "Vista previa"}
              </span>
            </div>
          </div>

        </DialogBody>
        <DialogStickyFooter>
          <Button
            onClick={handleSubmit}
            disabled={loading || !name || !totalAmount || (isLoan && !paymentDate)}
            className="w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-500"
          >
            {loading && <Loader2 className="size-4 animate-spin mr-2" />}
            {isEditing ? "Guardar Cambios" : "Crear Deuda"}
          </Button>

          {/* Delete button when editing */}
          {isEditing && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
              className="w-full rounded-xl"
            >
              {deleting ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="size-4 mr-2" />
              )}
              Eliminar Deuda
            </Button>
          )}
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  );
}
