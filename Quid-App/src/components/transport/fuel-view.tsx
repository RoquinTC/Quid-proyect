"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency, formatShortDate } from "@/lib/api";
import { useLocalQuery } from "@/lib/local/hooks/queries";
import { FuelPriceWidget } from "./fuel-price-widget";
import { FuelLogForm } from "./fuel-log-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Plus, Fuel, TrendingDown, BarChart3, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { motion } from "framer-motion";
import type { Vehicle, FuelLog } from "@/lib/types";
import { toast } from "sonner";

type FuelLogWithVehicle = FuelLog & { vehicleId: string };

interface FuelViewProps {
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

export function FuelView({ onSelectVehicle }: FuelViewProps) {
  // Vehicles via useLocalQuery for reactivity
  const { data: vehiclesData, loading: vehiclesLoading } = useLocalQuery<Vehicle>("/api/vehicles");
  const vehicles = vehiclesData as Vehicle[] || [];

  const [fuelLogs, setFuelLogs] = useState<FuelLogWithVehicle[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [filterVehicle, setFilterVehicle] = useState<string>("all");
  const [showFuelLogForm, setShowFuelLogForm] = useState(false);
  const [editFuelLog, setEditFuelLog] = useState<FuelLog | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; vehicleId: string } | null>(null);

  const fetchFuelLogs = useCallback(async () => {
    if (vehicles.length === 0) {
      setFuelLogs([]);
      setLoadingLogs(false);
      return;
    }
    setLoadingLogs(true);
    try {
      const allLogs: FuelLogWithVehicle[] = [];
      for (const v of vehicles) {
        try {
          const logs = await apiFetch<FuelLog[]>(`/api/vehicles/${v.id}/fuel-logs`);
          allLogs.push(...logs.map((l) => ({ ...l, vehicleId: v.id })));
        } catch {
          // vehicle may not have logs
        }
      }
      allLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setFuelLogs(allLogs);
    } catch (error) {
      console.error("Error fetching fuel data:", error);
    } finally {
      setLoadingLogs(false);
    }
  }, [vehicles]);

  useEffect(() => {
    fetchFuelLogs();
  }, [fetchFuelLogs]);

  const loading = vehiclesLoading || loadingLogs;

  const filteredLogs = filterVehicle === "all"
    ? fuelLogs
    : fuelLogs.filter((l) => l.vehicleId === filterVehicle);

  // Stats
  const now = new Date();
  const thisMonth = fuelLogs.filter((l) => {
    const d = new Date(l.date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const totalSpentThisMonth = thisMonth.reduce((s, l) => s + l.amount, 0);

  // Average km/gallon across all logs with enough data
  const logsWithKm = fuelLogs.filter((l) => l.gallons > 0);
  let avgKmPerGallon = 0;
  if (logsWithKm.length >= 2) {
    const oldest = logsWithKm[logsWithKm.length - 1];
    const newest = logsWithKm[0];
    const totalKm = newest.km - oldest.km;
    const totalGallons = logsWithKm.slice(0, -1).reduce((s, l) => s + l.gallons, 0);
    if (totalGallons > 0 && totalKm > 0) {
      avgKmPerGallon = Math.round(totalKm / totalGallons);
    }
  }

  const getVehicleName = (vehicleId: string) => {
    const v = vehicles.find((v) => v.id === vehicleId);
    return v?.name || "Vehículo";
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/vehicles/${deleteTarget.vehicleId}/fuel-logs/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Registro eliminado");
      fetchFuelLogs();
    } catch (error) {
      console.error("Error deleting fuel log:", error);
      toast.error("Error al eliminar");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
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
          Combustible
        </h2>
        <p className="text-sm text-gray-500">
          Historial de recargas y consumo
        </p>
      </motion.div>

      {/* Fuel Price Widget */}
      <motion.div variants={itemVariants}>
        <FuelPriceWidget />
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-3">
        <Card className="border-0 shadow-md rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="size-4 text-cyan-500" />
              <span className="text-[10px] text-gray-500">Gasto este mes</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCurrency(totalSpentThisMonth)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="size-4 text-blue-500" />
              <span className="text-[10px] text-gray-500">Prom. km/gal</span>
            </div>
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {avgKmPerGallon > 0 ? `${avgKmPerGallon}` : "—"}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filter */}
      {vehicles.length > 1 && (
        <motion.div variants={itemVariants}>
          <Select value={filterVehicle} onValueChange={setFilterVehicle}>
            <SelectTrigger className="rounded-xl">
              <SelectValue placeholder="Filtrar por vehículo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los vehículos</SelectItem>
              {vehicles.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>
      )}

      {/* Fuel Logs List */}
      {filteredLogs.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20">
            <CardContent className="p-6 text-center">
              <Fuel className="size-8 text-cyan-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {vehicles.length === 0
                  ? "Agrega un vehículo primero"
                  : "No hay registros de combustible"}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredLogs.map((log) => (
            <motion.div key={log.id} variants={itemVariants}>
              <Card className="border-0 shadow-sm rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {getVehicleName(log.vehicleId)}
                        </span>
                        {log.isFullTank && (
                          <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300">
                            Tanque lleno
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-gray-500">
                        <span>{formatShortDate(log.date)}</span>
                        <span>{(log.km ?? 0).toLocaleString("es-CO")} km</span>
                        <span>{(log.gallons ?? 0).toFixed(2)} gal</span>
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
                          <DropdownMenuItem onClick={() => setDeleteTarget({ id: log.id, vehicleId: log.vehicleId })} className="text-red-600">
                            <Trash2 className="size-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* FAB - Add Fuel Log */}
      {vehicles.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Button
            onClick={() => { setEditFuelLog(null); setShowFuelLogForm(true); }}
            className="size-14 rounded-full bg-gradient-to-br from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/40"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      {/* Fuel Log Form */}
      <FuelLogForm
        open={showFuelLogForm}
        onOpenChange={setShowFuelLogForm}
        preselectedVehicleId={editFuelLog ? fuelLogs.find(l => l.id === editFuelLog.id)?.vehicleId : undefined}
        fuelLog={editFuelLog}
        onSuccess={fetchFuelLogs}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará este registro de combustible y su transacción asociada. Esta acción no se puede deshacer.
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
    </motion.div>
  );
}
