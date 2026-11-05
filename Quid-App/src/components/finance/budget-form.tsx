"use client";

import { useState, useEffect, useCallback } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, formatCurrency, calcPercentage } from "@/lib/api";
import { ensureCategory } from "@/lib/categories/ensure-category";
import { Loader2 } from "lucide-react";
import { SubCategorySelector } from "./subcategory-selector";
import { Switch } from "@/components/ui/switch";
import type { CategoryData, Budget } from "@/lib/types";

interface BudgetFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget?: {
    id: string;
    type: string;
    category: string;
    subCategory?: string | null;
    amount: number;
    spent: number;
    period: string;
  } | null;
  prefilledCategory?: {
    category: string;
    subCategory?: string | null;
    type: string;
    suggestedAmount?: number;
  } | null;
  existingBudgets?: Budget[];
  onSuccess?: () => void;
}

export function BudgetForm({ open, onOpenChange, budget, prefilledCategory, existingBudgets, onSuccess }: BudgetFormProps) {
  const [loading, setLoading] = useState(false);
  const [sumIfExists, setSumIfExists] = useState(false);
  const [type, setType] = useState(budget?.type || prefilledCategory?.type || "expense");
  const [category, setCategory] = useState(budget?.category || prefilledCategory?.category || "");
  const [customCategory, setCustomCategory] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [subCategory, setSubCategory] = useState(budget?.subCategory || prefilledCategory?.subCategory || "");
  const [amount, setAmount] = useState(budget?.amount?.toString() || (prefilledCategory?.suggestedAmount ? prefilledCategory.suggestedAmount.toString() : ""));
  const [period, setPeriod] = useState(budget?.period || "monthly");

  // Categories from API
  const [categories, setCategories] = useState<CategoryData[]>([]);

  const isEditing = !!budget;

  const finalCategory = useCustom ? customCategory : category;
  const duplicateBudget = existingBudgets?.find(
    (b) =>
      b.type === type &&
      b.category.toLowerCase() === finalCategory.toLowerCase() &&
      (b.subCategory || "").toLowerCase() === (subCategory || "").toLowerCase()
  );

  useEffect(() => {
    if (duplicateBudget) {
      setSumIfExists(true);
    } else {
      setSumIfExists(false);
    }
  }, [duplicateBudget]);

  // Get subcategories for current category
  const currentCategoryData = categories.find((c) => c.name === category);
  const availableSubCategories = currentCategoryData?.subcategories || [];

  const fetchCategories = useCallback(async () => {
    try {
      const data = await apiFetch<Record<string, CategoryData[]>>(`/api/categories?type=${type}`);
      setCategories(data[type] || []);

      // If editing and the category is not in the list, switch to custom
      if (isEditing && budget?.category) {
        const found = (data[type] || []).find((c: CategoryData) => c.name === budget.category);
        if (!found && budget.category) {
          setUseCustom(true);
          setCustomCategory(budget.category);
        }
      }
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }, [type, isEditing, budget?.category]);

  useEffect(() => {
    if (open) fetchCategories();
  }, [open, fetchCategories]);

  // Sync from prefilledCategory when it changes
  useEffect(() => {
    if (prefilledCategory && !budget) {
      setType(prefilledCategory.type);
      setCategory(prefilledCategory.category);
      setSubCategory(prefilledCategory.subCategory || "");
      if (prefilledCategory.suggestedAmount) {
        setAmount(prefilledCategory.suggestedAmount.toString());
      }
      // Check if category is in the default list; if not, use custom input
      const isDefaultCategory =
        (prefilledCategory.type === "income" && ["Salario", "Freelance", "Inversiones", "Ventas", "Otros"].includes(prefilledCategory.category)) ||
        (prefilledCategory.type === "expense" && ["Alimentación", "Transporte", "Vivienda", "Salud", "Entretenimiento", "Educación", "Ropa", "Servicios", "Deudas", "Ahorros", "Suscripciones", "Otros"].includes(prefilledCategory.category));
      if (!isDefaultCategory) {
        setUseCustom(true);
        setCustomCategory(prefilledCategory.category);
        setCategory("");
      }
    }
  }, [prefilledCategory, budget]);

  // When type changes, reset category
  useEffect(() => {
    if (!isEditing && !prefilledCategory) {
      setCategory("");
      setSubCategory("");
    }
    if (!prefilledCategory) {
      setUseCustom(false);
      setCustomCategory("");
    }
  }, [type, isEditing, prefilledCategory]);

  // When category changes, reset subcategory
  useEffect(() => {
    if (!isEditing) {
      setSubCategory("");
    }
  }, [category, isEditing]);

  const effectiveCategory = useCustom ? customCategory : category;

  const handleSubmit = async () => {
    const finalCategory = useCustom ? customCategory : category;
    if (!finalCategory || !amount) return;

    // F-43 · Guardar la categoría nueva para que quede seleccionable a futuro.
    if (useCustom) {
      await ensureCategory(type === "income" ? "income" : "expense", finalCategory);
    }

    setLoading(true);
    try {
      const data = {
        type,
        category: finalCategory,
        subCategory: subCategory || null,
        amount: parseFloat(amount),
        period,
      };

      if (isEditing) {
        await apiFetch(`/api/budgets/${budget.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch("/api/budgets", {
          method: "POST",
          body: JSON.stringify({
            ...data,
            sumIfExists,
          }),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving budget:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!budget && !prefilledCategory) {
      setType("expense");
      setCategory("");
      setCustomCategory("");
      setUseCustom(false);
      setSubCategory("");
      setAmount("");
      setPeriod("monthly");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl" scrollable>
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{isEditing ? "Editar Presupuesto" : "Nuevo Presupuesto"}</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Type */}
          <div className="space-y-2">
            <Label>Tipo</Label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setType("income");
                  setCategory("");
                  setUseCustom(false);
                }}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                  type === "income"
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 border-2 border-emerald-300"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-400 border-2 border-transparent"
                }`}
              >
                Ingreso
              </button>
              <button
                onClick={() => {
                  setType("expense");
                  setCategory("");
                  setUseCustom(false);
                }}
                className={`flex-1 py-3 rounded-xl text-sm font-medium transition-all ${
                  type === "expense"
                    ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 border-2 border-rose-300"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-400 border-2 border-transparent"
                }`}
              >
                Gasto
              </button>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Categoría</Label>
            {!useCustom ? (
              <Select
                value={category}
                onValueChange={(val) => {
                  if (val === "__custom__") {
                    setUseCustom(true);
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
          <SubCategorySelector
            availableSubCategories={availableSubCategories}
            value={subCategory}
            onChange={setSubCategory}
            visible={!!(category || (useCustom && customCategory))}
            resetKey={category}
          />

          {/* Amount */}
          <div className="space-y-2">
            <Label>Monto Presupuestado</Label>
            <CurrencyInput value={amount} onChange={setAmount} showPrefix placeholder="0" className="rounded-xl h-12" />
          </div>

          {/* Sum If Exists warning/panel */}
          {!isEditing && duplicateBudget && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 rounded-xl space-y-2">
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                Ya existe un presupuesto de {formatCurrency(duplicateBudget.amount)} para esta categoría.
              </p>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-amber-950 dark:text-amber-200 cursor-pointer" htmlFor="sum-switch">
                  ¿Deseas sumar este monto al presupuesto existente?
                </Label>
                <Switch
                  id="sum-switch"
                  checked={sumIfExists}
                  onCheckedChange={setSumIfExists}
                />
              </div>
              {sumIfExists && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  El nuevo límite del presupuesto será {formatCurrency(duplicateBudget.amount + (parseFloat(amount) || 0))}.
                </p>
              )}
            </div>
          )}

          {/* Preview bar */}
          {amount && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-xs text-gray-400 mb-2">Vista previa</p>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                  style={{ width: isEditing && budget ? `${Math.min(calcPercentage(budget.spent, parseFloat(amount) || 0), 100)}%` : "0%" }}
                />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {isEditing ? formatCurrency(budget?.spent || 0) : formatCurrency(0)} / {formatCurrency(parseFloat(amount) || 0)}
              </p>
            </div>
          )}

          {/* Period */}
          <div className="space-y-2">
            <Label>Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensual</SelectItem>
                <SelectItem value="weekly">Semanal</SelectItem>
                <SelectItem value="yearly">Anual</SelectItem>
              </SelectContent>
            </Select>
          </div>

        </DialogBody>

        <DialogStickyFooter>
          <Button
            onClick={handleSubmit}
            disabled={loading || !effectiveCategory || !amount}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500"
          >
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
            {isEditing ? "Guardar Cambios" : "Crear Presupuesto"}
          </Button>
        </DialogStickyFooter>
      </DialogContent>
    </Dialog>
  );
}
