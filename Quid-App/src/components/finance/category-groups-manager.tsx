"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, formatCurrency } from "@/lib/api";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, X, Check, FolderTree } from "lucide-react";
import type { CategoryData } from "@/lib/types";

/**
 * F-43 · Grupos de categorías.
 *
 * Un grupo junta varias categorías para leer el presupuesto en el idioma del
 * usuario: "Hogar" = Vivienda + Servicios + Mantenimiento.
 *
 * Se muestra el total del grupo (presupuestado vs gastado) para que agrupar
 * sirva de algo más que organizar nombres.
 */

type CategoryGroup = {
  id: string;
  name: string;
  type: string;
  color: string | null;
  icon: string | null;
  order: number;
  categories: string[];
};

type BudgetLike = { category: string; amount: number; spent: number; type: string };

export function CategoryGroupsManager() {
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [budgets, setBudgets] = useState<BudgetLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Formulario
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const load = useCallback(async () => {
    try {
      const [g, cats, b] = await Promise.all([
        apiFetch<CategoryGroup[]>("/api/category-groups"),
        apiFetch<Record<string, CategoryData[]>>("/api/categories?type=expense"),
        apiFetch<BudgetLike[]>("/api/budgets"),
      ]);
      setGroups(g);
      setCategories(cats.expense || []);
      setBudgets(b || []);
    } catch {
      toast.error("No se pudieron cargar los grupos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setSelected([]);
  };

  const startEdit = (g: CategoryGroup) => {
    setEditingId(g.id);
    setName(g.name);
    setSelected(g.categories);
  };

  const toggle = (category: string) => {
    setSelected((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Ponle un nombre al grupo");
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await apiFetch("/api/category-groups", {
          method: "PUT",
          body: JSON.stringify({ id: editingId, name: trimmed, categories: selected }),
        });
        toast.success("Grupo actualizado");
      } else {
        await apiFetch("/api/category-groups", {
          method: "POST",
          body: JSON.stringify({ name: trimmed, type: "expense", categories: selected }),
        });
        toast.success("Grupo creado");
      }
      resetForm();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el grupo");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch("/api/category-groups", {
        method: "DELETE",
        body: JSON.stringify({ id }),
      });
      toast.success("Grupo eliminado");
      if (editingId === id) resetForm();
      await load();
    } catch {
      toast.error("No se pudo eliminar el grupo");
    }
  };

  // Totales por grupo (solo presupuestos de gasto)
  const totalsByGroup = useMemo(() => {
    const map = new Map<string, { budget: number; spent: number }>();
    for (const g of groups) {
      const set = new Set(g.categories);
      const rows = budgets.filter((b) => b.type === "expense" && set.has(b.category));
      map.set(g.id, {
        budget: rows.reduce((s, b) => s + Number(b.amount || 0), 0),
        spent: rows.reduce((s, b) => s + Number(b.spent || 0), 0),
      });
    }
    return map;
  }, [groups, budgets]);

  // Categorías que todavía no están en ningún grupo (para sugerir)
  const ungrouped = useMemo(() => {
    const used = new Set(groups.flatMap((g) => g.categories));
    return categories.filter((c) => !used.has(c.name));
  }, [categories, groups]);

  if (loading) {
    return (
      <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
        <CardContent className="p-3">
          <div className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <FolderTree className="size-3.5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-900 dark:text-white">Grupos de categorías</p>
            <p className="text-xs text-gray-400">
              Junta categorías para ver totales por grupo (ej: Hogar = Vivienda + Servicios)
            </p>
          </div>
        </div>

        {/* Lista de grupos */}
        {groups.length > 0 && (
          <div className="space-y-1.5">
            {groups.map((g) => {
              const t = totalsByGroup.get(g.id);
              return (
                <div
                  key={g.id}
                  className="rounded-lg border border-gray-100 dark:border-gray-700/60 p-2"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-900 dark:text-white truncate flex-1">
                      {g.name}
                    </span>
                    {t && (
                      <span className="text-[11px] text-gray-400 tabular-nums shrink-0">
                        {formatCurrency(t.spent)} / {formatCurrency(t.budget)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => startEdit(g)}
                      className="size-6 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
                      aria-label={`Editar ${g.name}`}
                    >
                      <Pencil className="size-3 text-gray-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(g.id)}
                      className="size-6 rounded-md hover:bg-rose-50 dark:hover:bg-rose-900/20 flex items-center justify-center"
                      aria-label={`Eliminar ${g.name}`}
                    >
                      <Trash2 className="size-3 text-rose-400" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {g.categories.length === 0 ? (
                      <span className="text-[10px] text-gray-400">Sin categorías</span>
                    ) : (
                      g.categories.map((c) => (
                        <span
                          key={c}
                          className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300"
                        >
                          {c}
                        </span>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Formulario */}
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2 space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-[11px] text-gray-500">
              {editingId ? "Editar grupo" : "Nuevo grupo"}
            </Label>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[10px] text-gray-400 hover:text-gray-600 inline-flex items-center gap-0.5"
              >
                <X className="size-3" /> Cancelar
              </button>
            )}
          </div>

          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Hogar"
            className="h-8 text-xs rounded-lg"
          />

          {categories.length === 0 ? (
            <p className="text-[10px] text-gray-400">
              Aún no hay categorías de gasto. Crea una desde cualquier formulario y aparecerá aquí.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
              {categories.map((c) => {
                const active = selected.includes(c.name);
                const inOther = ungrouped.every((u) => u.name !== c.name) && !active;
                return (
                  <button
                    key={c.name}
                    type="button"
                    onClick={() => toggle(c.name)}
                    className={`text-[10px] px-1.5 py-0.5 rounded-full border transition-colors ${
                      active
                        ? "border-indigo-400 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                        : inOther
                          ? "border-gray-200 text-gray-400 dark:border-gray-700"
                          : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300"
                    }`}
                    title={inOther ? "Ya está en otro grupo" : c.name}
                  >
                    {active && <Check className="size-2.5 inline mr-0.5" />}
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}

          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="w-full h-8 rounded-lg text-xs"
          >
            <Plus className="size-3 mr-1" />
            {editingId ? "Guardar cambios" : "Crear grupo"}
          </Button>
        </div>

        {groups.length === 0 && (
          <p className="text-[10px] text-gray-400">
            Los grupos son opcionales: sirven para leer varios presupuestos como uno solo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
