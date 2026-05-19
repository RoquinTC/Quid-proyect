"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAppStore, type TransportSubView, type SidebarAction } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import {
  Car, Fuel, Wrench, Plus, HelpCircle,
  Droplets, CircleDot, ShieldAlert, Settings, Package,
  ChevronDown, Gauge, MapPin, AlertTriangle, Bell, Clock,
  Trash2, Pencil, MoreVertical, ArrowLeft, MoreHorizontal,
  Activity, RefreshCw,
} from "lucide-react";
import { VehicleForm } from "./vehicle-form";
import { FuelLogForm } from "./fuel-log-form";
import { MaintenanceForm } from "./maintenance-form";
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
import type { Vehicle, FuelLog, MaintenanceRecord } from "@/lib/types";
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
  general: Settings, parts_replacement: Package, other: HelpCircle,
};
const maintTypeLabels: Record<string, string> = {
  oil_change: "Cambio de aceite", tire_change: "Cambio de llantas",
  brake_service: "Servicio de frenos", general: "Revisión general",
  parts_replacement: "Cambio de repuestos", other: "Otro",
};
const maintTypeColors: Record<string, string> = {
  oil_change: "text-amber-600 bg-amber-100 dark:bg-amber-900/30",
  tire_change: "text-gray-600 bg-gray-100 dark:bg-gray-700",
  brake_service: "text-red-600 bg-red-100 dark:bg-red-900/30",
  general: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
  parts_replacement: "text-purple-600 bg-purple-100 dark:bg-purple-900/30",
  other: "text-gray-600 bg-gray-100 dark:bg-gray-700",
};

type VehicleWithDetails = Vehicle & {
  fuelLogs: Array<{ id: string; date: string; km: number; amount: number; pricePerGallon: number; gallons: number; isFullTank?: boolean; notes?: string | null }>;
  maintenanceRecords: Array<{ id: string; type: string; description: string; km: number; cost: number; date: string; nextDueKm?: number | null; nextDueDate?: string | null; reminderEnabled?: boolean }>;
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
  type: "fuel" | "maintenance";
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
};

// ─── Component ────────────────────────────────────────────────────
export function TransportPage() {
  const { sidebarAction, setSidebarAction } = useAppStore();

  // Data
  const { data: vehiclesData, refetch: refetchVehicles } = useLocalQuery<VehicleWithDetails>("/api/vehicles");
  const vehicles = (vehiclesData || []) as VehicleWithDetails[];

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
  const [showFuelPriceDialog, setShowFuelPriceDialog] = useState(false);
  const [showKmUpdate, setShowKmUpdate] = useState(false);

  // Fuel status card expanded state
  const [showFuelDetails, setShowFuelDetails] = useState(false);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<{ type: "fuel" | "maintenance" | "vehicle"; id: string; vehicleId?: string } | null>(null);

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
      }
      refetchVehicles();
    } catch (error) {
      console.error("Error deleting:", error);
      toast.error("Error al eliminar");
    } finally {
      setDeleteTarget(null);
    }
  };

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
          <div className="flex items-center gap-2 mt-2">
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
                <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[8px] font-bold animate-pulse">
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
                <span className="text-[10px] font-semibold text-red-500">Alerta</span>
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
                            <p className="text-[10px] text-gray-400">{lastKmUpdateLabel}</p>
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
                            <div className="flex justify-between text-[9px] text-gray-400">
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
                            <p className="text-[9px] text-gray-400">En tanque</p>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded-xl p-2 text-center">
                            <MapPin className="size-3 text-cyan-500 mx-auto mb-0.5" />
                            <p className="text-xs font-bold text-gray-900 dark:text-white">
                              ~{estimatedRange} km
                            </p>
                            <p className="text-[9px] text-gray-400">Autonomía</p>
                          </div>
                          <div className="bg-white dark:bg-gray-800 rounded-xl p-2 text-center">
                            <Activity className="size-3 text-cyan-500 mx-auto mb-0.5" />
                            <p className="text-xs font-bold text-gray-900 dark:text-white">
                              {avgKmPerGallon} km/g
                            </p>
                            <p className="text-[9px] text-gray-400">Promedio</p>
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
                                <span className={`text-[9px] ${isLowFuel ? "text-red-500 dark:text-red-400" : "text-cyan-500 dark:text-cyan-400"}`}>
                                  {refuelDateText}
                                </span>
                                {avgKmPerDay > 0 && (
                                  <span className={`text-[8px] ml-auto ${isLowFuel ? "text-red-400" : "text-cyan-400"}`}>
                                    ~{avgKmPerDay.toFixed(0)} km/día
                                  </span>
                                )}
                              </div>
                            )}
                            {isLearning && (
                              <p className="text-[8px] text-amber-600 dark:text-amber-400 mt-1">
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
                        <p className="text-[10px] text-gray-400 max-w-[220px] mx-auto mb-2">
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
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
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
        className="fixed bottom-24 right-4 z-40"
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
    </div>
  );
}

// ─── Timeline Card (compact, Drivvo-style) ────────────────────────
function TimelineCard({
  entry,
  showVehicleName,
  onEdit,
  onDelete,
}: {
  entry: TimelineEntry;
  showVehicleName: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isFuel = entry.type === "fuel";

  return (
    <div className="relative">
      {/* Timeline dot */}
      <div className={`absolute -left-7 top-3 size-5 rounded-full flex items-center justify-center ${
        isFuel
          ? "bg-orange-100 dark:bg-orange-900/30"
          : "bg-blue-100 dark:bg-blue-900/30"
      }`}>
        {isFuel
          ? <Fuel className="size-2.5 text-orange-500" />
          : <Wrench className="size-2.5 text-blue-500" />
        }
      </div>

      {/* Card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-3 group">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {isFuel ? "Recarga" : (maintTypeLabels[entry.maintType || ""] || entry.maintType || "Mantenimiento")}
            </span>
            {isFuel && entry.isFullTank && (
              <Badge variant="secondary" className="text-[8px] h-4 px-1.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                Lleno
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
                <DropdownMenuItem onClick={onDelete} className="text-red-600">
                  <Trash2 className="size-4 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          {showVehicleName && (
            <>
              <span className="font-medium text-gray-600 dark:text-gray-400">{entry.vehicleName}</span>
              <span>•</span>
            </>
          )}
          <span>{formatShortDate(entry.date)}</span>
          <span>{(entry.km ?? 0).toLocaleString("es-CO")} km</span>
          {isFuel && entry.gallons && (
            <>
              <span>•</span>
              <span>{entry.gallons.toFixed(2)} gal</span>
            </>
          )}
          {!isFuel && entry.nextDueKm && (
            <>
              <span>•</span>
              <Badge variant="secondary" className="text-[8px] h-3.5 px-1 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                Próx: {entry.nextDueKm.toLocaleString("es-CO")} km
              </Badge>
            </>
          )}
        </div>
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
  onDelete: (target: { type: "fuel" | "maintenance"; id: string; vehicleId?: string }) => void;
}) {
  const [showFuelLogForm, setShowFuelLogForm] = useState(false);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [showKmUpdate, setShowKmUpdate] = useState(false);

  const gradient = vehicleGradients[vehicle.type] || vehicleGradients.other;
  const fuelLevel = vehicle.fuelLevel ?? 0;
  const currentFuel = vehicle.currentFuel ?? 0;
  const estimatedRange = vehicle.estimatedRange ?? 0;
  const avgKmPerGallon = vehicle.avgKmPerGallon ?? 0;

  const totalFuelSpent = (vehicle.fuelLogs || []).reduce((s, l) => s + l.amount, 0);
  const totalMaintenanceSpent = (vehicle.maintenanceRecords || []).reduce((s, r) => s + r.cost, 0);

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
      nextDueDate: rec.nextDueDate, reminderEnabled: rec.reminderEnabled,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Upcoming maintenance
  const upcomingMaintenance = (vehicle.maintenanceRecords || []).filter((r) => {
    if (!r.reminderEnabled) return false;
    if (r.nextDueKm) {
      const kmRemaining = r.nextDueKm - vehicle.currentKm;
      return kmRemaining <= 1000;
    }
    return false;
  });

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
        <div className="flex items-center gap-3">
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
        {/* Upcoming maintenance alerts */}
        {upcomingMaintenance.length > 0 && (
          <div className="px-4 pt-3">
            <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="size-3.5 text-amber-600" />
                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  Próximos mantenimientos
                </span>
              </div>
              {upcomingMaintenance.map((r) => {
                const kmRemaining = r.nextDueKm ? r.nextDueKm - vehicle.currentKm : null;
                const isOverdue = kmRemaining !== null && kmRemaining <= 0;
                return (
                  <div key={r.id} className="flex items-center gap-2 py-1">
                    <AlertTriangle className={`size-3 ${isOverdue ? "text-red-500" : "text-amber-500"}`} />
                    <span className="text-[11px] text-gray-700 dark:text-gray-300">
                      {maintTypeLabels[r.type] || r.type}
                    </span>
                    <span className={`text-[10px] ml-auto font-semibold ${isOverdue ? "text-red-500" : "text-amber-600"}`}>
                      {isOverdue ? "Vencido" : `Faltan ${kmRemaining?.toLocaleString("es-CO")} km`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Anomaly warning */}
        {vehicle.anomalyDetected && (
          <div className="px-4 pt-3">
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
              <AlertTriangle className="size-4 text-red-500 flex-shrink-0" />
              <p className="text-[10px] text-red-600 dark:text-red-400">
                Consumo anormal detectado — posible fuga o problema mecánico
              </p>
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
