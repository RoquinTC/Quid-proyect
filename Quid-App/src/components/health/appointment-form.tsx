"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, toColombiaDateString } from "@/lib/api";
import { Loader2 } from "lucide-react";

interface AppointmentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  appointment?: {
    id: string;
    doctorName?: string | null;
    specialty?: string | null;
    location?: string | null;
    date: string;
    notes?: string | null;
    reminderEnabled: boolean;
    status: string;
  } | null;
  onSuccess?: () => void;
}

const specialtyOptions = [
  "Medicina General",
  "Cardiología",
  "Dermatología",
  "Endocrinología",
  "Gastroenterología",
  "Ginecología",
  "Neurología",
  "Oftalmología",
  "Ortopedia",
  "Pediatría",
  "Psiquiatría",
  "Traumatología",
  "Urología",
  "Otra",
];

export function AppointmentForm({ open, onOpenChange, appointment, onSuccess }: AppointmentFormProps) {
  const [loading, setLoading] = useState(false);
  const [doctorName, setDoctorName] = useState(appointment?.doctorName || "");
  const [specialty, setSpecialty] = useState(appointment?.specialty || "");
  const [location, setLocation] = useState(appointment?.location || "");
  const [dateStr, setDateStr] = useState(() => {
    if (appointment?.date) {
      const d = toColombiaDateString(appointment.date);
      return `${d}T09:00`;
    }
    return "";
  });
  const [notes, setNotes] = useState(appointment?.notes || "");
  const [reminderEnabled, setReminderEnabled] = useState(appointment?.reminderEnabled ?? true);

  const isEditing = !!appointment;

  const handleSubmit = async () => {
    if (!dateStr) return;
    setLoading(true);
    try {
      const data = {
        doctorName: doctorName || null,
        specialty: specialty || null,
        location: location || null,
        date: new Date(dateStr).toISOString(),
        notes: notes || null,
        reminderEnabled,
      };

      if (isEditing && appointment) {
        await apiFetch(`/api/appointments/${appointment.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch("/api/appointments", {
          method: "POST",
          body: JSON.stringify(data),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving appointment:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!appointment) {
      setDoctorName("");
      setSpecialty("");
      setLocation("");
      setDateStr("");
      setNotes("");
      setReminderEnabled(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Cita Médica" : "Nueva Cita Médica"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Doctor name */}
          <div className="space-y-2">
            <Label htmlFor="apt-doctor">Nombre del doctor</Label>
            <Input
              id="apt-doctor"
              placeholder="Ej: Dr. García"
              value={doctorName}
              onChange={(e) => setDoctorName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Specialty */}
          <div className="space-y-2">
            <Label>Especialidad</Label>
            <Select value={specialty} onValueChange={setSpecialty}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Seleccionar especialidad" />
              </SelectTrigger>
              <SelectContent>
                {specialtyOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div className="space-y-2">
            <Label htmlFor="apt-location">Ubicación</Label>
            <Input
              id="apt-location"
              placeholder="Ej: Clínica del Valle, Consultorio 302"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Date and time */}
          <div className="space-y-2">
            <Label htmlFor="apt-date">Fecha y hora</Label>
            <Input
              id="apt-date"
              type="datetime-local"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="apt-notes">Notas</Label>
            <Textarea
              id="apt-notes"
              placeholder="Notas adicionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl min-h-[80px] resize-none"
            />
          </div>

          {/* Reminder */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Recordatorio</Label>
              <p className="text-[10px] text-gray-400">
                Notificación antes de la cita
              </p>
            </div>
            <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !dateStr}
            className="w-full rounded-xl bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-700 hover:to-pink-600"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Guardar Cambios" : "Agendar Cita"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
