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
import { Loader2, Plus, X, Check } from "lucide-react";
import type { CategoryData } from "@/lib/types";

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
  onSuccess?: () => void;
}

export function BudgetForm({ open, onOpenChange, budget, prefilledCategory, onSuccess }: BudgetFormProps) {
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState(budget?.type || prefilledCategory?.type || "expense");
  const [category, setCategory] = useState(budget?.category || prefilledCategory?.category || "");
  const [customCategory, setCustomCategory] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [subCategory, setSubCategory] = useState(budget?.subCategory || prefilledCategory?.subCategory || "");
  const [amount, setAmount] = useState(budget?.amount?.toString() || (prefilledCategory?.suggestedAmount ? prefilledCategory.suggestedAmount.toString() : ""));
  const [period, setPeriod] = useState(budget?.period || "monthly");

  // Categories from API
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [newSubCategory, setNewSubCategory] = useState("");
  const [showNewSubCategory, setShowNewSubCategory] = useState(false);

  const isEditing = !!budget;

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
    setShowNewSubCategory(false);
    setNewSubCategory("");
  }, [category, isEditing]);

  const handleAddSubCategory = () => {
    if (newSubCategory.trim()) {
      setSubCategory(newSubCategory.trim());
      setShowNewSubCategory(false);
      setNewSubCategory("");
    }
  };

  const effectiveCategory = useCustom ? customCategory : category;

  const handleSubmit = async () => {
    const finalCategory = useCustom ? customCategory : category;
    if (!finalCategory || !amount) return;
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
          body: JSON.stringify(data),
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
    setShowNewSubCategory(false);
    setNewSubCategory("");
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
          {(category || (useCustom && customCategory)) && (
            <div className="space-y-2">
              <Label>Subcategoría (opcional)</Label>

              {/* Existing subcategories as tags */}
              {availableSubCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1">
                  {availableSubCategories.map((sub) => (
                    <button
                      key={sub}
                      onClick={() => setSubCategory(sub === subCategory ? "" : sub)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                        sub === subCategory
                          ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300"
                          : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-transparent hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              )}

              {/* New subcategory creation or input */}
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl h-9"
                    onClick={handleAddSubCategory}
                    disabled={!newSubCategory.trim()}
                  >
                    <Check className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-xl h-9"
                    onClick={() => {
                      setShowNewSubCategory(false);
                      setNewSubCategory("");
                    }}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder={subCategory || "Ej: Mercado, Restaurantes..."}
                    value={subCategory}
                    onChange={(e) => setSubCategory(e.target.value)}
                    className="rounded-xl flex-1 text-sm h-9"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-xl h-9 text-xs gap-1"
                    onClick={() => setShowNewSubCategory(true)}
                  >
                    <Plus className="size-3" />
                    Nueva
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Amount */}
          <div className="space-y-2">
            <Label>Monto Presupuestado</Label>
            <CurrencyInput value={amount} onChange={setAmount} showPrefix placeholder="0" className="rounded-xl h-12" />
          </div>

          {/* Preview bar */}
          {amount && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <p className="text-[10px] text-gray-400 mb-2">Vista previa</p>
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                  style={{ width: isEditing && budget ? `${Math.min(calcPercentage(budget.spent, parseFloat(amount) || 0), 100)}%` : "0%" }}
                />
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
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
