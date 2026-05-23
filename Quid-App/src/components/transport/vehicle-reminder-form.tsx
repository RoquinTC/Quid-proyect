"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiFetch, getColombiaTodayString } from "@/lib/api";
import type { VehicleReminder } from "@/lib/types";
import { Bell, CalendarClock, Gauge, Loader2 } from "lucide-react";
import { toast } from "sonner";

const reminderCategories = [
  { value: "custom", label: "General" },
  { value: "maintenance", label: "Mantenimiento" },
  { value: "document", label: "Documento" },
  { value: "fuel", label: "Combustible" },
  { value: "inspection", label: "Revisión" },
  { value: "wash", label: "Lavado" },
  { value: "other", label: "Otro" },
];

interface VehicleReminderFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string | null;
  currentKm?: number;
  reminder?: VehicleReminder | null;
  onSuccess?: () => void;
}

function toInputDate(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

export function VehicleReminderForm({
  open,
  onOpenChange,
  vehicleId,
  currentKm = 0,
  reminder,
  onSuccess,
}: VehicleReminderFormProps) {
  const isEditing = Boolean(reminder);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("custom");
  const [triggerMode, setTriggerMode] = useState<"date" | "km" | "hybrid">("date");
  const [dueDate, setDueDate] = useState("");
  const [dueKm, setDueKm] = useState("");
  const [warningDays, setWarningDays] = useState("7");
  const [warningKm, setWarningKm] = useState("500");
  const [repeatIntervalKm, setRepeatIntervalKm] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(reminder?.title ?? "");
    setDescription(reminder?.description ?? "");
    setCategory(reminder?.category ?? "custom");
    setTriggerMode((reminder?.triggerMode as "date" | "km" | "hybrid") ?? "date");
    setDueDate(toInputDate(reminder?.dueDate) || getColombiaTodayString());
    setDueKm(reminder?.dueKm != null ? String(Math.round(reminder.dueKm)) : "");
    setWarningDays(String(reminder?.warningDays ?? 7));
    setWarningKm(String(reminder?.warningKm ?? 500));
    setRepeatIntervalKm(reminder?.repeatIntervalKm != null ? String(Math.round(reminder.repeatIntervalKm)) : "");
    setIsActive(reminder?.isActive ?? true);
  }, [open, reminder]);

  const needsDate = triggerMode === "date" || triggerMode === "hybrid";
  const needsKm = triggerMode === "km" || triggerMode === "hybrid";

  const helperText = useMemo(() => {
    if (triggerMode === "hybrid") return "Avisará por fecha y por kilometraje, lo que ocurra primero.";
    if (triggerMode === "km") return `Kilometraje actual aproximado: ${Math.round(currentKm).toLocaleString("es-CO")} km.`;
    return "Útil para pagos, revisiones o tareas con fecha fija.";
  }, [currentKm, triggerMode]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!vehicleId) {
      toast.error("Selecciona un vehículo");
      return;
    }
    if (needsDate && !dueDate) {
      toast.error("Indica la fecha del recordatorio");
      return;
    }
    if (needsKm && !dueKm) {
      toast.error("Indica el kilometraje del recordatorio");
      return;
    }

    setLoading(true);
    try {
      const payload = {
        title,
        description: description || null,
        category,
        triggerMode,
        dueDate: needsDate ? dueDate : null,
        dueKm: needsKm ? Number(dueKm) : null,
        warningDays: Number(warningDays || 0),
        warningKm: warningKm ? Number(warningKm) : null,
        repeatIntervalKm: needsKm && repeatIntervalKm ? Number(repeatIntervalKm) : null,
        isActive,
      };

      if (isEditing && reminder) {
        await apiFetch(`/api/vehicles/${vehicleId}/reminders/${reminder.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast.success("Recordatorio actualizado");
      } else {
        await apiFetch(`/api/vehicles/${vehicleId}/reminders`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast.success("Recordatorio creado");
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving vehicle reminder:", error);
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el recordatorio");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto rounded-t-3xl p-0 sm:max-w-lg sm:mx-auto">
        <SheetHeader className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur dark:bg-gray-950/95 dark:border-gray-800">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bell className="size-5 text-cyan-600" />
            {isEditing ? "Editar Recordatorio" : "Nuevo Recordatorio"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="space-y-4 px-4 py-5 pb-safe">
          <div className="space-y-2">
            <Label htmlFor="reminder-title">Título</Label>
            <Input
              id="reminder-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Cambio de aceite, pagar impuesto..."
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {reminderCategories.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Activación</Label>
              <Select value={triggerMode} onValueChange={(value) => setTriggerMode(value as "date" | "km" | "hybrid")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Fecha</SelectItem>
                  <SelectItem value="km">Kilometraje</SelectItem>
                  <SelectItem value="hybrid">Fecha + km</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="rounded-xl bg-cyan-50 px-3 py-2 text-xs text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">
            {helperText}
          </p>

          <div className="grid grid-cols-2 gap-3">
            {needsDate && (
              <div className="space-y-2">
                <Label htmlFor="reminder-date" className="flex items-center gap-1">
                  <CalendarClock className="size-3.5" />
                  Fecha
                </Label>
                <Input
                  id="reminder-date"
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                />
              </div>
            )}
            {needsKm && (
              <div className="space-y-2">
                <Label htmlFor="reminder-km" className="flex items-center gap-1">
                  <Gauge className="size-3.5" />
                  Km objetivo
                </Label>
                <Input
                  id="reminder-km"
                  type="number"
                  min="0"
                  value={dueKm}
                  onChange={(event) => setDueKm(event.target.value)}
                  placeholder={String(Math.round(currentKm + 1000))}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="warning-days">Avisar días antes</Label>
              <Input
                id="warning-days"
                type="number"
                min="0"
                value={warningDays}
                onChange={(event) => setWarningDays(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="warning-km">Avisar km antes</Label>
              <Input
                id="warning-km"
                type="number"
                min="0"
                value={warningKm}
                onChange={(event) => setWarningKm(event.target.value)}
              />
            </div>
          </div>

          {needsKm && (
            <div className="space-y-2">
              <Label htmlFor="repeat-km">Repetir cada km</Label>
              <Input
                id="repeat-km"
                type="number"
                min="0"
                value={repeatIntervalKm}
                onChange={(event) => setRepeatIntervalKm(event.target.value)}
                placeholder="Ej: 2500 para cambio de aceite"
              />
              <p className="text-xs text-gray-500">
                Al completarlo, Quid podrá programar el siguiente aviso con este intervalo.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reminder-description">Notas</Label>
            <Textarea
              id="reminder-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Detalle opcional para recordar mejor qué hay que hacer."
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between rounded-xl border px-3 py-3 dark:border-gray-800">
            <div>
              <p className="text-sm font-medium">Recordatorio activo</p>
              <p className="text-xs text-gray-500">Desactívalo si quieres guardarlo sin recibir alertas.</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="sticky bottom-0 -mx-4 flex gap-2 border-t bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-800 dark:bg-gray-950/95">
            <Button type="button" variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 bg-cyan-600 hover:bg-cyan-700" disabled={loading}>
              {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
              Guardar
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
