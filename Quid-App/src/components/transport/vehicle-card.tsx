"use client";

import { useState } from "react";
import { formatCurrency, formatDate, apiFetch } from "@/lib/api";
import { Fuel, Wrench, AlertTriangle, Gauge, MapPin, Pencil, ChevronDown, ChevronUp, Wallet, CalendarClock, Droplets } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { FuelGauge } from "./Fuel-gauge";
import { QuickKmUpdate } from "./quick-km-update";
import { VehicleIcon } from "./vehicle-icon";

interface VehicleCardProps {
  vehicle: {
    id: string;
    name: string;
    type: string;
    brand?: string | null;
    model?: string | null;
    year?: number | null;
    color?: string | null;
    tankCapacity?: number | null;
    fuelType?: string | null;
    currentKm: number;
    icon?: string | null;
    plate?: string | null;
    fuelLogs: Array<{
      id: string;
      date: string;
      km: number;
      amount: number;
      pricePerGallon: number;
      gallons: number;
    }>;
    maintenanceRecords: Array<{
      id: string;
      type: string;
      description: string;
      km: number;
      nextDueKm?: number | null;
      nextDueDate?: string | null;
    }>;
    fuelLevel?: number;
    currentFuel?: number;
    estimatedRange?: number;
    avgKmPerGallon?: number;
    anomalyDetected?: boolean;
    // Smart refuel prediction
    avgKmPerDay?: number;
    daysUntilRefuel?: number | null;
    refuelByDate?: string | null;
    gallonsToRefuel?: number;
    isLowFuel?: boolean;
    isLearning?: boolean;
    lastPricePerGallon?: number;
  };
  onClick?: () => void;
  onKmUpdated?: () => void;
  currentFuelPrice?: number | null;
}

const vehicleGradients: Record<string, string> = {
  motorcycle: "from-cyan-500 to-blue-600",
  car: "from-blue-500 to-indigo-600",
  truck: "from-indigo-500 to-purple-600",
  other: "from-slate-500 to-gray-600",
};

const vehicleTypeLabels: Record<string, string> = {
  motorcycle: "Moto",
  car: "Carro",
  truck: "Camión",
  other: "Otro",
};

const fuelTypeLabels: Record<string, string> = {
  gasoline: "Gasolina",
  diesel: "Diésel",
  electric: "Eléctrico",
};

export function VehicleCard({ vehicle, onClick, onKmUpdated, currentFuelPrice }: VehicleCardProps) {
  const [showKmUpdate, setShowKmUpdate] = useState(false);
  const [showFuelHistory, setShowFuelHistory] = useState(false);
  const gradient = vehicleGradients[vehicle.type] || vehicleGradients.other;
  const lastFuelLog = vehicle.fuelLogs?.[0];
  const recentFuelLogs = vehicle.fuelLogs?.slice(0, 5) || [];
  const nextMaintenance = vehicle.maintenanceRecords?.[0];

  const fuelLevel = vehicle.fuelLevel ?? 0;
  const currentFuel = vehicle.currentFuel ?? 0;
  const estimatedRange = vehicle.estimatedRange ?? 0;
  const avgKmPerGallon = vehicle.avgKmPerGallon ?? 0;
  const avgKmPerDay = vehicle.avgKmPerDay ?? 0;
  const daysUntilRefuel = vehicle.daysUntilRefuel ?? null;
  const refuelByDate = vehicle.refuelByDate ?? null;
  const gallonsToRefuel = vehicle.gallonsToRefuel ?? 0;
  const isLowFuel = vehicle.isLowFuel ?? false;
  const isLearning = vehicle.isLearning ?? true;

  // Determine maintenance status
  let maintenanceStatus: "ok" | "warning" | "overdue" = "ok";
  if (nextMaintenance?.nextDueKm && vehicle.currentKm) {
    const kmRemaining = nextMaintenance.nextDueKm - vehicle.currentKm;
    if (kmRemaining <= 0) maintenanceStatus = "overdue";
    else if (kmRemaining <= 500) maintenanceStatus = "warning";
  }

  const statusColors = {
    ok: "bg-emerald-500",
    warning: "bg-amber-500",
    overdue: "bg-red-500",
  };

  // Fuel level color
  const getFuelColorClass = (level: number) => {
    if (level > 50) return "text-emerald-500";
    if (level > 25) return "text-amber-500";
    return "text-red-500";
  };

  // Cost to fill calculation — prefer last logged price, fallback to fuel-prices API
  const lastPricePerGallon = vehicle.lastPricePerGallon ?? 0;
  const costToFillData = (() => {
    if (fuelLevel >= 100 || !vehicle.tankCapacity || !vehicle.fuelType || vehicle.fuelType === "electric") return null;
    const gallonsNeeded = gallonsToRefuel > 0 ? gallonsToRefuel : vehicle.tankCapacity - currentFuel;
    if (gallonsNeeded <= 0) return null;
    const effectivePrice = lastPricePerGallon > 0 ? lastPricePerGallon : (currentFuelPrice ?? 0);
    if (effectivePrice > 0) {
      const costToFill = gallonsNeeded * effectivePrice;
      return { gallonsNeeded, costToFill, pricePerGallon: effectivePrice, hasPrice: true };
    }
    return { gallonsNeeded, costToFill: 0, pricePerGallon: 0, hasPrice: false };
  })();

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
    <>
      <motion.div
        className="w-full text-left"
        whileTap={{ scale: 0.98 }}
        whileHover={{ scale: 1.01 }}
      >
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 overflow-hidden">
          {/* Header with gradient */}
          <div
            className={`bg-gradient-to-r ${isLowFuel ? "from-red-500 to-orange-500" : gradient} p-4 relative overflow-hidden cursor-pointer`}
            onClick={onClick}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.15),transparent)] pointer-events-none" />
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <VehicleIcon icon={vehicle.icon} type={vehicle.type} className="size-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{vehicle.name}</h3>
                    {vehicle.plate && (
                      <span className="text-[9px] font-bold bg-white text-gray-800 border border-gray-300 rounded px-1.5 py-0 leading-4 tracking-wider uppercase">
                        {vehicle.plate}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-white/70">
                    {vehicle.brand && vehicle.model
                      ? `${vehicle.brand} ${vehicle.model}`
                      : vehicleTypeLabels[vehicle.type] || vehicle.type}
                    {vehicle.year ? ` ${vehicle.year}` : ""}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {vehicle.fuelType && (
                  <span className="text-[9px] bg-white/20 backdrop-blur-sm text-white rounded-full px-2 py-0.5">
                    {fuelTypeLabels[vehicle.fuelType] || vehicle.fuelType}
                  </span>
                )}
                <div className={`size-2.5 rounded-full ${statusColors[maintenanceStatus]}`} title={
                  maintenanceStatus === "overdue" ? "Mantenimiento vencido" :
                    maintenanceStatus === "warning" ? "Mantenimiento próximo" : "Al día"
                } />
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-4 space-y-3">
            {/* Fuel Gauge + Stats Row */}
            {vehicle.tankCapacity && (
              <div className="flex items-center gap-4 cursor-pointer" onClick={onClick}>
                {/* Compact Fuel Gauge */}
                <div className="flex-shrink-0" style={{ width: '100px' }}>
                  <FuelGauge
                    fuelLevel={fuelLevel}
                    vehicleType={vehicle.type}
                    tankCapacity={vehicle.tankCapacity}
                    currentFuel={currentFuel}
                    showDetails={false}
                  />
                </div>

                {/* Fuel Stats */}
                <div className="flex-1 space-y-2 min-w-0">
                  {/* Current Fuel */}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Fuel className={`size-3.5 ${getFuelColorClass(fuelLevel)}`} />
                      <span className="text-xs text-gray-500">Combustible</span>
                      {isLearning && (
                        <span className="text-[8px] bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded px-1 py-0" title="Rendimiento estimado, se ajustará con más registros">
                          Aprendiendo
                        </span>
                      )}
                    </div>
                    <p className={`text-lg font-bold ${getFuelColorClass(fuelLevel)}`}>
                      {currentFuel.toFixed(1)} <span className="text-xs font-normal text-gray-400">/ {vehicle.tankCapacity} gal</span>
                    </p>
                  </div>

                  {/* Estimated Range */}
                  {estimatedRange > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 text-blue-500" />
                        <span className="text-xs text-gray-500">Autonomía</span>
                      </div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        ~{estimatedRange.toLocaleString("es-CO")} km
                      </p>
                    </div>
                  )}

                  {/* Avg Performance */}
                  {avgKmPerGallon > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5">
                        <Gauge className="size-3.5 text-cyan-500" />
                        <span className="text-xs text-gray-500">Rendimiento</span>
                      </div>
                      <p className="text-sm font-bold text-gray-900 dark:text-white">
                        {avgKmPerGallon} km/gal
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Smart Refuel Prediction Card ── */}
            {costToFillData && (
              <div className={`p-2.5 rounded-xl border ${
                isLowFuel
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  : "bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800"
              }`}>
                {/* Top row: Gallons needed + Cost */}
                <div className="flex items-center gap-2">
                  <Droplets className={`size-4 flex-shrink-0 ${isLowFuel ? "text-red-500" : "text-cyan-600 dark:text-cyan-400"}`} />
                  <div className="text-[11px] flex-1">
                    {costToFillData.hasPrice ? (
                      <span className={`font-semibold ${isLowFuel ? "text-red-700 dark:text-red-300" : "text-cyan-700 dark:text-cyan-300"}`}>
                        Para llenar: {formatCurrency(costToFillData.costToFill)}
                        <span className={`font-normal ${isLowFuel ? "text-red-500 dark:text-red-400" : "text-cyan-600 dark:text-cyan-400"}`}>
                          {" "}({costToFillData.gallonsNeeded.toFixed(1)} gal × {formatCurrency(costToFillData.pricePerGallon)}/gal)
                        </span>
                      </span>
                    ) : (
                      <span className={isLowFuel ? "text-red-600 dark:text-red-400" : "text-cyan-600 dark:text-cyan-400"}>
                        {costToFillData.gallonsNeeded.toFixed(1)} gal para llenar
                        <span className="text-[9px] block opacity-70">Configura el precio de la gasolina para ver el costo</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Bottom row: Days until refuel prediction */}
                {daysUntilRefuel != null && refuelDateText && (
                  <div className={`flex items-center gap-2 mt-1.5 pt-1.5 border-t ${
                    isLowFuel ? "border-red-200 dark:border-red-800" : "border-cyan-200 dark:border-cyan-800"
                  }`}>
                    <CalendarClock className={`size-3.5 flex-shrink-0 ${isLowFuel ? "text-red-500" : "text-cyan-600 dark:text-cyan-400"}`} />
                    <span className={`text-[11px] font-medium ${isLowFuel ? "text-red-700 dark:text-red-300" : "text-cyan-700 dark:text-cyan-300"}`}>
                      {daysUntilRefuel <= 1
                        ? "¡Tanquea pronto!"
                        : `Tanquea en ~${daysUntilRefuel} días`}
                    </span>
                    <span className={`text-[9px] ${isLowFuel ? "text-red-500 dark:text-red-400" : "text-cyan-500 dark:text-cyan-400"}`}>
                      {refuelDateText}
                    </span>
                    {avgKmPerDay > 0 && (
                      <span className={`text-[8px] ml-auto ${isLowFuel ? "text-red-400 dark:text-red-500" : "text-cyan-400 dark:text-cyan-500"}`}>
                        ~{avgKmPerDay.toFixed(0)} km/día
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Anomaly Warning */}
            {vehicle.anomalyDetected && (
              <div className="flex items-center gap-2 p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                <AlertTriangle className="size-4 text-red-500 flex-shrink-0" />
                <p className="text-[10px] text-red-600 dark:text-red-400">
                  Consumo anormal detectado — posible fuga o problema mecánico
                </p>
              </div>
            )}

            {/* KM Display with update button */}
            <div
              className="flex items-center gap-2 group cursor-pointer rounded-lg px-1 py-1.5 -mx-1 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setShowKmUpdate(true);
              }}
            >
              <Gauge className="size-4 text-gray-400" />
              <span className="text-xs text-gray-500">Kilometraje</span>
              <span className="text-sm font-bold text-gray-900 dark:text-white ml-auto">
                {(vehicle.currentKm ?? 0).toLocaleString("es-CO")} km
              </span>
              <Pencil className="size-3 text-gray-300 group-hover:text-cyan-500 transition-colors" />
            </div>

            {/* Last Fuel Log */}
            {lastFuelLog && (
              <div className="flex items-center gap-2 text-gray-500" onClick={onClick}>
                <Fuel className="size-3.5 text-cyan-500" />
                <span className="text-[11px]">
                  Última recarga: {formatDate(lastFuelLog.date)} • {formatCurrency(lastFuelLog.amount)}
                </span>
              </div>
            )}

            {/* Recent Fuel History (collapsible) */}
            {recentFuelLogs.length > 1 && (
              <div>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowFuelHistory(!showFuelHistory); }}
                  className="flex items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 font-medium transition-colors"
                >
                  {showFuelHistory ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  {showFuelHistory ? "Ocultar historial" : `Ver más (${recentFuelLogs.length - 1} recargas recientes)`}
                </button>
                <AnimatePresence>
                  {showFuelHistory && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-2 space-y-1.5">
                        {recentFuelLogs.slice(1).map((log) => (
                          <div key={log.id} className="flex items-center gap-2 text-gray-500 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg px-1 py-1" onClick={onClick}>
                            <Fuel className="size-3 text-gray-400" />
                            <span className="text-[10px]">
                              {formatDate(log.date)} • {formatCurrency(log.amount)} • {log.gallons.toFixed(2)} gal
                            </span>
                          </div>
                        ))}
                        <button
                          onClick={onClick}
                          className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline pl-5"
                        >
                          Ver todo el historial →
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Next Maintenance */}
            {nextMaintenance?.nextDueKm && (
              <div className="flex items-center gap-2 text-gray-500" onClick={onClick}>
                <Wrench className={`size-3.5 ${maintenanceStatus === "overdue" ? "text-red-500" : maintenanceStatus === "warning" ? "text-amber-500" : "text-emerald-500"}`} />
                <span className="text-[11px]">
                  Próx. mantenimiento: {(nextMaintenance.nextDueKm ?? 0).toLocaleString("es-CO")} km
                </span>
                {maintenanceStatus !== "ok" && (
                  <AlertTriangle className={`size-3.5 ml-auto ${maintenanceStatus === "overdue" ? "text-red-500" : "text-amber-500"}`} />
                )}
              </div>
            )}

            {/* Tank capacity badge */}
            {vehicle.tankCapacity && (
              <div className="flex items-center gap-1 pt-1" onClick={onClick}>
                <span className="text-[9px] bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full px-2 py-0.5">
                  Tanque: {vehicle.tankCapacity} gal
                </span>
              </div>
            )}
          </div>
        </div>
      </motion.div>

      {/* Quick KM Update Sheet */}
      <QuickKmUpdate
        open={showKmUpdate}
        onOpenChange={setShowKmUpdate}
        vehicleId={vehicle.id}
        vehicleName={vehicle.name}
        currentKm={vehicle.currentKm}
        onSuccess={onKmUpdated}
      />
    </>
  );
}
