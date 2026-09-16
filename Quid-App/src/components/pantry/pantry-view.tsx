"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useDataEvent } from "@/hooks/use-data-event";
import { PantryItemCard } from "./pantry-item-card";
import { PantryItemForm } from "./pantry-item-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Package, Refrigerator, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { PantryItem } from "@/lib/types";

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

const containerVariants = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const itemVariants = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } };

type PantryResponse = { items?: PantryItem[]; lowStockItems?: PantryItem[] } | PantryItem[];

export function PantryView() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [search, setSearch] = useState("");
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const fetchItems = useCallback(async () => {
    try {
      const data = await apiFetch<PantryResponse>("/api/pantry");
      const next = Array.isArray(data) ? data : data.items ?? [];
      setItems(next);
    } catch (e) {
      console.error("Error fetching pantry items:", e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useDataEvent("pantryItems", fetchItems);
  useDataEvent("shoppingLists", fetchItems);
  useDataEvent("shoppingListItems", fetchItems);

  const now = Date.now();
  const deficitItems = items.filter((it) => (it.deficit ?? 0) > 0);
  const staleItems = items.filter((it) => {
    const base = it.lastUsedAt ? new Date(it.lastUsedAt).getTime() : null;
    return base ? now - base > 24 * 60 * 60 * 1000 : false;
  });
  const total = items.length;

  const filtered = items.filter((it) => it.name.toLowerCase().includes(search.toLowerCase()));
  const grouped = categories
    .map((cat) => ({ ...cat, fc: filtered.filter((i) => (i.category || "other") === cat.value) }))
    .filter((g) => g.fc.length > 0);

  const handleClose = () => { setShowForm(false); setEditingItem(null); };

  if (loading) {
    return (
      <div className="space-y-2 p-4 pb-safe">
        {[1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />)}
      </div>
    );
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-3 p-4 pb-safe">
      {/* Header row: subtle count + chips */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Refrigerator className="size-4 text-amber-600 dark:text-amber-400" />
          <h2 className="text-[15px] font-semibold text-gray-900 dark:text-white">Mis existencias</h2>
        </div>
        <div className="flex gap-1.5">
          {deficitItems.length > 0 && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10.5px] font-semibold text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              {deficitItems.length} stock bajo
            </span>
          )}
          {staleItems.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10.5px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              hace tiempo sin usar
            </span>
          )}
        </div>
      </motion.div>

      {/* Soft search */}
      <motion.div variants={itemVariants} className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Buscar productos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-xl bg-white pl-9 dark:bg-gray-800/70"
        />
      </motion.div>

      {/* Empty state */}
      {grouped.length === 0 ? (
        <motion.div variants={itemVariants} className="rounded-2xl bg-white p-8 text-center shadow-sm dark:bg-gray-800/70">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg">
            <Package className="size-6 text-white" />
          </div>
          <h3 className="mb-1 font-bold text-gray-900 dark:text-white">{search ? "Sin resultados" : "Despensa vacía"}</h3>
          <p className="mb-4 text-sm text-gray-500">{search ? "Prueba otro nombre" : "Agrega tu primer producto para empezar"}</p>
          <Button onClick={() => setShowForm(true)} className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500">
            <Plus className="mr-1 size-4" /> Agregar Producto
          </Button>
        </motion.div>
      ) : (
        <motion.div variants={itemVariants} className="space-y-1.5">
          {grouped.map((group) => {
            const isOpen = openCategories[group.value] !== false;
            return (
              <Collapsible key={group.value} open={isOpen} onOpenChange={() => setOpenCategories((p) => ({ ...p, [group.value]: !isOpen }))}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between rounded-lg px-1.5 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${group.color}`}>{group.label}</span>
                      <span className="text-[11px] text-gray-400">{group.fc.length}</span>
                    </div>
                    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown className="size-4 text-gray-400" />
                    </motion.div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-1 space-y-1.5">
                    <AnimatePresence>
                      {group.fc.map((item) => (
                        <PantryItemCard
                          key={item.id}
                          item={item}
                          onEdit={() => { setEditingItem(item); setShowForm(true); }}
                          onRefresh={fetchItems}
                        />
                      ))}
                    </AnimatePresence>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </motion.div>
      )}

      {/* Single flat CTA */}
      <motion.div variants={itemVariants}>
        <Button
          onClick={() => setShowForm(true)}
          className="h-11 w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 text-sm font-semibold shadow-lg shadow-orange-500/20"
        >
          <Plus className="size-4" /> Añadir a la nevera
        </Button>
      </motion.div>

      <PantryItemForm open={showForm} onOpenChange={handleClose} item={editingItem} onSuccess={fetchItems} />
    </motion.div>
  );
}