"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Pencil,
  Trash2,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  Tag,
  FolderOpen,
  FolderClosed,
  Plus,
  Palette,
} from "lucide-react";
import { toast } from "sonner";
import type { CategoryData, CategoriesByType } from "@/lib/types";

// Predefined icon options for custom categories
const ICON_OPTIONS = [
  { value: "Utensils", label: "🍽️ Alimentación" },
  { value: "Car", label: "🚗 Transporte" },
  { value: "Home", label: "🏠 Vivienda" },
  { value: "Heart", label: "❤️ Salud" },
  { value: "Gamepad2", label: "🎮 Entretenimiento" },
  { value: "GraduationCap", label: "📚 Educación" },
  { value: "Shirt", label: "👕 Ropa" },
  { value: "Receipt", label: "🧾 Servicios" },
  { value: "CreditCard", label: "💳 Deudas" },
  { value: "PiggyBank", label: "🐷 Ahorros" },
  { value: "Briefcase", label: "💼 Trabajo" },
  { value: "DollarSign", label: "💵 Dinero" },
  { value: "Gift", label: "🎁 Regalos" },
  { value: "Baby", label: "👶 Bebé" },
  { value: "Dog", label: "🐕 Mascota" },
  { value: "Dumbbell", label: "🏋️ Ejercicio" },
  { value: "Plane", label: "✈️ Viajes" },
  { value: "Music", label: "🎵 Música" },
  { value: "Coffee", label: "☕ Café" },
  { value: "Smartphone", label: "📱 Tecnología" },
];

const COLOR_OPTIONS = [
  "#EF4444", "#F97316", "#F59E0B", "#84CC16", "#10B981",
  "#06B6D4", "#3B82F6", "#6366F1", "#8B5CF6", "#EC4899",
  "#6B7280", "#14B8A6", "#D946EF", "#78716C",
];

export function CategoriesManager() {
  const [categories, setCategories] = useState<CategoriesByType>({ income: [], expense: [] });
  const [loading, setLoading] = useState(true);
  const [selectedType, setSelectedType] = useState<"expense" | "income">("expense");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Editing state
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editingSubCategory, setEditingSubCategory] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{
    type: string;
    category: string;
    subCategory?: string;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // New category form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"income" | "expense">("expense");
  const [newIcon, setNewIcon] = useState<string | null>(null);
  const [newColor, setNewColor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch<CategoriesByType>("/api/categories");
      setCategories(data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchCategories().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchCategories]);

  const toggleCategory = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleEditCategory = (category: string) => {
    setEditingCategory(category);
    setEditingSubCategory(null);
    setEditValue(category);
  };

  const handleEditSubCategory = (category: string, subCategory: string) => {
    setEditingCategory(category);
    setEditingSubCategory(subCategory);
    setEditValue(subCategory);
  };

  const handleSaveEdit = async () => {
    if (!editingCategory || !editValue.trim()) return;
    if (editingSubCategory) {
      if (editValue.trim() === editingSubCategory) {
        setEditingCategory(null);
        setEditingSubCategory(null);
        return;
      }
    } else {
      if (editValue.trim() === editingCategory) {
        setEditingCategory(null);
        setEditingSubCategory(null);
        return;
      }
    }

    setSaving(true);
    try {
      const result = await apiFetch<{
        updatedTransactions: number;
        updatedBudgets: number;
        updatedInstallments: number;
      }>("/api/categories", {
        method: "PUT",
        body: JSON.stringify({
          type: selectedType,
          oldCategory: editingCategory,
          oldSubCategory: editingSubCategory || null,
          newCategory: editingSubCategory ? editingCategory : editValue.trim(),
          newSubCategory: editingSubCategory ? editValue.trim() : undefined,
        }),
      });

      toast.success(
        editingSubCategory
          ? `Subcategoría actualizada`
          : `Categoría actualizada`,
        {
          description: `${result.updatedTransactions} transacciones, ${result.updatedBudgets} presupuestos actualizados`,
          duration: 3000,
        }
      );

      setEditingCategory(null);
      setEditingSubCategory(null);
      setEditValue("");
      fetchCategories();
    } catch (error) {
      console.error("Error updating category:", error);
      toast.error("Error al actualizar la categoría");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setEditingSubCategory(null);
    setEditValue("");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const result = await apiFetch<{
        updatedTransactions: number;
        deletedBudgets: number;
        updatedInstallments: number;
      }>("/api/categories", {
        method: "DELETE",
        body: JSON.stringify(deleteTarget),
      });

      toast.success(
        deleteTarget.subCategory
          ? `Subcategoría "${deleteTarget.subCategory}" eliminada`
          : `Categoría "${deleteTarget.category}" eliminada`,
        {
          description: `${result.updatedTransactions} transacciones actualizadas, ${result.deletedBudgets} presupuestos eliminados`,
          duration: 3000,
        }
      );

      setDeleteTarget(null);
      fetchCategories();
    } catch (error) {
      console.error("Error deleting category:", error);
      toast.error("Error al eliminar la categoría");
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateCategory = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiFetch("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          type: newType,
          name: newName.trim(),
          icon: newIcon,
          color: newColor,
        }),
      });
      toast.success("Categoría creada");
      setNewName("");
      setNewIcon(null);
      setNewColor(null);
      setShowNewForm(false);
      fetchCategories();
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes("409")) {
        toast.error("Ya existe una categoría con ese nombre y tipo");
      } else {
        console.error("Error creating category:", error);
        toast.error("Error al crear la categoría");
      }
    } finally {
      setCreating(false);
    }
  };

  const currentCategories = categories[selectedType] || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Type Selector */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={selectedType === "expense" ? "default" : "outline"}
          className={`rounded-xl text-xs gap-1.5 flex-1 ${
            selectedType === "expense"
              ? "bg-rose-500 hover:bg-rose-600 text-white"
              : "border-rose-200 text-rose-600 dark:border-rose-800 dark:text-rose-400"
          }`}
          onClick={() => setSelectedType("expense")}
        >
          Gastos
        </Button>
        <Button
          size="sm"
          variant={selectedType === "income" ? "default" : "outline"}
          className={`rounded-xl text-xs gap-1.5 flex-1 ${
            selectedType === "income"
              ? "bg-emerald-500 hover:bg-emerald-600 text-white"
              : "border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400"
          }`}
          onClick={() => setSelectedType("income")}
        >
          Ingresos
        </Button>
      </div>

      {/* New Category Button */}
      <Button
        variant="outline"
        size="sm"
        className="w-full rounded-xl text-xs gap-1.5 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-emerald-400 hover:text-emerald-600 dark:hover:border-emerald-600 dark:hover:text-emerald-400"
        onClick={() => {
          setShowNewForm(!showNewForm);
          setNewType(selectedType);
        }}
      >
        <Plus className="size-3.5" />
        Nueva Categoría
      </Button>

      {/* New Category Form */}
      {showNewForm && (
        <Card className="border border-emerald-200 dark:border-emerald-800/50 shadow-none rounded-xl overflow-hidden">
          <CardContent className="p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Nueva Categoría
              </span>
              <button
                onClick={() => {
                  setShowNewForm(false);
                  setNewName("");
                  setNewIcon(null);
                  setNewColor(null);
                }}
                className="size-5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
              >
                <X className="size-3 text-gray-400" />
              </button>
            </div>

            {/* Type selector for new category */}
            <div className="flex gap-1.5">
              <button
                onClick={() => setNewType("expense")}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                  newType === "expense"
                    ? "bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 border border-rose-300 dark:border-rose-700"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-400 border border-transparent"
                }`}
              >
                Gasto
              </button>
              <button
                onClick={() => setNewType("income")}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all ${
                  newType === "income"
                    ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700"
                    : "bg-gray-50 dark:bg-gray-800 text-gray-400 border border-transparent"
                }`}
              >
                Ingreso
              </button>
            </div>

            {/* Name */}
            <div className="space-y-1">
              <Label className="text-[10px]">Nombre</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Ej: Regalos, Mascota..."
                className="rounded-lg h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateCategory();
                }}
              />
            </div>

            {/* Icon selector */}
            <div className="space-y-1">
              <Label className="text-[10px]">Icono (opcional)</Label>
              <Select value={newIcon || "none"} onValueChange={(v) => setNewIcon(v === "none" ? null : v)}>
                <SelectTrigger className="rounded-lg h-8 text-xs">
                  <SelectValue placeholder="Sin icono" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin icono</SelectItem>
                  {ICON_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Color picker */}
            <div className="space-y-1">
              <Label className="text-[10px] flex items-center gap-1">
                <Palette className="size-3" /> Color (opcional)
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setNewColor(newColor === c ? null : c)}
                    className={`size-6 rounded-full border-2 transition-all ${
                      newColor === c
                        ? "border-gray-900 dark:border-white scale-110"
                        : "border-transparent hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Create button */}
            <Button
              size="sm"
              className="w-full rounded-xl text-xs h-8 bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={handleCreateCategory}
              disabled={creating || !newName.trim()}
            >
              {creating ? (
                <Loader2 className="size-3 animate-spin mr-1" />
              ) : (
                <Check className="size-3 mr-1" />
              )}
              Crear Categoría
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Categories List */}
      <div className="space-y-1.5">
        {currentCategories.length === 0 ? (
          <div className="text-center py-6">
            <Tag className="size-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">No hay categorías registradas</p>
          </div>
        ) : (
          currentCategories.map((cat) => {
            const isExpanded = expandedCategories.has(cat.name);
            const isEditingCat = editingCategory === cat.name && !editingSubCategory;

            return (
              <Card key={cat.name} className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl overflow-hidden">
                <CardContent className="p-0">
                  {/* Category Row */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    {cat.subcategories.length > 0 ? (
                      <button
                        onClick={() => toggleCategory(cat.name)}
                        className="shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronRight className="size-3.5" />
                        )}
                      </button>
                    ) : (
                      <div className="w-3.5 shrink-0" />
                    )}

                    {isEditingCat ? (
                      <div className="flex-1 flex items-center gap-1.5">
                        <Input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit();
                            if (e.key === "Escape") handleCancelEdit();
                          }}
                          className="rounded-lg h-7 text-xs flex-1"
                          autoFocus
                          disabled={saving}
                        />
                        <button
                          onClick={handleSaveEdit}
                          disabled={saving || !editValue.trim()}
                          className="size-6 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors shrink-0"
                        >
                          {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="size-6 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shrink-0"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {cat.subcategories.length > 0 ? (
                            <FolderOpen className="size-3.5 text-amber-500 shrink-0" />
                          ) : (
                            <FolderClosed className="size-3.5 text-gray-400 shrink-0" />
                          )}
                          <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                            {cat.name}
                          </span>
                          {cat.subcategories.length > 0 && (
                            <Badge variant="secondary" className="text-[9px] shrink-0 bg-gray-100 dark:bg-gray-700">
                              {cat.subcategories.length}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleEditCategory(cat.name)}
                            className="size-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors"
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget({ type: selectedType, category: cat.name })}
                            className="size-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Subcategories */}
                  {isExpanded && cat.subcategories.length > 0 && (
                    <div className="border-t border-gray-50 dark:border-gray-800">
                      {cat.subcategories.map((sub) => {
                        const isEditingSub = editingCategory === cat.name && editingSubCategory === sub;

                        return (
                          <div
                            key={sub}
                            className="flex items-center gap-2 px-3 py-2 pl-9 border-t border-gray-50 dark:border-gray-800/50"
                          >
                            {isEditingSub ? (
                              <div className="flex-1 flex items-center gap-1.5">
                                <Input
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveEdit();
                                    if (e.key === "Escape") handleCancelEdit();
                                  }}
                                  className="rounded-lg h-7 text-xs flex-1"
                                  autoFocus
                                  disabled={saving}
                                />
                                <button
                                  onClick={handleSaveEdit}
                                  disabled={saving || !editValue.trim()}
                                  className="size-6 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-colors shrink-0"
                                >
                                  {saving ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="size-6 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors shrink-0"
                                >
                                  <X className="size-3" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <Tag className="size-3 text-gray-400 shrink-0" />
                                <span className="text-xs text-gray-600 dark:text-gray-300 flex-1 truncate">
                                  {sub}
                                </span>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    onClick={() => handleEditSubCategory(cat.name, sub)}
                                    className="size-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors"
                                  >
                                    <Pencil className="size-3" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setDeleteTarget({
                                        type: selectedType,
                                        category: cat.name,
                                        subCategory: sub,
                                      })
                                    }
                                    className="size-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">
              {deleteTarget?.subCategory
                ? `¿Eliminar subcategoría "${deleteTarget.subCategory}"?`
                : `¿Eliminar categoría "${deleteTarget?.category}"?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              {deleteTarget?.subCategory ? (
                <>
                  Las transacciones con esta subcategoría quedarán sin categoría.
                  Se eliminarán los presupuestos asociados.
                </>
              ) : (
                <>
                  Las transacciones con esta categoría quedarán sin categoría.
                  Se eliminarán todos los presupuestos asociados, incluyendo las subcategorías.
                  Esta acción no se puede deshacer.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl text-xs" disabled={deleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl text-xs bg-red-500 hover:bg-red-600"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Info */}
      <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-2.5">
        <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium mb-0.5">
          Edición de categorías
        </p>
        <p className="text-[10px] text-gray-500 dark:text-gray-400">
          Al editar o eliminar una categoría, se actualizan automáticamente todas las transacciones,
          presupuestos y cuotas de TC que la usen.
        </p>
      </div>
    </div>
  );
}
