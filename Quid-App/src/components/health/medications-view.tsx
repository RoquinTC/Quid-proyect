"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { MedicationCard } from "./medication-card";
import { MedicationForm } from "./medication-form";
import { MedicationDetail } from "./medication-detail";
import { TodaySchedule } from "./today-schedule";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Pill, Filter } from "lucide-react";
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
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [filterActive, setFilterActive] = useState(false);

  const fetchMedications = useCallback(async () => {
    try {
      const data = await apiFetch<Medication[]>("/api/medications");
      setMedications(data);
    } catch (error) {
      console.error("Error fetching medications:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  const filteredMedications = filterActive
    ? medications.filter((m) => m.isActive)
    : medications;

  const activeCount = medications.filter((m) => m.isActive).length;

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

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
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
      <MedicationDetail
        medication={selectedMedication}
        onBack={() => setSelectedMedication(null)}
        onEdit={() => handleEdit(selectedMedication)}
        onDelete={() => handleDelete(selectedMedication.id)}
      />
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-24"
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
                <span className="text-[10px] text-rose-200">
                  activo{activeCount !== 1 ? "s" : ""} de {medications.length} total
                </span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-rose-200">Hoy</span>
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
          <TodaySchedule medications={medications.filter((m) => m.isActive)} />
        </motion.div>
      )}

      {/* Filter */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Todos los Medicamentos</h3>
        <Button
          variant={filterActive ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterActive(!filterActive)}
          className={`rounded-xl text-xs h-8 ${
            filterActive
              ? "bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-300"
              : ""
          }`}
        >
          <Filter className="size-3 mr-1" />
          {filterActive ? "Solo activos" : "Todos"}
        </Button>
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
                Sin medicamentos
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Agrega tu primer medicamento para gestionar tus tratamientos
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

      {/* FAB - Add Medication */}
      {medications.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Button
            onClick={() => {
              setEditingMedication(null);
              setShowForm(true);
            }}
            className="size-14 rounded-full bg-gradient-to-br from-rose-600 to-pink-500 shadow-lg shadow-rose-500/30 hover:shadow-xl hover:shadow-rose-500/40"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      {/* Form */}
      <MedicationForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingMedication(null);
        }}
        medication={editingMedication}
        onSuccess={fetchMedications}
      />
    </motion.div>
  );
}
