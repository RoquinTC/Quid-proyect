"use client";

import { useState } from "react";
import { formatCurrency, formatDate, apiFetch } from "@/lib/api";
import { Bike, Car, Truck, HelpCircle, Fuel, Wrench, AlertTriangle, Gauge, MapPin, Pencil } from "lucide-react";
import { motion } from "framer-motion";
import { FuelGauge } from "./Fuel-gauge";
import { QuickKmUpdate } from "./quick-km-update";

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
  };
  onClick?: () => void;
  onKmUpdated?: () => void;
}

const vehicleIcons: Record<string, typeof Car> = {
  motorcycle: Bike,
  car: Car,
  truck: Truck,
  other: HelpCircle,
};

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

export function VehicleCard({ vehicle, onClick, onKmUpdated }: VehicleCardProps) {
  const [showKmUpdate, setShowKmUpdate] = useState(false);
  const Icon = vehicleIcons[vehicle.type] || Car;
  const gradient = vehicleGradients[vehicle.type] || vehicleGradients.other;
  const lastFuelLog = vehicle.fuelLogs?.[0];
  const nextMaintenance = vehicle.maintenanceRecords?.[0];

  const fuelLevel = vehicle.fuelLevel ?? 0;
  const currentFuel = vehicle.currentFuel ?? 0;
  const estimatedRange = vehicle.estimatedRange ?? 0;
  const avgKmPerGallon = vehicle.avgKmPerGallon ?? 0;

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
            className={`bg-gradient-to-r ${gradient} p-4 relative overflow-hidden cursor-pointer`}
            onClick={onClick}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(255,255,255,0.15),transparent)] pointer-events-none" />
            <div className="flex items-center justify-between relative z-10">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <Icon className="size-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{vehicle.name}</h3>
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
                {vehicle.currentKm.toLocaleString("es-CO")} km
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

            {/* Next Maintenance */}
            {nextMaintenance?.nextDueKm && (
              <div className="flex items-center gap-2 text-gray-500" onClick={onClick}>
                <Wrench className={`size-3.5 ${maintenanceStatus === "overdue" ? "text-red-500" : maintenanceStatus === "warning" ? "text-amber-500" : "text-emerald-500"}`} />
                <span className="text-[11px]">
                  Próx. mantenimiento: {nextMaintenance.nextDueKm.toLocaleString("es-CO")} km
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
