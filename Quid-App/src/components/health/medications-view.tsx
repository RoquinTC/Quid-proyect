"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { MedicationCard } from "./medication-card";
import { MedicationForm } from "./medication-form";
import { MedicationDetail } from "./medication-detail";
import { TodaySchedule } from "./today-schedule";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pill, Filter, AlertTriangle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
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

export function MedicationsView() {
  const { healthMedicationFilter, setHealthMedicationFilter } = useAppStore();
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);

  const fetchMedications = useCallback(async () => {
    try {
      const data = await apiFetch<Medication[]>("/api/medications");
      setMedications(data);
      return data;
    } catch (error) {
      console.error("Error fetching medications:", error);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  const needsSetup = (med: Medication) => {
    const hasDose = Boolean(med.dosage && med.dosage.trim() && med.dosage !== "Por definir");
    let times: string[] = [];
    try {
      times = med.reminderTimes ? JSON.parse(med.reminderTimes) : [];
    } catch {
      times = [];
    }
    const needsSchedule = med.reminderEnabled && med.frequency !== "asNeeded";
    return med.isActive && (!hasDose || (needsSchedule && times.length === 0));
  };

  const configured = (med: Medication) => med.isActive && !needsSetup(med);

  const filteredMedications = medications.filter((med) => {
    if (healthMedicationFilter === "active") return med.isActive;
    if (healthMedicationFilter === "needs_setup") return needsSetup(med);
    if (healthMedicationFilter === "configured") return configured(med);
    return true;
  });

  const activeCount = medications.filter((m) => m.isActive).length;
  const needsSetupCount = medications.filter(needsSetup).length;

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/medications/${id}`, { method: "DELETE" });
      fetchMedications();
      setSelectedMedication(null);
    } catch (error) {
      console.error("Error deleting medication:", error);
    }
  };

  const handleEdit = (med: Medication) => {
    setEditingMedication(med);
    setShowForm(true);
  };

  const handleFormSuccess = async () => {
    const refreshed = await fetchMedications();
    if (editingMedication?.id) {
      setSelectedMedication(refreshed.find((med) => med.id === editingMedication.id) || null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Show detail view
  if (selectedMedication) {
    return (
      <>
        <MedicationDetail
          medication={selectedMedication}
          onBack={() => setSelectedMedication(null)}
          onEdit={() => handleEdit(selectedMedication)}
          onDelete={() => handleDelete(selectedMedication.id)}
        />
        <MedicationForm
          open={showForm}
          onOpenChange={(open) => {
            setShowForm(open);
            if (!open) setEditingMedication(null);
          }}
          medication={editingMedication}
          onSuccess={handleFormSuccess}
        />
      </>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-safe"
    >
      {/* Summary card */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-rose-600 to-pink-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Pill className="size-4 text-rose-200" />
              <span className="text-sm text-rose-100">Medicamentos</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold tracking-tight">{activeCount}</p>
                <span className="text-xs text-rose-200">
                  activo{activeCount !== 1 ? "s" : ""} de {medications.length} total
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-rose-200">Hoy</span>
                <p className="text-lg font-bold">
                  {medications.filter((m) => m.isActive).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Today's schedule */}
      {activeCount > 0 && (
        <motion.div variants={itemVariants}>
          <TodaySchedule medications={medications.filter((m) => m.isActive)} onTaken={fetchMedications} />
        </motion.div>
      )}

      {needsSetupCount > 0 && (
        <motion.button
          variants={itemVariants}
          type="button"
          onClick={() => setHealthMedicationFilter("needs_setup")}
          className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-3 text-left dark:border-amber-900/60 dark:bg-amber-950/20"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-300" />
            <div>
              <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                {needsSetupCount} medicamento{needsSetupCount !== 1 ? "s" : ""} sin rutina completa
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                Toca aquí para ver cuáles necesitan dosis u horario.
              </p>
            </div>
          </div>
        </motion.button>
      )}

      {/* Filter */}
      <motion.div variants={itemVariants} className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Todos los Medicamentos</h3>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {[
            { value: "all", label: "Todos", icon: Filter },
            { value: "active", label: "Activos", icon: Pill },
            { value: "needs_setup", label: "Sin rutina", icon: AlertTriangle },
            { value: "configured", label: "Configurados", icon: CheckCircle2 },
          ].map((filter) => {
            const Icon = filter.icon;
            return (
              <Button
                key={filter.value}
                variant={healthMedicationFilter === filter.value ? "default" : "outline"}
                size="sm"
                onClick={() => setHealthMedicationFilter(filter.value as typeof healthMedicationFilter)}
                className={`h-8 shrink-0 rounded-xl text-xs ${
                  healthMedicationFilter === filter.value
                    ? "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-300"
                    : ""
                }`}
              >
                <Icon className="size-3 mr-1" />
                {filter.label}
              </Button>
            );
          })}
        </div>
      </motion.div>

      {/* Medications list */}
      {filteredMedications.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 shadow-lg mb-4">
                <Pill className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                {healthMedicationFilter === "needs_setup" ? "Sin pendientes de rutina" : "Sin medicamentos"}
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {healthMedicationFilter === "needs_setup"
                  ? "Todos los medicamentos activos tienen dosis y horario configurado."
                  : "Agrega tu primer medicamento para gestionar tus tratamientos"}
              </p>
              <Button
                onClick={() => {
                  setEditingMedication(null);
                  setShowForm(true);
                }}
                className="rounded-xl bg-gradient-to-r from-rose-600 to-pink-500"
              >
                <Plus className="size-4 mr-1" />
                Agregar Medicamento
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {filteredMedications.map((med) => (
            <motion.div key={med.id} variants={itemVariants}>
              <MedicationCard
                medication={med}
                onClick={() => setSelectedMedication(med)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* Form */}
      <MedicationForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingMedication(null);
        }}
        medication={editingMedication}
        onSuccess={handleFormSuccess}
      />
    </motion.div>
  );
}
