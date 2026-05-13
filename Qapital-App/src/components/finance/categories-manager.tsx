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
} from "lucide-react";
import { toast } from "sonner";
import type { CategoryData } from "@/lib/types";

interface CategoriesByType {
  income: CategoryData[];
  expense: CategoryData[];
}

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
