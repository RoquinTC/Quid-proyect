"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAppStore, type TransportSubView, type SidebarAction } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import {
  Car, Fuel, Wrench, Plus, HelpCircle,
  Droplets, CircleDot, ShieldAlert, Settings, Package,
  FileText, Shield, FileCheck,
  ChevronDown, Gauge, MapPin, AlertTriangle, Bell, Clock,
  Trash2, Pencil, MoreVertical, ArrowLeft, MoreHorizontal,
  Activity, RefreshCw, ChevronRight, RotateCcw,
} from "lucide-react";
import { VehicleForm } from "./vehicle-form";
import { FuelLogForm } from "./fuel-log-form";
import { MaintenanceForm } from "./maintenance-form";
import { VehicleDocumentForm } from "./vehicle-document-form";
import { FuelPriceWidget } from "./fuel-price-widget";
import { QuickKmUpdate } from "./quick-km-update";
import { VehicleIcon } from "./vehicle-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiFetch, formatCurrency, formatShortDate } from "@/lib/api";
import { useLocalQuery } from "@/lib/local/hooks/queries";
import { useDataEvent } from "@/hooks/use-data-event";
import type { Vehicle, FuelLog, MaintenanceRecord, VehicleDocument } from "@/lib/types";
import { MAINTENANCE_TYPES } from "@/lib/types/transport";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────
const vehicleTypeLabels: Record<string, string> = {
  motorcycle: "Moto", car: "Carro", truck: "Camión", other: "Otro",
};
const vehicleGradients: Record<string, string> = {
  motorcycle: "from-cyan-500 to-blue-600",
  car: "from-blue-500 to-indigo-600",
  truck: "from-indigo-500 to-purple-600",
  other: "from-slate-500 to-gray-600",
};
const fuelTypeLabels: Record<string, string> = {
  gasoline: "Gasolina", diesel: "Diésel", electric: "Eléctrico",
};
const maintTypeIcons: Record<string, typeof Wrench> = {
  oil_change: Droplets, tire_change: CircleDot, brake_service: ShieldAlert,
  general: Settings, parts_replacement: Package,
  alignment: Settings, suspension: Package, transmission: Settings,
  electrical: ShieldAlert, cooling: Droplets, ac: Settings,
  battery: ShieldAlert, inspection: Settings, wash: Droplets,
  aesthetics: HelpCircle, other: HelpCircle,
};
const maintTypeLabels: Record<string, string> = {
  oil_change: "Cambio de aceite", tire_change: "Cambio de llantas",
  brake_service: "Servicio de frenos", general: "Revisión general",
  parts_replacement: "Cambio de repuestos",
  alignment: "Alineación/Balanceo", suspension: "Suspensión",
  transmission: "Transmisión", electrical: "Sistema eléctrico",
  cooling: "Sistema de enfriamiento", ac: "Aire acondicionado",
  battery: "Batería", inspection: "Inspección/Revisión",
  wash: "Lavado", aesthetics: "Estética", other: "Otro",
};
const maintTypeColors: Record<string, string> = {
  oil_change: "text-amber-600 bg-amber-100 dark:bg-amber-900/30",
  tire_change: "text-gray-600 bg-gray-100 dark:bg-gray-700",
  brake_service: "text-red-600 bg-red-100 dark:bg-red-900/30",
  general: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
  parts_replacement: "text-purple-600 bg-purple-100 dark:bg-purple-900/30",
  alignment: "text-teal-600 bg-teal-100 dark:bg-teal-900/30",
  suspension: "text-orange-600 bg-orange-100 dark:bg-orange-900/30",
  transmission: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30",
  electrical: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30",
  cooling: "text-sky-600 bg-sky-100 dark:bg-sky-900/30",
  ac: "text-cyan-600 bg-cyan-100 dark:bg-cyan-900/30",
  battery: "text-lime-600 bg-lime-100 dark:bg-lime-900/30",
  inspection: "text-violet-600 bg-violet-100 dark:bg-violet-900/30",
  wash: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
  aesthetics: "text-pink-600 bg-pink-100 dark:bg-pink-900/30",
  other: "text-gray-600 bg-gray-100 dark:bg-gray-700",
};

// ─── Document type constants ──────────────────────────────────────
const docTypeLabels: Record<string, string> = {
  soat: "SOAT", tecnomecanica: "Tecnomecánica", seguro: "Seguro",
  impuesto: "Impuesto", otro: "Otro",
};
const docTypeColors: Record<string, string> = {
  soat: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30",
  tecnomecanica: "text-amber-600 bg-amber-100 dark:bg-amber-900/30",
  seguro: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
  impuesto: "text-rose-600 bg-rose-100 dark:bg-rose-900/30",
  otro: "text-gray-600 bg-gray-100 dark:bg-gray-700",
};
const docTypeIcons: Record<string, typeof Shield> = {
  soat: Shield, tecnomecanica: FileCheck, seguro: Shield,
  impuesto: FileText, otro: FileText,
};

type VehicleWithDetails = Vehicle & {
  fuelLogs: Array<{ id: string; date: string; km: number; amount: number; pricePerGallon: number; gallons: number; isFullTank?: boolean; notes?: string | null }>;
  maintenanceRecords: Array<{ id: string; type: string; description: string; km: number; cost: number; date: string; nextDueKm?: number | null; nextDueDate?: string | null; reminderEnabled?: boolean; items?: Array<{ id: string; name: string; quantity: number; unitPrice: number; totalPrice: number }> }>;
  documents?: Array<{ id: string; vehicleId: string; type: string; documentNumber?: string | null; issueDate: string; expiryDate: string; cost: number; reminderDays: number; reminderEnabled: boolean; notes?: string | null }>;
  fuelLevel?: number;
  currentFuel?: number;
  estimatedRange?: number;
  avgKmPerGallon?: number;
  anomalyDetected?: boolean;
  // Smart refuel prediction fields
  avgKmPerDay?: number;
  daysUntilRefuel?: number | null;
  refuelByDate?: string | null;
  gallonsToRefuel?: number;
  isLowFuel?: boolean;
  isLearning?: boolean;
};

type TimelineEntry = {
  id: string;
  type: "fuel" | "maintenance" | "document";
  date: string;
  km: number;
  cost: number;
  vehicleId: string;
  vehicleName: string;
  // Fuel-specific
  gallons?: number;
  isFullTank?: boolean;
  pricePerGallon?: number;
  notes?: string | null;
  // Maintenance-specific
  maintType?: string;
  maintDescription?: string;
  nextDueKm?: number | null;
  nextDueDate?: string | null;
  reminderEnabled?: boolean;
  items?: Array<{ id: string; name: string; quantity: number; unitPrice: number; totalPrice: number }>;
  // Document-specific
  docType?: string;
  documentNumber?: string | null;
  expiryDate?: string;
  reminderDays?: number;
};

// ─── Component ────────────────────────────────────────────────────
export function TransportPage() {
  const { sidebarAction, setSidebarAction } = useAppStore();

  // Data
  const { data: vehiclesData, refetch: refetchVehicles, loading: vehiclesLoading } = useLocalQuery<VehicleWithDetails>("/api/vehicles");
  const vehicles = (vehiclesData || []) as VehicleWithDetails[];

  // ─── Reactive data event subscriptions ────────────────────────────
  // When mutations happen to sub-resources (maintenance, fuel-logs, documents),
  // the liveQuery on the `vehicles` table won't fire because only the sub-resource
  // table was modified. We use the data event bus to force a refetch.
  const refetchRef = useRef(refetchVehicles);
  refetchRef.current = refetchVehicles;
  const handleDataRefresh = useCallback(() => { refetchRef.current(); }, []);
  useDataEvent("maintenanceRecords", handleDataRefresh);
  useDataEvent("fuelLogs", handleDataRefresh);
  useDataEvent("vehicles", handleDataRefresh);

  // Selection
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const selectedVehicle = vehicles.find((v) => v.id === selectedVehicleId) || null;

  // Detail view for a single vehicle
  const [detailVehicleId, setDetailVehicleId] = useState<string | null>(null);
  const detailVehicle = vehicles.find((v) => v.id === detailVehicleId) || null;

  // Forms
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editVehicle, setEditVehicle] = useState<VehicleWithDetails | null>(null);
  const [showFuelLogForm, setShowFuelLogForm] = useState(false);
  const [editFuelLog, setEditFuelLog] = useState<FuelLog | null>(null);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [editMaintenance, setEditMaintenance] = useState<MaintenanceRecord | null>(null);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [editDocument, setEditDocument] = useState<VehicleDocument | null>(null);
  const [showFuelPriceDialog, setShowFuelPriceDialog] = useState(false);
  const [showKmUpdate, setShowKmUpdate] = useState(false);

  // Fuel status card expanded state
  const [showFuelDetails, setShowFuelDetails] = useState(false);

  // Reminders expanded state
  const [showReminderDetails, setShowReminderDetails] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ type: "fuel" | "maintenance" | "vehicle" | "document"; id: string; vehicleId?: string } | null>(null);

  // Reverse
  const [reverseTarget, setReverseTarget] = useState<{ type: "fuel" | "maintenance" | "document"; id: string; vehicleId: string; cost: number; description: string } | null>(null);

  // Auto-select first vehicle
  useEffect(() => {
    if (vehicles.length > 0 && !selectedVehicleId) {
      setSelectedVehicleId(vehicles[0].id);
    }
  }, [vehicles, selectedVehicleId]);

  // ─── Build unified timeline ─────────────────────────────────────
  const buildTimeline = useCallback((): TimelineEntry[] => {
    const entries: TimelineEntry[] = [];
    const targetVehicles = selectedVehicleId
      ? vehicles.filter((v) => v.id === selectedVehicleId)
      : vehicles;

    for (const v of targetVehicles) {
      if (v.fuelLogs) {
        for (const log of v.fuelLogs) {
          entries.push({
            id: log.id,
            type: "fuel",
            date: log.date,
            km: log.km,
            cost: log.amount,
            vehicleId: v.id,
            vehicleName: v.name,
            gallons: log.gallons,
            isFullTank: log.isFullTank,
            pricePerGallon: log.pricePerGallon,
            notes: log.notes,
          });
        }
      }
      if (v.maintenanceRecords) {
        for (const rec of v.maintenanceRecords) {
          entries.push({
            id: rec.id,
            type: "maintenance",
            date: String(rec.date),
            km: rec.km,
            cost: rec.cost,
            vehicleId: v.id,
            vehicleName: v.name,
            maintType: rec.type,
            maintDescription: rec.description,
            nextDueKm: rec.nextDueKm,
            nextDueDate: rec.nextDueDate,
            reminderEnabled: rec.reminderEnabled,
            items: rec.items,
          });
        }
      }
      if (v.documents) {
        for (const doc of v.documents) {
          entries.push({
            id: doc.id,
            type: "document",
            date: doc.issueDate,
            km: 0,
            cost: doc.cost,
            vehicleId: v.id,
            vehicleName: v.name,
            docType: doc.type,
            documentNumber: doc.documentNumber,
            expiryDate: doc.expiryDate,
            reminderDays: doc.reminderDays,
            reminderEnabled: doc.reminderEnabled,
          });
        }
      }
    }

    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return entries;
  }, [vehicles, selectedVehicleId]);

  const timeline = buildTimeline();

  // ─── Group timeline by month ────────────────────────────────────
  const groupedTimeline = useCallback(() => {
    const groups: { month: string; entries: TimelineEntry[] }[] = [];
    let currentMonth = "";
    for (const entry of timeline) {
      const d = new Date(entry.date);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      const monthLabel = d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
      if (monthKey !== currentMonth) {
        groups.push({ month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1), entries: [] });
        currentMonth = monthKey;
      }
      groups[groups.length - 1].entries.push(entry);
    }
    return groups;
  }, [timeline]);

  // ─── Sidebar quick-action listener ──────────────────────────────
  useEffect(() => {
    if (!sidebarAction) return;
    const actionMap: Partial<Record<SidebarAction, () => void>> = {
      "create-vehicle": () => { setEditVehicle(null); setShowVehicleForm(true); },
      "log-fuel": () => { setEditFuelLog(null); setShowFuelLogForm(true); },
      "log-maintenance": () => { setEditMaintenance(null); setShowMaintenanceForm(true); },
      "register-document": () => { setEditDocument(null); setShowDocumentForm(true); },
      "update-fuel-price": () => setShowFuelPriceDialog(true),
    };
    const handler = actionMap[sidebarAction];
    if (handler) handler();
    setSidebarAction(null);
  }, [sidebarAction, setSidebarAction]);

  // ─── Stats ──────────────────────────────────────────────────────
  const fuelLevel = selectedVehicle?.fuelLevel ?? 0;
  const currentFuel = selectedVehicle?.currentFuel ?? 0;
  const estimatedRange = selectedVehicle?.estimatedRange ?? 0;
  const avgKmPerGallon = selectedVehicle?.avgKmPerGallon ?? 0;
  const tankCapacity = selectedVehicle?.tankCapacity ?? 0;
  // Smart refuel prediction
  const daysUntilRefuel = selectedVehicle?.daysUntilRefuel ?? null;
  const refuelByDate = selectedVehicle?.refuelByDate ?? null;
  const gallonsToRefuel = selectedVehicle?.gallonsToRefuel ?? 0;
  const isLowFuel = selectedVehicle?.isLowFuel ?? false;
  const avgKmPerDay = selectedVehicle?.avgKmPerDay ?? 0;
  const isLearning = selectedVehicle?.isLearning ?? true;

  // Format the refuel date nicely
  const formatRefuelDate = (isoDate: string | null) => {
    if (!isoDate) return null;
    try {
      const date = new Date(isoDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const refuel = new Date(date);
      refuel.setHours(0, 0, 0, 0);
      const diffDays = Math.round((refuel.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return "Hoy";
      if (diffDays === 1) return "Mañana";
      if (diffDays <= 7) return `En ${diffDays} días`;
      return date.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
    } catch {
      return null;
    }
  };
  const refuelDateText = formatRefuelDate(refuelByDate);

  const getFuelColor = (level: number) => {
    if (level > 50) return "bg-emerald-500";
    if (level > 25) return "bg-amber-500";
    return "bg-red-500";
  };
  const getFuelTextColor = (level: number) => {
    if (level > 50) return "text-emerald-500";
    if (level > 25) return "text-amber-500";
    return "text-red-500";
  };
  const getFuelGradientBg = (level: number) => {
    if (level > 50) return "from-emerald-500/10 to-emerald-500/5";
    if (level > 25) return "from-amber-500/10 to-amber-500/5";
    return "from-red-500/10 to-red-500/5";
  };

  // ─── KM Outdated Detection ──────────────────────────────────────
  const isKmOutdated = useMemo(() => {
    if (!selectedVehicle) return false;
    const lastLog = selectedVehicle.fuelLogs?.[0]; // already sorted desc by API
    if (!lastLog) return false;

    // If latest fuel log km is significantly different from currentKm (>500km gap)
    const kmDiff = Math.abs(selectedVehicle.currentKm - lastLog.km);
    if (kmDiff > 500) return true;

    // If no fuel log in the last 7 days and vehicle has been used
    const lastLogDate = new Date(lastLog.date);
    const daysSinceLastLog = (Date.now() - lastLogDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceLastLog > 7 && selectedVehicle.currentKm > 0) return true;

    return false;
  }, [selectedVehicle]);

  // ─── Last KM update info ────────────────────────────────────────
  const lastKmUpdateLabel = useMemo(() => {
    if (!selectedVehicle) return null;
    const lastLog = selectedVehicle.fuelLogs?.[0];
    if (lastLog) {
      const d = new Date(lastLog.date);
      const daysAgo = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo === 0) return "Actualizado hoy";
      if (daysAgo === 1) return "Actualizado ayer";
      return `Hace ${daysAgo} días`;
    }
    // Fallback to vehicle updatedAt
    if (selectedVehicle.updatedAt) {
      const d = new Date(selectedVehicle.updatedAt);
      const daysAgo = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (daysAgo === 0) return "Actualizado hoy";
      if (daysAgo === 1) return "Actualizado ayer";
      return `Hace ${daysAgo} días`;
    }
    return null;
  }, [selectedVehicle]);

  // ─── Has fuel logs ──────────────────────────────────────────────
  const hasFuelLogs = useMemo(() => {
    return (selectedVehicle?.fuelLogs?.length ?? 0) > 0;
  }, [selectedVehicle]);

  // ─── Delete handler ────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "vehicle") {
        await apiFetch(`/api/vehicles/${deleteTarget.id}`, { method: "DELETE" });
        toast.success("Vehículo eliminado");
        if (selectedVehicleId === deleteTarget.id) {
          setSelectedVehicleId(vehicles.find(v => v.id !== deleteTarget.id)?.id || null);
        }
      } else if (deleteTarget.type === "fuel" && deleteTarget.vehicleId) {
        await apiFetch(`/api/vehicles/${deleteTarget.vehicleId}/fuel-logs/${deleteTarget.id}`, { method: "DELETE" });
        toast.success("Registro de combustible eliminado");
      } else if (deleteTarget.type === "maintenance" && deleteTarget.vehicleId) {
        await apiFetch(`/api/vehicles/${deleteTarget.vehicleId}/maintenance/${deleteTarget.id}`, { method: "DELETE" });
        toast.success("Registro de mantenimiento eliminado");
      } else if (deleteTarget.type === "document" && deleteTarget.vehicleId) {
        await apiFetch(`/api/vehicles/${deleteTarget.vehicleId}/documents/${deleteTarget.id}`, { method: "DELETE" });
        toast.success("Documento eliminado");
      }
      refetchVehicles();
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Error al eliminar");
    } finally {
      setDeleteTarget(null);
    }
  };

  // ─── Reverse handler (creates a reversing entry, keeps original) ───
  const handleReverse = async () => {
    if (!reverseTarget) return;
    try {
      // Delete the record which also reverses the finance entry
      // but inform the user this reverses the financial impact
      if (reverseTarget.type === "fuel") {
        await apiFetch(`/api/vehicles/${reverseTarget.vehicleId}/fuel-logs/${reverseTarget.id}`, { method: "DELETE" });
        toast.success("Recarga reversada", { description: "Se revirtió la transacción financiera asociada" });
      } else if (reverseTarget.type === "maintenance") {
        await apiFetch(`/api/vehicles/${reverseTarget.vehicleId}/maintenance/${reverseTarget.id}`, { method: "DELETE" });
        toast.success("Mantenimiento reversado", { description: "Se revirtió la transacción financiera asociada" });
      } else if (reverseTarget.type === "document") {
        await apiFetch(`/api/vehicles/${reverseTarget.vehicleId}/documents/${reverseTarget.id}`, { method: "DELETE" });
        toast.success("Documento reversado", { description: "Se revirtió la transacción financiera asociada" });
      }
      refetchVehicles();
    } catch (error) {
      console.error("Error reversing:", error);
      toast.error("Error al reversar");
    } finally {
      setReverseTarget(null);
    }
  };

  // ─── Loading state ────────────────────────────────────────────
  if (vehiclesLoading && vehicles.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full">
        <div className="size-10 rounded-full border-3 border-cyan-200 border-t-cyan-600 animate-spin mb-4" />
        <p className="text-sm text-gray-400">Cargando vehículos...</p>

        <VehicleForm
          open={showVehicleForm}
          onOpenChange={setShowVehicleForm}
          vehicle={editVehicle}
          onSuccess={refetchVehicles}
        />
      </div>
    );
  }

  // ─── If viewing detail ──────────────────────────────────────────
  if (detailVehicleId && detailVehicle) {
    return (
      <VehicleDetailView
        vehicle={detailVehicle}
        onBack={() => setDetailVehicleId(null)}
        onRefresh={refetchVehicles}
        onEditVehicle={(v) => { setEditVehicle(v); setShowVehicleForm(true); }}
        onEditFuelLog={(log) => { setEditFuelLog(log); setShowFuelLogForm(true); }}
        onEditMaintenance={(rec) => { setEditMaintenance(rec); setShowMaintenanceForm(true); }}
        onDelete={(target) => setDeleteTarget(target)}
      />
    );
  }

  // ─── Empty state ────────────────────────────────────────────────
  if (vehicles.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center h-full">
        <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/30 mb-4">
          <VehicleIcon type="motorcycle" className="size-8 text-white" />
        </div>
        <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-1">
          Sin vehículos aún
        </h3>
        <p className="text-sm text-gray-500 text-center mb-4 max-w-xs">
          Agrega tu primer vehículo para empezar a controlar combustible y mantenimiento
        </p>
        <Button
          onClick={() => { setEditVehicle(null); setShowVehicleForm(true); }}
          className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600"
        >
          <Plus className="size-4 mr-1" />
          Agregar Vehículo
        </Button>

        <VehicleForm
          open={showVehicleForm}
          onOpenChange={setShowVehicleForm}
          vehicle={editVehicle}
          onSuccess={refetchVehicles}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ─── Header: Vehicle Selector ──────────────────────────── */}
      <div className="px-4 pt-3 pb-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-2">
          <Select
            value={selectedVehicleId || ""}
            onValueChange={setSelectedVehicleId}
          >
            <SelectTrigger className="rounded-xl border-0 bg-gray-100 dark:bg-gray-800 h-10 font-semibold text-sm flex-1">
              <div className="flex items-center gap-2">
                {selectedVehicle && (
                  <VehicleIcon icon={selectedVehicle.icon} type={selectedVehicle.type} className="size-4 text-cyan-500" />
                )}
                <SelectValue placeholder="Seleccionar vehículo" />
              </div>
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    <div className="flex items-center gap-2">
                      <VehicleIcon icon={v.icon} type={v.type} className="size-3.5 text-cyan-500" />
                      <span>{v.name}</span>
                      <span className="text-xs text-gray-400">
                        {vehicleTypeLabels[v.type] || v.type}
                      </span>
                    </div>
                  </SelectItem>
                ))
              }
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-10 rounded-xl">
                <MoreVertical className="size-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDetailVehicleId(selectedVehicleId)}>
                <Car className="size-4 mr-2 text-cyan-500" />
                Ver detalle
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setEditVehicle(selectedVehicle); setShowVehicleForm(true); }}>
                <Pencil className="size-4 mr-2 text-blue-500" />
                Editar vehículo
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDeleteTarget({ type: "vehicle", id: selectedVehicleId || "" })}
                className="text-red-600"
              >
                <Trash2 className="size-4 mr-2" />
                Eliminar vehículo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ─── Compact Indicators Row ─────────────────────────── */}
        {selectedVehicle && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {/* Fuel bar + level + range — clickable to show fuel details */}
            {tankCapacity > 0 && (
              <button
                className="flex items-center gap-1.5 flex-1 min-w-0 group"
                onClick={() => setShowFuelDetails(!showFuelDetails)}
              >
                <Fuel className={`size-3.5 flex-shrink-0 ${getFuelTextColor(fuelLevel)}`} />
                <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden min-w-[40px]">
                  <motion.div
                    className={`h-full rounded-full ${getFuelColor(fuelLevel)}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(fuelLevel, 100)}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
                <span className={`text-[11px] font-bold flex-shrink-0 ${getFuelTextColor(fuelLevel)}`}>
                  {Math.round(fuelLevel)}%
                  {estimatedRange > 0 && (
                    <span className="text-gray-400 font-normal"> · ~{estimatedRange} km</span>
                  )}
                </span>
              </button>
            )}

            {/* KM */}
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors relative"
              onClick={() => setShowKmUpdate(true)}
            >
              <Gauge className="size-3 text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                {(selectedVehicle.currentKm ?? 0).toLocaleString("es-CO")} km
              </span>
              <Pencil className="size-2.5 text-gray-300" />
              {/* KM Outdated Warning pill */}
              {isKmOutdated && (
                <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-bold animate-pulse">
                  <AlertTriangle className="size-2" />
                  Actualizar
                </span>
              )}
            </button>

            {/* Avg km/gal */}
            {avgKmPerGallon > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800">
                <MapPin className="size-3 text-cyan-500" />
                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                  {avgKmPerGallon} km/g
                </span>
              </div>
            )}

            {/* Anomaly */}
            {selectedVehicle.anomalyDetected && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20">
                <AlertTriangle className="size-3 text-red-500" />
                <span className="text-xs font-semibold text-red-500">Alerta</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Timeline Content ──────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {/* ─── Fuel Status Card ─────────────────────────────────── */}
        {selectedVehicle && tankCapacity > 0 && (
          <AnimatePresence>
            {showFuelDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="px-4 pt-3 pb-2">
                  <div className={`rounded-2xl bg-gradient-to-br ${getFuelGradientBg(fuelLevel)} border border-gray-100 dark:border-gray-700 p-4`}>
                    {/* Header row */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`size-8 rounded-xl flex items-center justify-center ${getFuelColor(fuelLevel)}`}>
                          <Fuel className="size-4 text-white" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Estado del Combustible</h3>
                          {lastKmUpdateLabel && (
                            <p className="text-xs text-gray-400">{lastKmUpdateLabel}</p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => setShowFuelDetails(false)}
                        className="size-6 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <ChevronDown className="size-4" />
                      </button>
                    </div>

                    {hasFuelLogs ? (
                      <>
                        {/* Big percentage + gauge */}
                        <div className="flex items-center gap-4 mb-3">
                          <div className="text-center min-w-[72px]">
                            <span className={`text-3xl font-black ${getFuelTextColor(fuelLevel)}`}>
                              {Math.round(fuelLevel)}%
                            </span>
                          </div>
                          <div className="flex-1">
                            {/* Fuel bar large */}
                            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1.5">
                              <motion.div
                                className={`h-full rounded-full ${getFuelColor(fuelLevel)}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.min(fuelLevel, 100)}%` }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                              />
                            </div>
                            <div className="flex justify-between text-[11px] text-gray-400">
                              <span>0 gal</span>
                              <span>{tankCapacity} gal</span>
                            </div>
                          </div>
                        </div>

                        {/* Stats grid */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-white dark:bg-gray-800 rounded-xl p-2 text-center">
                            <Fuel className="size-3 text-cyan-500 mx-auto mb-0.5" />
                            <p className="text-xs font-bold text-gray-900 dark:text-white">
                              {currentFuel.toFixed(1)} gal
                            </p>
                            <p className="text-[11px] text-gray-400">En tanque</p>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded-xl p-2 text-center">
                            <MapPin className="size-3 text-cyan-500 mx-auto mb-0.5" />
                            <p className="text-xs font-bold text-gray-900 dark:text-white">
                              ~{estimatedRange} km
                            </p>
                            <p className="text-[11px] text-gray-400">Autonomía</p>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded-xl p-2 text-center">
                            <Activity className="size-3 text-cyan-500 mx-auto mb-0.5" />
                            <p className="text-xs font-bold text-gray-900 dark:text-white">
                              {avgKmPerGallon} km/g
                            </p>
                            <p className="text-[11px] text-gray-400">Promedio</p>
                          </div>
                        </div>

                        {/* Smart Refuel Prediction */}
                        {(daysUntilRefuel != null || gallonsToRefuel > 0) && (
                          <motion.div
                            initial={{ opacity: 0, y: -5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`p-3 rounded-xl border mb-3 ${
                              isLowFuel
                                ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                                : "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800"
                            }`}
                          >
                            {/* Gallons to refuel */}
                            {gallonsToRefuel > 0 && (
                              <div className="flex items-center gap-2 mb-1.5">
                                <Droplets className={`size-3.5 flex-shrink-0 ${isLowFuel ? "text-red-500" : "text-cyan-600 dark:text-cyan-400"}`} />
                                <span className={`text-[11px] font-semibold ${isLowFuel ? "text-red-700 dark:text-red-300" : "text-cyan-700 dark:text-cyan-300"}`}>
                                  {gallonsToRefuel.toFixed(1)} gal para llenar
                                </span>
                              </div>
                            )}
                            {/* Days until refuel */}
                            {daysUntilRefuel != null && refuelDateText && (
                              <div className={`flex items-center gap-2 ${gallonsToRefuel > 0 ? "pt-1.5 border-t" : ""} ${
                                isLowFuel ? "border-red-200 dark:border-red-800" : "border-cyan-200 dark:border-cyan-800"
                              }`}>
                                <Clock className={`size-3.5 flex-shrink-0 ${isLowFuel ? "text-red-500" : "text-cyan-600 dark:text-cyan-400"}`} />
                                <span className={`text-[11px] font-semibold ${isLowFuel ? "text-red-700 dark:text-red-300" : "text-cyan-700 dark:text-cyan-300"}`}>
                                  {daysUntilRefuel <= 0 ? "¡Tanquea hoy!" : daysUntilRefuel === 1 ? "¡Tanquea mañana!" : `Tanquea en ~${daysUntilRefuel} días`}
                                </span>
                                <span className={`text-[11px] ${isLowFuel ? "text-red-500 dark:text-red-400" : "text-cyan-500 dark:text-cyan-400"}`}>
                                  {refuelDateText}
                                </span>
                                {avgKmPerDay > 0 && (
                                  <span className={`text-[11px] ml-auto ${isLowFuel ? "text-red-400" : "text-cyan-400"}`}>
                                    ~{avgKmPerDay.toFixed(0)} km/día
                                  </span>
                                )}
                              </div>
                            )}
                            {isLearning && (
                              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                                Rendimiento estimado — se ajustará con más registros
                              </p>
                            )}
                          </motion.div>
                        )}

                        {/* Quick Update KM button if outdated */}
                        {isKmOutdated && (
                          <button
                            onClick={() => setShowKmUpdate(true)}
                            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                          >
                            <Gauge className="size-3.5 text-amber-600" />
                            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                              Actualizar KM para estimación precisa
                            </span>
                            <ArrowLeft className="size-3 text-amber-500 rotate-180" />
                          </button>
                        )}
                      </>
                    ) : (
                      /* No fuel logs yet */
                      <div className="text-center py-3">
                        <div className="inline-flex items-center justify-center size-10 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 mb-2">
                          <Fuel className="size-5 text-cyan-400" />
                        </div>
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Sin registros de combustible
                        </p>
                        <p className="text-xs text-gray-400 max-w-[220px] mx-auto mb-2">
                          Registra una recarga con &quot;Tanque lleno&quot; para empezar a rastrear el nivel de combustible estimado
                        </p>
                        <Button
                          size="sm"
                          className="h-7 rounded-lg text-[11px] bg-gradient-to-r from-cyan-600 to-blue-600 px-3"
                          onClick={() => { setEditFuelLog(null); setShowFuelLogForm(true); }}
                        >
                          <Plus className="size-3 mr-0.5" />
                          Registrar Recarga
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {/* Show fuel status card collapsed hint when there's tank capacity and no timeline items */}
        {selectedVehicle && tankCapacity > 0 && !showFuelDetails && hasFuelLogs && (
          <div className="px-4 pt-2">
            <button
              onClick={() => setShowFuelDetails(true)}
              className={`w-full flex items-center gap-2 py-2 px-3 rounded-xl border transition-colors ${
                isLowFuel
                  ? "bg-gradient-to-r from-red-50 to-amber-50 dark:from-red-900/10 dark:to-amber-900/10 border-red-200 dark:border-red-900/30"
                  : "bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/10 dark:to-blue-900/10 border-cyan-100 dark:border-cyan-900/30"
              }`}
            >
              <Fuel className={`size-3.5 ${getFuelTextColor(fuelLevel)}`} />
              <span className={`text-[11px] font-semibold flex-1 text-left ${
                isLowFuel ? "text-red-700 dark:text-red-300" : "text-cyan-700 dark:text-cyan-300"
              }`}>
                {Math.round(fuelLevel)}% combustible · ~{estimatedRange} km
                {daysUntilRefuel != null && daysUntilRefuel > 0 && (
                  <span className="font-normal text-gray-500 dark:text-gray-400"> · Tanquea en ~{daysUntilRefuel} días</span>
                )}
                {daysUntilRefuel != null && daysUntilRefuel <= 0 && (
                  <span className="font-bold text-red-500"> · ¡Tanquea hoy!</span>
                )}
              </span>
              <ChevronDown className="size-3.5 text-gray-400" />
            </button>
          </div>
        )}

        {/* ─── Reminders Section (compact bar, always visible when vehicle selected) ─── */}
        {selectedVehicle && (() => {
          const now = new Date();
          const maintReminders = (selectedVehicle.maintenanceRecords || [])
            .filter(r => r.reminderEnabled && (r.nextDueKm || r.nextDueDate))
            .map(r => {
              const kmRemaining = r.nextDueKm ? r.nextDueKm - selectedVehicle.currentKm : null;
              const daysUntil = r.nextDueDate ? Math.ceil((new Date(r.nextDueDate).getTime() - now.getTime()) / (1000*60*60*24)) : null;
              const isOverdue = (kmRemaining !== null && kmRemaining <= 0) || (daysUntil !== null && daysUntil <= 0);
              const isUrgent = !isOverdue && ((kmRemaining !== null && kmRemaining <= 500) || (daysUntil !== null && daysUntil <= 15));
              const typeConfig = MAINTENANCE_TYPES.find(t => t.value === r.type);
              const kmInterval = typeConfig?.nextKmInterval || 0;
              const monthInterval = typeConfig?.nextMonthInterval || 0;
              return { ...r, kmRemaining, daysUntil, isOverdue, isUrgent, kmInterval, monthInterval };
            })
            .sort((a, b) => {
              if (a.isOverdue && !b.isOverdue) return -1;
              if (!a.isOverdue && b.isOverdue) return 1;
              if (a.isUrgent && !b.isUrgent) return -1;
              if (!a.isUrgent && b.isUrgent) return 1;
              return (a.kmRemaining ?? Infinity) - (b.kmRemaining ?? Infinity);
            });

          const docReminders = (selectedVehicle.documents || [])
            .filter(d => d.reminderEnabled)
            .map(d => {
              const daysUntilExpiry = Math.ceil((new Date(d.expiryDate).getTime() - now.getTime()) / (1000*60*60*24));
              const isExpired = daysUntilExpiry < 0;
              const isExpiringSoon = !isExpired && daysUntilExpiry <= (d.reminderDays || 30);
              return { ...d, daysUntilExpiry, isExpired, isExpiringSoon };
            })
            .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

          const hasReminders = maintReminders.length > 0 || docReminders.length > 0;
          const overdueCount = maintReminders.filter(r => r.isOverdue).length + docReminders.filter(d => d.isExpired).length;
          const urgentCount = maintReminders.filter(r => r.isUrgent).length + docReminders.filter(d => d.isExpiringSoon).length;
          const totalCount = maintReminders.length + docReminders.length;

          return (
            <div className="px-4 pt-2">
              <button
                onClick={() => setShowReminderDetails(!showReminderDetails)}
                className={`w-full rounded-xl border transition-colors ${
                  overdueCount > 0
                    ? "bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/10 dark:to-orange-900/10 border-red-200 dark:border-red-900/30"
                    : urgentCount > 0
                    ? "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border-amber-200 dark:border-amber-900/30"
                    : hasReminders
                    ? "bg-gradient-to-r from-cyan-50 to-blue-50 dark:from-cyan-900/10 dark:to-blue-900/10 border-cyan-100 dark:border-cyan-900/30"
                    : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
                }`}
              >
                <div className="flex items-center gap-2 p-2.5">
                  <Bell className={`size-3.5 ${
                    overdueCount > 0 ? "text-red-500" : urgentCount > 0 ? "text-amber-600" : hasReminders ? "text-cyan-600" : "text-gray-400"
                  }`} />
                  <span className={`text-xs font-semibold flex-1 text-left ${
                    overdueCount > 0 ? "text-red-700 dark:text-red-300" : urgentCount > 0 ? "text-amber-700 dark:text-amber-300" : hasReminders ? "text-cyan-700 dark:text-cyan-300" : "text-gray-500 dark:text-gray-400"
                  }`}>
                    Recordatorios
                    {totalCount > 0 && (
                      <span className="font-normal text-gray-400 ml-1">({totalCount})</span>
                    )}
                  </span>
                  {overdueCount > 0 && (
                    <Badge className="text-[10px] h-4 px-1.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">
                      {overdueCount} vencido{overdueCount > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {urgentCount > 0 && (
                    <Badge className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0">
                      {urgentCount} próximo
                    </Badge>
                  )}
                  {!hasReminders && (
                    <span className="text-[11px] text-gray-400">Sin recordatorios</span>
                  )}
                  <ChevronDown className={`size-3.5 text-gray-400 transition-transform ${showReminderDetails ? "rotate-180" : ""}`} />
                </div>
              </button>

              <AnimatePresence>
                {showReminderDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="pt-1.5 pb-1 space-y-1.5">
                      {hasReminders ? (
                        <>
                          {maintReminders.map(r => {
                            const Icon = maintTypeIcons[r.type] || Wrench;
                            return (
                              <div key={r.id} className={`flex items-center gap-2.5 p-2 rounded-xl ${
                                r.isOverdue
                                  ? "bg-red-100/60 dark:bg-red-900/30"
                                  : r.isUrgent
                                  ? "bg-amber-100/50 dark:bg-amber-900/20"
                                  : "bg-white/60 dark:bg-gray-800/40"
                              }`}>
                                <div className={`size-7 rounded-lg flex items-center justify-center flex-shrink-0 ${maintTypeColors[r.type] || maintTypeColors.other}`}>
                                  <Icon className="size-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                                    {maintTypeLabels[r.type] || r.type}
                                    {r.kmInterval > 0 && (
                                      <span className="text-gray-400 font-normal ml-1">· Cada {r.kmInterval.toLocaleString()} km</span>
                                    )}
                                    {r.monthInterval > 0 && !r.kmInterval && (
                                      <span className="text-gray-400 font-normal ml-1">· Cada {r.monthInterval} mes{r.monthInterval > 1 ? "es" : ""}</span>
                                    )}
                                  </p>
                                  <p className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                                    {r.kmRemaining !== null && (
                                      <span className={`font-medium ${
                                        r.isOverdue ? "text-red-600 dark:text-red-400" : r.isUrgent ? "text-amber-600 dark:text-amber-400" : "text-gray-600 dark:text-gray-400"
                                      }`}>
                                        {r.isOverdue ? "Vencido" : `Faltan ${r.kmRemaining.toLocaleString("es-CO")} km`}
                                      </span>
                                    )}
                                    {r.daysUntil !== null && (
                                      <span className="text-gray-400">
                                        <Clock className="size-3 inline -mt-0.5" /> {formatShortDate(r.nextDueDate!)}
                                        {!r.isOverdue && r.daysUntil > 0 && (
                                          <span className="ml-1">({r.daysUntil}d)</span>
                                        )}
                                      </span>
                                    )}
                                  </p>
                                </div>
                                {r.kmRemaining !== null && r.kmInterval > 0 && !r.isOverdue && (
                                  <div className="w-12 flex-shrink-0">
                                    <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${
                                          r.kmRemaining <= 500 ? "bg-red-500" : r.kmRemaining <= r.kmInterval * 0.3 ? "bg-amber-500" : "bg-emerald-500"
                                        }`}
                                        style={{ width: `${Math.max(0, Math.min(100, ((r.kmInterval - r.kmRemaining) / r.kmInterval) * 100))}%` }}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {docReminders.map(d => {
                            const DocIcon = docTypeIcons[d.type] || FileText;
                            return (
                              <div key={d.id} className={`flex items-center gap-2.5 p-2 rounded-xl ${
                                d.isExpired
                                  ? "bg-red-100/60 dark:bg-red-900/30"
                                  : d.isExpiringSoon
                                  ? "bg-amber-100/50 dark:bg-amber-900/20"
                                  : "bg-white/60 dark:bg-gray-800/40"
                              }`}>
                                <div className={`size-7 rounded-lg flex items-center justify-center flex-shrink-0 ${docTypeColors[d.type] || docTypeColors.otro}`}>
                                  <DocIcon className="size-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                                    {docTypeLabels[d.type] || d.type}
                                  </p>
                                  <p className="text-[11px] text-gray-500">
                                    <span className={`font-medium ${
                                      d.isExpired ? "text-red-600 dark:text-red-400" : d.isExpiringSoon ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                                    }`}>
                                      {d.isExpired ? "Vencido" : d.isExpiringSoon ? `Vence en ${d.daysUntilExpiry} días` : `Vigente (${d.daysUntilExpiry}d restantes)`}
                                    </span>
                                    <span className="ml-2 text-gray-400">
                                      <Clock className="size-3 inline -mt-0.5" /> {formatShortDate(d.expiryDate)}
                                    </span>
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="py-2 text-center">
                          <p className="text-xs text-gray-400">
                            Sin recordatorios. Activa recordatorios al registrar mantenimiento o documentos.
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })()}

        {timeline.length === 0 ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center justify-center size-12 rounded-2xl bg-gray-100 dark:bg-gray-800 mb-3">
              <Fuel className="size-6 text-gray-300" />
            </div>
            <p className="text-sm text-gray-400">
              Sin registros aún. Usa el botón + para agregar.
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4 pb-safe">
            {groupedTimeline().map((group) => (
              <div key={group.month}>
                {/* Month header */}
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
                  {group.month}
                </p>

                {/* Timeline entries */}
                <div className="relative pl-7">
                  {/* Vertical line */}
                  <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />

                  <div className="space-y-2">
                    {group.entries.map((entry) => (
                      <TimelineCard
                        key={entry.id}
                        entry={entry}
                        showVehicleName={!selectedVehicleId}
                        onEdit={() => {
                          if (entry.type === "fuel") {
                            setEditFuelLog({
                              id: entry.id,
                              date: entry.date,
                              km: entry.km,
                              amount: entry.cost,
                              pricePerGallon: entry.pricePerGallon || 0,
                              gallons: entry.gallons || 0,
                              isFullTank: entry.isFullTank ?? true,
                              notes: entry.notes,
                            } as FuelLog);
                            setShowFuelLogForm(true);
                          } else if (entry.type === "document") {
                            setEditDocument({
                              id: entry.id,
                              vehicleId: entry.vehicleId,
                              type: entry.docType || "soat",
                              documentNumber: entry.documentNumber,
                              issueDate: entry.date,
                              expiryDate: entry.expiryDate || "",
                              cost: entry.cost,
                              reminderDays: entry.reminderDays || 30,
                              reminderEnabled: entry.reminderEnabled ?? true,
                            } as VehicleDocument);
                            setShowDocumentForm(true);
                          } else {
                            setEditMaintenance({
                              id: entry.id,
                              type: entry.maintType || "general",
                              description: entry.maintDescription || "",
                              km: entry.km,
                              cost: entry.cost,
                              date: entry.date,
                              nextDueKm: entry.nextDueKm,
                              nextDueDate: entry.nextDueDate,
                              reminderEnabled: entry.reminderEnabled ?? true,
                            } as MaintenanceRecord);
                            setShowMaintenanceForm(true);
                          }
                        }}
                        onDelete={() => setDeleteTarget({
                          type: entry.type,
                          id: entry.id,
                          vehicleId: entry.vehicleId,
                        })}
                        onReverse={() => setReverseTarget({
                          type: entry.type,
                          id: entry.id,
                          vehicleId: entry.vehicleId,
                          cost: entry.cost,
                          description: entry.type === "fuel" ? "Recarga" : entry.type === "document" ? (docTypeLabels[entry.docType || ""] || "Documento") : (maintTypeLabels[entry.maintType || ""] || "Mantenimiento"),
                        })}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── FAB ───────────────────────────────────────────────── */}
      <motion.div
        className="fixed bottom-24 right-4 md:right-8 z-40"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring" }}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="size-14 rounded-full bg-gradient-to-br from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/40"
              size="icon"
            >
              <Plus className="size-6 text-white" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-xl">
            <DropdownMenuItem onClick={() => { setEditFuelLog(null); setShowFuelLogForm(true); }}>
              <Fuel className="size-4 mr-2 text-cyan-500" />
              Registrar Recarga
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setEditMaintenance(null); setShowMaintenanceForm(true); }}>
              <Wrench className="size-4 mr-2 text-amber-500" />
              Registrar Mantenimiento
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setEditDocument(null); setShowDocumentForm(true); }}>
              <Shield className="size-4 mr-2 text-violet-500" />
              Registrar Documento
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowFuelPriceDialog(true)}>
              <Settings className="size-4 mr-2 text-blue-500" />
              Precio Combustible
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setEditVehicle(null); setShowVehicleForm(true); }}>
              <Car className="size-4 mr-2 text-emerald-500" />
              Nuevo Vehículo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </motion.div>

      {/* ─── Forms ─────────────────────────────────────────────── */}
      <VehicleForm
        open={showVehicleForm}
        onOpenChange={setShowVehicleForm}
        vehicle={editVehicle}
        onSuccess={refetchVehicles}
      />

      <FuelLogForm
        open={showFuelLogForm}
        onOpenChange={setShowFuelLogForm}
        preselectedVehicleId={selectedVehicleId}
        fuelLog={editFuelLog}
        currentFuelLevel={selectedVehicle?.fuelLevel}
        currentFuelGallons={selectedVehicle?.currentFuel}
        tankCapacity={selectedVehicle?.tankCapacity}
        estimatedRange={selectedVehicle?.estimatedRange}
        avgKmPerGallon={selectedVehicle?.avgKmPerGallon}
        onSuccess={refetchVehicles}
      />

      <MaintenanceForm
        open={showMaintenanceForm}
        onOpenChange={setShowMaintenanceForm}
        preselectedVehicleId={selectedVehicleId}
        record={editMaintenance}
        onSuccess={refetchVehicles}
      />

      <VehicleDocumentForm
        open={showDocumentForm}
        onOpenChange={setShowDocumentForm}
        preselectedVehicleId={selectedVehicleId}
        document={editDocument}
        onSuccess={refetchVehicles}
      />

      <Dialog open={showFuelPriceDialog} onOpenChange={setShowFuelPriceDialog}>
        <DialogContent className="rounded-2xl max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fuel className="size-5 text-cyan-600" />
              Precio del Combustible
            </DialogTitle>
          </DialogHeader>
          <FuelPriceWidget />
        </DialogContent>
      </Dialog>

      {selectedVehicle && (
        <QuickKmUpdate
          open={showKmUpdate}
          onOpenChange={setShowKmUpdate}
          vehicleId={selectedVehicle.id}
          vehicleName={selectedVehicle.name}
          currentKm={selectedVehicle.currentKm}
          onSuccess={refetchVehicles}
        />
      )}

      {/* ─── Delete Confirmation ───────────────────────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "vehicle"
                ? "Se eliminará el vehículo y todos sus registros asociados. "
                : deleteTarget?.type === "fuel"
                ? "Se eliminará este registro de combustible y su transacción asociada. "
                : deleteTarget?.type === "document"
                ? "Se eliminará este documento y su transacción asociada. "
                : "Se eliminará este registro de mantenimiento y su transacción asociada. "}
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-xl bg-red-500 hover:bg-red-600"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Reverse Confirmation ───────────────────────────────── */}
      <AlertDialog open={!!reverseTarget} onOpenChange={(open) => !open && setReverseTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-5 text-orange-500" />
              ¿Reversar este registro?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {reverseTarget && (
                <>
                  Se eliminará el registro de <strong>{reverseTarget.description}</strong> por <strong>{formatCurrency(reverseTarget.cost)}</strong> y se revertirá su transacción financiera asociada (saldo del cuenta/presupuesto se restaurará).
                  <br /><br />
                  <span className="text-orange-600 dark:text-orange-400 font-medium">Esta acción no se puede deshacer.</span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReverse}
              className="rounded-xl bg-orange-500 hover:bg-orange-600"
            >
              <RotateCcw className="size-4 mr-1" />
              Reversar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Timeline Card (compact, Drivvo-style) ────────────────────────
function TimelineCard({
  entry,
  showVehicleName,
  onEdit,
  onDelete,
  onReverse,
}: {
  entry: TimelineEntry;
  showVehicleName: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReverse?: () => void;
}) {
  const isFuel = entry.type === "fuel";
  const isDoc = entry.type === "document";
  const [showItems, setShowItems] = useState(false);

  // Document status
  const docStatus = (() => {
    if (!isDoc || !entry.expiryDate) return null;
    const now = new Date();
    const expiry = new Date(entry.expiryDate);
    const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000*60*60*24));
    if (daysUntil < 0) return { label: "Vencido", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
    if (daysUntil <= (entry.reminderDays || 30)) return { label: "Por vencer", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };
    return { label: "Vigente", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" };
  })();

  // KM interval from MAINTENANCE_TYPES
  const kmInterval = !isFuel && !isDoc && entry.maintType
    ? MAINTENANCE_TYPES.find(t => t.value === entry.maintType)?.nextKmInterval || 0
    : 0;

  // Doc type icon
  const DocIcon = isDoc ? (docTypeIcons[entry.docType || ""] || FileText) : FileText;

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className={`absolute -left-7 top-3 size-5 rounded-full flex items-center justify-center ${
        isFuel
          ? "bg-orange-100 dark:bg-orange-900/30"
          : isDoc
          ? docTypeColors[entry.docType || ""]?.replace("text-", "bg-").split(" ")[0] + " dark:bg-gray-700"
          : "bg-blue-100 dark:bg-blue-900/30"
      }`}>
        {isFuel
          ? <Fuel className="size-2.5 text-orange-500" />
          : isDoc
          ? <DocIcon className="size-2.5" />
          : <Wrench className="size-2.5 text-blue-500" />
        }
      </div>

      {/* Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 group">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            {isDoc && DocIcon && (
              <div className={`size-5 rounded-md flex items-center justify-center flex-shrink-0 ${docTypeColors[entry.docType || ""] || docTypeColors.otro}`}>
                <DocIcon className="size-3" />
              </div>
            )}
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {isFuel ? "Recarga" : isDoc ? (docTypeLabels[entry.docType || ""] || entry.docType || "Documento") : (maintTypeLabels[entry.maintType || ""] || entry.maintType || "Mantenimiento")}
            </span>
            {isFuel && entry.isFullTank && (
              <Badge variant="secondary" className="text-[11px] h-4 px-1.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                Lleno
              </Badge>
            )}
            {isDoc && docStatus && (
              <Badge variant="secondary" className={`text-[11px] h-4 px-1.5 ${docStatus.color}`}>
                {docStatus.label}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
            <span className="text-sm font-bold text-gray-900 dark:text-white">
              {formatCurrency(entry.cost)}
            </span>
            {/* Action buttons - always visible on mobile */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="size-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-xl">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="size-4 mr-2 text-blue-500" />
                  Editar
                </DropdownMenuItem>
                {onReverse && (
                  <DropdownMenuItem onClick={onReverse}>
                    <RotateCcw className="size-4 mr-2 text-orange-500" />
                    Reversar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onDelete} className="text-red-600">
                  <Trash2 className="size-4 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-gray-500 flex-wrap">
          {showVehicleName && (
            <>
              <span className="font-medium text-gray-600 dark:text-gray-400">{entry.vehicleName}</span>
              <span>•</span>
            </>
          )}
          <span>{formatShortDate(entry.date)}</span>
          {!isDoc && <span>{(entry.km ?? 0).toLocaleString("es-CO")} km</span>}
          {isFuel && entry.gallons && (
            <>
              <span>•</span>
              <span>{entry.gallons.toFixed(2)} gal</span>
            </>
          )}
          {!isFuel && !isDoc && entry.nextDueKm && (
            <>
              <span>•</span>
              <Badge variant="secondary" className="text-[11px] h-3.5 px-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                Próx: {entry.nextDueKm.toLocaleString("es-CO")} km
                {kmInterval > 0 && <span className="font-normal"> · Cada {kmInterval.toLocaleString()} km</span>}
              </Badge>
            </>
          )}
          {isDoc && entry.documentNumber && (
            <>
              <span>•</span>
              <span className="text-gray-400">#{entry.documentNumber}</span>
            </>
          )}
          {isDoc && entry.expiryDate && (
            <>
              <span>•</span>
              <span>Vence: {formatShortDate(entry.expiryDate)}</span>
            </>
          )}
        </div>

        {/* Maintenance items expandable */}
        {!isFuel && !isDoc && entry.items && entry.items.length > 0 && (
          <div className="mt-1.5">
            <button
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              onClick={() => setShowItems(!showItems)}
            >
              <ChevronRight className={`size-3 transition-transform ${showItems ? "rotate-90" : ""}`} />
              <span>{entry.items.length} {entry.items.length === 1 ? "item" : "items"}</span>
            </button>
            {showItems && (
              <div className="mt-1.5 space-y-1 pl-4 border-l-2 border-gray-100 dark:border-gray-700">
                {entry.items.map(item => (
                  <div key={item.id} className="flex items-center justify-between text-[11px]">
                    <span className="text-gray-600 dark:text-gray-400 truncate">{item.name}</span>
                    <span className="text-gray-500 flex-shrink-0 ml-2">
                      {item.quantity} × {formatCurrency(item.unitPrice)} = {formatCurrency(item.totalPrice)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Vehicle Detail View (from timeline) ──────────────────────────
function VehicleDetailView({
  vehicle,
  onBack,
  onRefresh,
  onEditVehicle,
  onEditFuelLog,
  onEditMaintenance,
  onDelete,
}: {
  vehicle: VehicleWithDetails;
  onBack: () => void;
  onRefresh: () => void;
  onEditVehicle: (v: VehicleWithDetails) => void;
  onEditFuelLog: (log: FuelLog) => void;
  onEditMaintenance: (rec: MaintenanceRecord) => void;
  onDelete: (target: { type: "fuel" | "maintenance" | "document"; id: string; vehicleId?: string }) => void;
}) {
  const [showFuelLogForm, setShowFuelLogForm] = useState(false);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [editDocument, setEditDocument] = useState<VehicleDocument | null>(null);
  const [showKmUpdate, setShowKmUpdate] = useState(false);

  const gradient = vehicleGradients[vehicle.type] || vehicleGradients.other;
  const fuelLevel = vehicle.fuelLevel ?? 0;
  const currentFuel = vehicle.currentFuel ?? 0;
  const estimatedRange = vehicle.estimatedRange ?? 0;
  const avgKmPerGallon = vehicle.avgKmPerGallon ?? 0;

  const totalFuelSpent = (vehicle.fuelLogs || []).reduce((s, l) => s + l.amount, 0);
  const totalMaintenanceSpent = (vehicle.maintenanceRecords || []).reduce((s, r) => s + r.cost, 0);
  const totalDocSpent = (vehicle.documents || []).reduce((s, d) => s + d.cost, 0);

  const getFuelColor = (level: number) => {
    if (level > 50) return "bg-emerald-500";
    if (level > 25) return "bg-amber-500";
    return "bg-red-500";
  };

  // Build combined timeline for this vehicle
  const timeline: TimelineEntry[] = [
    ...(vehicle.fuelLogs || []).map((log) => ({
      id: log.id, type: "fuel" as const, date: log.date, km: log.km,
      cost: log.amount, vehicleId: vehicle.id, vehicleName: vehicle.name,
      gallons: log.gallons, isFullTank: log.isFullTank, pricePerGallon: log.pricePerGallon,
      notes: log.notes,
    })),
    ...(vehicle.maintenanceRecords || []).map((rec) => ({
      id: rec.id, type: "maintenance" as const,
      date: String(rec.date),
      km: rec.km, cost: rec.cost, vehicleId: vehicle.id, vehicleName: vehicle.name,
      maintType: rec.type, maintDescription: rec.description, nextDueKm: rec.nextDueKm,
      nextDueDate: rec.nextDueDate, reminderEnabled: rec.reminderEnabled, items: rec.items,
    })),
    ...(vehicle.documents || []).map((doc) => ({
      id: doc.id, type: "document" as const, date: doc.issueDate,
      km: 0, cost: doc.cost, vehicleId: vehicle.id, vehicleName: vehicle.name,
      docType: doc.type, documentNumber: doc.documentNumber,
      expiryDate: doc.expiryDate, reminderDays: doc.reminderDays,
      reminderEnabled: doc.reminderEnabled,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Upcoming maintenance with KM intervals (ALL reminders, not just urgent)
  const now = new Date();
  const upcomingMaintenance = (vehicle.maintenanceRecords || [])
    .filter(r => r.reminderEnabled && (r.nextDueKm || r.nextDueDate))
    .map(r => {
      const kmRemaining = r.nextDueKm ? r.nextDueKm - vehicle.currentKm : null;
      const daysUntil = r.nextDueDate ? Math.ceil((new Date(r.nextDueDate).getTime() - now.getTime()) / (1000*60*60*24)) : null;
      const isOverdue = (kmRemaining !== null && kmRemaining <= 0) || (daysUntil !== null && daysUntil <= 0);
      const isUrgent = !isOverdue && ((kmRemaining !== null && kmRemaining <= 500) || (daysUntil !== null && daysUntil <= 15));
      const typeConfig = MAINTENANCE_TYPES.find(t => t.value === r.type);
      const kmInterval = typeConfig?.nextKmInterval || 0;
      const monthInterval = typeConfig?.nextMonthInterval || 0;
      return { ...r, kmRemaining, daysUntil, isOverdue, isUrgent, kmInterval, monthInterval };
    })
    .sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.isUrgent && !b.isUrgent) return -1;
      if (!a.isUrgent && b.isUrgent) return 1;
      const aKm = a.kmRemaining ?? Infinity;
      const bKm = b.kmRemaining ?? Infinity;
      return aKm - bKm;
    });

  // Document expiry reminders (all with reminderEnabled)
  const docReminders = (vehicle.documents || [])
    .filter(d => d.reminderEnabled)
    .map(d => {
      const daysUntilExpiry = Math.ceil((new Date(d.expiryDate).getTime() - now.getTime()) / (1000*60*60*24));
      const isExpired = daysUntilExpiry < 0;
      const isExpiringSoon = !isExpired && daysUntilExpiry <= (d.reminderDays || 30);
      return { ...d, daysUntilExpiry, isExpired, isExpiringSoon };
    })
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  const hasReminders = upcomingMaintenance.length > 0 || docReminders.length > 0;
  const overdueCount = upcomingMaintenance.filter(r => r.isOverdue).length + docReminders.filter(d => d.isExpired).length;
  const urgentCount = upcomingMaintenance.filter(r => r.isUrgent).length + docReminders.filter(d => d.isExpiringSoon).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`bg-gradient-to-r ${gradient} px-4 pt-3 pb-4`}>
        <div className="flex items-center gap-2 mb-3">
          <Button variant="ghost" size="icon" className="size-8 rounded-xl text-white/80 hover:bg-white/10" onClick={onBack}>
            <ArrowLeft className="size-5" />
          </Button>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-white">{vehicle.name}</h2>
            <p className="text-xs text-white/70">
              {vehicle.brand && vehicle.model ? `${vehicle.brand} ${vehicle.model}` : vehicleTypeLabels[vehicle.type]}
              {vehicle.year ? ` ${vehicle.year}` : ""}
            </p>
          </div>
          <Button variant="ghost" size="icon" className="size-8 rounded-xl text-white/80 hover:bg-white/10" onClick={() => onEditVehicle(vehicle)}>
            <Pencil className="size-4" />
          </Button>
        </div>

        {/* Compact stats row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* KM */}
          <button
            className="flex items-center gap-1.5 bg-white/15 rounded-lg px-2.5 py-1.5 backdrop-blur-sm"
            onClick={() => setShowKmUpdate(true)}
          >
            <Gauge className="size-3.5 text-white/70" />
            <span className="text-xs font-bold text-white">{(vehicle.currentKm ?? 0).toLocaleString("es-CO")} km</span>
            <Pencil className="size-2.5 text-white/50" />
          </button>

          {/* Fuel level */}
          {vehicle.tankCapacity && vehicle.tankCapacity > 0 && (
            <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-2.5 py-1.5 backdrop-blur-sm flex-1">
              <Fuel className="size-3.5 text-white/70" />
              <div className="flex-1 h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${getFuelColor(fuelLevel)}`} style={{ width: `${Math.min(fuelLevel, 100)}%` }} />
              </div>
              <span className="text-xs font-bold text-white">{Math.round(fuelLevel)}%</span>
            </div>
          )}

          {/* Range */}
          {estimatedRange > 0 && (
            <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-2.5 py-1.5 backdrop-blur-sm">
              <MapPin className="size-3.5 text-white/70" />
              <span className="text-xs font-bold text-white">~{estimatedRange} km</span>
            </div>
          )}
        </div>
      </div>

      {/* Quick stats pills */}
      <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-900/20">
          <Fuel className="size-3 text-cyan-500" />
          <span className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">{formatCurrency(totalFuelSpent)}</span>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/20">
          <Wrench className="size-3 text-amber-500" />
          <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">{formatCurrency(totalMaintenanceSpent)}</span>
        </div>
        {(vehicle.documents || []).length > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-50 dark:bg-violet-900/20">
            <Shield className="size-3 text-violet-500" />
            <span className="text-[11px] font-semibold text-violet-700 dark:text-violet-300">{formatCurrency(totalDocSpent)}</span>
          </div>
        )}
        {avgKmPerGallon > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/20">
            <Gauge className="size-3 text-blue-500" />
            <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">{avgKmPerGallon} km/g</span>
          </div>
        )}
        <div className="flex-1" />
        <Button
          size="sm"
          className="h-7 rounded-lg text-[11px] bg-gradient-to-r from-cyan-600 to-blue-600 px-2.5"
          onClick={() => setShowFuelLogForm(true)}
        >
          <Plus className="size-3 mr-0.5" />
          Recarga
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-7 rounded-lg text-[11px] border-cyan-300 text-cyan-600 px-2.5"
          onClick={() => setShowMaintenanceForm(true)}
        >
          <Plus className="size-3 mr-0.5" />
          Mant.
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* ─── Reminders Section (always visible) ──────────────────────────────────── */}
        <div className="px-4 pt-3 pb-1">
          <div className={`rounded-2xl border p-3 ${
            overdueCount > 0
              ? "bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200 dark:border-red-800/30"
              : urgentCount > 0
              ? "bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border-amber-200 dark:border-amber-800/30"
              : hasReminders
              ? "bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/10 dark:to-blue-900/10 border-cyan-200 dark:border-cyan-800/30"
              : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700"
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <Bell className={`size-4 ${
                overdueCount > 0 ? "text-red-500" : urgentCount > 0 ? "text-amber-600" : hasReminders ? "text-cyan-600" : "text-gray-400"
              }`} />
              <span className={`text-sm font-semibold ${
                overdueCount > 0 ? "text-red-800 dark:text-red-300" : urgentCount > 0 ? "text-amber-800 dark:text-amber-300" : hasReminders ? "text-cyan-800 dark:text-cyan-300" : "text-gray-500 dark:text-gray-400"
              }`}>
                Recordatorios
              </span>
              {overdueCount > 0 && (
                <Badge className="text-[10px] h-4 px-1.5 bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0">
                  {overdueCount} vencido{overdueCount > 1 ? "s" : ""}
                </Badge>
              )}
              {urgentCount > 0 && (
                <Badge className="text-[10px] h-4 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0">
                  {urgentCount} próximo
                </Badge>
              )}
            </div>

            {hasReminders ? (
              <div className="space-y-1.5">
                {/* Maintenance reminders */}
                {upcomingMaintenance.map(r => {
                  const Icon = maintTypeIcons[r.type] || Wrench;
                  return (
                    <div key={r.id} className={`flex items-center gap-2.5 p-2 rounded-xl ${
                      r.isOverdue
                        ? "bg-red-100/60 dark:bg-red-900/30"
                        : r.isUrgent
                        ? "bg-amber-100/50 dark:bg-amber-900/20"
                        : "bg-white/60 dark:bg-gray-800/40"
                    }`}>
                      <div className={`size-7 rounded-lg flex items-center justify-center flex-shrink-0 ${maintTypeColors[r.type] || maintTypeColors.other}`}>
                        <Icon className="size-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                          {maintTypeLabels[r.type] || r.type}
                          {r.kmInterval > 0 && (
                            <span className="text-gray-400 font-normal ml-1">· Cada {r.kmInterval.toLocaleString()} km</span>
                          )}
                          {r.monthInterval > 0 && !r.kmInterval && (
                            <span className="text-gray-400 font-normal ml-1">· Cada {r.monthInterval} mes{r.monthInterval > 1 ? "es" : ""}</span>
                          )}
                        </p>
                        <p className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                          {r.kmRemaining !== null && (
                            <span className={`font-medium ${
                              r.isOverdue ? "text-red-600 dark:text-red-400" : r.isUrgent ? "text-amber-600 dark:text-amber-400" : "text-gray-600 dark:text-gray-400"
                            }`}>
                              {r.isOverdue ? "Vencido" : `Faltan ${r.kmRemaining.toLocaleString("es-CO")} km`}
                            </span>
                          )}
                          {r.daysUntil !== null && (
                            <span className="text-gray-400">
                              <Clock className="size-3 inline -mt-0.5" /> {formatShortDate(r.nextDueDate!)}
                              {!r.isOverdue && r.daysUntil > 0 && (
                                <span className="ml-1">({r.daysUntil}d)</span>
                              )}
                            </span>
                          )}
                        </p>
                      </div>
                      {r.kmRemaining !== null && r.kmInterval > 0 && !r.isOverdue && (
                        <div className="w-12 flex-shrink-0">
                          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                r.kmRemaining <= 500 ? "bg-red-500" : r.kmRemaining <= r.kmInterval * 0.3 ? "bg-amber-500" : "bg-emerald-500"
                              }`}
                              style={{ width: `${Math.max(0, Math.min(100, ((r.kmInterval - r.kmRemaining) / r.kmInterval) * 100))}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {/* Document reminders */}
                {docReminders.map(d => {
                  const DocIcon = docTypeIcons[d.type] || FileText;
                  return (
                    <div key={d.id} className={`flex items-center gap-2.5 p-2 rounded-xl ${
                      d.isExpired
                        ? "bg-red-100/60 dark:bg-red-900/30"
                        : d.isExpiringSoon
                        ? "bg-amber-100/50 dark:bg-amber-900/20"
                        : "bg-white/60 dark:bg-gray-800/40"
                    }`}>
                      <div className={`size-7 rounded-lg flex items-center justify-center flex-shrink-0 ${docTypeColors[d.type] || docTypeColors.otro}`}>
                        <DocIcon className="size-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                          {docTypeLabels[d.type] || d.type}
                        </p>
                        <p className="text-[11px] text-gray-500">
                          <span className={`font-medium ${
                            d.isExpired ? "text-red-600 dark:text-red-400" : d.isExpiringSoon ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                          }`}>
                            {d.isExpired ? "Vencido" : d.isExpiringSoon ? `Vence en ${d.daysUntilExpiry} días` : `Vigente (${d.daysUntilExpiry}d restantes)`}
                          </span>
                          <span className="ml-2 text-gray-400">
                            <Clock className="size-3 inline -mt-0.5" /> {formatShortDate(d.expiryDate)}
                          </span>
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-2 text-center">
                <p className="text-xs text-gray-400">
                  Sin recordatorios configurados. Activa recordatorios al registrar mantenimiento o documentos.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Anomaly warning */}
        {vehicle.anomalyDetected && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertTriangle className="size-4 text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-600 dark:text-red-400">
                Consumo anormal detectado — posible fuga o problema mecánico
              </p>
            </div>
          </div>
        )}

        {/* ─── Documents Section ──────────────────────────────────── */}
        {(vehicle.documents || []).length > 0 && (
          <div className="px-4 pt-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Documentos</h3>
            <div className="space-y-2">
              {(vehicle.documents || []).map((doc) => {
                const DocIcon = docTypeIcons[doc.type] || FileText;
                const colorClass = docTypeColors[doc.type] || docTypeColors.otro;
                const daysUntil = Math.ceil((new Date(doc.expiryDate).getTime() - now.getTime()) / (1000*60*60*24));
                const isExpired = daysUntil < 0;
                const isExpiringSoon = !isExpired && daysUntil <= (doc.reminderDays || 30);
                const statusLabel = isExpired ? "Vencido" : isExpiringSoon ? "Por vencer" : "Vigente";
                const statusColor = isExpired
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  : isExpiringSoon
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";

                return (
                  <div key={doc.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3">
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                        <DocIcon className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-gray-900 dark:text-white truncate">
                            {docTypeLabels[doc.type] || doc.type}
                          </span>
                          <Badge variant="secondary" className={`text-[11px] h-3.5 px-1 ${statusColor}`}>
                            {statusLabel}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                          {doc.documentNumber && <span>#{doc.documentNumber}</span>}
                          <span>Emisión: {formatShortDate(doc.issueDate)}</span>
                          <span>•</span>
                          <span>Vence: {formatShortDate(doc.expiryDate)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs font-bold text-gray-900 dark:text-white">
                          {formatCurrency(doc.cost)}
                        </span>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="size-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                              <MoreHorizontal className="size-3.5" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem onClick={() => {
                              setEditDocument({
                                id: doc.id,
                                vehicleId: doc.vehicleId,
                                type: doc.type,
                                documentNumber: doc.documentNumber,
                                issueDate: doc.issueDate,
                                expiryDate: doc.expiryDate,
                                cost: doc.cost,
                                reminderDays: doc.reminderDays,
                                reminderEnabled: doc.reminderEnabled,
                              } as VehicleDocument);
                              setShowDocumentForm(true);
                            }}>
                              <Pencil className="size-4 mr-2 text-blue-500" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete({ type: "document", id: doc.id, vehicleId: doc.vehicleId })} className="text-orange-600">
                              <RotateCcw className="size-4 mr-2" />
                              Reversar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onDelete({ type: "document", id: doc.id, vehicleId: doc.vehicleId })} className="text-red-600">
                              <Trash2 className="size-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Timeline */}
        {timeline.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-400">Sin registros aún</p>
          </div>
        ) : (
          <div className="p-4 space-y-4 pb-4">
            {/* Timeline entries */}
            <div className="relative pl-7">
              <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="space-y-2">
                {timeline.map((entry) => (
                  <TimelineCard
                    key={entry.id}
                    entry={entry}
                    showVehicleName={false}
                    onEdit={() => {
                      if (entry.type === "fuel") {
                        onEditFuelLog({
                          id: entry.id,
                          date: entry.date,
                          km: entry.km,
                          amount: entry.cost,
                          pricePerGallon: entry.pricePerGallon || 0,
                          gallons: entry.gallons || 0,
                          isFullTank: entry.isFullTank ?? true,
                          notes: entry.notes,
                        } as FuelLog);
                      } else if (entry.type === "document") {
                        setEditDocument({
                          id: entry.id,
                          vehicleId: entry.vehicleId,
                          type: entry.docType || "soat",
                          documentNumber: entry.documentNumber,
                          issueDate: entry.date,
                          expiryDate: entry.expiryDate || "",
                          cost: entry.cost,
                          reminderDays: entry.reminderDays || 30,
                          reminderEnabled: entry.reminderEnabled ?? true,
                        } as VehicleDocument);
                        setShowDocumentForm(true);
                      } else {
                        onEditMaintenance({
                          id: entry.id,
                          type: entry.maintType || "general",
                          description: entry.maintDescription || "",
                          km: entry.km,
                          cost: entry.cost,
                          date: entry.date,
                          nextDueKm: entry.nextDueKm,
                          nextDueDate: entry.nextDueDate,
                          reminderEnabled: entry.reminderEnabled ?? true,
                        } as MaintenanceRecord);
                      }
                    }}
                    onDelete={() => onDelete({
                      type: entry.type,
                      id: entry.id,
                      vehicleId: entry.vehicleId,
                    })}
                    onReverse={() => onDelete({
                      type: entry.type,
                      id: entry.id,
                      vehicleId: entry.vehicleId,
                    })}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Forms inside detail view */}
      <FuelLogForm
        open={showFuelLogForm}
        onOpenChange={setShowFuelLogForm}
        preselectedVehicleId={vehicle.id}
        currentFuelLevel={vehicle.fuelLevel}
        currentFuelGallons={vehicle.currentFuel}
        tankCapacity={vehicle.tankCapacity}
        estimatedRange={vehicle.estimatedRange}
        avgKmPerGallon={vehicle.avgKmPerGallon}
        onSuccess={onRefresh}
      />

      <MaintenanceForm
        open={showMaintenanceForm}
        onOpenChange={setShowMaintenanceForm}
        preselectedVehicleId={vehicle.id}
        onSuccess={onRefresh}
      />

      <VehicleDocumentForm
        open={showDocumentForm}
        onOpenChange={setShowDocumentForm}
        preselectedVehicleId={vehicle.id}
        document={editDocument}
        onSuccess={onRefresh}
      />

      <QuickKmUpdate
        open={showKmUpdate}
        onOpenChange={setShowKmUpdate}
        vehicleId={vehicle.id}
        vehicleName={vehicle.name}
        currentKm={vehicle.currentKm}
        onSuccess={onRefresh}
      />
    </div>
  );
}
