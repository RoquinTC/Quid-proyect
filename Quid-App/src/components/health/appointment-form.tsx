"use client";

import { useEffect, useState } from "react";
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
import { apiFetch } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { hasNativeCalendarEvent, syncNativeAppointment } from "@/lib/native/device-integrations";
import { isNativeAndroid } from "@/lib/native/biometric";
import { ReceiptUpload } from "@/components/finance/receipt-upload";

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
    copayAmount?: number | null;
    supportUrl?: string | null;
    supportType?: string | null;
  } | null;
  onSuccess?: () => void | Promise<void>;
}

const specialtyOptions = [
  "Alergología",
  "Anestesiología",
  "Audiología",
  "Cirugía General",
  "Cirugía Maxilofacial",
  "Cirugía Plástica",
  "Medicina General",
  "Cardiología",
  "Coloproctología",
  "Dermatología",
  "Endocrinología",
  "Fisiatría",
  "Fisioterapia",
  "Gastroenterología",
  "Genética",
  "Geriatría",
  "Ginecología",
  "Hematología",
  "Infectología",
  "Medicina Interna",
  "Nefrología",
  "Neumología",
  "Neurología",
  "Nutrición",
  "Odontología",
  "Oftalmología",
  "Oncología",
  "Ortopedia",
  "Otorrinolaringología",
  "Pediatría",
  "Psicología",
  "Psiquiatría",
  "Radiología",
  "Reumatología",
  "Terapia Ocupacional",
  "Traumatología",
  "Urología",
  "Otra",
];

const supportTypes = [
  "Orden de cita",
  "Historia clinica",
  "Autorizacion",
  "Resultado o examen",
  "Indicaciones previas",
  "Otro soporte",
];

function toLocalDateTimeInput(value: string) {
  const date = new Date(value);
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function AppointmentForm({ open, onOpenChange, appointment, onSuccess }: AppointmentFormProps) {
  const [loading, setLoading] = useState(false);
  const [doctorName, setDoctorName] = useState(appointment?.doctorName || "");
  const [specialty, setSpecialty] = useState(appointment?.specialty || "");
  const [location, setLocation] = useState(appointment?.location || "");
  const [dateStr, setDateStr] = useState(() => {
    if (appointment?.date) {
      return toLocalDateTimeInput(appointment.date);
    }
    return "";
  });
  const [notes, setNotes] = useState(appointment?.notes || "");
  const [copayAmount, setCopayAmount] = useState(
    appointment?.copayAmount != null ? String(appointment.copayAmount) : ""
  );
  const [supportUrl, setSupportUrl] = useState<string | null>(appointment?.supportUrl || null);
  const [supportType, setSupportType] = useState(appointment?.supportType || supportTypes[0]);
  const [reminderEnabled, setReminderEnabled] = useState(appointment?.reminderEnabled ?? true);
  const [calendarEnabled, setCalendarEnabled] = useState(() => hasNativeCalendarEvent(appointment?.id));

  const isEditing = !!appointment;

  useEffect(() => {
    if (!open) return;
    setDoctorName(appointment?.doctorName || "");
    setSpecialty(appointment?.specialty || "");
    setLocation(appointment?.location || "");
    setDateStr(appointment?.date ? toLocalDateTimeInput(appointment.date) : "");
    setNotes(appointment?.notes || "");
    setCopayAmount(appointment?.copayAmount != null ? String(appointment.copayAmount) : "");
    setSupportUrl(appointment?.supportUrl || null);
    setSupportType(appointment?.supportType || supportTypes[0]);
    setReminderEnabled(appointment?.reminderEnabled ?? true);
    setCalendarEnabled(hasNativeCalendarEvent(appointment?.id));
  }, [appointment, open]);

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
        copayAmount: copayAmount ? Number(copayAmount) : null,
        reminderEnabled,
        supportUrl,
        supportType: supportUrl ? supportType : null,
      };

      if (isEditing && appointment) {
        const savedAppointment = await apiFetch<{ id: string }>(`/api/appointments/${appointment.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
        await syncAppointmentOnDevice(savedAppointment.id, data);
      } else {
        const savedAppointment = await apiFetch<{ id: string }>("/api/appointments", {
          method: "POST",
          body: JSON.stringify(data),
        });
        await syncAppointmentOnDevice(savedAppointment.id, data);
      }

      await onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving appointment:", error);
    } finally {
      setLoading(false);
    }
  };

  const syncAppointmentOnDevice = async (appointmentId: string, data: {
    doctorName: string | null;
    specialty: string | null;
    location: string | null;
    date: string;
    notes: string | null;
    reminderEnabled: boolean;
  }) => {
    if (!isNativeAndroid()) return;
    try {
      await syncNativeAppointment({
        appointmentId,
        title: data.specialty || data.doctorName || "Cita médica",
        description: data.notes || undefined,
        location: data.location || undefined,
        date: new Date(data.date),
        reminderEnabled: data.reminderEnabled,
        calendarEnabled,
      });
    } catch (error) {
      console.warn("Native appointment sync failed:", error);
      toast.warning("La cita se guardó en Quid, pero Android no pudo completar el recordatorio o calendario.");
    }
  };

  const resetForm = () => {
    if (!appointment) {
      setDoctorName("");
      setSpecialty("");
      setLocation("");
      setDateStr("");
      setNotes("");
      setCopayAmount("");
      setSupportUrl(null);
      setSupportType(supportTypes[0]);
      setReminderEnabled(true);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto p-4 sm:p-6">
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

          <div className="space-y-2">
            <Label htmlFor="apt-copay">Copago / gasto asociado</Label>
            <Input
              id="apt-copay"
              type="number"
              min="0"
              step="1"
              placeholder="Ej: 12000"
              value={copayAmount}
              onChange={(e) => setCopayAmount(e.target.value)}
              className="rounded-xl"
            />
            <p className="text-xs text-gray-500">
              Al completar la cita podrás confirmar si realmente hubo copago, editar el valor y escoger cuenta o tarjeta.
            </p>
          </div>

          {/* Reminder */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Recordatorio</Label>
              <p className="text-xs text-gray-400">
                Notificación antes de la cita
              </p>
            </div>
            <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
          </div>

          {isNativeAndroid() && (
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
              <div>
                <Label className="text-sm">Calendario del teléfono</Label>
                <p className="text-xs text-gray-400">
                  Guardar también en tu calendario sincronizado
                </p>
              </div>
              <Switch checked={calendarEnabled} onCheckedChange={setCalendarEnabled} />
            </div>
          )}

          <div className="space-y-3 rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 p-3 dark:border-rose-900/50 dark:bg-rose-950/10">
            <div>
              <Label className="text-sm font-bold">Soporte de la cita</Label>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Adjunta PDF o foto de la orden, historia clínica, indicaciones o resultados relacionados con esta cita.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="apt-support-type" className="text-xs">Tipo de soporte</Label>
              <select
                id="apt-support-type"
                value={supportType}
                onChange={(e) => setSupportType(e.target.value)}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-rose-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                {supportTypes.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <ReceiptUpload value={supportUrl} onChange={setSupportUrl} uploadLabel="Subir soporte" />
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
