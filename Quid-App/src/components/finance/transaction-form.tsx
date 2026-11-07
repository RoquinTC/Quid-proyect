"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { maskAmountInput } from "@/lib/format/money-input";
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
import { ensureCategory } from "@/lib/categories/ensure-category";
import { Switch } from "@/components/ui/switch";
import { Loader2, ArrowUpRight, ArrowDownRight, Repeat, PiggyBank, Plus, X, Check, Sparkles, CalendarClock } from "lucide-react";
import { ReceiptUpload } from "./receipt-upload";
import { SubCategorySelector } from "./subcategory-selector";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { evaluateExpression } from "@/lib/parse/expression";
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
  onSuccess?: () => void | Promise<void>;
  /**
   * F-49 · Valores iniciales para aceptar una captura de la bandeja.
   * Solo se aplican al crear (nunca al editar).
   */
  prefill?: {
    amount?: string;
    category?: string;
    date?: string;
    /**
     * Cuenta destino de una transferencia. Se usa en el retiro en cajero:
     * la plata no se gasta, pasa a la cuenta de efectivo.
     */
    toAccountId?: string;
  } | null;
  /**
   * F-39 · Cuando se provee, el formulario ofrece registrar un "Pago":
   * una obligación futura que todavía no movió dinero. No crea una
   * transacción; abre el formulario de pago programado en modo único.
   */
  onCreatePayment?: () => void;
}

export function TransactionForm({
  open,
  onOpenChange,
  defaultAccountId,
  defaultType,
  defaultDescription,
  editTransaction,
  onSuccess,
  onCreatePayment,
  prefill,
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

  // F-03 · El monto acepta aritmética (12000/3, 2500+1800, (1200+800)*2).
  // Se evalúa de forma segura (sin eval) y el resultado se muestra al usuario
  // antes de guardar, para que una mala lectura del formato nunca pase inadvertida.
  const parsedAmount = useMemo(() => evaluateExpression(amount), [amount]);

  /** Añade un token al final del monto (operadores del teclado numérico móvil). */
  const appendToken = (token: string) => setAmount((prev) => `${prev}${token}`);

  // F-48 · Sugerencia de cuenta por categoría.
  // Un "cuenta predeterminada" fijo estaría mal la mitad de las veces: el patrón
  // real es categoría → cuenta (el arriendo sale de una, el mercado de otra).
  // Se aprende del historial y se marca visualmente como sugerencia.
  const [suggestion, setSuggestion] = useState<{
    accountId: string;
    subAccountId: string | null;
    count: number;
  } | null>(null);
  // Si el usuario toca una cuenta, la sugerencia deja de aplicarse.
  const [accountTouched, setAccountTouched] = useState(false);

  const normalizeSubAccountId = (value: string | null | undefined) =>
    value && value !== "none" && value !== "__none__" ? value : null;

  // Get sub-accounts for selected account
  const selectedAccount = accounts.find((a) => a.id === accountId);
  const subAccounts = selectedAccount?.subAccounts || [];

  const toAccount = accounts.find((a) => a.id === toAccountId);
  const toSubAccounts = toAccount?.subAccounts || [];

  // Get subcategories for current category
  const currentCategoryData = categories.find((c) => c.name === category);
  const availableSubCategories = currentCategoryData?.subcategories || [];
  const isSameTransferTarget = type === "transfer" &&
    !!accountId &&
    !!toAccountId &&
    accountId === toAccountId &&
    normalizeSubAccountId(subAccountId) === normalizeSubAccountId(toSubAccountId);

  useEffect(() => {
    if (editTransaction) {
      setType(editTransaction.type);
      setAmount(maskAmountInput(editTransaction.amount.toString()));
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
      // Antes se preseleccionaba `data[0]` en silencio, lo que registraba el gasto
      // en la primera cuenta de la lista si el usuario no lo notaba. Ahora no se
      // preselecciona nada: o lo elige el usuario, o lo sugiere la categoría.
    } catch (error) {
      console.error("Error fetching accounts:", error);
    }
  }, []);

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
    // Cambiar de ingreso a gasto (o al revés) invalida la sugerencia previa.
    setAccountTouched(false);
    setSuggestion(null);
  }, [type, editTransaction]);

  // When category changes, reset subcategory
  useEffect(() => {
    if (!editTransaction) {
      setSubCategory("");
    }
  }, [category, editTransaction]);

  // F-49 · Prellenar desde una captura de la bandeja (solo al crear).
  useEffect(() => {
    if (!open || !prefill || editTransaction) return;
    if (prefill.amount) setAmount(maskAmountInput(prefill.amount));
    if (prefill.category) setCategory(prefill.category);
    if (prefill.date) setDate(prefill.date);
    // Retiro en cajero: la cuenta destino es la de efectivo (por tipo, no por
    // nombre: puede llamarse "Moneditas").
    if (prefill.toAccountId) setToAccountId(prefill.toAccountId);
  }, [open, prefill, editTransaction]);
  // F-48 · Pide la sugerencia de cuenta para la categoría/subcategoría elegida.
  useEffect(() => {
    if (!open || isEditing || type === "transfer") {
      setSuggestion(null);
      return;
    }
    const effectiveCategory = useCustomCategory ? customCategory.trim() : category;
    if (!effectiveCategory) {
      setSuggestion(null);
      return;
    }

    let cancelled = false;
    const params = new URLSearchParams({ category: effectiveCategory, type });
    if (subCategory) params.set("subCategory", subCategory);

    apiFetch<{ suggestion: { accountId: string; subAccountId: string | null; count: number } | null }>(
      `/api/transactions/account-suggestion?${params.toString()}`
    )
      .then((res) => {
        if (!cancelled) setSuggestion(res.suggestion ?? null);
      })
      .catch(() => {
        if (!cancelled) setSuggestion(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open, isEditing, type, category, subCategory, useCustomCategory, customCategory]);

  // F-48 · Aplica la sugerencia mientras el usuario no haya tocado la cuenta.
  // No es silencioso: la cuenta queda marcada como "Sugerida" en la fila de chips.
  useEffect(() => {
    if (isEditing || type === "transfer" || accountTouched) return;
    if (!suggestion?.accountId) return;
    if (!accounts.some((a) => a.id === suggestion.accountId)) return;

    setAccountId(suggestion.accountId);
    if (suggestion.subAccountId) {
      setSubAccountId(suggestion.subAccountId);
    }
  }, [suggestion, accountTouched, isEditing, type, accounts]);

  const handleSubmit = async () => {
    if (!description) return;
    if (!parsedAmount.ok) {
      toast.error("Monto no válido", { description: parsedAmount.error });
      return;
    }
    if (parsedAmount.value <= 0) {
      toast.error("El monto debe ser mayor que cero");
      return;
    }
    if (type !== "transfer" && !accountId) return;
    if (type === "transfer" && (!accountId || !toAccountId)) return;
    if (isSameTransferTarget) {
      toast.error("El origen y el destino son el mismo lugar", {
        description: "Escoge otro bolsillo o la cuenta principal para mover el dinero.",
      });
      return;
    }
    setLoading(true);
    try {
      const finalCategory = useCustomCategory ? customCategory : category;

      // F-43 · Si el usuario escribió una categoría nueva, se guarda para que
      // aparezca en los selectores de aquí en adelante (antes se perdía).
      if (useCustomCategory && type !== "transfer" && finalCategory?.trim()) {
        await ensureCategory(type === "income" ? "income" : "expense", finalCategory);
      }

      const sourceSubAccountId = normalizeSubAccountId(subAccountId);
      const destinationSubAccountId = normalizeSubAccountId(toSubAccountId);
      if (isEditing) {
        await apiFetch(`/api/transactions/${editTransaction.id}`, {
          method: "PUT",
          body: JSON.stringify({
            type,
            amount: parsedAmount.value,
            description,
            accountId: accountId || null,
            subAccountId: sourceSubAccountId,
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
            amount: parsedAmount.value,
            description,
            accountId: accountId || null,
            subAccountId: sourceSubAccountId,
            category: type !== 'transfer' ? (finalCategory || 'Otros') : null,
            subCategory: type !== 'transfer' ? (subCategory || null) : null,
            date,
            notes: notes || null,
            excludeFromBudget,
            receiptUrl,
            transferToAccountId: type === 'transfer' ? toAccountId : undefined,
            transferToSubAccountId: type === 'transfer' ? destinationSubAccountId : undefined,
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

      await onSuccess?.();
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
    // La siguiente transacción vuelve a aceptar sugerencia por categoría.
    setAccountTouched(false);
    setSuggestion(null);
  };

  /**
   * F-48 · Chips de cuenta en lugar de un dropdown.
   * Con varias cuentas (y bolsillos) el desplegable obliga a abrir, buscar y
   * desplazarse; un chip es un toque. La cuenta sugerida se marca aparte para
   * que la preselección sea VISIBLE y no silenciosa.
   */
  const renderAccountChips = (
    value: string,
    onChange: (val: string) => void,
    label: string,
    suggestedAccountId?: string | null,
    suggestedSubAccountId?: string | null
  ) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      {accounts.length === 0 ? (
        <p className="text-xs text-gray-400">Cargando cuentas…</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {accounts.map((acc) => {
            const isActive = value === acc.id;
            const isSuggested = suggestedAccountId === acc.id && !isActive;
            return (
              <button
                key={acc.id}
                type="button"
                onClick={() => onChange(acc.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : isSuggested
                      ? "border-dashed border-emerald-300 bg-white text-gray-600 dark:border-emerald-800 dark:bg-gray-800 dark:text-gray-300"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
                title={isSuggested ? `Sugerida: la usas más para esta categoría` : acc.name}
              >
                <span
                  className="size-2 rounded-full shrink-0"
                  style={{ backgroundColor: acc.color }}
                />
                <span className="max-w-[9rem] truncate">{acc.name}</span>
                {isSuggested && <Sparkles className="size-3 text-emerald-500" />}
              </button>
            );
          })}
        </div>
      )}
      {suggestedSubAccountId && suggestedAccountId === value && (
        <p className="text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
          <Sparkles className="size-3" />
          Sugerida según tu historial de esta categoría
        </p>
      )}
    </div>
  );

  const renderSubAccountChips = (
    parentAccountId: string,
    value: string,
    onChange: (val: string) => void,
    subs: SubAccount[],
    suggestedSubAccountId?: string | null
  ) => {
    if (!parentAccountId || subs.length === 0) return null;
    return (
      <div className="space-y-2">
        <Label>Bolsillo (opcional)</Label>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onChange("none")}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
              normalizeSubAccountId(value) === null
                ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            Cuenta principal
          </button>
          {subs.map((sub) => {
            const isActive = value === sub.id;
            const isSuggested = suggestedSubAccountId === sub.id && !isActive;
            return (
              <button
                key={sub.id}
                type="button"
                onClick={() => onChange(sub.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-all ${
                  isActive
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : isSuggested
                      ? "border-dashed border-emerald-300 bg-white text-gray-600 dark:border-emerald-800 dark:bg-gray-800 dark:text-gray-300"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                <PiggyBank className="size-3 text-gray-400" />
                <span className="max-w-[9rem] truncate">{sub.name}</span>
                {isSuggested && <Sparkles className="size-3 text-emerald-500" />}
              </button>
            );
          })}
        </div>
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

      {/* F-39 · Pago = obligación futura, no gasto ya hecho.
          Va como enlace aparte para no apretar los tres tipos en móvil y
          porque NO crea una transacción: abre el pago programado. */}
      {onCreatePayment && !isEditing && (
        <button
          type="button"
          onClick={() => {
            onOpenChange(false);
            onCreatePayment();
          }}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100/70 dark:border-amber-800 dark:bg-amber-900/10 dark:text-amber-400 dark:hover:bg-amber-900/20"
          title="Registra algo que aún tienes que pagar; no afecta tu saldo hasta que lo pagues"
        >
          <CalendarClock className="size-3.5" />
          ¿Un pago que aún no hiciste? Regístralo como pago programado
        </button>
      )}

      {/* Amount */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label>Monto</Label>
          {parsedAmount.ok && parsedAmount.isExpression && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
              = {formatCurrency(parsedAmount.value)}
            </span>
          )}
          {!parsedAmount.ok && amount.trim() !== "" && (
            <span className="text-xs font-medium text-rose-500">{parsedAmount.error}</span>
          )}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
            $
          </span>
          <Input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0 o una operación: 12000/3"
            value={amount}
            onChange={(e) => {
              const raw = e.target.value;
              // La calculadora admite operadores (12000/3): si hay alguno se
              // respeta lo escrito y no se aplica la máscara de miles.
              const hasOperator = /[+\-*/()]/.test(raw);
              setAmount(hasOperator ? raw : maskAmountInput(raw));
            }}
            className="pl-7 pr-10 text-xl font-bold rounded-xl h-14"
          />
          {amount !== "" && (
            <button
              type="button"
              onClick={() => setAmount("")}
              aria-label="Limpiar monto"
              className="absolute right-2 top-1/2 -translate-y-1/2 size-8 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {/* Atajos de monto */}
        <div className="flex gap-2">
          {quickAmounts.map((qa) => (
            <button
              key={qa}
              type="button"
              onClick={() => setAmount(maskAmountInput(qa.toString()))}
              className="flex-1 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {formatCurrency(qa)}
            </button>
          ))}
        </div>

        {/* Operadores: el teclado numérico del móvil no los trae */}
        <div className="flex gap-1.5 items-center">
          <span className="text-[11px] text-gray-400 shrink-0 mr-0.5">Calcular</span>
          {[
            { token: "+", label: "+" },
            { token: "-", label: "−" },
            { token: "*", label: "×" },
            { token: "/", label: "÷" },
            { token: "(", label: "(" },
            { token: ")", label: ")" },
          ].map((op) => (
            <button
              key={op.token}
              type="button"
              onClick={() => appendToken(op.token)}
              className="flex-1 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {op.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setAmount((prev) => prev.slice(0, -1))}
            aria-label="Borrar último"
            className="flex-1 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ⌫
          </button>
        </div>

        {/* Dividir la cuenta entre varios */}
        <div className="flex gap-1.5 items-center">
          <span className="text-[11px] text-gray-400 shrink-0 mr-0.5">Dividir entre</span>
          {[2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => appendToken(`/${n}`)}
              className="flex-1 h-7 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
            >
              {n}
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
          {renderAccountChips(
            accountId,
            (v) => {
              setAccountId(v);
              setAccountTouched(true);
            },
            "Desde cuenta"
          )}
          {renderSubAccountChips(accountId, subAccountId, setSubAccountId, subAccounts)}
          {renderAccountChips(
            toAccountId,
            (v) => {
              setToAccountId(v);
              setAccountTouched(true);
            },
            "Hacia cuenta"
          )}
          {renderSubAccountChips(toAccountId, toSubAccountId, setToSubAccountId, toSubAccounts)}
          {isSameTransferTarget && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
              El origen y destino son iguales. Puedes mover de un bolsillo a la cuenta principal, de la cuenta principal a un bolsillo o entre bolsillos distintos.
            </p>
          )}
        </>
      ) : (
        <>
          {renderAccountChips(
            accountId,
            (v) => {
              setAccountId(v);
              setAccountTouched(true);
              // Al cambiar de cuenta, el bolsillo anterior deja de existir.
              setSubAccountId("");
            },
            "Cuenta",
            suggestion?.accountId ?? null,
            suggestion?.subAccountId ?? null
          )}
          {renderSubAccountChips(
            accountId,
            subAccountId,
            (v) => {
              setSubAccountId(v);
              setAccountTouched(true);
            },
            subAccounts,
            suggestion?.subAccountId ?? null
          )}
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
            <p className="text-xs text-gray-400">Este movimiento no afectará tu presupuesto</p>
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
        disabled={loading || !parsedAmount.ok || parsedAmount.value <= 0 || !description || (!accountId && type !== "transfer") || (type === "transfer" && (!accountId || !toAccountId || isSameTransferTarget))}
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
