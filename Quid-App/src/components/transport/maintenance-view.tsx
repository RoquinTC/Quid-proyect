"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency, formatShortDate, formatDate } from "@/lib/api";
import { MaintenanceForm } from "./maintenance-form";
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
import {
  Plus,
  Wrench,
  Droplets,
  CircleDot,
  ShieldAlert,
  Settings,
  Package,
  HelpCircle,
  AlertTriangle,
  Bell,
  Clock,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { motion } from "framer-motion";
import type { Vehicle, MaintenanceRecord } from "@/lib/types";
import { toast } from "sonner";

type MaintenanceRecordWithVehicle = MaintenanceRecord & { vehicleId: string };

interface MaintenanceViewProps {
  onSelectVehicle: (id: string) => void;
}

const maintTypeIcons: Record<string, typeof Wrench> = {
  oil_change: Droplets,
  tire_change: CircleDot,
  brake_service: ShieldAlert,
  general: Settings,
  parts_replacement: Package,
  other: HelpCircle,
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

export function MaintenanceView({ onSelectVehicle }: MaintenanceViewProps) {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [records, setRecords] = useState<MaintenanceRecordWithVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterVehicle, setFilterVehicle] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [showForm, setShowForm] = useState(false);
  const [editRecord, setEditRecord] = useState<MaintenanceRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; vehicleId: string } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const vehiclesData = await apiFetch<Vehicle[]>("/api/vehicles");
      setVehicles(vehiclesData);

      const allRecords: MaintenanceRecordWithVehicle[] = [];
      for (const v of vehiclesData) {
        try {
          const recs = await apiFetch<MaintenanceRecord[]>(`/api/vehicles/${v.id}/maintenance`);
          allRecords.push(...recs.map((r) => ({ ...r, vehicleId: v.id })));
        } catch {
          // vehicle may not have records
        }
      }
      allRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecords(allRecords);
    } catch (error) {
      console.error("Error fetching maintenance data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRecords = records.filter((r) => {
    if (filterVehicle !== "all" && r.vehicleId !== filterVehicle) return false;
    if (filterType !== "all" && r.type !== filterType) return false;
    return true;
  });

  // Upcoming maintenance reminders
  const now = new Date();
  const upcoming = records.filter((r) => {
    if (!r.reminderEnabled) return false;
    if (r.nextDueKm) {
      const vehicle = vehicles.find((v) => v.id === r.vehicleId);
      if (vehicle && r.nextDueKm - vehicle.currentKm <= 1000) return true;
    }
    if (r.nextDueDate) {
      const dueDate = new Date(r.nextDueDate);
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysUntilDue <= 30) return true;
    }
    return false;
  });

  const getVehicleName = (vehicleId: string) => {
    const v = vehicles.find((v) => v.id === vehicleId);
    return v?.name || "Vehículo";
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await apiFetch(`/api/vehicles/${deleteTarget.vehicleId}/maintenance/${deleteTarget.id}`, { method: "DELETE" });
      toast.success("Registro eliminado");
      fetchData();
    } catch (error) {
      console.error("Error deleting maintenance record:", error);
      toast.error("Error al eliminar");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
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
      className="p-4 space-y-4 pb-24"
    >
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Mantenimiento
        </h2>
        <p className="text-sm text-gray-500">
          Historial y próximos mantenimientos
        </p>
      </motion.div>

      {/* Upcoming Reminders */}
      {upcoming.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Bell className="size-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Próximos mantenimientos
                </span>
              </div>
              <div className="space-y-2">
                {upcoming.map((r) => {
                  const vehicle = vehicles.find((v) => v.id === r.vehicleId);
                  const kmRemaining = r.nextDueKm && vehicle ? r.nextDueKm - vehicle.currentKm : null;
                  const isOverdue = kmRemaining !== null && kmRemaining <= 0;

                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 p-2 bg-white/60 dark:bg-gray-800/60 rounded-xl"
                    >
                      <AlertTriangle className={`size-4 flex-shrink-0 ${isOverdue ? "text-red-500" : "text-amber-500"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                          {getVehicleName(r.vehicleId)} • {maintTypeLabels[r.type] || r.type}
                        </p>
                        <p className="text-[10px] text-gray-500">
                          {kmRemaining !== null && (
                            <span className={isOverdue ? "text-red-500 font-medium" : ""}>
                              {isOverdue ? "Vencido" : `Faltan ${kmRemaining.toLocaleString("es-CO")} km`}
                            </span>
                          )}
                          {r.nextDueDate && (
                            <span className="ml-2">
                              <Clock className="size-3 inline" /> {formatShortDate(r.nextDueDate)}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Filters */}
      {vehicles.length > 0 && (
        <motion.div variants={itemVariants} className="flex gap-2">
          {vehicles.length > 1 && (
            <Select value={filterVehicle} onValueChange={setFilterVehicle}>
              <SelectTrigger className="rounded-xl flex-1">
                <SelectValue placeholder="Vehículo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="rounded-xl flex-1">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {Object.entries(maintTypeLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </motion.div>
      )}

      {/* Maintenance Records */}
      {filteredRecords.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20">
            <CardContent className="p-6 text-center">
              <Wrench className="size-8 text-blue-400 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {vehicles.length === 0
                  ? "Agrega un vehículo primero"
                  : "No hay registros de mantenimiento"}
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredRecords.map((record) => {
            const Icon = maintTypeIcons[record.type] || Wrench;
            const colorClass = maintTypeColors[record.type] || maintTypeColors.other;

            return (
              <motion.div key={record.id} variants={itemVariants}>
                <Card className="border-0 shadow-sm rounded-xl">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className={`size-9 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                        <Icon className="size-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {getVehicleName(record.vehicleId)}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                            <span className="text-sm font-bold text-gray-900 dark:text-white">
                              {formatCurrency(record.cost)}
                            </span>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="size-6 rounded-lg flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                  <MoreHorizontal className="size-3.5" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => { setEditRecord(record); setShowForm(true); }}>
                                  <Pencil className="size-4 mr-2 text-blue-500" />
                                  Editar
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setDeleteTarget({ id: record.id, vehicleId: record.vehicleId })} className="text-red-600">
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
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-gray-400">
                            {formatShortDate(record.date)}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {(record.km ?? 0).toLocaleString("es-CO")} km
                          </span>
                          {record.nextDueKm && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              Próx: {(record.nextDueKm ?? 0).toLocaleString("es-CO")} km
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* FAB - Add Maintenance */}
      {vehicles.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Button
            onClick={() => { setEditRecord(null); setShowForm(true); }}
            className="size-14 rounded-full bg-gradient-to-br from-cyan-600 to-blue-600 shadow-lg shadow-cyan-500/30 hover:shadow-xl hover:shadow-cyan-500/40"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      {/* Maintenance Form */}
      <MaintenanceForm
        open={showForm}
        onOpenChange={setShowForm}
        preselectedVehicleId={editRecord ? records.find(r => r.id === editRecord.id)?.vehicleId : undefined}
        record={editRecord}
        onSuccess={fetchData}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar este registro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará este registro de mantenimiento y su transacción asociada. Esta acción no se puede deshacer.
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
