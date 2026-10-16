"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useDataEvent } from "@/hooks/use-data-event";
import { NeveraItemRow } from "./nevera-item-row";
import { PantryItemForm } from "./pantry-item-form";
import { NeveraRecount } from "./nevera-recount";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  ChevronDown,
  Package,
  RefreshCw,
  ShoppingBasket,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import {
  STOCK_FILTERS,
  LOCATION_LABELS,
  LOCATION_ORDER,
  severityRank,
  fridgeVoice,
} from "./nevera-style";
import type { PantryItem, StockStatus } from "@/lib/types/pantry";

const categories = [
  { value: "dairy", label: "Lácteos y huevos", color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" },
  { value: "meat", label: "Carnes", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  { value: "vegetables", label: "Verduras", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  { value: "fruits", label: "Frutas", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  { value: "grains", label: "Granos", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "beverages", label: "Bebidas", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
  { value: "snacks", label: "Snacks", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
  { value: "condiments", label: "Condimentos", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  { value: "other", label: "Otros", color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
];

type GroupBy = "location" | "category";

interface PantryResponse {
  items: PantryItem[];
  counts: {
    total: number;
    out: number;
    low: number;
    expiring: number;
    expired: number;
    unused: number;
  };
}

export function NeveraView() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [counts, setCounts] = useState<PantryResponse["counts"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [recount, setRecount] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilters, setActiveFilters] = useState<StockStatus[]>([]);
  const [groupBy, setGroupBy] = useState<GroupBy>("location");
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (activeFilters.length > 0) params.set("status", activeFilters.join(","));
      const query = params.toString();
      const data = await apiFetch<PantryResponse>(`/api/pantry${query ? `?${query}` : ""}`);
      setItems(data.items ?? []);
      setCounts(data.counts ?? null);
    } catch (e) {
      console.error("Error fetching nevera:", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [activeFilters]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useDataEvent("pantryItems", fetchItems);
  useDataEvent("shoppingLists", fetchItems);
  useDataEvent("shoppingListItems", fetchItems);

  const filtered = useMemo(
    () => items.filter((it) => it.name.toLowerCase().includes(search.toLowerCase())),
    [items, search]
  );

  /** Agrupa y ordena por gravedad dentro de cada grupo: lo urgente arriba. */
  const grouped = useMemo(() => {
    const groups = new Map<string, { label: string; color?: string; items: PantryItem[] }>();

    for (const item of filtered) {
      const key = groupBy === "location" ? (item.location ?? "nevera") : (item.category || "other");
      const meta =
        groupBy === "location"
          ? { label: LOCATION_LABELS[key] ?? key }
          : (() => {
              const cat = categories.find((c) => c.value === key) ?? categories[categories.length - 1];
              return { label: cat.label, color: cat.color };
            })();

      if (!groups.has(key)) groups.set(key, { ...meta, items: [] });
      groups.get(key)!.items.push(item);
    }

    for (const group of groups.values()) {
      group.items.sort((a, b) => {
        const bySeverity = severityRank(a.status) - severityRank(b.status);
        if (bySeverity !== 0) return bySeverity;
        return a.name.localeCompare(b.name, "es");
      });
    }

    // Ubicaciones en orden fijo; categorías por cantidad descendente.
    return [...groups.entries()]
      .sort(([aKey, a], [bKey, b]) => {
        if (groupBy === "location") {
          return LOCATION_ORDER.indexOf(aKey as never) - LOCATION_ORDER.indexOf(bKey as never);
        }
        return b.items.length - a.items.length;
      })
      .map(([key, group]) => ({ key, ...group }));
  }, [filtered, groupBy]);

  const toggleFilter = (status: StockStatus) => {
    setActiveFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handleQuickAdjust = async (item: PantryItem, delta: number) => {
    // Optimista: la nevera debe sentirse instantánea al contar.
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, quantity: Math.max(0, it.quantity + delta) } : it
      )
    );
    try {
      await apiFetch(`/api/pantry/${item.id}/adjust`, {
        method: "POST",
        body: JSON.stringify({ delta, reason: "Recuento" }),
      });
    } catch {
      toast.error("No se pudo guardar el ajuste");
      fetchItems();
    }
  };

  const generateRestockList = async () => {
    setGenerating(true);
    try {
      const list = await apiFetch<{ id: string; items: unknown[] }>("/api/pantry/restock-list", {
        method: "POST",
        body: JSON.stringify({ includeRunningLow: true }),
      });
      toast.success(`Lista creada con ${(list.items ?? []).length} producto(s) faltante(s)`);
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo generar la lista";
      toast.error(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = () => { setShowForm(false); setEditingItem(null); };

  const total = counts?.total ?? items.length;
  const urgent = (counts?.out ?? 0) + (counts?.low ?? 0) + (counts?.expiring ?? 0);

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2.5 p-4 pb-safe">
      {/* Voz del personaje + acción explícita de recuento */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-br from-cyan-50 to-sky-50 px-3.5 py-3 dark:from-cyan-950/30 dark:to-sky-950/20"
      >
        <p className="text-[12.5px] font-medium leading-snug text-cyan-900 dark:text-cyan-200">
          {fridgeVoice({
            total,
            out: counts?.out ?? 0,
            low: counts?.low ?? 0,
            expiring: counts?.expiring ?? 0,
          })}
        </p>
        <button
          onClick={() => setRecount(true)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-cyan-200 bg-white/70 py-1.5 text-[12px] font-semibold text-cyan-700 transition-colors hover:bg-white dark:border-cyan-900 dark:bg-cyan-950/40 dark:text-cyan-300"
        >
          <RefreshCw className="size-3.5" />
          Actualizar nevera
        </button>
      </motion.div>

      {/* Buscador + agrupación */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar en la nevera..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-xl bg-white pl-9 text-[13px] dark:bg-gray-800/70"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 rounded-xl px-2.5 text-[11.5px] text-gray-500"
          onClick={() => setGroupBy((g) => (g === "location" ? "category" : "location"))}
        >
          {groupBy === "location" ? "Lugar" : "Categoría"}
        </Button>
      </div>

      {/* Filtros en chips: una sola fila */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5">
        <button
          onClick={() => setActiveFilters([])}
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
            activeFilters.length === 0
              ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          }`}
        >
          Todo {total > 0 && <span className="opacity-60">{total}</span>}
        </button>
        {STOCK_FILTERS.map((filter) => {
          const count =
            filter.value === "out"
              ? counts?.out
              : filter.value === "low"
                ? counts?.low
                : filter.value === "expiring"
                  ? counts?.expiring
                  : counts?.unused;
          const isActive = activeFilters.includes(filter.value);
          if (!count) return null;
          return (
            <button
              key={filter.value}
              onClick={() => toggleFilter(filter.value)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                isActive
                  ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
              }`}
            >
              {filter.label} <span className="opacity-60">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {grouped.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl bg-white p-8 text-center shadow-sm dark:bg-gray-800/70"
        >
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-sky-500 shadow-lg">
            <Package className="size-6 text-white" />
          </div>
          <h3 className="mb-1 font-bold text-gray-900 dark:text-white">
            {search || activeFilters.length > 0 ? "Sin resultados" : "La nevera está vacía"}
          </h3>
          <p className="mb-4 text-[12.5px] text-gray-500">
            {search || activeFilters.length > 0
              ? "Prueba con otro filtro o búsqueda"
              : "Agrega lo primero que tengas en casa"}
          </p>
          <Button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500"
          >
            Agregar producto
          </Button>
        </motion.div>
      ) : (
        <div className="space-y-1">
          {grouped.map((group) => {
            const isOpen = openGroups[group.key] !== false;
            return (
              <Collapsible
                key={group.key}
                open={isOpen}
                onOpenChange={() => setOpenGroups((p) => ({ ...p, [group.key]: !isOpen }))}
              >
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between rounded-lg px-1 py-1.5">
                    <div className="flex items-center gap-2">
                      {group.color ? (
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${group.color}`}>
                          {group.label}
                        </span>
                      ) : (
                        <span className="text-[12px] font-semibold text-gray-700 dark:text-gray-300">
                          {group.label}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400">{group.items.length}</span>
                    </div>
                    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown className="size-3.5 text-gray-400" />
                    </motion.div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1 space-y-1">
                    <AnimatePresence initial={false}>
                      {group.items.map((item) => (
                        <NeveraItemRow
                          key={item.id}
                          item={item}
                          onEdit={() => { setEditingItem(item); setShowForm(true); }}
                          onQuickAdjust={(delta) => handleQuickAdjust(item, delta)}
                          recountMode={recount}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* Acciones */}
      <div className="space-y-1.5 pt-1">
        {urgent > 0 && (
          <Button
            onClick={generateRestockList}
            disabled={generating}
            variant="outline"
            className="h-10 w-full rounded-xl border-amber-200 text-[13px] font-semibold text-amber-700 dark:border-amber-900 dark:text-amber-400"
          >
            {generating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ShoppingBasket className="size-4" />
            )}
            Generar lista de faltantes
          </Button>
        )}
        <Button
          onClick={() => setShowForm(true)}
          className="h-11 w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 text-sm font-semibold shadow-lg shadow-orange-500/20"
        >
          Agregar a la nevera
        </Button>
      </div>

      <PantryItemForm
        open={showForm}
        onOpenChange={handleClose}
        item={editingItem}
        onSuccess={fetchItems}
      />

      <NeveraRecount
        open={recount}
        onOpenChange={setRecount}
        items={items}
        onQuickAdjust={handleQuickAdjust}
        onEdit={(item) => { setEditingItem(item); setShowForm(true); }}
      />
    </motion.div>
  );
}
