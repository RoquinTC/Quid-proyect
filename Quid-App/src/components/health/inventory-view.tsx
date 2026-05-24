"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Pill, Clock, Plus, Layers, Sparkles, Package, AlertTriangle, CheckCircle, Info, RefreshCw, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Medication } from "@/lib/types";

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function InventoryView() {
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState<"dosis" | "stock">("stock");

  // Refill Modal state
  const [refillMed, setRefillMed] = useState<Medication | null>(null);
  const [refillAmount, setRefillAmount] = useState<string>("30");
  const [refillSuccess, setRefillSuccess] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchMedications = useCallback(async () => {
    try {
      const data = await apiFetch<Medication[]>("/api/medications");
      setMedications(data);
    } catch (error) {
      console.error("Error fetching medications for inventory:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  const handleRefillSubmit = async () => {
    if (!refillMed) return;
    const added = parseInt(refillAmount, 10);
    if (isNaN(added) || added <= 0) return;

    setIsSubmitting(true);
    try {
      const currentStock = refillMed.stockQuantity ?? 0;
      const newStock = currentStock + added;

      await apiFetch(`/api/medications/${refillMed.id}`, {
        method: "PUT",
        body: JSON.stringify({
          stockQuantity: newStock,
        }),
      });

      setRefillSuccess(true);
      setTimeout(() => {
        setRefillSuccess(false);
        setRefillMed(null);
        setRefillAmount("30");
        fetchMedications();
      }, 1200);
    } catch (err) {
      console.error("Failed to refill medication stock:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStockStatus = (med: Medication) => {
    if (med.stockQuantity == null) return { color: "text-gray-400", label: "Sin control", badgeColor: "bg-gray-100 dark:bg-gray-800 text-gray-500" };
    if (med.lowStockThreshold != null && med.stockQuantity <= med.lowStockThreshold) {
      return { color: "text-red-500 font-bold", label: "Stock Bajo", badgeColor: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-900/30" };
    }
    return { color: "text-emerald-500 font-semibold", label: "Óptimo", badgeColor: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30" };
  };

  const formatSchedule = (med: Medication) => {
    if (med.frequency === "custom" && med.customSchedule) {
      try {
        const parsed = JSON.parse(med.customSchedule);
        if (parsed.type === "days") {
          return `Cada ${parsed.daysInterval} día${parsed.daysInterval > 1 ? "s" : ""}`;
        }
        if (parsed.type === "daysOfWeek") {
          return `Días: ${parsed.daysOfWeek.map((d: number) => ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d]).join(", ")}`;
        }
      } catch {
        return "Horario personalizado";
      }
    }
    const freqMap: Record<string, string> = {
      daily: "Diario",
      twiceDaily: "Dos veces al día",
      thriceDaily: "Tres veces al día",
      asNeeded: "Cuando sea necesario",
    };
    return freqMap[med.frequency] || med.frequency;
  };

  const activeMedications = medications.filter((m) => m.isActive);

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-safe"
    >
      {/* Visual Subtabs for Inventory */}
      <div className="flex gap-2 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl max-w-sm">
        <button
          onClick={() => setSubTab("stock")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
            subTab === "stock"
              ? "bg-white dark:bg-gray-700 text-rose-600 dark:text-white shadow-sm"
              : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          <Package className="size-3.5" />
          <span>Control de Stock</span>
        </button>
        <button
          onClick={() => setSubTab("dosis")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold transition-all duration-200 ${
            subTab === "dosis"
              ? "bg-white dark:bg-gray-700 text-rose-600 dark:text-white shadow-sm"
              : "text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
          }`}
        >
          <Layers className="size-3.5" />
          <span>Dosis y Frecuencias</span>
        </button>
      </div>

      <AnimatePresence mode="wait">
        {subTab === "stock" ? (
          <motion.div
            key="stock"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {activeMedications.length === 0 ? (
              <Card className="border-0 shadow-md rounded-2xl bg-gray-50 dark:bg-gray-900/50">
                <CardContent className="p-8 text-center text-gray-500">
                  <Pill className="size-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                  <p className="text-sm font-semibold">No hay medicamentos activos</p>
                  <p className="text-xs mt-1">Activa o añade medicamentos para gestionar su inventario</p>
                </CardContent>
              </Card>
            ) : (
              activeMedications.map((med) => {
                const status = getStockStatus(med);
                const isLow = med.stockQuantity != null && med.lowStockThreshold != null && med.stockQuantity <= med.lowStockThreshold;

                return (
                  <motion.div key={med.id} variants={itemVariants}>
                    <Card className="border-0 shadow-md rounded-2xl bg-white dark:bg-gray-900 hover:shadow-lg transition-all duration-200 overflow-hidden relative border-l-4 border-rose-500">
                      <CardContent className="p-4 flex items-center justify-between gap-3">
                        <div className="space-y-1 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-gray-900 dark:text-white truncate">
                              {med.name}
                            </span>
                            <Badge className={`text-[9px] px-1.5 py-0 rounded-md font-medium ${status.badgeColor}`}>
                              {status.label}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs text-gray-500">
                            <span>Dosis: {med.dosage || "Sin especificar"}</span>
                            {med.stockQuantity != null && (
                              <>
                                <span className="text-gray-300 dark:text-gray-700">•</span>
                                <span className="font-medium text-gray-700 dark:text-gray-300">
                                  Quedan: <span className={status.color}>{med.stockQuantity} {med.stockUnit || "uds"}</span>
                                </span>
                              </>
                            )}
                          </div>

                          {isLow && (
                            <div className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-lg bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-[10px] font-medium border border-red-100 dark:border-red-900/30 animate-pulse">
                              <AlertTriangle className="size-3" />
                              <span>Límite de alerta: {med.lowStockThreshold} {med.stockUnit || "uds"}</span>
                            </div>
                          )}
                        </div>

                        {/* Refill Button */}
                        <div className="shrink-0">
                          <Button
                            type="button"
                            onClick={() => {
                              setRefillMed(med);
                              setRefillAmount("30");
                            }}
                            className="rounded-xl h-8 text-[11px] px-3 font-semibold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer flex items-center gap-1"
                          >
                            <Plus className="size-3" />
                            <span>Rellenar</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        ) : (
          <motion.div
            key="dosis"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="space-y-3"
          >
            {activeMedications.length === 0 ? (
              <Card className="border-0 shadow-md rounded-2xl bg-gray-50 dark:bg-gray-900/50">
                <CardContent className="p-8 text-center text-gray-500">
                  <Pill className="size-10 text-gray-300 dark:text-gray-700 mx-auto mb-2" />
                  <p className="text-sm font-semibold">No hay medicamentos activos</p>
                </CardContent>
              </Card>
            ) : (
              activeMedications.map((med) => {
                let timesList: string[] = [];
                if (med.reminderTimes) {
                  try {
                    timesList = JSON.parse(med.reminderTimes);
                  } catch {
                    timesList = [];
                  }
                }

                return (
                  <motion.div key={med.id} variants={itemVariants}>
                    <Card className="border-0 shadow-md rounded-2xl bg-white dark:bg-gray-900 hover:shadow-lg transition-all duration-200 overflow-hidden relative">
                      <CardContent className="p-4 space-y-2.5">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                              <Pill className="size-3.5 text-rose-500 shrink-0" />
                              {med.name}
                            </h4>
                            {med.disease && (
                              <p className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/20 px-2 py-0.5 rounded-md inline-block mt-1">
                                {med.disease}
                              </p>
                            )}
                          </div>

                          <Badge variant="outline" className="text-[10px] rounded-lg text-gray-500 border-gray-200 dark:border-gray-800">
                            {formatSchedule(med)}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-gray-100 dark:border-gray-800">
                          <div>
                            <span className="text-gray-400 block text-[10px]">Dosis por toma</span>
                            <span className="font-semibold text-gray-800 dark:text-gray-200">{med.dosage || "1 toma"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block text-[10px]">Forma de toma</span>
                            <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">{med.howToTake || "No requiere"}</span>
                          </div>
                        </div>

                        {timesList.length > 0 && (
                          <div className="pt-1.5">
                            <span className="text-gray-400 block text-[10px] mb-1">Horarios programados</span>
                            <div className="flex flex-wrap gap-1">
                              {timesList.map((time) => (
                                <Badge
                                  key={time}
                                  variant="secondary"
                                  className="text-[10px] px-2 py-0.5 rounded-lg flex items-center gap-1 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                                >
                                  <Clock className="size-2.5 text-rose-500" />
                                  <span>{time}</span>
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Refill Dialog Form */}
      <Dialog open={!!refillMed} onOpenChange={(open) => { if (!open) setRefillMed(null); }}>
        <DialogContent className="w-[95vw] sm:max-w-md rounded-2xl border-0 p-5 bg-white dark:bg-gray-900 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <Package className="size-4 text-rose-500" />
              <span>Adicionar Stock</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-500">
              Registra la cantidad de medicamento que acabas de comprar o reponer para {refillMed?.name}.
            </DialogDescription>
          </DialogHeader>

          {refillSuccess ? (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="py-6 flex flex-col items-center justify-center text-center space-y-2"
            >
              <div className="size-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="size-7 text-emerald-500 animate-bounce" />
              </div>
              <h4 className="font-bold text-sm text-gray-900 dark:text-white">¡Stock Actualizado!</h4>
              <p className="text-xs text-gray-500">El inventario se ha actualizado correctamente.</p>
            </motion.div>
          ) : (
            <div className="space-y-4 pt-1">
              <div className="p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-xl space-y-1">
                <span className="text-[10px] text-gray-400 block font-medium">Stock Actual</span>
                <span className="font-bold text-sm text-gray-800 dark:text-gray-200">
                  {refillMed?.stockQuantity ?? 0} {refillMed?.stockUnit || "uds"}
                </span>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Cantidad a Adicionar
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={refillAmount}
                    onChange={(e) => setRefillAmount(e.target.value)}
                    className="rounded-xl text-xs h-10 border-gray-200 dark:border-gray-800"
                    placeholder="Ej: 30"
                  />
                  <span className="flex items-center text-xs text-gray-500 font-medium px-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                    {refillMed?.stockUnit || "uds"}
                  </span>
                </div>

                {/* Quick select presets */}
                <div className="flex gap-1.5 mt-2">
                  {["10", "30", "50", "100"].map((p) => (
                    <Button
                      key={p}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setRefillAmount(p)}
                      className={`h-7 px-2.5 text-[10px] font-semibold rounded-lg ${
                        refillAmount === p
                          ? "bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/20 dark:border-rose-900/30 dark:text-rose-400"
                          : "border-gray-200 dark:border-gray-800"
                      }`}
                    >
                      +{p}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRefillMed(null)}
                  className="flex-1 rounded-xl text-xs h-10 border border-gray-100 dark:border-gray-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleRefillSubmit}
                  disabled={isSubmitting || !refillAmount}
                  className="flex-1 rounded-xl text-xs h-10 bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
                >
                  {isSubmitting && <RefreshCw className="size-3 animate-spin" />}
                  <span>Guardar</span>
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
