"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  FormActions,
  FormDialog,
  FormField,
  FormSection,
  FormSwitchRow,
} from "@/components/layout/form-kit";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  FileText,
  Paperclip,
  Stethoscope,
} from "lucide-react";
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
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? "Editar cita médica" : "Nueva cita médica"}
      description="Agenda la cita y adjunta el soporte en el mismo lugar."
      icon={Stethoscope}
      tone="violet"
      footer={
        <FormActions
          onCancel={() => onOpenChange(false)}
          submitLabel={isEditing ? "Guardar cambios" : "Agendar cita"}
          submitType="button"
          onSubmit={handleSubmit}
          submitting={loading}
          disabled={!dateStr}
        />
      }
    >
      <FormSection title="Datos de la cita" icon={CalendarDays}>
        <FormField label="Nombre del doctor" htmlFor="apt-doctor">
          <Input
            id="apt-doctor"
            placeholder="Ej: Dr. García"
            value={doctorName}
            onChange={(e) => setDoctorName(e.target.value)}
            className="rounded-xl"
          />
        </FormField>

        <FormField label="Especialidad">
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
        </FormField>

        <FormField label="Ubicación" htmlFor="apt-location">
          <Input
            id="apt-location"
            placeholder="Ej: Clínica del Valle, Consultorio 302"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-xl"
          />
        </FormField>

        <FormField label="Fecha y hora" htmlFor="apt-date">
          <Input
            id="apt-date"
            type="datetime-local"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="rounded-xl"
          />
        </FormField>

        <FormField
          label="Copago / gasto asociado"
          htmlFor="apt-copay"
          hint="Al completar la cita confirmas si hubo copago y escoges la cuenta."
        >
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
        </FormField>
      </FormSection>

      <FormSection title="Recordatorios" icon={Bell}>
        <FormSwitchRow
          icon={Bell}
          label="Recordatorio"
          description="Notificación antes de la cita"
          checked={reminderEnabled}
          onCheckedChange={setReminderEnabled}
        />
        {isNativeAndroid() && (
          <FormSwitchRow
            icon={CalendarClock}
            label="Calendario del teléfono"
            description="Guardar también en tu calendario sincronizado"
            checked={calendarEnabled}
            onCheckedChange={setCalendarEnabled}
            tone="sky"
          />
        )}
      </FormSection>

      <FormSection
        title="Soporte de la cita"
        icon={Paperclip}
        hint="Orden, historia clínica o resultados"
        collapsibleHint="opcional"
      >
        <FormField label="Tipo de soporte" htmlFor="apt-support-type">
          <select
            id="apt-support-type"
            value={supportType}
            onChange={(e) => setSupportType(e.target.value)}
            className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-emerald-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            {supportTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </FormField>
        <ReceiptUpload value={supportUrl} onChange={setSupportUrl} uploadLabel="Subir soporte" />
      </FormSection>

      <FormSection title="Notas" icon={FileText} collapsibleHint="opcional">
        <Textarea
          id="apt-notes"
          placeholder="Indicaciones, preparación previa, observaciones…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="min-h-[80px] rounded-xl resize-none"
        />
      </FormSection>
    </FormDialog>
  );
}
