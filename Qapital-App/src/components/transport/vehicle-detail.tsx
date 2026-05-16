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
import type { Vehicle, FuelLog, MaintenanceRecord, FuelLevelData } from "@/lib/types";
import { QuickKmUpdate } from "./quick-km-update";
import { VehicleIcon } from "./vehicle-icon";
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
  other: Wrench,
};

const maintTypeLabels: Record<string, string> = {
  oil_change: "Cambio de aceite",
  tire_change: "Cambio de llantas",
  brake_service: "Servicio de frenos",
  general: "Revisión general",
  parts_replacement: "Cambio de repuestos",
  other: "Otro",
};

const maintTypeColors: Record<string, string> = {
  oil_change: "text-amber-600 bg-amber-100 dark:bg-amber-900/30",
  tire_change: "text-gray-600 bg-gray-100 dark:bg-gray-700",
  brake_service: "text-red-600 bg-red-100 dark:bg-red-900/30",
  general: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
  parts_replacement: "text-purple-600 bg-purple-100 dark:bg-purple-900/30",
  other: "text-gray-600 bg-gray-100 dark:bg-gray-700",
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
  const [deleteTarget, setDeleteTarget] = useState<{ type: "fuel" | "maintenance"; id: string } | null>(null);
  const [fuelLevelData, setFuelLevelData] = useState<FuelLevelData | null>(null);
  const [currentFuelPrice, setCurrentFuelPrice] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const vehicleData = await apiFetch<Vehicle>(`/api/vehicles/${vehicleId}`);
      setVehicle(vehicleData);

      const [logs, records] = await Promise.all([
        apiFetch<FuelLog[]>(`/api/vehicles/${vehicleId}/fuel-logs`),
        apiFetch<MaintenanceRecord[]>(`/api/vehicles/${vehicleId}/maintenance`),
      ]);

      setFuelLogs(logs);
      setMaintenanceRecords(records);
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
      } else {
        await apiFetch(`/api/vehicles/${vehicle.id}/maintenance/${deleteTarget.id}`, { method: "DELETE" });
        toast.success("Registro de mantenimiento eliminado");
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
      <div className="p-4 space-y-3 pb-24">
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

  // Cost to fill calculation
  const costToFillData = (() => {
    if (!fuelLevelData || fuelLevelData.fuelLevel >= 100 || !vehicle.tankCapacity || !vehicle.fuelType || vehicle.fuelType === "electric") return null;
    const gallonsNeeded = vehicle.tankCapacity - fuelLevelData.currentFuel;
    if (gallonsNeeded <= 0) return null;
    if (currentFuelPrice != null && currentFuelPrice > 0) {
      const costToFill = gallonsNeeded * currentFuelPrice;
      return { gallonsNeeded, costToFill, pricePerGallon: currentFuelPrice, hasPrice: true };
    }
    return { gallonsNeeded, costToFill: 0, pricePerGallon: 0, hasPrice: false };
  })();

  return (
    <div className="p-4 space-y-4 pb-24">
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
                  <span className="text-[10px] font-bold bg-white text-gray-800 border border-gray-300 rounded px-1.5 py-0 leading-4 tracking-wider uppercase">
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
                  <span className="text-[10px] bg-white/20 backdrop-blur-sm text-white rounded-full px-2 py-0.5">
                    {fuelTypeLabels[vehicle.fuelType] || vehicle.fuelType}
                  </span>
                )}
                {vehicle.color && (
                  <span className="text-[10px] bg-white/20 backdrop-blur-sm text-white rounded-full px-2 py-0.5">
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
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-gray-500 mb-1">
                    <TrendingDown className="size-3" />
                    <span>Rendimiento</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {fuelLevelData.avgKmPerGallon > 0 ? `${fuelLevelData.avgKmPerGallon} km/gal` : "—"}
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                  <div className="flex items-center gap-1 text-gray-500 mb-1">
                    <Gauge className="size-3" />
                    <span>Autonomía</span>
                  </div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {fuelLevelData.estimatedRange > 0 ? `${fuelLevelData.estimatedRange} km` : "—"}
                  </p>
                </div>
              </div>

              {/* Cost to Fill Tank */}
              {costToFillData && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 p-3 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-xl"
                >
                  <div className="flex items-start gap-2">
                    <Wallet className="size-4 text-cyan-600 dark:text-cyan-400 flex-shrink-0 mt-0.5" />
                    <div>
                      {costToFillData.hasPrice ? (
                        <>
                          <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                            Para llenar el tanque: {formatCurrency(costToFillData.costToFill)}
                          </p>
                          <p className="text-[10px] text-cyan-600 dark:text-cyan-400 mt-0.5">
                            {costToFillData.gallonsNeeded.toFixed(1)} gal a {formatCurrency(costToFillData.pricePerGallon)}/gal
                          </p>
                        </>
                      ) : (
                        <p className="text-[11px] text-cyan-600 dark:text-cyan-400">
                          Actualiza el precio de la gasolina para ver cuánto necesitas para llenar el tanque
                        </p>
                      )}
                    </div>
                  </div>
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
                      <p className="text-[10px] text-red-600 dark:text-red-400 mt-0.5">
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
            <p className="text-[10px] text-gray-500">Combustible</p>
            <p className="text-xs font-bold text-gray-900 dark:text-white">
              {formatCurrency(totalFuelSpent)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-3 text-center">
            <Wrench className="size-4 text-amber-500 mx-auto mb-1" />
            <p className="text-[10px] text-gray-500">Mantenimiento</p>
            <p className="text-xs font-bold text-gray-900 dark:text-white">
              {formatCurrency(totalMaintenanceSpent)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm rounded-xl">
          <CardContent className="p-3 text-center">
            <TrendingDown className="size-4 text-blue-500 mx-auto mb-1" />
            <p className="text-[10px] text-gray-500">Rendimiento</p>
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
                          <Badge variant="secondary" className="text-[8px] h-3.5 px-1 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                            Lleno
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
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
                        <p className="text-[10px] text-gray-500 truncate">
                          {record.description}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-400">
                            {formatShortDate(record.date)} • {(record.km ?? 0).toLocaleString("es-CO")} km
                          </span>
                          {record.nextDueKm && (
                            <Badge
                              variant="secondary"
                              className={`text-[8px] h-3.5 px-1 ${isUpcoming
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                                }`}
                            >
                              Próx: {(record.nextDueKm ?? 0).toLocaleString("es-CO")} km
                            </Badge>
                          )}
                        </div>
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
