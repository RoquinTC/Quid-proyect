"use client";

import { useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { apiFetch, toColombiaDateString } from "@/lib/api";
import { Loader2, Sparkles, Plus, X, Pill } from "lucide-react";
import { motion } from "framer-motion";

const frequencyOptions = [
  { value: "daily", label: "Diario" },
  { value: "twice_daily", label: "Dos veces al día" },
  { value: "three_times_daily", label: "Tres veces al día" },
  { value: "weekly", label: "Semanal" },
  { value: "as_needed", label: "Según necesidad" },
  { value: "custom", label: "Personalizado" },
];

const howToTakeOptions = [
  { value: "with_food", label: "Con alimentos" },
  { value: "without_food", label: "Sin alimentos" },
  { value: "morning", label: "Mañana" },
  { value: "night", label: "Noche" },
  { value: "custom", label: "Personalizado" },
];

interface MedicationInfo {
  diseases: string[];
  recommendedDosage: string;
  howToTake: string;
  sideEffects: string[];
}

interface MedicationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  medication?: {
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
  } | null;
  onSuccess?: () => void;
}

export function MedicationForm({ open, onOpenChange, medication, onSuccess }: MedicationFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(medication?.name || "");
  const [dosage, setDosage] = useState(medication?.dosage || "");
  const [frequency, setFrequency] = useState(medication?.frequency || "daily");
  const [disease, setDisease] = useState(medication?.disease || "");
  const [howToTake, setHowToTake] = useState(medication?.howToTake || "");
  const [startDate, setStartDate] = useState(
    medication?.startDate ? toColombiaDateString(medication.startDate) : ""
  );
  const [endDate, setEndDate] = useState(
    medication?.endDate ? toColombiaDateString(medication.endDate) : ""
  );
  const [isActive, setIsActive] = useState(medication?.isActive ?? true);
  const [reminderEnabled, setReminderEnabled] = useState(medication?.reminderEnabled ?? true);
  const [reminderTimes, setReminderTimes] = useState<string[]>(() => {
    try {
      return medication?.reminderTimes ? JSON.parse(medication.reminderTimes) : [];
    } catch {
      return [];
    }
  });
  const [newTime, setNewTime] = useState("08:00");

  // AI suggestion state
  const [aiInfo, setAiInfo] = useState<MedicationInfo | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiSuggestions, setShowAiSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const isEditing = !!medication;

  const fetchAiInfo = useCallback(async (medName: string) => {
    if (!medName || medName.length < 3) {
      setAiInfo(null);
      setShowAiSuggestions(false);
      return;
    }
    setAiLoading(true);
    try {
      const data = await apiFetch<MedicationInfo>("/api/ai/medication-info", {
        method: "POST",
        body: JSON.stringify({ medicationName: medName }),
      });
      setAiInfo(data);
      setShowAiSuggestions(true);
    } catch {
      setAiInfo(null);
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleNameChange = (value: string) => {
    setName(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchAiInfo(value);
    }, 800);
  };

  const addReminderTime = () => {
    if (newTime && !reminderTimes.includes(newTime)) {
      setReminderTimes([...reminderTimes, newTime].sort());
      setNewTime("08:00");
    }
  };

  const removeReminderTime = (time: string) => {
    setReminderTimes(reminderTimes.filter((t) => t !== time));
  };

  const applyAiDisease = (d: string) => {
    setDisease(d);
  };

  const applyAiHowToTake = (h: string) => {
    // Map AI text to our options
    const lower = h.toLowerCase();
    if (lower.includes("con alimentos") || lower.includes("con comida")) {
      setHowToTake("with_food");
    } else if (lower.includes("sin alimentos") || lower.includes("ayunas") || lower.includes("estómago vacío")) {
      setHowToTake("without_food");
    } else if (lower.includes("mañana")) {
      setHowToTake("morning");
    } else if (lower.includes("noche")) {
      setHowToTake("night");
    } else {
      setHowToTake(h);
    }
  };

  const handleSubmit = async () => {
    if (!name || !dosage) return;
    setLoading(true);
    try {
      const data = {
        name,
        dosage,
        frequency,
        disease: disease || null,
        howToTake: howToTake || null,
        startDate: startDate || null,
        endDate: endDate || null,
        isActive,
        reminderEnabled,
        reminderTimes: reminderTimes.length > 0 ? reminderTimes : null,
      };

      if (isEditing && medication) {
        await apiFetch(`/api/medications/${medication.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch("/api/medications", {
          method: "POST",
          body: JSON.stringify(data),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving medication:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!medication) {
      setName("");
      setDosage("");
      setFrequency("daily");
      setDisease("");
      setHowToTake("");
      setStartDate("");
      setEndDate("");
      setIsActive(true);
      setReminderEnabled(true);
      setReminderTimes([]);
    }
    setAiInfo(null);
    setShowAiSuggestions(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Medicamento" : "Nuevo Medicamento"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name with AI */}
          <div className="space-y-2">
            <Label htmlFor="med-name">Nombre del Medicamento</Label>
            <div className="relative">
              <Input
                id="med-name"
                placeholder="Ej: Omeprazol"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="rounded-xl pr-9"
              />
              {aiLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-rose-500" />
              )}
              {!aiLoading && aiInfo && (
                <Sparkles className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-rose-500" />
              )}
            </div>

            {/* AI Suggestions */}
            {showAiSuggestions && aiInfo && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20 rounded-xl space-y-2 border border-rose-100 dark:border-rose-800"
              >
                <div className="flex items-center gap-1">
                  <Sparkles className="size-3 text-rose-500" />
                  <span className="text-[10px] font-medium text-rose-600">Sugerencias IA</span>
                </div>

                {/* AI diseases */}
                {aiInfo.diseases.length > 0 && (
                  <div>
                    <span className="text-[10px] text-gray-500">Enfermedades que trata:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {aiInfo.diseases.map((d) => (
                        <Badge
                          key={d}
                          variant="secondary"
                          className="text-[10px] cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-900/30 bg-rose-50 text-rose-700 dark:text-rose-300"
                          onClick={() => applyAiDisease(d)}
                        >
                          {d}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI dosage */}
                {aiInfo.recommendedDosage && (
                  <div>
                    <span className="text-[10px] text-gray-500">Dosis recomendada:</span>
                    <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5">{aiInfo.recommendedDosage}</p>
                  </div>
                )}

                {/* AI how to take */}
                {aiInfo.howToTake && (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[10px] h-auto p-0 text-rose-600 hover:text-rose-700"
                      onClick={() => applyAiHowToTake(aiInfo.howToTake)}
                    >
                      <Pill className="size-3 mr-1" />
                      Aplicar &quot;{aiInfo.howToTake}&quot;
                    </Button>
                  </div>
                )}

                {/* Side effects */}
                {aiInfo.sideEffects.length > 0 && (
                  <div>
                    <span className="text-[10px] text-gray-500">Efectos secundarios:</span>
                    <p className="text-[10px] text-gray-500 mt-0.5">{aiInfo.sideEffects.join(", ")}</p>
                  </div>
                )}
              </motion.div>
            )}
          </div>

          {/* Dosage */}
          <div className="space-y-2">
            <Label htmlFor="med-dosage">Dosis</Label>
            <Input
              id="med-dosage"
              placeholder="Ej: 20mg"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Frequency */}
          <div className="space-y-2">
            <Label>Frecuencia</Label>
            <Select value={frequency} onValueChange={setFrequency}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {frequencyOptions.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Disease */}
          <div className="space-y-2">
            <Label htmlFor="med-disease">Enfermedad</Label>
            <Input
              id="med-disease"
              placeholder="Ej: Gastritis"
              value={disease}
              onChange={(e) => setDisease(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* How to take */}
          <div className="space-y-2">
            <Label>Cómo tomarlo</Label>
            <Select value={howToTake} onValueChange={setHowToTake}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Seleccionar" />
              </SelectTrigger>
              <SelectContent>
                {howToTakeOptions.map((h) => (
                  <SelectItem key={h.value} value={h.value}>
                    {h.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="med-start">Fecha inicio</Label>
              <Input
                id="med-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="med-end">Fecha fin</Label>
              <Input
                id="med-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Active switch */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Medicamento activo</Label>
              <p className="text-[10px] text-gray-400">
                Desactiva si ya no lo tomas
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {/* Reminder switch */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Recordatorio</Label>
              <p className="text-[10px] text-gray-400">
                Recibe notificaciones para tomarlo
              </p>
            </div>
            <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
          </div>

          {/* Reminder times */}
          {reminderEnabled && (
            <div className="space-y-2">
              <Label>Horarios de recordatorio</Label>
              <div className="flex gap-2">
                <Input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="rounded-xl flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={addReminderTime}
                  className="rounded-xl shrink-0"
                >
                  <Plus className="size-4" />
                </Button>
              </div>
              {reminderTimes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {reminderTimes.map((time) => (
                    <Badge
                      key={time}
                      variant="secondary"
                      className="text-xs gap-1 bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                    >
                      {time}
                      <button onClick={() => removeReminderTime(time)} className="hover:text-rose-900">
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !name || !dosage}
            className="w-full rounded-xl bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-700 hover:to-pink-600"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Guardar Cambios" : "Agregar Medicamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
