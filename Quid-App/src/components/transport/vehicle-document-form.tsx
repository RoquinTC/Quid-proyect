"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, getColombiaTodayString } from "@/lib/api";
import type {
  Vehicle,
  VehicleDocument,
  PaymentMethodType,
} from "@/lib/types/transport";
import { DOCUMENT_TYPES } from "@/lib/types/transport";
import { PaymentMethodSelector } from "@/components/transport/payment-method-selector";
import {
  Loader2,
  Shield,
  FileText,
  Car,
  Receipt,
  FileCheck,
  Bell,
  CalendarClock,
} from "lucide-react";
import { toast } from "sonner";

// ─── Icon mapping per document type ───
const DOCUMENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  soat: <Shield className="size-4 text-emerald-500" />,
  tecnomecanica: <FileCheck className="size-4 text-amber-500" />,
  seguro: <Car className="size-4 text-blue-500" />,
  impuesto: <Receipt className="size-4 text-rose-500" />,
  otro: <FileText className="size-4 text-gray-500" />,
};

const DOCUMENT_TYPE_COLORS: Record<string, string> = {
  soat: "from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-900/10 border-emerald-200 dark:border-emerald-800/30",
  tecnomecanica: "from-amber-50 to-amber-100 dark:from-amber-900/20 dark:to-amber-900/10 border-amber-200 dark:border-amber-800/30",
  seguro: "from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/10 border-blue-200 dark:border-blue-800/30",
  impuesto: "from-rose-50 to-rose-100 dark:from-rose-900/20 dark:to-rose-900/10 border-rose-200 dark:border-rose-800/30",
  otro: "from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-900/10 border-gray-200 dark:border-gray-800/30",
};

// ─── Expiry date auto-calculation ───
function calculateExpiryDate(issueDate: string, docType: string): string {
  if (!issueDate) return "";
  const [y, m, d] = issueDate.split("-").map(Number);
  if (!y || !m || !d) return "";

  const date = new Date(y, m - 1, d);

  switch (docType) {
    case "soat":
    case "tecnomecanica":
    case "seguro":
      // +1 year
      date.setFullYear(date.getFullYear() + 1);
      break;
    case "impuesto":
      // +1 year (annual tax)
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      // "otro" — no auto-calculation
      return "";
  }

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ─── Days until a date ───
function daysUntilDate(dateStr: string): number {
  if (!dateStr) return 0;
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

interface VehicleDocumentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedVehicleId?: string | null;
  document?: VehicleDocument | null;
  onSuccess?: () => void;
}

export function VehicleDocumentForm({
  open,
  onOpenChange,
  preselectedVehicleId,
  document: existingDocument,
  onSuccess,
}: VehicleDocumentFormProps) {
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId || "");
  const [docType, setDocType] = useState("soat");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issueDate, setIssueDate] = useState(getColombiaTodayString());
  const [expiryDate, setExpiryDate] = useState("");
  const [cost, setCost] = useState("");
  const [reminderDays, setReminderDays] = useState("30");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [notes, setNotes] = useState("");

  // ── Finance integration state ──
  const [paymentData, setPaymentData] = useState<{
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

  const isEditing = !!existingDocument;

  // ── Fetch vehicles ──
  const fetchVehicles = useCallback(async () => {
    try {
      const data = await apiFetch<Vehicle[]>("/api/vehicles");
      setVehicles(data);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchVehicles();
    }
  }, [open, fetchVehicles]);

  // ── Pre-fill form when editing ──
  useEffect(() => {
    if (open && existingDocument) {
      setVehicleId(preselectedVehicleId || existingDocument.vehicleId || "");
      setDocType(existingDocument.type || "soat");
      setDocumentNumber(existingDocument.documentNumber || "");
      setIssueDate(
        existingDocument.issueDate
          ? existingDocument.issueDate.split("T")[0]
          : getColombiaTodayString()
      );
      setExpiryDate(
        existingDocument.expiryDate
          ? existingDocument.expiryDate.split("T")[0]
          : ""
      );
      setCost(existingDocument.cost?.toString() || "");
      setReminderDays(existingDocument.reminderDays?.toString() || "30");
      setReminderEnabled(existingDocument.reminderEnabled ?? true);
      setNotes(existingDocument.notes || "");
      // Pre-fill payment data from existing record
      setPaymentData({
        paymentType: existingDocument.debtId ? "credit_card" : "account",
        accountId: existingDocument.accountId || null,
        subAccountId: existingDocument.subAccountId || null,
        debtId: existingDocument.debtId || null,
        installmentCount: existingDocument.installmentCount || null,
      });
    }
  }, [open, existingDocument, preselectedVehicleId]);

  // ── Auto-select vehicle if only one exists and no preselection ──
  useEffect(() => {
    if (!preselectedVehicleId && !isEditing && vehicles.length === 1 && !vehicleId) {
      setVehicleId(vehicles[0].id);
    }
  }, [vehicles, preselectedVehicleId, vehicleId, isEditing]);

  // ── Sync preselected vehicle ──
  useEffect(() => {
    if (preselectedVehicleId && !isEditing) {
      setVehicleId(preselectedVehicleId);
    }
  }, [preselectedVehicleId, isEditing]);

  // ── Auto-calculate expiry date when issue date or type changes ──
  useEffect(() => {
    if (isEditing) return; // Don't override when editing
    if (!issueDate) return;

    const autoExpiry = calculateExpiryDate(issueDate, docType);
    if (autoExpiry) {
      setExpiryDate(autoExpiry);
    }
  }, [issueDate, docType, isEditing]);

  // ── Selected vehicle ──
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  // ── Days until expiry (for the visual badge) ──
  const daysLeft = daysUntilDate(expiryDate);
  const expiryBadgeColor = (() => {
    if (!expiryDate || daysLeft <= 0) return "text-red-500";
    if (daysLeft <= 30) return "text-amber-500";
    return "text-emerald-500";
  })();

  // ── Submit handler ──
  const handleSubmit = async () => {
    if (!vehicleId || !issueDate || !expiryDate) return;
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        type: docType,
        documentNumber: documentNumber || null,
        issueDate,
        expiryDate,
        cost: cost ? parseFloat(cost) : 0,
        reminderDays: reminderEnabled ? parseInt(reminderDays) || 30 : null,
        reminderEnabled,
        notes: notes || undefined,
        // ── Finance integration ──
        paymentType: paymentData.paymentType,
        accountId: paymentData.accountId,
        subAccountId: paymentData.subAccountId,
        debtId: paymentData.debtId,
        installmentCount: paymentData.installmentCount,
      };

      if (isEditing && existingDocument) {
        await apiFetch(
          `/api/vehicles/${vehicleId}/documents/${existingDocument.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );

        toast.success("Documento actualizado", {
          description: "Los cambios se guardaron correctamente",
        });
      } else {
        await apiFetch(`/api/vehicles/${vehicleId}/documents`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        toast.success("Documento registrado", {
          description: "El documento del vehículo se guardó correctamente",
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving vehicle document:", error);
      toast.error(isEditing ? "Error al actualizar" : "Error al registrar", {
        description:
          "No se pudo guardar el documento del vehículo. Intenta de nuevo.",
      });
    } finally {
      setLoading(false);
    }
  };

  // ── Reset form ──
  const resetForm = () => {
    if (!isEditing) {
      setVehicleId(preselectedVehicleId || "");
      setDocType("soat");
      setDocumentNumber("");
      setIssueDate(getColombiaTodayString());
      setExpiryDate("");
      setCost("");
      setReminderDays("30");
      setReminderEnabled(true);
      setNotes("");
      setPaymentData({
        paymentType: "account",
        accountId: null,
        subAccountId: null,
        debtId: null,
        installmentCount: null,
      });
    }
  };

  // ── Document type icon for the header ──
  const currentDocIcon = DOCUMENT_TYPE_ICONS[docType] || DOCUMENT_TYPE_ICONS.otro;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl max-h-[85vh] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {currentDocIcon}
            {isEditing ? "Editar Documento" : "Registrar Documento"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4 pb-6">
          {/* ─── Document Type Badge ─── */}
          {docType && (
            <div
              className={`rounded-xl bg-gradient-to-br border p-3 ${DOCUMENT_TYPE_COLORS[docType] || DOCUMENT_TYPE_COLORS.otro}`}
            >
              <div className="flex items-center gap-2">
                {DOCUMENT_TYPE_ICONS[docType] || DOCUMENT_TYPE_ICONS.otro}
                <span className="text-sm font-semibold">
                  {DOCUMENT_TYPES.find((t) => t.value === docType)?.label || "Documento"}
                </span>
                {expiryDate && !isEditing && (
                  <span className={`text-[10px] font-medium ml-auto ${expiryBadgeColor}`}>
                    {daysLeft > 0
                      ? `Vence en ${daysLeft} días`
                      : daysLeft === 0
                        ? "Vence hoy"
                        : "Vencido"}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ─── Vehicle ─── */}
          <div className="space-y-2">
            <Label>Vehículo</Label>
            {vehicles.length === 1 || isEditing ? (
              <div className="h-10 px-3 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
                <Car className="size-4 text-cyan-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {selectedVehicle?.name || vehicles[0]?.name || "Vehículo"}
                </span>
                {selectedVehicle?.plate && (
                  <span className="text-[10px] text-gray-400 ml-auto">
                    {selectedVehicle.plate}
                  </span>
                )}
              </div>
            ) : (
              <Select value={vehicleId} onValueChange={setVehicleId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Seleccionar vehículo" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex items-center gap-2">
                        <Car className="size-3.5 text-gray-400" />
                        <span>{v.name}</span>
                        {v.plate && (
                          <span className="text-[10px] text-gray-400">
                            {v.plate}
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* ─── Document Type ─── */}
          <div className="space-y-2">
            <Label>Tipo de documento</Label>
            <Select
              value={docType}
              onValueChange={(v) => {
                setDocType(v);
                // Re-trigger auto-expiry calculation
                if (!isEditing && issueDate) {
                  const autoExpiry = calculateExpiryDate(issueDate, v);
                  if (autoExpiry) {
                    setExpiryDate(autoExpiry);
                  }
                }
              }}
              disabled={isEditing}
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex items-center gap-2">
                      {DOCUMENT_TYPE_ICONS[t.value]}
                      <span>{t.label}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ─── Document Number ─── */}
          <div className="space-y-2">
            <Label htmlFor="doc-number" className="flex items-center gap-1.5">
              <FileText className="size-3.5 text-gray-400" />
              Número de documento
              <span className="text-[10px] text-gray-400 font-normal">
                (opcional)
              </span>
            </Label>
            <Input
              id="doc-number"
              type="text"
              placeholder="Ej: 2024-123456"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* ─── Issue & Expiry Dates ─── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="doc-issue-date">Fecha de emisión</Label>
              <Input
                id="doc-issue-date"
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="rounded-xl"
                required
              />
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="doc-expiry-date"
                className="flex items-center gap-1.5"
              >
                <CalendarClock className="size-3.5 text-gray-400" />
                Fecha de vencimiento
              </Label>
              <Input
                id="doc-expiry-date"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="rounded-xl"
                required
              />
            </div>
          </div>

          {/* ─── Expiry info banner ─── */}
          {expiryDate && issueDate && expiryDate <= issueDate && (
            <div className="flex items-center gap-1.5 p-2.5 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-100 dark:border-red-900/30">
              <CalendarClock className="size-3.5 text-red-500 flex-shrink-0" />
              <span className="text-[11px] text-red-600 dark:text-red-400">
                La fecha de vencimiento debe ser posterior a la fecha de emisión
              </span>
            </div>
          )}

          {/* ─── Cost ─── */}
          <div className="space-y-2">
            <Label htmlFor="doc-cost">Costo</Label>
            <CurrencyInput
              id="doc-cost"
              showPrefix
              placeholder="350000"
              value={cost}
              onChange={(v) => setCost(v)}
              className="rounded-xl"
            />
          </div>

          {/* ─── Reminder ─── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-amber-500" />
                <div>
                  <Label className="text-sm">Recordatorio</Label>
                  <p className="text-[10px] text-gray-400">
                    Recibir aviso antes del vencimiento
                  </p>
                </div>
              </div>
              <Switch
                checked={reminderEnabled}
                onCheckedChange={setReminderEnabled}
              />
            </div>
            {reminderEnabled && (
              <div className="space-y-1.5 pl-1">
                <Label
                  htmlFor="doc-reminder-days"
                  className="text-[10px] text-gray-500"
                >
                  Días de anticipación
                </Label>
                <Input
                  id="doc-reminder-days"
                  type="number"
                  min={1}
                  max={365}
                  placeholder="30"
                  value={reminderDays}
                  onChange={(e) => setReminderDays(e.target.value)}
                  className="rounded-xl h-9 text-sm"
                />
              </div>
            )}
          </div>

          {/* ─── Payment Method ─── */}
          <PaymentMethodSelector
            vehicleId={vehicleId}
            defaultPaymentType={
              existingDocument?.debtId ? "credit_card" : "account"
            }
            defaultAccountId={existingDocument?.accountId}
            defaultSubAccountId={existingDocument?.subAccountId}
            defaultDebtId={existingDocument?.debtId}
            defaultInstallmentCount={existingDocument?.installmentCount}
            onChange={setPaymentData}
          />

          {/* ─── Notes ─── */}
          <div className="space-y-2">
            <Label htmlFor="doc-notes">
              Notas{" "}
              <span className="text-[10px] text-gray-400 font-normal">
                (opcional)
              </span>
            </Label>
            <Textarea
              id="doc-notes"
              placeholder="Notas opcionales sobre el documento..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl min-h-[60px]"
            />
          </div>

          {/* ─── Submit ─── */}
          <Button
            onClick={handleSubmit}
            disabled={
              loading ||
              !vehicleId ||
              !issueDate ||
              !expiryDate ||
              (expiryDate && issueDate && expiryDate <= issueDate) ||
              false
            }
            className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Guardar Cambios" : "Registrar Documento"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
