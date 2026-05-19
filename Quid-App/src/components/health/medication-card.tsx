"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pill, Clock, ChevronDown, ChevronUp, Utensils, AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface MedicationCardProps {
  medication: {
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    customSchedule?: string | null;
    disease?: string | null;
    howToTake?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    isActive: boolean;
    reminderEnabled: boolean;
    reminderTimes?: string | null;
  };
  onClick?: () => void;
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

function getTimeOfDayColor(reminderTimes: string | null | undefined): { bg: string; text: string; accent: string; border: string } {
  if (!reminderTimes) return { bg: "bg-amber-50", text: "text-amber-600", accent: "bg-amber-500", border: "border-amber-200" };

  try {
    const times: string[] = JSON.parse(reminderTimes);
    if (times.length === 0) return { bg: "bg-amber-50", text: "text-amber-600", accent: "bg-amber-500", border: "border-amber-200" };

    const firstHour = parseInt(times[0].split(":")[0]);
    if (firstHour >= 6 && firstHour < 12) {
      return { bg: "bg-amber-50", text: "text-amber-600", accent: "bg-amber-500", border: "border-amber-200" }; // Morning = amber
    } else if (firstHour >= 12 && firstHour < 18) {
      return { bg: "bg-sky-50", text: "text-sky-600", accent: "bg-sky-500", border: "border-sky-200" }; // Afternoon = blue
    } else {
      return { bg: "bg-purple-50", text: "text-purple-600", accent: "bg-purple-500", border: "border-purple-200" }; // Night = purple
    }
  } catch {
    return { bg: "bg-amber-50", text: "text-amber-600", accent: "bg-amber-500", border: "border-amber-200" };
  }
}

export function MedicationCard({ medication, onClick }: MedicationCardProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = getTimeOfDayColor(medication.reminderTimes);

  const reminderTimesList = (() => {
    try {
      return medication.reminderTimes ? JSON.parse(medication.reminderTimes) : [];
    } catch {
      return [];
    }
  })();

  const nextReminder = (() => {
    if (reminderTimesList.length === 0) return null;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    for (const time of reminderTimesList.sort()) {
      const [h, m] = time.split(":").map(Number);
      if (h * 60 + m > currentMinutes) {
        return time;
      }
    }
    return reminderTimesList.sort()[0]; // next day's first
  })();

  return (
    <motion.button
      onClick={() => {
        setExpanded(!expanded);
        onClick?.();
      }}
      className="w-full text-left"
      whileTap={{ scale: 0.98 }}
    >
      <div className={`bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md border ${colors.border} dark:border-gray-700 transition-all`}>
        {/* Header row */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`size-10 rounded-xl flex items-center justify-center ${colors.accent}`}>
              <Pill className="size-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                {medication.name}
              </h3>
              <span className="text-xs text-gray-400">
                {medication.dosage} · {frequencyLabels[medication.frequency] || medication.frequency}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {medication.isActive ? (
              <div className="flex items-center gap-1">
                <CheckCircle2 className="size-4 text-emerald-500" />
                <span className="text-[10px] font-medium text-emerald-600">Activo</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <XCircle className="size-4 text-gray-400" />
                <span className="text-[10px] font-medium text-gray-400">Inactivo</span>
              </div>
            )}
            {expanded ? (
              <ChevronUp className="size-4 text-gray-400" />
            ) : (
              <ChevronDown className="size-4 text-gray-400" />
            )}
          </div>
        </div>

        {/* Disease badge + How to take */}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {medication.disease && (
            <Badge variant="secondary" className={`${colors.bg} ${colors.text} text-[10px] border-0`}>
              {medication.disease}
            </Badge>
          )}
          {medication.howToTake && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <Utensils className="size-3" />
              {howToTakeLabels[medication.howToTake] || medication.howToTake}
            </Badge>
          )}
        </div>

        {/* Next reminder */}
        {nextReminder && medication.isActive && (
          <div className="flex items-center gap-1.5 mt-2">
            <Clock className="size-3 text-gray-400" />
            <span className="text-[10px] text-gray-500">
              Próxima toma: <span className="font-medium text-gray-700 dark:text-gray-300">{nextReminder}</span>
            </span>
          </div>
        )}

        {/* Expanded details */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 mt-3 border-t border-gray-100 dark:border-gray-700 space-y-2">
                {/* Reminder times */}
                {reminderTimesList.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Clock className="size-3.5 text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-500">Horarios:</span>
                    <div className="flex gap-1 flex-wrap">
                      {reminderTimesList.map((time: string) => (
                        <Badge key={time} variant="secondary" className="text-[10px] bg-gray-100 dark:bg-gray-700">
                          {time}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dates */}
                {medication.startDate && (
                  <div className="text-[10px] text-gray-400">
                    Inicio: {new Date(medication.startDate).toLocaleDateString("es-CO")}
                    {medication.endDate && ` · Fin: ${new Date(medication.endDate).toLocaleDateString("es-CO")}`}
                  </div>
                )}

                {/* Reminder enabled */}
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="size-3.5 text-gray-400" />
                  <span className="text-[10px] text-gray-500">
                    Recordatorio {medication.reminderEnabled ? "activado" : "desactivado"}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.button>
  );
}
