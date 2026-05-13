"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "@/lib/api";
import { VehicleCard } from "./vehicle-card";
import { VehicleForm } from "./vehicle-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Bike } from "lucide-react";
import { motion } from "framer-motion";
import type { Vehicle } from "@/lib/types";

type VehicleWithDetails = Vehicle & {
  fuelLogs: Array<{ id: string; date: string; km: number; amount: number; pricePerGallon: number; gallons: number }>;
  maintenanceRecords: Array<{ id: string; type: string; description: string; km: number; nextDueKm?: number | null; nextDueDate?: string | null }>;
};

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
  const [vehicles, setVehicles] = useState<VehicleWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editVehicle, setEditVehicle] = useState<VehicleWithDetails | null>(null);

  const fetchVehicles = useCallback(async () => {
    try {
      const data = await apiFetch<VehicleWithDetails[]>("/api/vehicles");
      setVehicles(data);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
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
      className="p-4 space-y-4 pb-24"
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

      {/* Empty State */}
      {vehicles.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-500 shadow-lg shadow-cyan-500/30 mb-4">
                <Bike className="size-7 text-white" />
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
