"use client";

import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert,
  ShieldCheck,
  Calendar,
  User,
  MapPin,
  Clock,
  Plus,
  Loader2,
  FileClock,
  History,
  AlertTriangle,
  FileText,
  Edit3,
  Trash2,
  RotateCcw,
  CalendarX,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { ReceiptUpload } from "@/components/finance/receipt-upload";

interface Authorization {
  id: string;
  type: string;
  specialty: string;
  status: string;
  /** Campo del DB: code */
  code?: string | null;
  authorizationDate?: string | null;
  expirationDate?: string | null;
  daysOfValidity: number;
  notes?: string | null;
  renewals?: any;
  supportUrl?: string | null;
  supportType?: string | null;
  createdAt: string;
  originAppointment?: {
    id: string;
    doctorName?: string | null;
    specialty?: string | null;
    date: string;
  } | null;
  /** Cita programada con esta autorización */
  appointment?: {
    id: string;
    doctorName?: string | null;
    date: string;
    location?: string | null;
    status: string;
  } | null;
  originAppointmentId?: string | null;
}

export function AuthorizationsTab() {
  const [authorizations, setAuthorizations] = useState<Authorization[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [activeAuth, setActiveAuth] = useState<Authorization | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRenewDialog, setShowRenewDialog] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | "pending_authorization" | "authorized" | "expired" | "scheduled">("all");

  // Form states
  const [authCode, setAuthCode] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [daysOfValidity, setDaysOfValidity] = useState("30");
  const [supportUrl, setSupportUrl] = useState<string | null>(null);
  const [supportType, setSupportType] = useState("Autorizacion EPS");
  const [submitting, setSubmitting] = useState(false);

  // Schedule Appointment Form states
  const [doctorName, setDoctorName] = useState("");
  const [aptDate, setAptDate] = useState("");
  const [location, setLocation] = useState("");
  const [aptNotes, setAptNotes] = useState("");
  const [scheduleWarning, setScheduleWarning] = useState<string | null>(null);

  const fetchAuthorizations = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<Authorization[]>("/api/health/authorizations");
      setAuthorizations(data);
    } catch (error) {
      console.error("Error fetching authorizations:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuthorizations();
  }, []);

  const handleApprove = async () => {
    if (!activeAuth || !authCode || !issueDate) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/health/authorizations/${activeAuth.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: "authorized",
          authorizationCode: authCode,
          issueDate: new Date(issueDate).toISOString(),
          daysOfValidity: Number(daysOfValidity) || 30,
          supportUrl,
          supportType: supportUrl ? supportType : null,
        }),
      });
      setShowApproveDialog(false);
      setActiveAuth(null);
      fetchAuthorizations();
    } catch (error) {
      console.error("Error approving authorization:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenew = async () => {
    if (!activeAuth || !authCode || !issueDate) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/health/authorizations/${activeAuth.id}`, {
        method: "PUT",
        body: JSON.stringify({
          status: "authorized",
          authorizationCode: authCode,
          issueDate: new Date(issueDate).toISOString(),
          daysOfValidity: Number(daysOfValidity) || 30,
          supportUrl,
          supportType: supportUrl ? supportType : null,
        }),
      });
      setShowRenewDialog(false);
      setActiveAuth(null);
      fetchAuthorizations();
    } catch (error) {
      console.error("Error renewing authorization:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSchedule = async () => {
    if (!activeAuth || !aptDate) return;
    const daysLeft = getDaysLeft(activeAuth.expirationDate);
    if (daysLeft !== null && daysLeft <= 0) {
      setScheduleWarning("Esta autorización está vencida. Renueva o registra una nueva autorización antes de programar.");
      return;
    }
    if (activeAuth.expirationDate) {
      const appointmentDate = new Date(aptDate);
      const expiration = new Date(activeAuth.expirationDate);
      appointmentDate.setHours(0, 0, 0, 0);
      expiration.setHours(0, 0, 0, 0);
      if (appointmentDate > expiration) {
        setScheduleWarning("La fecha de la cita queda después del vencimiento de la autorización.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload = {
          doctorName: doctorName || null,
          specialty: activeAuth.specialty,
          location: location || null,
          date: new Date(aptDate).toISOString(),
          notes: aptNotes || null,
          reminderEnabled: true,
          status: "scheduled",
          authorizationId: activeAuth.id,
      };

      if (activeAuth.appointment?.id) {
        await apiFetch(`/api/appointments/${activeAuth.appointment.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/appointments", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setShowScheduleDialog(false);
      setActiveAuth(null);
      setScheduleWarning(null);
      fetchAuthorizations();
    } catch (error) {
      console.error("Error scheduling appointment:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditAuthorization = async () => {
    if (!activeAuth || !activeAuth.specialty.trim()) return;
    setSubmitting(true);
    try {
      await apiFetch(`/api/health/authorizations/${activeAuth.id}`, {
        method: "PUT",
        body: JSON.stringify({
          type: activeAuth.type,
          specialty: activeAuth.specialty,
          notes: activeAuth.notes || null,
          supportUrl,
          supportType: supportUrl ? supportType : null,
        }),
      });
      setShowEditDialog(false);
      setActiveAuth(null);
      fetchAuthorizations();
    } catch (error) {
      console.error("Error editing authorization:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleReverseAuthorization = async (auth: Authorization) => {
    const confirmed = window.confirm("Esto devuelve la autorización a pendiente EPS, limpia código/vigencia y desvincula la cita programada si existe. ¿Continuar?");
    if (!confirmed) return;
    try {
      await apiFetch(`/api/health/authorizations/${auth.id}`, {
        method: "PUT",
        body: JSON.stringify({ clearAuthorization: true }),
      });
      fetchAuthorizations();
    } catch (error) {
      console.error("Error reversing authorization:", error);
    }
  };

  const handleUnlinkAppointment = async (auth: Authorization) => {
    if (!auth.appointment?.id) return;
    const confirmed = window.confirm("Esto quitará la cita programada de esta autorización, pero no eliminará la autorización. ¿Continuar?");
    if (!confirmed) return;
    try {
      await apiFetch(`/api/appointments/${auth.appointment.id}`, {
        method: "PUT",
        body: JSON.stringify({ authorizationId: null, notes: "Cita desvinculada de autorización EPS." }),
      });
      fetchAuthorizations();
    } catch (error) {
      console.error("Error unlinking appointment:", error);
    }
  };

  const handleDeleteAuthorization = async (auth: Authorization) => {
    const confirmed = window.confirm("¿Eliminar esta autorización EPS? Si tiene una cita asociada, quedará sin autorización vinculada.");
    if (!confirmed) return;
    try {
      await apiFetch(`/api/health/authorizations/${auth.id}`, { method: "DELETE" });
      fetchAuthorizations();
    } catch (error) {
      console.error("Error deleting authorization:", error);
    }
  };

  // El API retorna appointment (la cita programada con esta autorización)
  // y originAppointment (la cita de origen que generó la autorización)

  const getDaysLeft = (expirationDateStr: string | null | undefined) => {
    if (!expirationDateStr) return null;
    const expDate = new Date(expirationDateStr);
    const today = new Date();
    // Reset hours for accurate day calculation
    expDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getStatusBadge = (auth: Authorization) => {
    if (auth.status === "pending_authorization") {
      return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900 rounded-lg text-xs font-semibold px-2 py-0.5">Pendiente EPS</Badge>;
    }
    if (auth.status === "expired") {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-lg text-xs font-semibold px-2 py-0.5">Expirado</Badge>;
    }
    // Si está autorizado, verificar si queda poco para expirar
    const daysLeft = getDaysLeft(auth.expirationDate);
    if (daysLeft !== null && daysLeft <= 0) {
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 border border-red-200 dark:border-red-900 rounded-lg text-xs font-semibold px-2 py-0.5">Expirado</Badge>;
    }
    if (daysLeft !== null && daysLeft <= 5) {
      return <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border border-orange-200 dark:border-orange-900 rounded-lg text-xs font-semibold px-2 py-0.5">Vence Pronto</Badge>;
    }
    return <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 rounded-lg text-xs font-semibold px-2 py-0.5">Autorizado</Badge>;
  };

  const filteredAuthorizations = authorizations.filter((auth) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "scheduled") return Boolean(auth.appointment);
    if (statusFilter === "expired") {
      const daysLeft = getDaysLeft(auth.expirationDate);
      return auth.status === "expired" || (daysLeft !== null && daysLeft <= 0);
    }
    return auth.status === statusFilter;
  });

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-safe">
      {/* Resumen EPS */}
      <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.08),transparent)] pointer-events-none" />
        <CardContent className="p-5 relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="size-4 text-indigo-200" />
            <span className="text-sm text-indigo-100">Autorizaciones Médicas</span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold tracking-tight">
                {authorizations.filter((a) => a.status === "pending_authorization").length}
              </p>
              <span className="text-xs text-indigo-200">trámites pendientes en la EPS</span>
            </div>
            <div className="text-right">
              <span className="text-xs text-indigo-200">Vigentes</span>
              <p className="text-sm font-bold">
                {authorizations.filter((a) => {
                  if (a.status !== "authorized") return false;
                  const dl = getDaysLeft(a.expirationDate);
                  return dl !== null && dl > 0;
                }).length} autorizadas
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          { value: "all", label: "Todas" },
          { value: "pending_authorization", label: "Pendientes" },
          { value: "authorized", label: "Autorizadas" },
          { value: "scheduled", label: "Con cita" },
          { value: "expired", label: "Vencidas" },
        ].map((filter) => (
          <Button
            key={filter.value}
            variant={statusFilter === filter.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(filter.value as typeof statusFilter)}
            className={`h-8 shrink-0 rounded-xl text-xs ${
              statusFilter === filter.value
                ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300"
                : ""
            }`}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {/* Lista de autorizaciones */}
      <div className="space-y-3">
        {authorizations.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <ShieldCheck className="size-10 mx-auto opacity-20 mb-2" />
            <p className="text-sm">No tienes trámites de autorización registrados.</p>
          </div>
        ) : (
          <AnimatePresence>
            {filteredAuthorizations.map((auth) => {
              const daysLeft = getDaysLeft(auth.expirationDate);
              const formattedExp = auth.expirationDate
                ? new Date(auth.expirationDate).toLocaleDateString("es-CO", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : null;
              const isExpired = daysLeft !== null && daysLeft <= 0;
              const isLastValidDay = daysLeft === 0;
              const isExpanded = expandedId === auth.id;
              const needsAttention =
                auth.status === "pending_authorization" ||
                Boolean(auth.appointment && auth.appointment.status === "scheduled") ||
                isExpired ||
                isLastValidDay ||
                (daysLeft !== null && daysLeft <= 5);

              return (
                <motion.div
                  key={auth.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                >
                  <Card className="border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm hover:shadow-md transition-shadow duration-200">
                    <CardContent className="p-3 space-y-3">
                      {/* Cabecera */}
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : auth.id)}
                        className="flex w-full items-center justify-between gap-2 text-left"
                      >
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 dark:text-white capitalize">
                            {auth.specialty}
                          </h4>
                          <span className="block truncate text-[10px] text-gray-400 font-medium tracking-wide uppercase">
                            {auth.type === "specialist"
                              ? "Cita Especialista"
                              : auth.type === "procedure"
                              ? "Examen / Procedimiento"
                              : "Control Médico"}
                          </span>
                          {auth.appointment ? (
                            <span className={`mt-1 inline-flex items-center gap-1 text-[11px] ${
                              auth.appointment.status === "scheduled"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : "text-amber-700 dark:text-amber-300"
                            }`}>
                              <Calendar className="size-3" />
                              {auth.appointment.status === "scheduled" ? "Cita: " : "Cita no activa: "}
                              {new Date(auth.appointment.date).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : formattedExp ? (
                            <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-gray-500">
                              <FileClock className="size-3" />
                              Vence: {formattedExp}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {getStatusBadge(auth)}
                          <ChevronDown className={`size-4 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </button>

                      {/* Información de origen */}
                      {isExpanded && auth.originAppointment && (
                        <div className="text-xs text-gray-500 bg-gray-50 dark:bg-gray-900/60 p-2.5 rounded-xl flex items-start gap-2">
                          <FileText className="size-3.5 mt-0.5 text-gray-400 flex-shrink-0" />
                          <div>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Ordenada en: </span>
                            {auth.originAppointment.specialty} ({new Date(auth.originAppointment.date).toLocaleDateString("es-CO")})
                          </div>
                        </div>
                      )}

                      {/* Detalles de autorización */}
                      {isExpanded && auth.status === "authorized" && (
                        <div className="text-xs space-y-1.5 border-t border-gray-50 dark:border-gray-800 pt-2.5">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Código de Autorización:</span>
                            <span className="font-mono font-bold text-gray-900 dark:text-white">
                              {auth.code}
                            </span>
                          </div>
                          {formattedExp && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 flex items-center gap-1">
                                <Calendar className="size-3" /> Vence el:
                              </span>
                              <span className="font-semibold text-gray-700 dark:text-gray-300">
                                {formattedExp}
                              </span>
                            </div>
                          )}
                          {daysLeft !== null && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400">Vigencia restante:</span>
                              <span
                                className={`font-bold ${
                                  daysLeft <= 0
                                    ? "text-red-500"
                                    : daysLeft <= 5
                                    ? "text-orange-500"
                                    : "text-emerald-500"
                                }`}
                              >
                                {daysLeft <= 0 ? "Expirada" : `${daysLeft} días`}
                              </span>
                            </div>
                          )}
                          {auth.supportUrl && (
                            <a
                              href={auth.supportUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-2 flex items-center justify-between rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900/50 dark:bg-indigo-950/20 dark:text-indigo-300"
                            >
                              <span className="flex items-center gap-2 font-semibold">
                                <FileText className="size-3.5" />
                                {auth.supportType || "Soporte adjunto"}
                              </span>
                              <ExternalLink className="size-3.5" />
                            </a>
                          )}
                        </div>
                      )}

                      {isExpanded && auth.notes && (
                        <p className="text-xs text-gray-400 italic bg-gray-50 dark:bg-gray-900/40 p-2 rounded-xl">
                          &ldquo;{auth.notes}&rdquo;
                        </p>
                      )}

                      {needsAttention && isExpired && auth.status !== "pending_authorization" && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
                          Esta autorización ya venció. No se debe programar cita con esta vigencia; renueva o reversa el trámite.
                        </div>
                      )}

                      {needsAttention && isLastValidDay && (
                        <div className="rounded-xl border border-orange-200 bg-orange-50 p-2.5 text-xs text-orange-800 dark:border-orange-900 dark:bg-orange-950/20 dark:text-orange-300">
                          Hoy es el último día de vigencia. Si la entidad no agenda hoy, conviene renovar.
                        </div>
                      )}

                      {/* Información de cita programada */}
                      {isExpanded && auth.appointment ? (
                        <div className={`mt-2 text-xs p-2.5 rounded-xl border ${
                          auth.appointment.status === "scheduled"
                            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300 border-emerald-100/30"
                            : "bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 border-amber-100/30"
                        }`}>
                          <p className="font-bold flex items-center gap-1.5 mb-1">
                            <Calendar className="size-3.5" /> {auth.appointment.status === "scheduled" ? "Cita programada" : "Cita cancelada o no activa"}
                          </p>
                          <div className="space-y-1 pl-5">
                            {auth.appointment.doctorName && (
                              <p className="flex items-center gap-1 text-[11px]">
                                <User className="size-3" /> {auth.appointment.doctorName}
                              </p>
                            )}
                            <p className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400">
                              <Clock className="size-3" /> {new Date(auth.appointment.date).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </p>
                            {auth.appointment.location && (
                              <p className="flex items-center gap-1 text-[11px]">
                                <MapPin className="size-3" /> {auth.appointment.location}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        auth.status === "authorized" &&
                        daysLeft !== null &&
                        daysLeft > 0 && (
                          <div className={`mt-2 bg-amber-50 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 p-2.5 rounded-xl border border-amber-100/30 text-xs items-center gap-2 ${isExpanded || daysLeft <= 5 ? "flex" : "hidden"}`}>
                            <AlertTriangle className="size-4 flex-shrink-0 text-amber-500" />
                            <span>Aún no has agendado la cita de esta autorización.</span>
                          </div>
                        )
                      )}

                      {/* Acciones */}
                      {isExpanded && <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-gray-50 dark:border-gray-800">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-8 text-gray-500 rounded-xl"
                          onClick={() => {
                            setActiveAuth({ ...auth });
                            setSupportUrl(auth.supportUrl || null);
                            setSupportType(auth.supportType || "Autorizacion EPS");
                            setShowEditDialog(true);
                          }}
                        >
                          <Edit3 className="size-3.5 mr-1" /> Editar
                        </Button>

                        {auth.renewals && (auth.renewals as any[]).length > 0 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs h-8 text-gray-500 rounded-xl"
                            onClick={() => {
                              setActiveAuth(auth);
                              setShowHistoryDialog(true);
                            }}
                          >
                            <History className="size-3.5 mr-1" /> Historial
                          </Button>
                        )}

                        {auth.status === "pending_authorization" && (
                          <Button
                            size="sm"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs h-8"
                            onClick={() => {
                              setActiveAuth(auth);
                              setAuthCode("");
                              setIssueDate(new Date().toISOString().split("T")[0]);
                              setDaysOfValidity("30");
                              setSupportUrl(auth.supportUrl || null);
                              setSupportType(auth.supportType || "Autorizacion EPS");
                              setShowApproveDialog(true);
                            }}
                          >
                            <ShieldCheck className="size-3.5 mr-1" /> Registrar Autorización
                          </Button>
                        )}

                        {auth.status === "authorized" && !auth.appointment && !isExpired && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs h-8"
                            onClick={() => {
                              setActiveAuth(auth);
                              setDoctorName("");
                              setAptDate("");
                              setLocation("");
                              setAptNotes("");
                              setScheduleWarning(null);
                              setShowScheduleDialog(true);
                            }}
                          >
                            <Calendar className="size-3.5 mr-1" /> Agendar Cita
                          </Button>
                        )}

                        {auth.status === "authorized" && auth.appointment && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl text-xs h-8"
                              onClick={() => {
                                setActiveAuth(auth);
                                setDoctorName(auth.appointment?.doctorName || "");
                                setAptDate(auth.appointment?.date ? new Date(auth.appointment.date).toISOString().slice(0, 16) : "");
                                setLocation(auth.appointment?.location || "");
                                setAptNotes("");
                                setScheduleWarning(null);
                                setShowScheduleDialog(true);
                              }}
                            >
                              <Calendar className="size-3.5 mr-1" /> Reprogramar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-xl text-xs h-8 border-amber-200 text-amber-700 hover:bg-amber-50"
                              onClick={() => handleUnlinkAppointment(auth)}
                            >
                              <CalendarX className="size-3.5 mr-1" /> Desvincular
                            </Button>
                          </>
                        )}

                        {(auth.status === "expired" || (daysLeft !== null && daysLeft <= 0)) && (
                          <Button
                            size="sm"
                            className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs h-8"
                            onClick={() => {
                              setActiveAuth(auth);
                              setAuthCode("");
                              setIssueDate(new Date().toISOString().split("T")[0]);
                              setDaysOfValidity("30");
                              setSupportUrl(auth.supportUrl || null);
                              setSupportType(auth.supportType || "Autorizacion EPS");
                              setShowRenewDialog(true);
                            }}
                          >
                            <FileClock className="size-3.5 mr-1" /> Renovar
                          </Button>
                        )}

                        {auth.status === "authorized" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="rounded-xl text-xs h-8 border-orange-200 text-orange-700 hover:bg-orange-50"
                            onClick={() => handleReverseAuthorization(auth)}
                          >
                            <RotateCcw className="size-3.5 mr-1" /> Reversar
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl text-xs h-8 border-red-200 text-red-600 hover:bg-red-50"
                          onClick={() => handleDeleteAuthorization(auth)}
                        >
                          <Trash2 className="size-3.5 mr-1" /> Eliminar
                        </Button>
                      </div>}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* DIÁLOGO APROBAR/AUTORIZAR EPS */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle>Editar orden EPS</DialogTitle>
            <DialogDescription>
              Corrige el servicio, tipo o notas si la remisión quedó mal registrada.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-specialty" className="text-xs text-gray-500">Servicio o especialidad</Label>
              <Input
                id="edit-specialty"
                value={activeAuth?.specialty || ""}
                onChange={(event) => {
                  if (!activeAuth) return;
                  setActiveAuth({ ...activeAuth, specialty: event.target.value });
                }}
                className="rounded-xl h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-gray-500">Tipo</Label>
              <div className="flex gap-2">
                {[
                  { value: "specialist", label: "Especialista" },
                  { value: "procedure", label: "Examen" },
                  { value: "control", label: "Control" },
                ].map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => {
                      if (!activeAuth) return;
                      setActiveAuth({ ...activeAuth, type: type.value });
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                      activeAuth?.type === type.value
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-300"
                        : "border-gray-200 text-gray-500 dark:border-gray-800"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-notes" className="text-xs text-gray-500">Notas</Label>
              <Textarea
                id="edit-notes"
                value={activeAuth?.notes || ""}
                onChange={(event) => {
                  if (!activeAuth) return;
                  setActiveAuth({ ...activeAuth, notes: event.target.value });
                }}
                className="rounded-xl min-h-[80px] resize-none text-sm"
              />
            </div>

            <div className="space-y-2 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/10">
              <Label className="text-xs font-bold text-indigo-700 dark:text-indigo-300">Soporte PDF o foto</Label>
              <ReceiptUpload value={supportUrl} onChange={setSupportUrl} uploadLabel="Subir soporte" />
            </div>

            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-10 font-medium"
              onClick={handleEditAuthorization}
              disabled={submitting || !activeAuth?.specialty}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Guardar cambios"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle>Registrar Autorización EPS</DialogTitle>
            <DialogDescription>
              Ingresa el código oficial y las fechas de vigencia autorizadas por tu EPS para continuar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="reg-code" className="text-xs text-gray-500">Código de Autorización</Label>
              <Input
                id="reg-code"
                placeholder="Ej: AUT-928381"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                className="rounded-xl h-10 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="reg-issue" className="text-xs text-gray-500">Fecha de Expedición</Label>
                <Input
                  id="reg-issue"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="rounded-xl h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reg-validity" className="text-xs text-gray-500">Días de Validez</Label>
                <Input
                  id="reg-validity"
                  type="number"
                  placeholder="30"
                  value={daysOfValidity}
                  onChange={(e) => setDaysOfValidity(e.target.value)}
                  className="rounded-xl h-10 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-3 dark:border-indigo-900/50 dark:bg-indigo-950/10">
              <Label className="text-xs font-bold text-indigo-700 dark:text-indigo-300">PDF o foto de la autorización</Label>
              <ReceiptUpload value={supportUrl} onChange={setSupportUrl} uploadLabel="Subir soporte" />
            </div>

            <Button
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl h-10 font-medium"
              onClick={handleApprove}
              disabled={submitting || !authCode || !issueDate}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Guardar Autorización"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO RENOVAR AUTORIZACIÓN */}
      <Dialog open={showRenewDialog} onOpenChange={setShowRenewDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-2xl p-5">
          <DialogHeader>
            <DialogTitle>Renovar Autorización EPS</DialogTitle>
            <DialogDescription>
              Registra un nuevo trámite de prórroga con un código actualizado. El historial quedará guardado para auditoría.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="ren-code" className="text-xs text-gray-500">Nuevo Código de Autorización</Label>
              <Input
                id="ren-code"
                placeholder="Ej: AUT-928381-R1"
                value={authCode}
                onChange={(e) => setAuthCode(e.target.value)}
                className="rounded-xl h-10 text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="ren-issue" className="text-xs text-gray-500">Fecha de Nueva Expedición</Label>
                <Input
                  id="ren-issue"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className="rounded-xl h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ren-validity" className="text-xs text-gray-500">Días de Validez</Label>
                <Input
                  id="ren-validity"
                  type="number"
                  placeholder="30"
                  value={daysOfValidity}
                  onChange={(e) => setDaysOfValidity(e.target.value)}
                  className="rounded-xl h-10 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-2xl border border-dashed border-rose-200 bg-rose-50/40 p-3 dark:border-rose-900/50 dark:bg-rose-950/10">
              <Label className="text-xs font-bold text-rose-700 dark:text-rose-300">PDF o foto de la renovación</Label>
              <ReceiptUpload value={supportUrl} onChange={setSupportUrl} uploadLabel="Subir soporte" />
            </div>

            <Button
              className="w-full bg-rose-600 hover:bg-rose-700 text-white rounded-xl h-10 font-medium"
              onClick={handleRenew}
              disabled={submitting || !authCode || !issueDate}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : "Registrar Renovación"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO AGENDAR CITA CON AUTORIZACIÓN */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Agendar Cita con Especialista</DialogTitle>
            <DialogDescription>
              {activeAuth?.appointment ? "Actualiza la fecha oficial si la entidad reprogramó la cita." : "Asigna la fecha y hora oficial de tu cita médica autorizada."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <Label className="text-xs text-gray-400">Especialidad (De la Autorización)</Label>
              <div className="text-sm font-semibold capitalize bg-gray-50 dark:bg-gray-900 p-2.5 rounded-xl border border-gray-100 dark:border-gray-800">
                {activeAuth?.specialty}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sched-doctor" className="text-xs text-gray-500">Nombre del Doctor (Opcional)</Label>
              <Input
                id="sched-doctor"
                placeholder="Ej: Dr. Fernando Gómez"
                value={doctorName}
                onChange={(e) => setDoctorName(e.target.value)}
                className="rounded-xl h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sched-date" className="text-xs text-gray-500">Fecha y Hora</Label>
              <Input
                id="sched-date"
                type="datetime-local"
                value={aptDate}
                onChange={(e) => setAptDate(e.target.value)}
                className="rounded-xl h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sched-location" className="text-xs text-gray-500">Consultorio / Ubicación (Opcional)</Label>
              <Input
                id="sched-location"
                placeholder="Ej: Centro de Especialistas, Consultorio 504"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="rounded-xl h-10 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sched-notes" className="text-xs text-gray-500">Notas de Preparación (Opcional)</Label>
              <Textarea
                id="sched-notes"
                placeholder="Ej: Ir en ayunas de 8 horas..."
                value={aptNotes}
                onChange={(e) => setAptNotes(e.target.value)}
                className="rounded-xl min-h-[70px] resize-none text-sm"
              />
            </div>

            {scheduleWarning && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/20 dark:text-red-300">
                {scheduleWarning}
              </div>
            )}

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl h-10 font-medium"
              onClick={handleSchedule}
              disabled={submitting || !aptDate}
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : activeAuth?.appointment ? "Guardar reprogramación" : "Confirmar agendamiento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* DIÁLOGO HISTORIAL DE RENOVACIONES */}
      <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
        <DialogContent className="w-[95vw] sm:w-full sm:max-w-md rounded-2xl p-5 max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Historial de Renovaciones</DialogTitle>
            <DialogDescription>
              Auditoría de códigos y fechas previas de esta autorización de la EPS.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {activeAuth?.renewals &&
              (activeAuth.renewals as any[]).map((ren: any, index: number) => (
                <div
                  key={index}
                  className="p-3 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 space-y-1 text-xs"
                >
                  <div className="flex justify-between">
                    <span className="text-gray-400">Código anterior:</span>
                    <span className="font-mono font-bold text-gray-850 dark:text-gray-200">
                      {ren.authorizationCode}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Expedido el:</span>
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {new Date(ren.issueDate).toLocaleDateString("es-CO")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Vencimiento:</span>
                    <span className="font-medium text-gray-750 dark:text-gray-300">
                      {new Date(ren.expirationDate).toLocaleDateString("es-CO")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Vigencia:</span>
                    <span className="text-gray-650 dark:text-gray-400">
                      {ren.daysOfValidity} días
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
