"use client";

import { useState, useEffect } from "react";
import { useLocalQuery } from "@/lib/local/hooks/queries";
import { formatCurrency, apiFetch } from "@/lib/api";
import { VehicleCard } from "./vehicle-card";
import { VehicleForm } from "./vehicle-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Fuel, MapPin, Gauge, AlertTriangle, Wallet, CalendarClock } from "lucide-react";
import { motion } from "framer-motion";
import { VehicleIcon } from "./vehicle-icon";
import type { Vehicle } from "@/lib/types";

type VehicleWithDetails = Vehicle & {
  fuelLogs: Array<{ id: string; date: string; km: number; amount: number; pricePerGallon: number; gallons: number }>;
  maintenanceRecords: Array<{ id: string; type: string; description: string; km: number; nextDueKm?: number | null; nextDueDate?: string | null }>;
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
};

interface FuelPriceInfo {
  id: string;
  fuelType: string;
  pricePerGallon: number;
}

interface VehiclesViewProps {
  onSelectVehicle: (id: string) => void;
}

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

export function VehiclesView({ onSelectVehicle }: VehiclesViewProps) {
  const { data: vehiclesData, loading, refetch: fetchVehicles } = useLocalQuery<VehicleWithDetails>("/api/vehicles");
  const vehicles = vehiclesData as VehicleWithDetails[];
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editVehicle, setEditVehicle] = useState<VehicleWithDetails | null>(null);
  const [fuelPrices, setFuelPrices] = useState<FuelPriceInfo[]>([]);

  // Fetch fuel prices
  useEffect(() => {
    async function loadFuelPrices() {
      try {
        const prices = await apiFetch<FuelPriceInfo[]>("/api/fuel-prices");
        setFuelPrices(prices);
      } catch {
        // silently ignore
      }
    }
    loadFuelPrices();
  }, []);

  // Helper: get fuel price for a vehicle
  const getFuelPrice = (vehicle: VehicleWithDetails): number | null => {
    if (!vehicle.fuelType || vehicle.fuelType === "electric") return null;
    const match = fuelPrices.find((p) => p.fuelType === vehicle.fuelType);
    return match ? match.pricePerGallon : null;
  };

  // Compute summary stats
  const vehiclesWithTank = vehicles.filter((v) => v.tankCapacity && v.tankCapacity > 0);
  const primaryVehicle = vehiclesWithTank[0]; // Most recently created
  const hasAnomaly = vehicles.some((v) => v.anomalyDetected);
  const lowestFuel = vehiclesWithTank.reduce(
    (min, v) => (v.fuelLevel ?? 0) < min ? (v.fuelLevel ?? 0) : min,
    100
  );

  // Cost to fill for the primary vehicle (for the summary card)
  const primaryCostToFill = (() => {
    if (!primaryVehicle || !primaryVehicle.tankCapacity || (primaryVehicle.fuelLevel ?? 0) >= 100) return null;
    const gallonsNeeded = primaryVehicle.tankCapacity - (primaryVehicle.currentFuel ?? 0);
    if (gallonsNeeded <= 0) return null;
    const price = getFuelPrice(primaryVehicle);
    if (price != null && price > 0) {
      return { gallonsNeeded, costToFill: gallonsNeeded * price, pricePerGallon: price };
    }
    return null;
  })();

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="h-40 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-safe"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Mis Vehículos
        </h2>
        <p className="text-sm text-gray-500">
          {vehicles.length} vehículo{vehicles.length !== 1 ? "s" : ""} registrado{vehicles.length !== 1 ? "s" : ""}
        </p>
      </motion.div>

      {/* ── FUEL SUMMARY CARD ── */}
      {primaryVehicle && (
        <motion.div variants={itemVariants}>
          <Card
            className="border-0 shadow-lg rounded-2xl overflow-hidden cursor-pointer hover:shadow-xl transition-shadow"
            onClick={() => onSelectVehicle(primaryVehicle.id)}
          >
            {/* Gradient header with fuel info */}
            <div className={`bg-gradient-to-r ${
              lowestFuel <= 15 ? "from-red-500 to-red-600" :
              lowestFuel <= 25 ? "from-amber-500 to-orange-500" :
              "from-cyan-600 to-blue-600"
            } p-4 relative overflow-hidden`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(255,255,255,0.12),transparent)] pointer-events-none" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-3">
                  <Fuel className="size-5 text-white/80" />
                  <span className="text-sm font-semibold text-white">
                    Nivel de Combustible
                  </span>
                  {vehiclesWithTank.length > 1 && (
                    <span className="text-[10px] bg-white/20 text-white rounded-full px-2 py-0.5 ml-auto">
                      {vehiclesWithTank.length} vehículos
                    </span>
                  )}
                </div>

                {vehiclesWithTank.length === 1 ? (
                  /* Single vehicle - show detailed info */
                  <div className="space-y-2">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-3xl font-bold text-white">
                          {primaryVehicle.currentFuel?.toFixed(1) ?? "0"}
                          <span className="text-base font-normal text-white/60 ml-1">gal</span>
                        </p>
                        <p className="text-xs text-white/60 mt-0.5">
                          de {primaryVehicle.tankCapacity} gal • {Math.round(primaryVehicle.fuelLevel ?? 0)}% del tanque
                        </p>
                      </div>
                      <div className="text-right">
                        {primaryVehicle.estimatedRange && primaryVehicle.estimatedRange > 0 ? (
                          <>
                            <div className="flex items-center gap-1 justify-end">
                              <MapPin className="size-3.5 text-white/70" />
                              <span className="text-lg font-bold text-white">
                                ~{primaryVehicle.estimatedRange.toLocaleString("es-CO")}
                              </span>
                            </div>
                            <p className="text-xs text-white/60">km autonomía</p>
                          </>
                        ) : (
                          <p className="text-xs text-white/50">Sin datos de autonomía</p>
                        )}
                      </div>
                    </div>

                    {/* Fuel bar */}
                    <div className="w-full h-2 bg-white/20 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-white/80 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(primaryVehicle.fuelLevel ?? 0, 100)}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                ) : (
                  /* Multiple vehicles - compact summary */
                  <div className="space-y-2">
                    {vehiclesWithTank.map((v) => (
                      <div key={v.id} className="flex items-center gap-3">
                        <span className="text-xs text-white/80 w-20 truncate">{v.name}</span>
                        <div className="flex-1 h-2 bg-white/20 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white/80 rounded-full transition-all"
                            style={{ width: `${Math.min(v.fuelLevel ?? 0, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-white w-12 text-right">
                          {Math.round(v.fuelLevel ?? 0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Quick stats footer */}
            <CardContent className="p-3">
              <div className="flex items-center gap-4 text-xs flex-wrap">
                {primaryVehicle.avgKmPerGallon && primaryVehicle.avgKmPerGallon > 0 && (
                  <div className="flex items-center gap-1.5 text-gray-500">
                    <Gauge className="size-3.5 text-cyan-500" />
                    <span>{primaryVehicle.avgKmPerGallon} km/gal</span>
                  </div>
                )}
                {primaryCostToFill && (
                  <div className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                    <Wallet className="size-3.5" />
                    <span>Llenar: {formatCurrency(primaryCostToFill.costToFill)}</span>
                  </div>
                )}
                {primaryVehicle.daysUntilRefuel != null && primaryVehicle.daysUntilRefuel > 0 && (
                  <div className={`flex items-center gap-1.5 ${primaryVehicle.isLowFuel ? "text-red-500" : "text-cyan-600 dark:text-cyan-400"}`}>
                    <CalendarClock className="size-3.5" />
                    <span>Tanquea en ~{primaryVehicle.daysUntilRefuel}d</span>
                  </div>
                )}
                {primaryVehicle.isLowFuel && (
                  <div className="flex items-center gap-1.5 text-red-500 font-semibold">
                    <Fuel className="size-3.5" />
                    <span>¡Combustible bajo!</span>
                  </div>
                )}
                {hasAnomaly && (
                  <div className="flex items-center gap-1.5 text-red-500">
                    <AlertTriangle className="size-3.5" />
                    <span>Consumo anormal</span>
                  </div>
                )}
                <span className="text-gray-400 ml-auto">Toca para ver detalle</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Empty State */}
      {vehicles.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/30 mb-4">
                <VehicleIcon type="motorcycle" className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                Sin vehículos aún
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Agrega tu primer vehículo para empezar a controlar combustible y mantenimiento
              </p>
              <Button
                onClick={() => setShowVehicleForm(true)}
                className="rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600"
              >
                <Plus className="size-4 mr-1" />
                Agregar Vehículo
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {vehicles.map((vehicle) => (
            <motion.div key={vehicle.id} variants={itemVariants}>
              <VehicleCard
                vehicle={vehicle}
                onClick={() => onSelectVehicle(vehicle.id)}
                onKmUpdated={fetchVehicles}
                currentFuelPrice={getFuelPrice(vehicle)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* FAB - Add Vehicle */}
      {vehicles.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Button
            onClick={() => {
              setEditVehicle(null);
              setShowVehicleForm(true);
            }}
            className="size-14 rounded-full bg-gradient-to-br from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/40"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      {/* Vehicle Form */}
      <VehicleForm
        open={showVehicleForm}
        onOpenChange={(open) => {
          setShowVehicleForm(open);
          if (!open) setEditVehicle(null);
        }}
        vehicle={editVehicle}
        onSuccess={fetchVehicles}
      />
    </motion.div>
  );
}
