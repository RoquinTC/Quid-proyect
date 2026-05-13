"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";
import { PantryItemCard } from "./pantry-item-card";
import { PantryItemForm } from "./pantry-item-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Package, AlertTriangle, Refrigerator } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { PantryItem } from "@/lib/types";

const categories = [
  { value: "dairy", label: "Lácteos", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { value: "meat", label: "Carnes", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { value: "vegetables", label: "Verduras", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { value: "fruits", label: "Frutas", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  { value: "grains", label: "Granos", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
  { value: "beverages", label: "Bebidas", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  { value: "snacks", label: "Snacks", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  { value: "condiments", label: "Condimentos", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  { value: "other", label: "Otros", color: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function PantryView() {
  const [items, setItems] = useState<PantryItem[]>([]);
  const [lowStockItems, setLowStockItems] = useState<PantryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PantryItem | null>(null);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  const fetchItems = useCallback(async () => {
    try {
      const data = await apiFetch<{ items: PantryItem[]; lowStockItems: PantryItem[] }>("/api/pantry");
      setItems(data.items);
      setLowStockItems(data.lowStockItems);
    } catch (error) {
      console.error("Error fetching pantry items:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !filterCategory || item.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedItems = categories
    .map((cat) => ({
      ...cat,
      items: filteredItems.filter((item) => (item.category || "other") === cat.value),
    }))
    .filter((group) => group.items.length > 0);

  const totalItems = items.length;
  const expiredItems = items.filter(
    (item) => item.expirationDate && new Date(item.expirationDate) < new Date()
  );

  const handleEdit = (item: PantryItem) => {
    setEditingItem(item);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setEditingItem(null);
  };

  const toggleCategory = (category: string) => {
    setOpenCategories((prev) => ({ ...prev, [category]: !prev[category] }));
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-24"
    >
      {/* Summary Card */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-amber-600 to-orange-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Refrigerator className="size-4 text-amber-200" />
              <span className="text-sm text-amber-100">Mi Despensa</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold tracking-tight">{totalItems}</p>
                <span className="text-xs text-amber-200">productos</span>
              </div>
              <div className="flex gap-3">
                {lowStockItems.length > 0 && (
                  <div className="text-center">
                    <p className="text-lg font-bold">{lowStockItems.length}</p>
                    <span className="text-[10px] text-amber-200">Stock bajo</span>
                  </div>
                )}
                {expiredItems.length > 0 && (
                  <div className="text-center">
                    <p className="text-lg font-bold">{expiredItems.length}</p>
                    <span className="text-[10px] text-amber-200">Vencidos</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Search Bar */}
      <motion.div variants={itemVariants} className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
        <Input
          placeholder="Buscar productos..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 rounded-xl h-10"
        />
      </motion.div>

      {/* Category Filter Pills */}
      <motion.div variants={itemVariants} className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => setFilterCategory(null)}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            !filterCategory
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
          }`}
        >
          Todos
        </button>
        {categories.map((cat) => (
          <button
            key={cat.value}
            onClick={() => setFilterCategory(filterCategory === cat.value ? null : cat.value)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filterCategory === cat.value
                ? cat.color
                : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </motion.div>

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && !filterCategory && !search && (
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-amber-500" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">Stock Bajo</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
            {lowStockItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleEdit(item)}
                className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 cursor-pointer"
              >
                <span className="text-sm font-medium text-gray-900 dark:text-white">{item.name}</span>
                <Badge variant="outline" className="text-[10px] h-5 bg-amber-100 text-amber-700 border-amber-300">
                  {item.quantity} {item.unit}
                </Badge>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {items.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg mb-4">
                <Package className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                Despensa vacía
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Agrega tu primer producto para empezar a gestionar tu inventario
              </p>
              <Button
                onClick={() => setShowForm(true)}
                className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500"
              >
                <Plus className="size-4 mr-1" />
                Agregar Producto
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : filteredItems.length === 0 ? (
        <motion.div variants={itemVariants} className="text-center py-8">
          <p className="text-sm text-gray-500">No se encontraron productos</p>
        </motion.div>
      ) : (
        /* Grouped Items */
        <div className="space-y-3">
          {groupedItems.map((group) => {
            const isOpen = openCategories[group.value] !== false;
            return (
              <Collapsible
                key={group.value}
                open={isOpen}
                onOpenChange={() => toggleCategory(group.value)}
              >
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[10px] ${group.color}`}>{group.label}</Badge>
                      <span className="text-xs text-gray-500">{group.items.length} items</span>
                    </div>
                    <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                      <ChevronDown className="size-4 text-gray-400" />
                    </motion.div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-2 mt-1">
                    <AnimatePresence>
                      {group.items.map((item) => (
                        <motion.div
                          key={item.id}
                          variants={itemVariants}
                          initial="hidden"
                          animate="show"
                          exit={{ opacity: 0, y: -10 }}
                        >
                          <PantryItemCard
                            item={item}
                            onEdit={() => handleEdit(item)}
                            onDelete={fetchItems}
                            categoryColor={group.color}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* FAB - Add Item */}
      {items.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Button
            onClick={() => setShowForm(true)}
            className="size-14 rounded-full bg-gradient-to-br from-amber-600 to-orange-500 shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      {/* Form */}
      <PantryItemForm
        open={showForm}
        onOpenChange={handleCloseForm}
        item={editingItem}
        onSuccess={fetchItems}
      />
    </motion.div>
  );
}
