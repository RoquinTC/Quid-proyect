"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { AppointmentCard } from "./appointment-card";
import { AppointmentForm } from "./appointment-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PaymentMethodSelector } from "@/components/transport/payment-method-selector";
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
  Wallet,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { formatDate } from "@/lib/api";
import type { MedicalAppointment } from "@/lib/types";
import type { PaymentMethodType } from "@/lib/types/transport";

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
  const [completingAppointment, setCompletingAppointment] = useState<Appointment | null>(null);
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

  const handleStatusChange = async (
    id: string,
    status: string,
    payload?: Partial<Pick<Appointment, "copayAmount" | "accountId" | "subAccountId" | "debtId">>
  ) => {
    try {
      await apiFetch(`/api/appointments/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status, ...payload }),
      });
      fetchAppointments();
    } catch (error) {
      console.error("Error updating appointment:", error);
    }
  };

  const handleReverseCompletion = async (id: string) => {
    try {
      await apiFetch(`/api/appointments/${id}/reverse-completion`, { method: "POST" });
      await fetchAppointments();
      setSelectedAppointment(null);
    } catch (error) {
      console.error("Error reversing appointment completion:", error);
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
      <>
        <AppointmentDetail
          appointment={selectedAppointment}
          onBack={() => setSelectedAppointment(null)}
          onEdit={() => handleEdit(selectedAppointment)}
          onDelete={() => handleDelete(selectedAppointment.id)}
          onCompleteRequest={() => setCompletingAppointment(selectedAppointment)}
          onReverseCompletion={() => handleReverseCompletion(selectedAppointment.id)}
          onStatusChange={(status) => {
            handleStatusChange(selectedAppointment.id, status);
            setSelectedAppointment(null);
          }}
        />
        <CompleteAppointmentDialog
          appointment={completingAppointment}
          open={!!completingAppointment}
          onOpenChange={(open) => {
            if (!open) setCompletingAppointment(null);
          }}
          onConfirm={async (payload) => {
            if (!completingAppointment) return;

            await apiFetch(`/api/appointments/${completingAppointment.id}/complete`, {
              method: "POST",
              body: JSON.stringify(payload),
            });
            await fetchAppointments();

            setCompletingAppointment(null);
            setSelectedAppointment(null);
          }}
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
                <span className="text-xs text-violet-200">programada{scheduledCount !== 1 ? "s" : ""}</span>
              </div>
              {nextAppointment && (
                <div className="text-right">
                  <span className="text-xs text-violet-200">Próxima cita</span>
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
          className="fixed bottom-24 right-4 md:right-8 z-40"
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

function CompleteAppointmentDialog({
  appointment,
  open,
  onOpenChange,
  onConfirm,
}: {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: {
    copayAmount: number | null;
    accountId: string | null;
    subAccountId: string | null;
    debtId: string | null;
    createOrder?: {
      title: string;
      orderNumber: string | null;
      nextClaimDate: string | null;
      notes: string | null;
      items: Array<{ name: string; prescribedQty: number; unit: string }>;
    };
    createFollowUp?: {
      specialty: string;
      doctorName: string | null;
      date: string;
      location: string | null;
    };
    createAuthorization?: {
      type: string;
      specialty: string;
      notes: string | null;
    };
  }) => Promise<void>;
}) {
  const [hasCopay, setHasCopay] = useState(false);
  const [amount, setAmount] = useState("");
  const [payment, setPayment] = useState<{
    paymentType: PaymentMethodType;
    accountId: string | null;
    subAccountId: string | null;
    debtId: string | null;
    installmentCount: number | null;
  }>({
    paymentType: "account",
    accountId: null,
    subAccountId: null,
    debtId: null,
    installmentCount: null,
  });

  // Medical Order follow-up
  const [hasOrder, setHasOrder] = useState(false);
  const [orderTitle, setOrderTitle] = useState("Fórmula Médica");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderClaimDate, setOrderClaimDate] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  // Prescribed medications inside order
  const [meds, setMeds] = useState<Array<{ name: string; qty: string; unit: string }>>([
    { name: "", qty: "30", unit: "unit" }
  ]);

  // EPS Authorization follow-up
  const [hasAuthorization, setHasAuthorization] = useState(false);
  const [authSpecialty, setAuthSpecialty] = useState("");
  const [authType, setAuthType] = useState("specialist");
  const [authNotes, setAuthNotes] = useState("");

  // Next scheduled appointment control (direct)
  const [hasFollowUp, setHasFollowUp] = useState(false);
  const [followUpSpecialty, setFollowUpSpecialty] = useState("");
  const [followUpDoctor, setFollowUpDoctor] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpLocation, setFollowUpLocation] = useState("");

  const [saving, setSaving] = useState(false);

  const numericAmount = amount ? Number(amount) : 0;
  const needsPayment = hasCopay && numericAmount > 0;
  const hasPaymentSource = payment.paymentType === "credit_card" ? !!payment.debtId : !!payment.accountId;

  useEffect(() => {
    if (!open) return;
    setHasCopay(false);
    setAmount("");
    setPayment({
      paymentType: "account",
      accountId: null,
      subAccountId: null,
      debtId: null,
      installmentCount: null,
    });
    setHasOrder(false);
    setOrderTitle("Fórmula Médica");
    setOrderNumber("");
    setOrderClaimDate("");
    setOrderNotes("");
    setMeds([{ name: "", qty: "30", unit: "unit" }]);

    setHasAuthorization(false);
    setAuthSpecialty("");
    setAuthType("specialist");
    setAuthNotes("");

    setHasFollowUp(false);
    setFollowUpSpecialty(appointment?.specialty ? `Control de ${appointment.specialty}` : "Control Médico");
    setFollowUpDoctor(appointment?.doctorName || "");
    setFollowUpDate("");
    setFollowUpLocation(appointment?.location || "");
  }, [open, appointment]);

  const addMedRow = () => {
    setMeds([...meds, { name: "", qty: "30", unit: "unit" }]);
  };

  const removeMedRow = (index: number) => {
    const updated = [...meds];
    updated.splice(index, 1);
    setMeds(updated.length > 0 ? updated : [{ name: "", qty: "30", unit: "unit" }]);
  };

  const updateMedRow = (index: number, field: "name" | "qty" | "unit", val: string) => {
    const updated = [...meds];
    updated[index][field] = val;
    setMeds(updated);
  };

  const handleConfirm = async () => {
    if (needsPayment && !hasPaymentSource) return;
    if (hasFollowUp && !followUpDate) return;
    if (hasAuthorization && !authSpecialty) return;
    setSaving(true);
    try {
      const validMeds = meds
        .filter((m) => m.name.trim() !== "")
        .map((m) => ({
          name: m.name.trim(),
          prescribedQty: Number(m.qty) || 1,
          unit: m.unit || "unit",
        }));

      await onConfirm({
        copayAmount: hasCopay ? numericAmount : null,
        accountId: needsPayment ? payment.accountId : null,
        subAccountId: needsPayment ? payment.subAccountId : null,
        debtId: needsPayment && payment.paymentType === "credit_card" ? payment.debtId : null,
        createOrder: hasOrder ? {
          title: orderTitle || "Fórmula Médica",
          orderNumber: orderNumber || null,
          nextClaimDate: orderClaimDate || null,
          notes: orderNotes || null,
          items: validMeds,
        } : undefined,
        createFollowUp: hasFollowUp ? {
          specialty: followUpSpecialty || "Control Médico",
          doctorName: followUpDoctor || null,
          date: followUpDate,
          location: followUpLocation || null,
        } : undefined,
        createAuthorization: hasAuthorization ? {
          type: authType,
          specialty: authSpecialty,
          notes: authNotes || null,
        } : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const authTypes = [
    { value: "specialist", label: "Especialista" },
    { value: "procedure", label: "Examen / Proc." },
    { value: "control", label: "Control" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:w-full sm:max-w-lg rounded-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Completar cita médica</DialogTitle>
          <DialogDescription>
            Registra copagos, guarda fórmulas médicas o programa citas de control para continuar tu tratamiento.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Cita actual */}
          <div className="rounded-xl bg-violet-50 p-3 text-xs font-medium text-violet-800 dark:bg-violet-950/20 dark:text-violet-200">
            {appointment?.specialty || "Cita médica"}
            {appointment?.doctorName ? ` con ${appointment.doctorName}` : ""}
          </div>

          {/* SECCIÓN 1: COPAGO */}
          <div className="border border-gray-100 dark:border-gray-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2.5 items-center">
                <div className="size-8 rounded-xl bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center text-rose-500">
                  <Wallet className="size-4" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">¿Generó copago o gasto?</Label>
                  <p className="text-xs text-gray-400">Si pagaste copago, moderadora o consulta particular.</p>
                </div>
              </div>
              <Switch checked={hasCopay} onCheckedChange={setHasCopay} />
            </div>

            {hasCopay && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-4 pt-2 border-t border-gray-50 dark:border-gray-800"
              >
                <div className="space-y-2">
                  <Label htmlFor="complete-copay" className="text-xs text-gray-500">Valor pagado</Label>
                  <Input
                     id="complete-copay"
                     type="number"
                     min="0"
                     step="1"
                     placeholder="Ej: 12000"
                     value={amount}
                     onChange={(event) => setAmount(event.target.value)}
                     className="rounded-xl"
                  />
                </div>

                {numericAmount > 0 && (
                  <PaymentMethodSelector
                    defaultPaymentType="account"
                    onChange={setPayment}
                  />
                )}
              </motion.div>
            )}
          </div>

          {/* SECCIÓN 2: RECETA MÉDICA (ÓRDENES / MEDICAMENTOS) */}
          <div className="border border-gray-100 dark:border-gray-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2.5 items-center">
                <div className="size-8 rounded-xl bg-violet-50 dark:bg-violet-950/20 flex items-center justify-center text-violet-500">
                  <FileText className="size-4" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">¿Te dieron receta u orden médica?</Label>
                  <p className="text-xs text-gray-400">Registra los medicamentos o exámenes formulados.</p>
                </div>
              </div>
              <Switch checked={hasOrder} onCheckedChange={setHasOrder} />
            </div>

            {hasOrder && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-3 pt-2 border-t border-gray-50 dark:border-gray-800"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="order-title" className="text-xs text-gray-500">Título de la receta/orden</Label>
                    <Input
                      id="order-title"
                      placeholder="Ej: Fórmula de Medicamentos"
                      value={orderTitle}
                      onChange={(e) => setOrderTitle(e.target.value)}
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="order-number" className="text-xs text-gray-500">Número de orden/fórmula (Opcional)</Label>
                    <Input
                      id="order-number"
                      placeholder="Ej: F-92831"
                      value={orderNumber}
                      onChange={(e) => setOrderNumber(e.target.value)}
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="order-claim-date" className="text-xs text-gray-500">Fecha límite de reclamo (Opcional)</Label>
                  <Input
                    id="order-claim-date"
                    type="date"
                    value={orderClaimDate}
                    onChange={(e) => setOrderClaimDate(e.target.value)}
                    className="rounded-xl h-9 text-xs"
                  />
                </div>

                {/* Formulario Dinámico de Medicamentos */}
                <div className="space-y-2 pt-2">
                  <Label className="text-xs font-semibold text-gray-500">Medicamentos Formulados</Label>
                  <div className="space-y-2">
                    {meds.map((med, idx) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <Input
                          placeholder="Nombre (ej: Ibuprofeno 400mg)"
                          value={med.name}
                          onChange={(e) => updateMedRow(idx, "name", e.target.value)}
                          className="rounded-xl h-9 text-xs flex-1"
                        />
                        <Input
                          type="number"
                          min="1"
                          placeholder="Cant."
                          value={med.qty}
                          onChange={(e) => updateMedRow(idx, "qty", e.target.value)}
                          className="rounded-xl h-9 text-xs w-16"
                        />
                        <Input
                          placeholder="Unid."
                          value={med.unit}
                          onChange={(e) => updateMedRow(idx, "unit", e.target.value)}
                          className="rounded-xl h-9 text-xs w-16"
                        />
                        <button
                          type="button"
                          onClick={() => removeMedRow(idx)}
                          className="p-2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addMedRow}
                    className="w-full text-xs h-8 border-dashed rounded-xl"
                  >
                    <Plus className="size-3 mr-1" /> Agregar Medicamento
                  </Button>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="order-notes" className="text-xs text-gray-500">Notas Adicionales (Opcional)</Label>
                  <textarea
                    id="order-notes"
                    rows={2}
                    placeholder="Instrucciones del médico, dosis diaria..."
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent p-2.5 outline-none resize-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* SECCIÓN 3: TRÁMITE DE AUTORIZACIÓN EPS */}
          <div className="border border-gray-100 dark:border-gray-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2.5 items-center">
                <div className="size-8 rounded-xl bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center text-blue-500">
                  <Stethoscope className="size-4" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">¿Requiere autorización de la EPS?</Label>
                  <p className="text-xs text-gray-400">Si te remitieron a especialista o exámenes de diagnóstico.</p>
                </div>
              </div>
              <Switch checked={hasAuthorization} onCheckedChange={setHasAuthorization} />
            </div>

            {hasAuthorization && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-3 pt-2 border-t border-gray-50 dark:border-gray-800"
              >
                <div className="space-y-1.5">
                  <Label htmlFor="auth-specialty" className="text-xs text-gray-500">Especialidad u Orden Solicitada</Label>
                  <Input
                    id="auth-specialty"
                    placeholder="Ej: Fisioterapia, Cardiología, Ecografía"
                    value={authSpecialty}
                    onChange={(e) => setAuthSpecialty(e.target.value)}
                    className="rounded-xl h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-500">Tipo de Orden</Label>
                  <div className="flex gap-2">
                    {authTypes.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setAuthType(t.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                          authType === t.value
                            ? "bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-950/40 dark:border-violet-800 dark:text-violet-200"
                            : "border-gray-200 dark:border-gray-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="auth-notes" className="text-xs text-gray-500">Notas de la Autorización (Opcional)</Label>
                  <textarea
                    id="auth-notes"
                    rows={2}
                    placeholder="Ej: Diagnóstico asociado, requerimientos previos..."
                    value={authNotes}
                    onChange={(e) => setAuthNotes(e.target.value)}
                    className="w-full text-xs rounded-xl border border-gray-200 dark:border-gray-800 bg-transparent p-2.5 outline-none resize-none focus:ring-1 focus:ring-violet-500"
                  />
                </div>
              </motion.div>
            )}
          </div>

          {/* SECCIÓN 4: CITA DE CONTROL DIRECTA */}
          <div className="border border-gray-100 dark:border-gray-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-2.5 items-center">
                <div className="size-8 rounded-xl bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center text-amber-500">
                  <Plus className="size-4" />
                </div>
                <div>
                  <Label className="text-sm font-semibold">¿Tienes cita de control directa?</Label>
                  <p className="text-xs text-gray-400">Si programaste control inmediato sin autorización de EPS.</p>
                </div>
              </div>
              <Switch checked={hasFollowUp} onCheckedChange={setHasFollowUp} />
            </div>

            {hasFollowUp && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-3 pt-2 border-t border-gray-50 dark:border-gray-800"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="follow-up-specialty" className="text-xs text-gray-500">Especialidad</Label>
                    <Input
                      id="follow-up-specialty"
                      placeholder="Ej: Control Medicina Interna"
                      value={followUpSpecialty}
                      onChange={(e) => setFollowUpSpecialty(e.target.value)}
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="follow-up-doctor" className="text-xs text-gray-500">Médico (Opcional)</Label>
                    <Input
                      id="follow-up-doctor"
                      placeholder="Ej: Dr. Alejandro"
                      value={followUpDoctor}
                      onChange={(e) => setFollowUpDoctor(e.target.value)}
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="follow-up-date" className="text-xs text-gray-500">Fecha y Hora</Label>
                    <Input
                      id="follow-up-date"
                      type="datetime-local"
                      required
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="follow-up-location" className="text-xs text-gray-500">Consultorio / Lugar (Opcional)</Label>
                    <Input
                      id="follow-up-location"
                      placeholder="Ej: Torre Médica Piso 4"
                      value={followUpLocation}
                      onChange={(e) => setFollowUpLocation(e.target.value)}
                      className="rounded-xl h-9 text-xs"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          <Button
            className="w-full rounded-xl bg-gradient-to-r from-rose-600 to-pink-500 hover:from-rose-700 hover:to-pink-600 text-white font-medium py-2.5"
            onClick={handleConfirm}
            disabled={saving || (needsPayment && !hasPaymentSource) || (hasFollowUp && !followUpDate) || (hasAuthorization && !authSpecialty)}
          >
            {saving ? <Loader2 className="size-4 animate-spin mr-2" /> : <CalendarCheck className="size-4 mr-2" />}
            Guardar y Completar Cita
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Appointment detail sub-component
function AppointmentDetail({
  appointment,
  onBack,
  onEdit,
  onDelete,
  onStatusChange,
  onCompleteRequest,
  onReverseCompletion,
}: {
  appointment: Appointment;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: string) => void;
  onCompleteRequest: () => void;
  onReverseCompletion: () => void;
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
              <span className="text-[11px] text-white/80 uppercase">
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
          {appointment.copayAmount != null && Number(appointment.copayAmount) > 0 && (
            <div className="flex items-center gap-3">
              <div className="size-8 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center shrink-0">
                <Wallet className="size-4 text-violet-500" />
              </div>
              <div>
                <span className="text-xs text-gray-500">Copago</span>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {Number(appointment.copayAmount).toLocaleString("es-CO", {
                    style: "currency",
                    currency: "COP",
                    maximumFractionDigits: 0,
                  })}
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Status change buttons */}
      {appointment.status === "scheduled" ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800/30 dark:hover:bg-emerald-950/20"
            onClick={onCompleteRequest}
          >
            <CalendarCheck className="size-4 mr-1" />
            Completar
          </Button>
          <Button
            variant="outline"
            className="flex-1 rounded-xl border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800/30 dark:hover:bg-red-950/20"
            onClick={() => onStatusChange("cancelled")}
          >
            <CalendarX className="size-4 mr-1" />
            Cancelar
          </Button>
        </div>
      ) : appointment.status === "completed" ? (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800/30 dark:hover:bg-amber-950/20"
            onClick={onReverseCompletion}
          >
            <RotateCcw className="size-4 mr-1.5" />
            Reversar cita y copago
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 rounded-xl border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-800/30 dark:hover:bg-amber-950/20"
            onClick={() => onStatusChange("scheduled")}
          >
            <RotateCcw className="size-4 mr-1.5" />
            Volver a programar
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
