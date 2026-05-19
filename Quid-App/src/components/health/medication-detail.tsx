"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Pill,
  Clock,
  Calendar,
  Utensils,
  Bell,
  BellOff,
  Edit3,
  Trash2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { formatDate } from "@/lib/api";
import type { Medication } from "@/lib/types";

interface MedicationDetailProps {
  medication: Medication;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const frequencyLabels: Record<string, string> = {
  daily: "Diario",
  twice_daily: "Dos veces al día",
  three_times_daily: "Tres veces al día",
  weekly: "Semanal",
  as_needed: "Según necesidad",
  custom: "Personalizado",
};

const howToTakeLabels: Record<string, string> = {
  with_food: "Con alimentos",
  without_food: "Sin alimentos",
  morning: "Mañana",
  night: "Noche",
  custom: "Personalizado",
};

export function MedicationDetail({ medication, onBack, onEdit, onDelete }: MedicationDetailProps) {
  const reminderTimesList = (() => {
    try {
      return medication.reminderTimes ? JSON.parse(medication.reminderTimes) : [];
    } catch {
      return [];
    }
  })();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 space-y-4 pb-24"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{medication.name}</h2>
          <span className="text-sm text-gray-500">{medication.dosage}</span>
        </div>
        {medication.isActive ? (
          <Badge className="bg-emerald-50 text-emerald-700 border-0">
            <CheckCircle2 className="size-3 mr-1" />
            Activo
          </Badge>
        ) : (
          <Badge variant="secondary" className="bg-gray-100 text-gray-500">
            <XCircle className="size-3 mr-1" />
            Inactivo
          </Badge>
        )}
      </div>

      {/* Main info card */}
      <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-rose-600 to-pink-500 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
        <CardContent className="p-5 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-12 rounded-xl flex items-center justify-center bg-white/20">
              <Pill className="size-6 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{medication.name}</h3>
              <span className="text-sm text-rose-100">{medication.dosage}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5">
              <Clock className="size-4 text-rose-200" />
              <span className="text-rose-100">{frequencyLabels[medication.frequency] || medication.frequency}</span>
            </div>
            {medication.disease && (
              <Badge className="bg-white/20 text-white border-0 text-xs">
                {medication.disease}
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Details */}
      <Card className="border-0 shadow-md rounded-2xl">
        <CardContent className="p-4 space-y-4">
          {/* How to take */}
          {medication.howToTake && (
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center shrink-0">
                <Utensils className="size-4 text-rose-500" />
              </div>
              <div>
                <span className="text-xs text-gray-500">Cómo tomarlo</span>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {howToTakeLabels[medication.howToTake] || medication.howToTake}
                </p>
              </div>
            </div>
          )}

          {/* Dates */}
          {(medication.startDate || medication.endDate) && (
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center shrink-0">
                <Calendar className="size-4 text-rose-500" />
              </div>
              <div>
                <span className="text-xs text-gray-500">Período de tratamiento</span>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {medication.startDate ? formatDate(medication.startDate) : "Sin fecha inicio"}
                  {" → "}
                  {medication.endDate ? formatDate(medication.endDate) : "Indefinido"}
                </p>
              </div>
            </div>
          )}

          {/* Reminders */}
          <div className="flex items-start gap-3">
            <div className="size-8 rounded-lg bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center shrink-0">
              {medication.reminderEnabled ? (
                <Bell className="size-4 text-rose-500" />
              ) : (
                <BellOff className="size-4 text-gray-400" />
              )}
            </div>
            <div>
              <span className="text-xs text-gray-500">Recordatorio</span>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {medication.reminderEnabled ? "Activado" : "Desactivado"}
              </p>
              {reminderTimesList.length > 0 && (
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {reminderTimesList.map((time: string) => (
                    <Badge key={time} variant="secondary" className="text-xs bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                      {time}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* History placeholder */}
      <Card className="border-0 shadow-md rounded-2xl">
        <CardContent className="p-4">
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Historial</h4>
          <p className="text-xs text-gray-400 text-center py-4">
            El historial de tomas estará disponible próximamente
          </p>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50"
          onClick={onEdit}
        >
          <Edit3 className="size-4 mr-2" />
          Editar
        </Button>
        <Button
          variant="outline"
          className="flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
          onClick={onDelete}
        >
          <Trash2 className="size-4 mr-2" />
          Eliminar
        </Button>
      </div>
    </motion.div>
  );
}
