"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { AppointmentCard } from "./appointment-card";
import { AppointmentForm } from "./appointment-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Plus,
  Stethoscope,
  CalendarCheck,
  CalendarX,
  Filter,
  ArrowLeft,
  Edit3,
  Trash2,
  Bell,
  BellOff,
  MapPin,
  Clock,
  FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { formatDate } from "@/lib/api";
import type { MedicalAppointment } from "@/lib/types";

type Appointment = MedicalAppointment;

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

const statusFilters = [
  { value: "all", label: "Todas" },
  { value: "scheduled", label: "Programadas" },
  { value: "completed", label: "Completadas" },
  { value: "cancelled", label: "Canceladas" },
];

export function AppointmentsView() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchAppointments = useCallback(async () => {
    try {
      const data = await apiFetch<Appointment[]>("/api/appointments");
      setAppointments(data);
    } catch (error) {
      console.error("Error fetching appointments:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAppointments();
  }, [fetchAppointments]);

  const now = new Date();

  const filteredAppointments = statusFilter === "all"
    ? appointments
    : appointments.filter((a) => a.status === statusFilter);

  const upcoming = filteredAppointments.filter(
    (a) => new Date(a.date) >= now && a.status === "scheduled"
  );
  const past = filteredAppointments.filter(
    (a) => new Date(a.date) < now || a.status !== "scheduled"
  );

  const scheduledCount = appointments.filter((a) => a.status === "scheduled").length;
  const nextAppointment = upcoming.sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )[0];

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/appointments/${id}`, { method: "DELETE" });
      fetchAppointments();
      setSelectedAppointment(null);
    } catch (error) {
      console.error("Error deleting appointment:", error);
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await apiFetch(`/api/appointments/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      });
      fetchAppointments();
    } catch (error) {
      console.error("Error updating appointment:", error);
    }
  };

  const handleEdit = (apt: Appointment) => {
    setEditingAppointment(apt);
    setShowForm(true);
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

  // Detail view
  if (selectedAppointment) {
    return (
      <AppointmentDetail
        appointment={selectedAppointment}
        onBack={() => setSelectedAppointment(null)}
        onEdit={() => handleEdit(selectedAppointment)}
        onDelete={() => handleDelete(selectedAppointment.id)}
        onStatusChange={(status) => {
          handleStatusChange(selectedAppointment.id, status);
          setSelectedAppointment(null);
        }}
      />
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
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Stethoscope className="size-4 text-violet-200" />
              <span className="text-sm text-violet-100">Citas Médicas</span>
            </div>
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold tracking-tight">{scheduledCount}</p>
                <span className="text-[10px] text-violet-200">programada{scheduledCount !== 1 ? "s" : ""}</span>
              </div>
              {nextAppointment && (
                <div className="text-right">
                  <span className="text-[10px] text-violet-200">Próxima cita</span>
                  <p className="text-sm font-bold">
                    {new Date(nextAppointment.date).toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filter tabs */}
      <motion.div variants={itemVariants} className="flex gap-2 overflow-x-auto pb-1">
        {statusFilters.map((f) => (
          <Button
            key={f.value}
            variant={statusFilter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-xl text-xs h-8 shrink-0 ${
              statusFilter === f.value
                ? "bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300"
                : ""
            }`}
          >
            {f.label}
          </Button>
        ))}
      </motion.div>

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
            <CalendarCheck className="size-4 text-emerald-500" />
            Próximas Citas
          </h3>
          <div className="space-y-3">
            {upcoming
              .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map((apt) => (
                <motion.div key={apt.id} variants={itemVariants}>
                  <AppointmentCard
                    appointment={apt}
                    onClick={() => setSelectedAppointment(apt)}
                  />
                </motion.div>
              ))}
          </div>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-1.5">
            <CalendarX className="size-4 text-gray-400" />
            Citas Pasadas
          </h3>
          <div className="space-y-3">
            {past
              .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
              .map((apt) => (
                <motion.div key={apt.id} variants={itemVariants}>
                  <AppointmentCard
                    appointment={apt}
                    onClick={() => setSelectedAppointment(apt)}
                  />
                </motion.div>
              ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {filteredAppointments.length === 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 shadow-lg mb-4">
                <Stethoscope className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                Sin citas médicas
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Agrega tu primera cita para gestionar tus consultas
              </p>
              <Button
                onClick={() => {
                  setEditingAppointment(null);
                  setShowForm(true);
                }}
                className="rounded-xl bg-gradient-to-r from-violet-600 to-purple-500"
              >
                <Plus className="size-4 mr-1" />
                Agendar Cita
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* FAB - Add Appointment */}
      {appointments.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Button
            onClick={() => {
              setEditingAppointment(null);
              setShowForm(true);
            }}
            className="size-14 rounded-full bg-gradient-to-br from-violet-600 to-purple-500 shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/40"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      {/* Form */}
      <AppointmentForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingAppointment(null);
        }}
        appointment={editingAppointment}
        onSuccess={fetchAppointments}
      />
    </motion.div>
  );
}

// Appointment detail sub-component
function AppointmentDetail({
  appointment,
  onBack,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  appointment: Appointment;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
}) {
  const date = new Date(appointment.date);
  const statusLabels: Record<string, { label: string; color: string; bgColor: string }> = {
    scheduled: { label: "Programada", color: "text-emerald-700 dark:text-emerald-300", bgColor: "bg-emerald-50 dark:bg-emerald-900/20" },
    completed: { label: "Completada", color: "text-gray-600 dark:text-gray-400", bgColor: "bg-gray-100 dark:bg-gray-700" },
    cancelled: { label: "Cancelada", color: "text-red-600 dark:text-red-400", bgColor: "bg-red-50 dark:bg-red-900/20" },
  };
  const statusInfo = statusLabels[appointment.status] || statusLabels.scheduled;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 space-y-4 pb-safe"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {appointment.doctorName || "Cita Médica"}
          </h2>
          {appointment.specialty && (
            <span className="text-sm text-gray-500">{appointment.specialty}</span>
          )}
        </div>
        <Badge className={`${statusInfo.bgColor} ${statusInfo.color} border-0`}>
          {statusInfo.label}
        </Badge>
      </div>

      {/* Main card */}
      <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
        <CardContent className="p-5 relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-14 rounded-xl flex flex-col items-center justify-center bg-white/20">
              <span className="text-lg font-bold leading-none">{date.getDate()}</span>
              <span className="text-[9px] text-white/80 uppercase">
                {date.toLocaleDateString("es-CO", { month: "short" }).replace(".", "")}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-lg">
                {date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
              </h3>
              <span className="text-sm text-violet-100">
                {date.toLocaleDateString("es-CO", { weekday: "long" })}
              </span>
            </div>
          </div>
          {appointment.doctorName && (
            <p className="text-sm text-violet-100">Dr. {appointment.doctorName}</p>
          )}
        </CardContent>
      </Card>

      {/* Details */}
      <Card className="border-0 shadow-md rounded-2xl">
        <CardContent className="p-4 space-y-4">
          {appointment.specialty && (
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center shrink-0">
                <Stethoscope className="size-4 text-violet-500" />
              </div>
              <div>
                <span className="text-xs text-gray-500">Especialidad</span>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{appointment.specialty}</p>
              </div>
            </div>
          )}
          {appointment.location && (
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center shrink-0">
                <MapPin className="size-4 text-violet-500" />
              </div>
              <div>
                <span className="text-xs text-gray-500">Ubicación</span>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{appointment.location}</p>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center shrink-0">
              {appointment.reminderEnabled ? <Bell className="size-4 text-violet-500" /> : <BellOff className="size-4 text-gray-400" />}
            </div>
            <div>
              <span className="text-xs text-gray-500">Recordatorio</span>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {appointment.reminderEnabled ? "Activado" : "Desactivado"}
              </p>
            </div>
          </div>
          {appointment.notes && (
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center shrink-0">
                <FileText className="size-4 text-violet-500" />
              </div>
              <div>
                <span className="text-xs text-gray-500">Notas</span>
                <p className="text-sm text-gray-700 dark:text-gray-300">{appointment.notes}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status change buttons */}
      {appointment.status === "scheduled" && (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl border-emerald-200 text-emerald-600 hover:bg-emerald-50"
            onClick={() => onStatusChange("completed")}
          >
            <CalendarCheck className="size-4 mr-1" />
            Completar
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50"
            onClick={() => onStatusChange("cancelled")}
          >
            <CalendarX className="size-4 mr-1" />
            Cancelar
          </Button>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="flex-1 rounded-xl border-violet-200 text-violet-600 hover:bg-violet-50"
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
