"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { ShoppingListDetail } from "./shopping-list-detail";
import { ShoppingListForm } from "./shopping-list-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ShoppingCart,
  Plus,
  Sparkles,
  ClipboardList,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { ShoppingListItem, ShoppingList } from "@/lib/types";

const statusConfig: Record<string, { label: string; color: string; icon: typeof ClipboardList }> = {
  draft: { label: "Borrador", color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300", icon: ClipboardList },
  shopping: { label: "Comprando", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400", icon: ShoppingCart },
  verified: { label: "Verificando", color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400", icon: CheckCircle2 },
  completed: { label: "Completada", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: CheckCircle2 },
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function ShoppingListsView() {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchLists = useCallback(async () => {
    try {
      const data = await apiFetch<ShoppingList[]>("/api/shopping-lists");
      setLists(data);
    } catch (error) {
      console.error("Error fetching shopping lists:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  const handleGenerateFromPantry = async () => {
    setGenerating(true);
    try {
      await apiFetch("/api/shopping-lists/_/generate", {
        method: "POST",
        body: JSON.stringify({ name: "Lista Auto-generada" }),
      });
      await fetchLists();
    } catch (error) {
      console.error("Error generating list:", error);
    } finally {
      setGenerating(false);
    }
  };

  const activeLists = lists.filter((l) => l.status !== "completed");
  const completedLists = lists.filter((l) => l.status === "completed");

  // Detail view
  if (selectedListId) {
    return (
      <ShoppingListDetail
        listId={selectedListId}
        onBack={() => {
          setSelectedListId(null);
          fetchLists();
        }}
      />
    );
  }

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
      {/* Header Card */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-amber-600 to-orange-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="size-4 text-amber-200" />
              <span className="text-sm text-amber-100">Listas de Mercado</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold tracking-tight">{activeLists.length}</p>
                <span className="text-xs text-amber-200">listas activas</span>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold">{completedLists.length}</p>
                <span className="text-[10px] text-amber-200">completadas</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Auto-generate button */}
      <motion.div variants={itemVariants}>
        <Button
          variant="outline"
          className="w-full h-11 rounded-xl border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
          onClick={handleGenerateFromPantry}
          disabled={generating}
        >
          {generating ? (
            <Loader2 className="size-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="size-4 mr-2" />
          )}
          Generar desde Despensa
        </Button>
      </motion.div>

      {/* Empty State */}
      {lists.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg mb-4">
                <ShoppingCart className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                Sin listas de mercado
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Crea una lista manual o genéala automáticamente desde los productos con stock bajo
              </p>
              <div className="flex gap-2 justify-center">
                <Button
                  onClick={() => setShowForm(true)}
                  className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500"
                >
                  <Plus className="size-4 mr-1" />
                  Nueva Lista
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <>
          {/* Active Lists */}
          {activeLists.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Activas</h3>
              {activeLists.map((list) => {
                const status = statusConfig[list.status] || statusConfig.draft;
                const totalEstimated = list.items.reduce(
                  (sum, i) => sum + (i.estimatedPrice || 0),
                  0
                );
                const StatusIcon = status.icon;

                return (
                  <motion.div key={list.id} variants={itemVariants}>
                    <Card
                      className="border-0 shadow-sm rounded-2xl bg-white dark:bg-gray-800 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedListId(list.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                              {list.name}
                            </h3>
                            <span className="text-[10px] text-gray-400">
                              {list.items.length} items
                            </span>
                          </div>
                          <Badge className={`text-[10px] ${status.color}`}>
                            <StatusIcon className="size-3 mr-1" />
                            {status.label}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            Estimado: {formatCurrency(totalEstimated)}
                          </span>
                          <div className="flex -space-x-1">
                            {list.items.slice(0, 5).map((item, idx) => (
                              <div
                                key={item.id}
                                className={`size-5 rounded-full border-2 border-white dark:border-gray-800 flex items-center justify-center text-[8px] font-bold ${
                                  item.isPurchased
                                    ? "bg-green-500 text-white"
                                    : "bg-gray-200 dark:bg-gray-600 text-gray-500"
                                }`}
                                style={{ zIndex: 5 - idx }}
                              >
                                {idx + 1}
                              </div>
                            ))}
                            {list.items.length > 5 && (
                              <div className="size-5 rounded-full border-2 border-white dark:border-gray-800 bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-[8px] text-gray-500">
                                +{list.items.length - 5}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Completed Lists */}
          {completedLists.length > 0 && (
            <div className="space-y-3 mt-6">
              <h3 className="text-sm font-semibold text-gray-500">Completadas</h3>
              {completedLists.map((list) => {
                const totalActual = list.items.reduce(
                  (sum, i) => sum + (i.actualPrice || i.estimatedPrice || 0),
                  0
                );
                return (
                  <motion.div key={list.id} variants={itemVariants}>
                    <Card
                      className="border-0 shadow-sm rounded-2xl bg-white/50 dark:bg-gray-800/50 cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => setSelectedListId(list.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 line-through">
                              {list.name}
                            </h3>
                            <span className="text-[10px] text-gray-400">
                              {list.items.length} items · {formatCurrency(totalActual)}
                            </span>
                          </div>
                          <CheckCircle2 className="size-4 text-green-500" />
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* FAB - New List */}
      {lists.length > 0 && (
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
      <ShoppingListForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={fetchLists}
      />
    </motion.div>
  );
}
