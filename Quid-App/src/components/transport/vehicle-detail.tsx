"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency, formatDate, formatShortDate } from "@/lib/api";
import { FuelLogForm } from "./fuel-log-form";
import { MaintenanceForm } from "./maintenance-form";
import { VehicleForm } from "./vehicle-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Fuel,
  Wrench,
  ArrowLeft,
  Plus,
  Gauge,
  TrendingDown,
  Droplets,
  CircleDot,
  ShieldAlert,
  Settings,
  Package,
  MoreVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  AlertTriangle,
  Wallet,
  CalendarClock,
  MapPin,
  Shield,
  FileText,
  FileCheck,
  Bell,
  Clock,
  ChevronRight,
  HelpCircle,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { motion } from "framer-motion";
import { FuelGauge } from "./Fuel-gauge";
import type { Vehicle, FuelLog, MaintenanceRecord, FuelLevelData, VehicleDocument } from "@/lib/types";
import { MAINTENANCE_TYPES } from "@/lib/types/transport";
import { QuickKmUpdate } from "./quick-km-update";
import { VehicleIcon } from "./vehicle-icon";
import { VehicleDocumentForm } from "./vehicle-document-form";
import { toast } from "sonner";

interface VehicleDetailProps {
  vehicleId: string;
  onBack: () => void;
}

const vehicleGradients: Record<string, string> = {
  motorcycle: "from-cyan-500 to-blue-600",
  car: "from-blue-500 to-indigo-600",
  truck: "from-indigo-500 to-purple-600",
  other: "from-slate-500 to-gray-600",
};

const vehicleTypeLabels: Record<string, string> = {
  motorcycle: "Motocicleta",
  car: "Carro",
  truck: "Camión",
  other: "Otro",
};

const fuelTypeLabels: Record<string, string> = {
  gasoline: "Gasolina",
  diesel: "Diésel",
  electric: "Eléctrico",
};

const maintTypeIcons: Record<string, typeof Wrench> = {
  oil_change: Droplets,
  tire_change: CircleDot,
  brake_service: ShieldAlert,
  general: Settings,
  parts_replacement: Package,
  alignment: Settings,
  suspension: Package,
  transmission: Settings,
  electrical: ShieldAlert,
  cooling: Droplets,
  ac: Settings,
  battery: ShieldAlert,
  inspection: Settings,
  wash: Droplets,
  aesthetics: HelpCircle,
  other: Wrench,
};

const maintTypeLabels: Record<string, string> = {
  oil_change: "Cambio de aceite",
  tire_change: "Cambio de llantas",
  brake_service: "Servicio de frenos",
  general: "Revisión general",
  parts_replacement: "Cambio de repuestos",
  alignment: "Alineación/Balanceo",
  suspension: "Suspensión",
  transmission: "Transmisión",
  electrical: "Sistema eléctrico",
  cooling: "Sistema de enfriamiento",
  ac: "Aire acondicionado",
  battery: "Batería",
  inspection: "Inspección/Revisión",
  wash: "Lavado",
  aesthetics: "Estética",
  other: "Otro",
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

export function VehicleDetail({ vehicleId, onBack }: VehicleDetailProps) {
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFuelLogForm, setShowFuelLogForm] = useState(false);
  const [editFuelLog, setEditFuelLog] = useState<FuelLog | null>(null);
  const [showMaintenanceForm, setShowMaintenanceForm] = useState(false);
  const [editMaintenance, setEditMaintenance] = useState<MaintenanceRecord | null>(null);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showKmUpdate, setShowKmUpdate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: "fuel" | "maintenance" | "document"; id: string } | null>(null);
  const [fuelLevelData, setFuelLevelData] = useState<FuelLevelData | null>(null);
  const [currentFuelPrice, setCurrentFuelPrice] = useState<number | null>(null);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [showDocumentForm, setShowDocumentForm] = useState(false);
  const [editDocument, setEditDocument] = useState<VehicleDocument | null>(null);
  const [showItems, setShowItems] = useState<Record<string, boolean>>({});

  const fetchData = useCallback(async () => {
    try {
      const vehicleData = await apiFetch<Vehicle>(`/api/vehicles/${vehicleId}`);
      setVehicle(vehicleData);

      const [logs, records, docs] = await Promise.all([
        apiFetch<FuelLog[]>(`/api/vehicles/${vehicleId}/fuel-logs`),
        apiFetch<MaintenanceRecord[]>(`/api/vehicles/${vehicleId}/maintenance`),
        apiFetch<VehicleDocument[]>(`/api/vehicles/${vehicleId}/documents`),
      ]);

      setFuelLogs(logs);
      setMaintenanceRecords(records);
      setDocuments(docs);
    } catch (error) {
      console.error("Error fetching vehicle detail:", error);
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  const fetchFuelLevel = useCallback(async () => {
    if (!vehicleId || !vehicle?.tankCapacity) return;

    try {
      const data = await apiFetch<FuelLevelData>(`/api/vehicles/${vehicleId}/fuel-level`);
      setFuelLevelData(data);
    } catch (error) {
      console.error("Error fetching fuel level:", error);
    }
  }, [vehicleId, vehicle?.tankCapacity]);

  const fetchFuelPrice = useCallback(async () => {
    if (!vehicle?.fuelType || vehicle.fuelType === "electric") return;
    try {
      const prices = await apiFetch<Array<{ fuelType: string; pricePerGallon: number }>>("/api/fuel-prices");
      const match = prices.find((p) => p.fuelType === vehicle.fuelType);
      if (match) setCurrentFuelPrice(match.pricePerGallon);
    } catch {
      // silently ignore
    }
  }, [vehicle?.fuelType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (vehicle && vehicle.tankCapacity) {
      fetchFuelLevel();
      fetchFuelPrice();
    }
  }, [vehicle, vehicle?.tankCapacity, fetchFuelLevel, fetchFuelPrice]);

  const handleDeleteVehicle = async () => {
    if (!vehicle) return;
    try {
      await apiFetch(`/api/vehicles/${vehicle.id}`, { method: "DELETE" });
      toast.success("Vehículo eliminado");
      onBack();
    } catch (error) {
      console.error("Error deleting vehicle:", error);
      toast.error("Error al eliminar vehículo");
    }
  };

  const handleDeleteRecord = async () => {
    if (!deleteTarget || !vehicle) return;
    try {
      if (deleteTarget.type === "fuel") {
        await apiFetch(`/api/vehicles/${vehicle.id}/fuel-logs/${deleteTarget.id}`, { method: "DELETE" });
        toast.success("Registro de combustible eliminado");
      } else if (deleteTarget.type === "maintenance") {
        await apiFetch(`/api/vehicles/${vehicle.id}/maintenance/${deleteTarget.id}`, { method: "DELETE" });
        toast.success("Registro de mantenimiento eliminado");
      } else if (deleteTarget.type === "document") {
        await apiFetch(`/api/vehicles/${vehicle.id}/documents/${deleteTarget.id}`, { method: "DELETE" });
        toast.success("Documento eliminado");
      }
      await fetchData();
      await fetchFuelLevel();
    } catch (error) {
      console.error("Error deleting record:", error);
      toast.error("Error al eliminar registro");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading || !vehicle) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        <div className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    );
  }

  const gradient = vehicleGradients[vehicle.type] || vehicleGradients.other;

  // Stats
  const totalFuelSpent = fuelLogs.reduce((s, l) => s + l.amount, 0);
  const totalMaintenanceSpent = maintenanceRecords.reduce((s, r) => s + r.cost, 0);

  // Average km/gallon
  let avgKmPerGallon = fuelLevelData?.avgKmPerGallon || 0;
  if (avgKmPerGallon === 0 && fuelLogs.length >= 2) {
    const sorted = [...fuelLogs].sort((a, b) => a.km - b.km);
    const totalKm = sorted[sorted.length - 1].km - sorted[0].km;
    const totalGallons = sorted.slice(1).reduce((s, l) => s + l.gallons, 0);
    if (totalGallons > 0 && totalKm > 0) {
      avgKmPerGallon = Math.round(totalKm / totalGallons);
    }
  }

  // Cost to fill calculation — prefer last logged price, fallback to fuel-prices API
  const costToFillData = (() => {
    if (!fuelLevelData || fuelLevelData.fuelLevel >= 100 || !vehicle.tankCapacity || !vehicle.fuelType || vehicle.fuelType === "electric") return null;
    const gallonsNeeded = fuelLevelData.gallonsToRefuel > 0 ? fuelLevelData.gallonsToRefuel : vehicle.tankCapacity - fuelLevelData.currentFuel;
    if (gallonsNeeded <= 0) return null;
    // Priority: last price from fuel logs > fuel-prices API
    const effectivePrice = fuelLevelData.lastPricePerGallon > 0 ? fuelLevelData.lastPricePerGallon : (currentFuelPrice ?? 0);
    if (effectivePrice > 0) {
      const costToFill = gallonsNeeded * effectivePrice;
      return { gallonsNeeded, costToFill, pricePerGallon: effectivePrice, hasPrice: true };
    }
    return { gallonsNeeded, costToFill: 0, pricePerGallon: 0, hasPrice: false };
  })();

  // Smart refuel prediction from fuelLevelData
  const isLowFuel = fuelLevelData?.isLowFuel ?? false;
  const daysUntilRefuel = fuelLevelData?.daysUntilRefuel ?? null;
  const refuelByDate = fuelLevelData?.refuelByDate ?? null;
  const avgKmPerDay = fuelLevelData?.avgKmPerDay ?? 0;
  const isLearning = fuelLevelData?.isLearning ?? true;

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
      if (diffDays <= 7) return `En ${diffDays} días (${date.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" })})`;
      return date.toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });
    } catch {
      return null;
    }
  };
  const refuelDateText = formatRefuelDate(refuelByDate);

  return (
    <div className="p-4 space-y-4 pb-safe">
      {/* Header with back button */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-9 rounded-xl"
          onClick={onBack}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex-1">
          {vehicle.name}
        </h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-9 rounded-xl">
              <MoreVertical className="size-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setShowEditForm(true)}>
              <Pencil className="size-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDeleteVehicle} className="text-red-600">
              <Trash2 className="size-4 mr-2" />
              Eliminar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Vehicle Info Card with Fuel Gauge */}
      <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
        <div className={`bg-gradient-to-r ${gradient} p-5 relative`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.15),transparent)] pointer-events-none" />
          <div className="flex items-center gap-4 relative z-10">
            <div className="size-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <VehicleIcon icon={vehicle.icon} type={vehicle.type} className="size-7 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">{vehicle.name}</h3>
                {vehicle.plate && (
                  <span className="text-xs font-bold bg-white text-gray-800 border border-gray-300 rounded px-1.5 py-0 leading-4 tracking-wider uppercase">
                    {vehicle.plate}
                  </span>
                )}
              </div>
              <p className="text-sm text-white/70">
                {vehicle.brand && vehicle.model
                  ? `${vehicle.brand} ${vehicle.model}`
                  : vehicleTypeLabels[vehicle.type]}
                {vehicle.year ? ` ${vehicle.year}` : ""}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {vehicle.fuelType && (
                  <span className="text-xs bg-white/20 backdrop-blur-sm text-white rounded-full px-2 py-0.5">
                    {fuelTypeLabels[vehicle.fuelType] || vehicle.fuelType}
                  </span>
                )}
                {vehicle.color && (
                  <span className="text-xs bg-white/20 backdrop-blur-sm text-white rounded-full px-2 py-0.5">
                    {vehicle.color}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        <CardContent className="p-4 space-y-4">
          <div
            className="flex items-center gap-2 group cursor-pointer rounded-lg px-2 py-2 -mx-2 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            onClick={() => setShowKmUpdate(true)}
          >
            <Gauge className="size-4 text-gray-400" />
            <span className="text-xs text-gray-500">Kilometraje actual</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white ml-auto">
              {(vehicle.currentKm ?? 0).toLocaleString("es-CO")} km
            </span>
            <Pencil className="size-3 text-gray-300 group-hover:text-cyan-500 transition-colors" />
          </div>

          {/* Fuel Gauge Visual */}
          {vehicle.tankCapacity && fuelLevelData && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="flex justify-center mb-3">
                <FuelGauge
                  fuelLevel={fuelLevelData.fuelLevel}
                  vehicleType={vehicle.type}
                  tankCapacity={vehicle.tankCapacity}
                  currentFuel={fuelLevelData.currentFuel}
                  showDetails={true}
                />
              </div>

              {/* Fuel Stats Grid */}
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-gray-500 mb-1">
                    <TrendingDown className="size-3" />
                    <span>Rendimiento</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {fuelLevelData.avgKmPerGallon > 0 ? `${fuelLevelData.avgKmPerGallon}` : "—"}
                  </p>
                  <p className="text-[11px] text-gray-400">km/gal</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-gray-500 mb-1">
                    <Gauge className="size-3" />
                    <span>Autonomía</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {fuelLevelData.estimatedRange > 0 ? `${fuelLevelData.estimatedRange}` : "—"}
                  </p>
                  <p className="text-[11px] text-gray-400">km</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-gray-500 mb-1">
                    <MapPin className="size-3" />
                    <span>Uso diario</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {avgKmPerDay > 0 ? `~${avgKmPerDay.toFixed(0)}` : "—"}
                  </p>
                  <p className="text-[11px] text-gray-400">km/día</p>
                </div>
              </div>

              {/* Smart Refuel Prediction Card */}
              {costToFillData && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mt-3 p-3 rounded-xl border ${
                    isLowFuel
                      ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                      : "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800"
                  }`}
                >
                  {/* Gallons + Cost row */}
                  <div className="flex items-start gap-2">
                    <Droplets className={`size-4 flex-shrink-0 mt-0.5 ${isLowFuel ? "text-red-500" : "text-cyan-600 dark:text-cyan-400"}`} />
                    <div className="flex-1">
                      {costToFillData.hasPrice ? (
                        <>
                          <p className={`text-xs font-semibold ${isLowFuel ? "text-red-700 dark:text-red-300" : "text-cyan-700 dark:text-cyan-300"}`}>
                            Para llenar: {formatCurrency(costToFillData.costToFill)}
                          </p>
                          <p className={`text-xs mt-0.5 ${isLowFuel ? "text-red-500 dark:text-red-400" : "text-cyan-600 dark:text-cyan-400"}`}>
                            {costToFillData.gallonsNeeded.toFixed(1)} gal × {formatCurrency(costToFillData.pricePerGallon)}/gal
                          </p>
                        </>
                      ) : (
                        <>
                          <p className={`text-xs font-semibold ${isLowFuel ? "text-red-700 dark:text-red-300" : "text-cyan-700 dark:text-cyan-300"}`}>
                            {costToFillData.gallonsNeeded.toFixed(1)} gal para llenar el tanque
                          </p>
                          <p className={`text-[11px] mt-0.5 ${isLowFuel ? "text-red-500 dark:text-red-400" : "text-cyan-500 dark:text-cyan-400"}`}>
                            Registra un precio por galón para ver el costo estimado
                          </p>
                        </>
                      )}
                      {isLearning && (
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                          Rendimiento estimado — se ajustará con más registros
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Days until refuel prediction */}
                  {daysUntilRefuel != null && refuelDateText && (
                    <div className={`flex items-center gap-2 mt-2 pt-2 border-t ${
                      isLowFuel ? "border-red-200 dark:border-red-800" : "border-cyan-200 dark:border-cyan-800"
                    }`}>
                      <CalendarClock className={`size-3.5 flex-shrink-0 ${isLowFuel ? "text-red-500" : "text-cyan-600 dark:text-cyan-400"}`} />
                      <span className={`text-[11px] font-semibold ${isLowFuel ? "text-red-700 dark:text-red-300" : "text-cyan-700 dark:text-cyan-300"}`}>
                        {daysUntilRefuel <= 0 ? "¡Tanquea hoy!" : daysUntilRefuel === 1 ? "¡Tanquea mañana!" : `Tanquea en ~${daysUntilRefuel} días`}
                      </span>
                      <span className={`text-[11px] ${isLowFuel ? "text-red-500 dark:text-red-400" : "text-cyan-500 dark:text-cyan-400"}`}>
                        {refuelDateText}
                      </span>
                      {avgKmPerDay > 0 && (
                        <span className={`text-[11px] ml-auto ${isLowFuel ? "text-red-400 dark:text-red-500" : "text-cyan-400 dark:text-cyan-500"}`}>
                          ~{avgKmPerDay.toFixed(0)} km/día
                        </span>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Anomaly Warning */}
              {fuelLevelData.anomalyDetected && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="size-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                        Consumo Anormal Detectado
                      </p>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                        El consumo real ({(fuelLevelData.actualConsumption ?? 0).toFixed(2)} gal) excede el esperado ({(fuelLevelData.expectedConsumption ?? 0).toFixed(2)} gal).
                        Puede indicar problemas mecánicos o fugas.
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-3 text-center">
            <Fuel className="size-4 text-cyan-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">Combustible</p>
            <p className="text-xs font-bold text-gray-900 dark:text-white">
              {formatCurrency(totalFuelSpent)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-3 text-center">
            <Wrench className="size-4 text-amber-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">Mantenimiento</p>
            <p className="text-xs font-bold text-gray-900 dark:text-white">
              {formatCurrency(totalMaintenanceSpent)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-3 text-center">
            <TrendingDown className="size-4 text-blue-500 mx-auto mb-1" />
            <p className="text-xs text-gray-500">Rendimiento</p>
            <p className="text-xs font-bold text-gray-900 dark:text-white">
              {avgKmPerGallon > 0 ? `${avgKmPerGallon} km/g` : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Button
          className="flex-1 h-11 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600"
          onClick={() => { setEditFuelLog(null); setShowFuelLogForm(true); }}
        >
          <Fuel className="size-4 mr-1.5" />
          Registrar Recarga
        </Button>
        <Button
          variant="outline"
          className="flex-1 h-11 rounded-xl border-cyan-300 text-cyan-600 hover:bg-cyan-50"
          onClick={() => { setEditMaintenance(null); setShowMaintenanceForm(true); }}
        >
          <Wrench className="size-4 mr-1.5" />
          Registrar Mantenimiento
        </Button>
      </div>

      {/* Fuel Log History */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          Historial de Combustible
        </h3>
        {fuelLogs.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Sin registros de combustible
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {fuelLogs.slice(0, 10).map((log) => (
              <Card key={log.id} className="border-0 shadow-sm rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-900 dark:text-white">
                          {formatShortDate(log.date)}
                        </span>
                        {log.isFullTank && (
                          <Badge variant="secondary" className="text-[11px] h-3.5 px-1 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                            Lleno
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                        <span>{(log.km ?? 0).toLocaleString("es-CO")} km</span>
                        <span>•</span>
                        <span>{(log.gallons ?? 0).toFixed(2)} gal</span>
                        <span>•</span>
                        <span>{formatCurrency(log.pricePerGallon)}/gal</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold text-gray-900 dark:text-white mr-1">
                        {formatCurrency(log.amount)}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="size-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                            <MoreHorizontal className="size-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditFuelLog(log); setShowFuelLogForm(true); }}>
                            <Pencil className="size-4 mr-2 text-blue-500" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setDeleteTarget({ type: "fuel", id: log.id })} className="text-red-600">
                            <Trash2 className="size-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Maintenance Records */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          Historial de Mantenimiento
        </h3>
        {maintenanceRecords.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Sin registros de mantenimiento
          </p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {maintenanceRecords.map((record) => {
              const MIcon = maintTypeIcons[record.type] || Wrench;
              const colorClass = maintTypeColors[record.type] || maintTypeColors.other;
              const isUpcoming = record.nextDueKm && vehicle.currentKm
                ? record.nextDueKm - vehicle.currentKm <= 1000
                : false;
              const typeConfig = MAINTENANCE_TYPES.find(t => t.value === record.type);
              const kmInterval = typeConfig?.nextKmInterval || 0;
              const items = (record as MaintenanceRecord & { items?: Array<{ id: string; name: string; quantity: number; unitPrice: number; totalPrice: number }> }).items;

              return (
                <Card key={record.id} className={`border-0 shadow-sm rounded-xl ${isUpcoming ? "ring-1 ring-amber-300" : ""}`}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={`size-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                        <MIcon className="size-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-900 dark:text-white">
                            {maintTypeLabels[record.type] || record.type}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                              {formatCurrency(record.cost)}
                            </span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="size-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                  <MoreHorizontal className="size-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setEditMaintenance(record); setShowMaintenanceForm(true); }}>
                                  <Pencil className="size-4 mr-2 text-blue-500" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeleteTarget({ type: "maintenance", id: record.id })} className="text-red-600">
                                  <Trash2 className="size-4 mr-2" />
                                  Eliminar
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 truncate">
                          {record.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-400">
                            {formatShortDate(record.date)} • {(record.km ?? 0).toLocaleString("es-CO")} km
                          </span>
                          {record.nextDueKm && (
                            <Badge
                              variant="secondary"
                              className={`text-[11px] h-3.5 px-1 ${isUpcoming
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                }`}
                            >
                              Próx: {(record.nextDueKm ?? 0).toLocaleString("es-CO")} km
                              {kmInterval > 0 && <span className="font-normal ml-1">· Cada {kmInterval.toLocaleString()} km</span>}
                            </Badge>
                          )}
                        </div>
                        {/* Maintenance items expandable */}
                        {items && items.length > 0 && (
                          <div className="mt-1.5">
                            <button
                              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              onClick={() => setShowItems(prev => ({ ...prev, [record.id]: !prev[record.id] }))}
                            >
                              <ChevronRight className={`size-3 transition-transform ${showItems[record.id] ? "rotate-90" : ""}`} />
                              <span>{items.length} {items.length === 1 ? "item" : "items"}</span>
                            </button>
                            {showItems[record.id] && (
                              <div className="mt-1.5 space-y-1 pl-4 border-l-2 border-gray-100 dark:border-gray-700">
                                {items.map(item => (
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Reminders Section ──────────────────────────────────── */}
      {(() => {
        const now = new Date();
        const maintReminders = maintenanceRecords
          .filter(r => r.reminderEnabled && (r.nextDueKm || r.nextDueDate))
          .map(r => {
            const kmRemaining = r.nextDueKm ? r.nextDueKm - vehicle.currentKm : null;
            const daysUntil = r.nextDueDate ? Math.ceil((new Date(r.nextDueDate).getTime() - now.getTime()) / (1000*60*60*24)) : null;
            const isOverdue = (kmRemaining !== null && kmRemaining <= 0) || (daysUntil !== null && daysUntil <= 0);
            const isUrgent = !isOverdue && ((kmRemaining !== null && kmRemaining <= 500) || (daysUntil !== null && daysUntil <= 15));
            const typeConfig = MAINTENANCE_TYPES.find(t => t.value === r.type);
            const kmInterval = typeConfig?.nextKmInterval || 0;
            return { ...r, kmRemaining, daysUntil, isOverdue, isUrgent, kmInterval };
          })
          .filter(r => r.isOverdue || r.isUrgent || (r.kmRemaining !== null && r.kmRemaining <= 1000) || (r.daysUntil !== null && r.daysUntil <= 30));

        const docReminders = documents
          .filter(d => d.reminderEnabled)
          .map(d => {
            const daysUntilExpiry = Math.ceil((new Date(d.expiryDate).getTime() - now.getTime()) / (1000*60*60*24));
            const isExpired = daysUntilExpiry < 0;
            const isExpiringSoon = !isExpired && daysUntilExpiry <= (d.reminderDays || 30);
            return { ...d, daysUntilExpiry, isExpired, isExpiringSoon };
          })
          .filter(d => d.isExpired || d.isExpiringSoon);

        const hasReminders = maintReminders.length > 0 || docReminders.length > 0;
        if (!hasReminders) return null;

        return (
          <div className="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bell className="size-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Recordatorios</span>
            </div>
            <div className="space-y-2">
              {maintReminders.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-2 bg-white/60 dark:bg-gray-800/60 rounded-xl">
                  <AlertTriangle className={`size-4 flex-shrink-0 ${r.isOverdue ? "text-red-500" : "text-amber-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {maintTypeLabels[r.type] || r.type}
                      {r.kmInterval > 0 && <span className="text-gray-400 font-normal"> · Cada {r.kmInterval.toLocaleString()} km</span>}
                    </p>
                    <p className="text-xs text-gray-500">
                      {r.kmRemaining !== null && (
                        <span className={r.isOverdue ? "text-red-500 font-medium" : r.isUrgent ? "text-amber-600 font-medium" : ""}>
                          {r.isOverdue ? "Vencido" : `Faltan ${r.kmRemaining.toLocaleString("es-CO")} km`}
                        </span>
                      )}
                      {r.daysUntil !== null && (
                        <span className="ml-2">
                          <Clock className="size-3 inline" /> {formatShortDate(r.nextDueDate!)}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ))}
              {docReminders.map(d => (
                <div key={d.id} className="flex items-center gap-3 p-2 bg-white/60 dark:bg-gray-800/60 rounded-xl">
                  <Shield className={`size-4 flex-shrink-0 ${d.isExpired ? "text-red-500" : "text-amber-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                      {docTypeLabels[d.type] || d.type}
                    </p>
                    <p className="text-xs text-gray-500">
                      <span className={d.isExpired ? "text-red-500 font-medium" : "text-amber-600 font-medium"}>
                        {d.isExpired ? "Vencido" : `Vence en ${d.daysUntilExpiry} días`}
                      </span>
                      <span className="ml-2">
                        <Clock className="size-3 inline" /> {formatShortDate(d.expiryDate)}
                      </span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* ─── Documents Section ──────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Documentos
          </h3>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-lg text-[11px] border-violet-300 text-violet-600 px-2.5"
            onClick={() => { setEditDocument(null); setShowDocumentForm(true); }}
          >
            <Plus className="size-3 mr-0.5" />
            Documento
          </Button>
        </div>
        {documents.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">
            Sin documentos registrados
          </p>
        ) : (
          <div className="space-y-2">
            {documents.map((doc) => {
              const DocIcon = docTypeIcons[doc.type] || FileText;
              const colorClass = docTypeColors[doc.type] || docTypeColors.otro;
              const now = new Date();
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
                <Card key={doc.id} className="border-0 shadow-sm rounded-xl">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                        <DocIcon className="size-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
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
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => { setEditDocument(doc); setShowDocumentForm(true); }}>
                              <Pencil className="size-4 mr-2 text-blue-500" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setDeleteTarget({ type: "document", id: doc.id })} className="text-red-600">
                              <Trash2 className="size-4 mr-2" />
                              Eliminar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Record Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === "fuel"
                ? "Se eliminará este registro de combustible y su transacción asociada."
                : deleteTarget?.type === "document"
                ? "Se eliminará este documento y su transacción asociada."
                : "Se eliminará este registro de mantenimiento y su transacción asociada."}
              {" "}Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRecord}
              className="rounded-xl bg-red-500 hover:bg-red-600"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Forms */}
      <FuelLogForm
        open={showFuelLogForm}
        onOpenChange={setShowFuelLogForm}
        preselectedVehicleId={vehicleId}
        fuelLog={editFuelLog}
        onSuccess={() => {
          fetchData();
          fetchFuelLevel();
        }}
      />

      <MaintenanceForm
        open={showMaintenanceForm}
        onOpenChange={setShowMaintenanceForm}
        preselectedVehicleId={vehicleId}
        record={editMaintenance}
        onSuccess={fetchData}
      />

      <VehicleDocumentForm
        open={showDocumentForm}
        onOpenChange={setShowDocumentForm}
        preselectedVehicleId={vehicleId}
        document={editDocument}
        onSuccess={fetchData}
      />

      <VehicleForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        vehicle={vehicle}
        onSuccess={fetchData}
      />

      <QuickKmUpdate
        open={showKmUpdate}
        onOpenChange={setShowKmUpdate}
        vehicleId={vehicle.id}
        vehicleName={vehicle.name}
        currentKm={vehicle.currentKm}
        onSuccess={() => {
          fetchData();
          fetchFuelLevel();
        }}
      />
    </div>
  );
}
