"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogBody, DialogStickyFooter } from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DaySelect } from "@/components/ui/day-select";
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
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";
import {
  Loader2,
  Calendar,
  DollarSign,
  Wallet,
  CreditCard,
  Repeat,
  ArrowDownRight,
  ArrowLeftRight,
  TrendingUp,
  PiggyBank,
} from "lucide-react";
import { SubCategorySelector } from "./subcategory-selector";
import type { CategoryData, Account, SubAccount, Debt } from "@/lib/types";

const frequencyOptions = [
  { value: "monthly", label: "Mensual", desc: "1 vez al mes" },
  { value: "biweekly", label: "Quincenal", desc: "2 veces al mes" },
  { value: "weekly", label: "Semanal", desc: "1 vez por semana" },
  { value: "yearly", label: "Anual", desc: "1 vez al año" },
  { value: "one_time", label: "Único", desc: "Solo una vez" },
];

const dayOfWeekOptions = [
  { value: 0, label: "Domingo" },
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
];

const frequencyMultiplier: Record<string, number> = {
  weekly: 52,
  biweekly: 24,
  monthly: 12,
  yearly: 1,
  one_time: 1,
};

interface RecurringPaymentData {
  id: string;
  description: string;
  amount: number;
  actualAmount: number | null;
  type: string;
  accountId: string | null;
  subAccountId: string | null;
  debtId: string | null;
  destinationAccountId: string | null;
  destinationSubAccountId: string | null;
  category: string | null;
  subCategory: string | null;
  scheduledDate: string;
  confirmedDate: string | null;
  status: string;
  frequency: string;
  notes: string | null;
  isRecurring: boolean;
}

interface RecurringFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  editingPayment?: RecurringPaymentData | null;
}

export function RecurringForm({
  open,
  onOpenChange,
  onSuccess,
  editingPayment,
}: RecurringFormProps) {
  const isEditing = !!editingPayment;

  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState<"expense" | "transfer" | "income">("expense");
  const [frequency, setFrequency] = useState("monthly");
  const [scheduledDate, setScheduledDate] = useState("");

  // Biweekly schedule state
  const [biweeklyDay1, setBiweeklyDay1] = useState(1);
  const [biweeklyAmount1, setBiweeklyAmount1] = useState("");
  const [biweeklyDay2, setBiweeklyDay2] = useState(15);
  const [biweeklyAmount2, setBiweeklyAmount2] = useState("");

  // Weekly schedule state
  const [weeklyDayOfWeek, setWeeklyDayOfWeek] = useState(5); // Friday
  const [weeklyAmount, setWeeklyAmount] = useState("");

  const [sourceType, setSourceType] = useState<"account" | "debt">("account");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [sourceDebtId, setSourceDebtId] = useState("");
  const [sourceSubAccountId, setSourceSubAccountId] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [destinationSubAccountId, setDestinationSubAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [useCustomCategory, setUseCustomCategory] = useState(false);
  const [subCategory, setSubCategory] = useState("");
  const [notes, setNotes] = useState("");
  const [isRecurring, setIsRecurring] = useState(true);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<CategoryData[]>([]);
  const [incomeCategories, setIncomeCategories] = useState<CategoryData[]>([]);

  // Current categories based on payment type
  const categories = paymentType === "income" ? incomeCategories : expenseCategories;

  // Get sub-accounts for destination account
  const destAccount = accounts.find((a) => a.id === destinationAccountId);
  const destSubAccounts = destAccount?.subAccounts || [];

  // Get sub-accounts for source account
  const sourceAccount = accounts.find((a) => a.id === sourceAccountId);
  const sourceSubAccounts = sourceAccount?.subAccounts || [];

  // Get subcategories for current category
  const currentCategoryData = categories.find((c) => c.name === category);
  const availableSubCategories = currentCategoryData?.subcategories || [];

  // Load accounts, debts, and categories when dialog opens
  useEffect(() => {
    if (open) {
      apiFetch<Account[]>("/api/accounts")
        .then(setAccounts)
        .catch(console.error);
      apiFetch<Debt[]>("/api/debts")
        .then(setDebts)
        .catch(console.error);
      apiFetch<Record<string, CategoryData[]>>("/api/categories?type=expense")
        .then((data) => setExpenseCategories(data.expense || []))
        .catch(console.error);
      apiFetch<Record<string, CategoryData[]>>("/api/categories?type=income")
        .then((data) => setIncomeCategories(data.income || []))
        .catch(console.error);
    }
  }, [open]);

  // Populate form when editing
  useEffect(() => {
    if (editingPayment && open) {
      setDescription(editingPayment.description);
      setPaymentType((editingPayment.type as "expense" | "transfer" | "income") || "expense");
      setFrequency(editingPayment.frequency);
      setCategory(editingPayment.category || "");
      setSubCategory(editingPayment.subCategory || "");
      setNotes(editingPayment.notes || "");
      setIsRecurring(editingPayment.isRecurring);

      // Populate schedule fields based on frequency
      if (editingPayment.frequency === "biweekly") {
        const day = new Date(editingPayment.scheduledDate).getDate();
        if (day <= 15) {
          setBiweeklyDay1(day);
          setBiweeklyAmount1(editingPayment.amount.toString());
        } else {
          setBiweeklyDay2(day);
          setBiweeklyAmount2(editingPayment.amount.toString());
        }
        setScheduledDate(new Date(editingPayment.scheduledDate).toISOString().split("T")[0]);
      } else if (editingPayment.frequency === "weekly") {
        const day = new Date(editingPayment.scheduledDate).getDay();
        setWeeklyDayOfWeek(day);
        setWeeklyAmount(editingPayment.amount.toString());
        setScheduledDate(new Date(editingPayment.scheduledDate).toISOString().split("T")[0]);
      } else {
        setAmount(editingPayment.amount.toString());
        setScheduledDate(
          new Date(editingPayment.scheduledDate).toISOString().split("T")[0]
        );
      }

      if (editingPayment.accountId && !editingPayment.debtId) {
        setSourceType("account");
        setSourceAccountId(editingPayment.accountId);
      } else if (editingPayment.debtId) {
        setSourceType("debt");
        setSourceDebtId(editingPayment.debtId);
        if (editingPayment.accountId) {
          setSourceAccountId(editingPayment.accountId);
        }
        if ((editingPayment as unknown as Record<string, unknown>).subAccountId) {
          setSourceSubAccountId((editingPayment as unknown as Record<string, unknown>).subAccountId as string);
        }
      }

      if (editingPayment.destinationAccountId) {
        setDestinationAccountId(editingPayment.destinationAccountId);
      }
      if (editingPayment.destinationSubAccountId) {
        setDestinationSubAccountId(editingPayment.destinationSubAccountId);
      }
    } else if (!open) {
      resetForm();
    }
  }, [editingPayment, open]);

  // When category changes, reset subcategory
  useEffect(() => {
    if (!editingPayment) {
      setSubCategory("");
    }
  }, [category, editingPayment]);

  // When payment type changes, reset type-specific fields
  useEffect(() => {
    if (paymentType === "transfer") {
      setSourceType("account");
      setSourceDebtId("");
      setCategory("");
      setSubCategory("");
    } else if (paymentType === "income") {
      setSourceType("account");
      setSourceDebtId("");
      setCategory("");
      setSubCategory("");
    }
  }, [paymentType]);

  const resetForm = () => {
    setDescription("");
    setAmount("");
    setPaymentType("expense");
    setFrequency("monthly");
    setScheduledDate("");
    setBiweeklyDay1(1);
    setBiweeklyAmount1("");
    setBiweeklyDay2(15);
    setBiweeklyAmount2("");
    setWeeklyDayOfWeek(5);
    setWeeklyAmount("");
    setSourceType("account");
    setSourceAccountId("");
    setSourceDebtId("");
    setSourceSubAccountId("");
    setDestinationAccountId("");
    setDestinationSubAccountId("");
    setCategory("");
    setCustomCategory("");
    setUseCustomCategory(false);
    setSubCategory("");
    setNotes("");
    setIsRecurring(true);
  };

  // Preview calculations — computed based on frequency
  const getMonthlyTotal = (): number => {
    if (frequency === "biweekly") {
      return (parseFloat(biweeklyAmount1) || 0) + (parseFloat(biweeklyAmount2) || 0);
    }
    if (frequency === "weekly") {
      return (parseFloat(weeklyAmount) || 0) * 4;
    }
    return parseFloat(amount) || 0;
  };

  const parsedAmount = getMonthlyTotal();
  const annualCost = parsedAmount * 12;

  const nextPaymentDate = useMemo(() => {
    if (!scheduledDate) return null;
    const d = new Date(scheduledDate + "T12:00:00");
    return d;
  }, [scheduledDate]);

  const selectedSourceName = useMemo(() => {
    if (paymentType === "transfer" || paymentType === "income") {
      const acc = accounts.find((a) => a.id === sourceAccountId);
      return acc?.name || null;
    }
    if (sourceType === "account") {
      const acc = accounts.find((a) => a.id === sourceAccountId);
      return acc?.name || null;
    } else {
      const debt = debts.find((d) => d.id === sourceDebtId);
      return debt?.name || null;
    }
  }, [paymentType, sourceType, sourceAccountId, sourceDebtId, accounts, debts]);

  const selectedSourceBalance = useMemo(() => {
    if (paymentType === "transfer" || paymentType === "income") {
      const acc = accounts.find((a) => a.id === sourceAccountId);
      return acc?.balance ?? null;
    }
    if (sourceType === "account") {
      const acc = accounts.find((a) => a.id === sourceAccountId);
      return acc?.balance ?? null;
    } else {
      const debt = debts.find((d) => d.id === sourceDebtId);
      return debt?.currentBalance ?? null;
    }
  }, [paymentType, sourceType, sourceAccountId, sourceDebtId, accounts, debts]);

  const selectedDestName = useMemo(() => {
    const acc = accounts.find((a) => a.id === destinationAccountId);
    return acc?.name || null;
  }, [destinationAccountId, accounts]);

  // Color scheme based on payment type
  const typeColorScheme = {
    expense: {
      activeBorder: "border-rose-300",
      activeBg: "bg-rose-50 dark:bg-rose-900/30",
      activeText: "text-rose-600",
      gradientStyle: { background: "linear-gradient(to right, #e11d48, #ec4899)" },
      tagBg: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-300",
    },
    income: {
      activeBorder: "border-emerald-300",
      activeBg: "bg-emerald-50 dark:bg-emerald-900/30",
      activeText: "text-emerald-600",
      gradientStyle: { background: "linear-gradient(to right, #059669, #14b8a6)" },
      tagBg: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300",
    },
    transfer: {
      activeBorder: "border-blue-300",
      activeBg: "bg-blue-50 dark:bg-blue-900/30",
      activeText: "text-blue-600",
      gradientStyle: { background: "linear-gradient(to right, #3b82f6, #06b6d4)" },
      tagBg: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-300",
    },
  };

  const scheme = typeColorScheme[paymentType];

  const buildPayload = (overrideAmount: number, overrideScheduledDate: string) => {
    const finalCategory = useCustomCategory ? customCategory : category;
    return {
      description,
      amount: overrideAmount,
      type: paymentType,
      frequency,
      scheduledDate: overrideScheduledDate,
      accountId: paymentType === "income"
        ? (sourceAccountId || null)
        : paymentType === "expense" && sourceType === "debt"
          ? (sourceAccountId || null)
          : (sourceAccountId || null),
      subAccountId: paymentType === "income"
        ? (sourceSubAccountId && sourceSubAccountId !== "none" ? sourceSubAccountId : null)
        : paymentType === "expense" && sourceType === "debt"
          ? (sourceSubAccountId && sourceSubAccountId !== "none" ? sourceSubAccountId : null)
          : null,
      debtId: paymentType === "expense" && sourceType === "debt" ? sourceDebtId || null : null,
      destinationAccountId: paymentType === "transfer" ? destinationAccountId || null : null,
      destinationSubAccountId: paymentType === "transfer" ? destinationSubAccountId || null : null,
      category: paymentType !== "transfer" ? (finalCategory || null) : null,
      subCategory: paymentType !== "transfer" ? (subCategory || null) : null,
      notes: notes || null,
      isRecurring,
    };
  };

  // Helper to compute the next occurrence of a day-of-month from a reference date
  const computeNextDate = (dayOfMonth: number): string => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    // Try current month
    const candidate = new Date(year, month, dayOfMonth, 12, 0, 0);
    if (candidate >= now) {
      return candidate.toISOString().split("T")[0];
    }
    // Try next month
    const next = new Date(year, month + 1, dayOfMonth, 12, 0, 0);
    return next.toISOString().split("T")[0];
  };

  // Helper to compute next occurrence of a day-of-week
  const computeNextWeekday = (dayOfWeek: number): string => {
    const now = new Date();
    const currentDay = now.getDay();
    let daysUntil = dayOfWeek - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    const next = new Date(now);
    next.setDate(now.getDate() + daysUntil);
    next.setHours(12, 0, 0, 0);
    return next.toISOString().split("T")[0];
  };

  const handleSubmit = async () => {
    // Validation
    if (!description) return;
    if (frequency === "biweekly") {
      if (!biweeklyAmount1 || parseFloat(biweeklyAmount1) <= 0) return;
      if (!biweeklyAmount2 || parseFloat(biweeklyAmount2) <= 0) return;
    } else if (frequency === "weekly") {
      if (!weeklyAmount || parseFloat(weeklyAmount) <= 0) return;
    } else {
      if (!amount || parseFloat(amount) <= 0 || !scheduledDate) return;
    }
    if (paymentType === "transfer" && (!sourceAccountId || !destinationAccountId)) return;
    if (paymentType === "income" && !sourceAccountId) return;

    setLoading(true);
    try {
      if (frequency === "biweekly") {
        // Create two separate recurring payment records
        const date1 = computeNextDate(biweeklyDay1);
        const date2 = computeNextDate(biweeklyDay2);
        const payload1 = buildPayload(parseFloat(biweeklyAmount1), date1);
        const payload2 = buildPayload(parseFloat(biweeklyAmount2), date2);

        if (isEditing && editingPayment) {
          // For editing biweekly, update the current record and let user handle the other
          await apiFetch(`/api/recurring/${editingPayment.id}`, {
            method: "PUT",
            body: JSON.stringify(payload1),
          });
        } else {
          await apiFetch("/api/recurring", {
            method: "POST",
            body: JSON.stringify(payload1),
          });
          await apiFetch("/api/recurring", {
            method: "POST",
            body: JSON.stringify(payload2),
          });
        }
      } else if (frequency === "weekly") {
        const date = computeNextWeekday(weeklyDayOfWeek);
        const payload = buildPayload(parseFloat(weeklyAmount), date);

        if (isEditing && editingPayment) {
          await apiFetch(`/api/recurring/${editingPayment.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        } else {
          await apiFetch("/api/recurring", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      } else {
        // Monthly / Yearly / One-time
        const payload = buildPayload(parseFloat(amount), scheduledDate);

        if (isEditing && editingPayment) {
          await apiFetch(`/api/recurring/${editingPayment.id}`, {
            method: "PUT",
            body: JSON.stringify(payload),
          });
        } else {
          await apiFetch("/api/recurring", {
            method: "POST",
            body: JSON.stringify(payload),
          });
        }
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving recurring payment:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl" scrollable>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>
            {isEditing ? "Editar Pago Recurrente" : "Nuevo Pago Recurrente"}
          </DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {/* Type Selector — 3 options */}
          <div className="space-y-2">
            <Label>Tipo de Movimiento</Label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "expense" as const, label: "Gasto", icon: ArrowDownRight, schemeKey: "expense" as const },
                { id: "income" as const, label: "Ingreso", icon: TrendingUp, schemeKey: "income" as const },
                { id: "transfer" as const, label: "Transferencia", icon: ArrowLeftRight, schemeKey: "transfer" as const },
              ].map((t) => {
                const Icon = t.icon;
                const isActive = paymentType === t.id;
                const tScheme = typeColorScheme[t.schemeKey];
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setPaymentType(t.id);
                      setCategory("");
                      setSubCategory("");
                    }}
                    className={`py-2.5 rounded-xl text-xs font-medium flex flex-col items-center gap-1 transition-all ${
                      isActive
                        ? `${tScheme.activeBg} ${tScheme.activeText} border-2 ${tScheme.activeBorder}`
                        : "bg-gray-50 dark:bg-gray-800 text-gray-400 border-2 border-transparent"
                    }`}
                  >
                    <Icon className="size-4" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Descripción</Label>
            <Input
              placeholder={
                paymentType === "transfer"
                  ? "Ej: Envío quincenal a PiBank"
                  : paymentType === "income"
                  ? "Ej: Salario, Freelance"
                  : "Ej: Netflix, Arriendo, Seguro auto"
              }
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Frequency — visual buttons */}
          <div className="space-y-2">
            <Label>Frecuencia</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {frequencyOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setFrequency(opt.value)}
                  className={`p-2 rounded-xl border-2 transition-all text-center ${
                    frequency === opt.value
                      ? `${scheme.activeBorder} ${scheme.activeBg}`
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                  }`}
                >
                  <p className={`text-[11px] font-bold ${frequency === opt.value ? scheme.activeText : "text-gray-600 dark:text-gray-400"}`}>
                    {opt.label}
                  </p>
                  <p className="text-[8px] text-gray-400 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Schedule fields — frequency dependent */}
          {frequency === "biweekly" ? (
            <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pagos Quincenales</Label>
              {[
                { label: "Primera quincena", day: biweeklyDay1, setDay: setBiweeklyDay1, amt: biweeklyAmount1, setAmt: setBiweeklyAmount1 },
                { label: "Segunda quincena", day: biweeklyDay2, setDay: setBiweeklyDay2, amt: biweeklyAmount2, setAmt: setBiweeklyAmount2 },
              ].map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <p className="text-[10px] text-gray-500 font-medium">{item.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <DaySelect
                      value={item.day}
                      onValueChange={item.setDay}
                      placeholder="Día"
                      className="rounded-xl h-9 text-xs"
                    />
                    <CurrencyInput
                      value={item.amt}
                      onChange={item.setAmt}
                      showPrefix
                      placeholder="0"
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>
                </div>
              ))}
              {((parseFloat(biweeklyAmount1) || 0) + (parseFloat(biweeklyAmount2) || 0)) > 0 && (
                <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-700">
                  Total mensual: <span className="font-semibold text-gray-600 dark:text-gray-300">{formatCurrency((parseFloat(biweeklyAmount1) || 0) + (parseFloat(biweeklyAmount2) || 0))}</span>
                </p>
              )}
            </div>
          ) : frequency === "weekly" ? (
            <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Pago Semanal</Label>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-[11px]">Día de la semana</Label>
                  <Select value={weeklyDayOfWeek.toString()} onValueChange={(v) => setWeeklyDayOfWeek(parseInt(v))}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dayOfWeekOptions.map((d) => (
                        <SelectItem key={d.value} value={d.value.toString()}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Monto por semana</Label>
                  <CurrencyInput
                    value={weeklyAmount}
                    onChange={setWeeklyAmount}
                    showPrefix
                    placeholder="0"
                    className="rounded-xl"
                  />
                </div>
              </div>
              {(parseFloat(weeklyAmount) || 0) > 0 && (
                <p className="text-[10px] text-gray-400 pt-1 border-t border-gray-200 dark:border-gray-700">
                  Total mensual estimado: <span className="font-semibold text-gray-600 dark:text-gray-300">{formatCurrency((parseFloat(weeklyAmount) || 0) * 4)}</span>
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Monthly / Yearly / One-time: single amount + date */}
              <div className="space-y-2">
                <Label>Monto Esperado</Label>
                <CurrencyInput
                  value={amount}
                  onChange={setAmount}
                  showPrefix
                  placeholder="0"
                  className="rounded-xl"
                />
              </div>

              <div className="space-y-2">
                <Label>Fecha Programada</Label>
                <Input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </>
          )}

          {/* TRANSFER TYPE */}
          {paymentType === "transfer" ? (
            <>
              {/* Source Account */}
              <div className="space-y-2">
                <Label>Desde Cuenta</Label>
                <Select value={sourceAccountId} onValueChange={(v) => { setSourceAccountId(v); setSourceSubAccountId(""); }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecciona cuenta origen" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        <span className="flex items-center gap-2">
                          <span className="size-2 rounded-full" style={{ backgroundColor: acc.color }} />
                          {acc.name} — {formatCurrency(acc.balance)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Source Sub-Account */}
              {sourceAccountId && sourceSubAccounts.length > 0 && (
                <div className="space-y-2">
                  <Label>Bolsillo origen (opcional)</Label>
                  <Select value={sourceSubAccountId} onValueChange={setSourceSubAccountId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Cuenta principal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Cuenta principal</SelectItem>
                      {sourceSubAccounts.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          <span className="flex items-center gap-2">
                            <PiggyBank className="size-3 text-gray-400" />
                            {sub.name} — {formatCurrency(sub.balance)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Destination Account */}
              <div className="space-y-2">
                <Label>Hacia Cuenta</Label>
                <Select value={destinationAccountId} onValueChange={(v) => { setDestinationAccountId(v); setDestinationSubAccountId(""); }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecciona cuenta destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((acc) => acc.id !== sourceAccountId)
                      .map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          <span className="flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ backgroundColor: acc.color }} />
                            {acc.name} — {formatCurrency(acc.balance)}
                          </span>
                        </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Destination Sub-Account */}
              {destinationAccountId && destSubAccounts.length > 0 && (
                <div className="space-y-2">
                  <Label>Bolsillo destino (opcional)</Label>
                  <Select value={destinationSubAccountId} onValueChange={setDestinationSubAccountId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Cuenta principal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Cuenta principal</SelectItem>
                      {destSubAccounts.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          <span className="flex items-center gap-2">
                            <PiggyBank className="size-3 text-gray-400" />
                            {sub.name} — {formatCurrency(sub.balance)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          ) : paymentType === "income" ? (
            <>
              {/* INCOME TYPE: Account + Sub-account + Category */}
              <div className="space-y-2">
                <Label>Cuenta de recepción</Label>
                <Select value={sourceAccountId} onValueChange={(v) => { setSourceAccountId(v); setSourceSubAccountId(""); }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Selecciona la cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        <span className="flex items-center gap-2">
                          <span className="size-2 rounded-full" style={{ backgroundColor: acc.color }} />
                          {acc.name} — {formatCurrency(acc.balance)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sub-account */}
              {sourceAccountId && sourceSubAccounts.length > 0 && (
                <div className="space-y-2">
                  <Label>Bolsillo (opcional)</Label>
                  <Select value={sourceSubAccountId} onValueChange={setSourceSubAccountId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Cuenta principal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Cuenta principal</SelectItem>
                      {sourceSubAccounts.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          <span className="flex items-center gap-2">
                            <PiggyBank className="size-3 text-gray-400" />
                            {sub.name} — {formatCurrency(sub.balance)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Category — income categories */}
              <div className="space-y-2">
                <Label>Categoría</Label>
                <Select value={category} onValueChange={(v) => { setCategory(v); setSubCategory(""); }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Seleccionar categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {incomeCategories.map((cat) => (
                      <SelectItem key={cat.name} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Sub-category — income uses emerald */}
              <SubCategorySelector
                availableSubCategories={availableSubCategories}
                value={subCategory}
                onChange={setSubCategory}
                visible={!!category}
                colorScheme="emerald"
                resetKey={category}
              />
            </>
          ) : (
            <>
              {/* EXPENSE TYPE: Source Type */}
              <div className="space-y-2">
                <Label>Origen del Pago</Label>
                <Select
                  value={sourceType}
                  onValueChange={(v) => {
                    setSourceType(v as "account" | "debt");
                    setSourceAccountId("");
                    setSourceDebtId("");
                  }}
                >
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="account">
                      <span className="flex items-center gap-2">
                        <Wallet className="size-3" />
                        Cuenta
                      </span>
                    </SelectItem>
                    <SelectItem value="debt">
                      <span className="flex items-center gap-2">
                        <CreditCard className="size-3" />
                        Tarjeta de Crédito / Deuda
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Source Account */}
              {sourceType === "account" && (
                <div className="space-y-2">
                  <Label>Cuenta Origen</Label>
                  <Select value={sourceAccountId} onValueChange={(v) => { setSourceAccountId(v); setSourceSubAccountId(""); }}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Selecciona una cuenta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          <span className="flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ backgroundColor: acc.color }} />
                            {acc.name} — {formatCurrency(acc.balance)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Source Account Sub-account */}
              {sourceType === "account" && sourceAccountId && sourceSubAccounts.length > 0 && (
                <div className="space-y-2">
                  <Label>Bolsillo (opcional)</Label>
                  <Select value={sourceSubAccountId} onValueChange={setSourceSubAccountId}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Cuenta principal" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Cuenta principal</SelectItem>
                      {sourceSubAccounts.map((sub) => (
                        <SelectItem key={sub.id} value={sub.id}>
                          <span className="flex items-center gap-2">
                            <PiggyBank className="size-3 text-gray-400" />
                            {sub.name} — {formatCurrency(sub.balance)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Source Debt */}
              {sourceType === "debt" && (
                <div className="space-y-2">
                  <Label>Tarjeta / Deuda</Label>
                  <Select value={sourceDebtId} onValueChange={(v) => { setSourceDebtId(v); setSourceAccountId(""); setSourceSubAccountId(""); }}>
                    <SelectTrigger className="rounded-xl">
                      <SelectValue placeholder="Selecciona una deuda" />
                    </SelectTrigger>
                    <SelectContent>
                      {debts.map((debt) => (
                        <SelectItem key={debt.id} value={debt.id}>
                          <span className="flex items-center gap-2">
                            <span className="size-2 rounded-full" style={{ backgroundColor: debt.color }} />
                            {debt.name} — Saldo: {formatCurrency(debt.currentBalance)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Debt paying account */}
              {sourceType === "debt" && sourceDebtId && (
                <>
                  <div className="space-y-2">
                    <Label>Cuenta que pagará la factura</Label>
                    <Select value={sourceAccountId} onValueChange={(v) => { setSourceAccountId(v); setSourceSubAccountId(""); }}>
                      <SelectTrigger className="rounded-xl">
                        <SelectValue placeholder="Selecciona la cuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>
                            <span className="flex items-center gap-2">
                              <span className="size-2 rounded-full" style={{ backgroundColor: acc.color }} />
                              {acc.name} — {formatCurrency(acc.balance)}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400">
                      Se registrará como gasto en la tarjeta de crédito. La cuenta se usará cuando pagues la factura.
                    </p>
                  </div>

                  {sourceAccountId && sourceSubAccounts.length > 0 && (
                    <div className="space-y-2">
                      <Label>Bolsillo que pagará la factura (opcional)</Label>
                      <Select value={sourceSubAccountId} onValueChange={setSourceSubAccountId}>
                        <SelectTrigger className="rounded-xl">
                          <SelectValue placeholder="Cuenta principal" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Cuenta principal</SelectItem>
                          {sourceSubAccounts.map((sub) => (
                            <SelectItem key={sub.id} value={sub.id}>
                              <span className="flex items-center gap-2">
                                <PiggyBank className="size-3 text-gray-400" />
                                {sub.name} — {formatCurrency(sub.balance)}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}

              {/* Category — expense categories */}
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
                      <SelectValue placeholder="Selecciona una categoría" />
                    </SelectTrigger>
                    <SelectContent>
                      {expenseCategories.map((cat) => (
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

              {/* SubCategory — expense uses rose */}
              <SubCategorySelector
                availableSubCategories={availableSubCategories}
                value={subCategory}
                onChange={setSubCategory}
                visible={!!(category || (useCustomCategory && customCategory))}
                colorScheme="rose"
                resetKey={category}
              />
            </>
          )}

          {/* Is Recurring Switch */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label className="flex items-center gap-1.5">
                <Repeat className="size-3.5" />
                Recurrente
              </Label>
              <p className="text-[10px] text-gray-400">
                Se generará el siguiente pago automáticamente
              </p>
            </div>
            <Switch
              checked={isRecurring}
              onCheckedChange={setIsRecurring}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notas (opcional)</Label>
            <Textarea
              placeholder="Notas adicionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl"
              rows={2}
            />
          </div>

          {/* Preview Card */}
          {parsedAmount > 0 && (
            <Card className={`border-0 shadow-sm rounded-xl ${paymentType === "expense" ? "bg-rose-50 dark:bg-rose-900/20" : paymentType === "income" ? "bg-emerald-50 dark:bg-emerald-900/20" : "bg-blue-50 dark:bg-blue-900/20"}`}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className={`size-3.5 ${paymentType === "expense" ? "text-rose-600 dark:text-rose-400" : paymentType === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-blue-600 dark:text-blue-400"}`} />
                  <span className={`text-xs font-semibold ${paymentType === "expense" ? "text-rose-700 dark:text-rose-400" : paymentType === "income" ? "text-emerald-700 dark:text-emerald-400" : "text-blue-700 dark:text-blue-400"}`}>
                    Vista Previa
                  </span>
                </div>
                <div className="space-y-1.5">
                  {frequency === "biweekly" && (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">1ra quincena (día {biweeklyDay1})</span>
                        <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">{formatCurrency(parseFloat(biweeklyAmount1) || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">2da quincena (día {biweeklyDay2})</span>
                        <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">{formatCurrency(parseFloat(biweeklyAmount2) || 0)}</span>
                      </div>
                    </>
                  )}
                  {frequency === "weekly" && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        Cada {dayOfWeekOptions.find((d) => d.value === weeklyDayOfWeek)?.label}
                      </span>
                      <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">{formatCurrency(parseFloat(weeklyAmount) || 0)}</span>
                    </div>
                  )}
                  {nextPaymentDate && frequency !== "biweekly" && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Calendar className="size-3" />
                        Próximo pago
                      </span>
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {formatDate(nextPaymentDate)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 dark:text-gray-400">
                      {frequency === "biweekly" ? "Total mensual" : frequency === "weekly" ? "Total mensual estimado" : "Costo anual estimado"}
                    </span>
                    <span className={`text-xs font-bold ${paymentType === "expense" ? "text-rose-700 dark:text-rose-400" : paymentType === "income" ? "text-emerald-700 dark:text-emerald-400" : "text-blue-700 dark:text-blue-400"}`}>
                      {frequency === "biweekly" || frequency === "weekly"
                        ? formatCurrency(parsedAmount)
                        : formatCurrency(annualCost)}
                    </span>
                  </div>
                  {selectedSourceName && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        {paymentType === "transfer" ? (
                          <ArrowLeftRight className="size-3" />
                        ) : paymentType === "income" ? (
                          <TrendingUp className="size-3" />
                        ) : sourceType === "account" ? (
                          <Wallet className="size-3" />
                        ) : (
                          <CreditCard className="size-3" />
                        )}
                        {selectedSourceName}
                      </span>
                      {selectedSourceBalance !== null && (
                        <span className="text-[10px] text-gray-400">
                          Saldo: {formatCurrency(selectedSourceBalance)}
                        </span>
                      )}
                    </div>
                  )}
                  {paymentType === "transfer" && selectedDestName && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <ArrowLeftRight className="size-3" />
                        → {selectedDestName}
                      </span>
                    </div>
                  )}
                  {category && (
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 dark:text-gray-400">
                        Categoría
                      </span>
                      <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                        {category}{subCategory ? ` / ${subCategory}` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </DialogBody>
        <DialogStickyFooter>
          <Button onClick={handleSubmit} disabled={loading || !description || (frequency === "biweekly" ? (!biweeklyAmount1 || parseFloat(biweeklyAmount1) <= 0 || !biweeklyAmount2 || parseFloat(biweeklyAmount2) <= 0) : frequency === "weekly" ? (!weeklyAmount || parseFloat(weeklyAmount) <= 0) : (!amount || parseFloat(amount) <= 0 || !scheduledDate)) || (paymentType === "transfer" && (!sourceAccountId || !destinationAccountId)) || (paymentType === "income" && !sourceAccountId)} className="w-full rounded-xl" style={scheme.gradientStyle}>
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {isEditing ? "Guardar Cambios" : "Crear Pago Recurrente"}
          </Button>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  );
}
