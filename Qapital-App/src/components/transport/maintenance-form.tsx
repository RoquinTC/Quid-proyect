"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, getColombiaTodayString } from "@/lib/api";
import type { Vehicle } from "@/lib/types";
import { Loader2 } from "lucide-react";

interface MaintenanceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedVehicleId?: string | null;
  onSuccess?: () => void;
}

const maintenanceTypes = [
  { value: "oil_change", label: "Cambio de aceite" },
  { value: "tire_change", label: "Cambio de llantas" },
  { value: "brake_service", label: "Servicio de frenos" },
  { value: "general", label: "Revisión general" },
  { value: "parts_replacement", label: "Cambio de repuestos" },
  { value: "other", label: "Otro" },
];

export function MaintenanceForm({ open, onOpenChange, preselectedVehicleId, onSuccess }: MaintenanceFormProps) {
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId || "");
  const [type, setType] = useState("oil_change");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [km, setKm] = useState("");
  const [date, setDate] = useState(getColombiaTodayString());
  const [nextDueKm, setNextDueKm] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);

  const fetchVehicles = useCallback(async () => {
    try {
      const data = await apiFetch<Vehicle[]>("/api/vehicles");
      setVehicles(data);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchVehicles();
    }
  }, [open, fetchVehicles]);

  useEffect(() => {
    if (preselectedVehicleId) {
      setVehicleId(preselectedVehicleId);
      const vehicle = vehicles.find((v) => v.id === preselectedVehicleId);
      if (vehicle) {
        setKm(vehicle.currentKm.toString());
      }
    }
  }, [preselectedVehicleId, vehicles]);

  useEffect(() => {
    if (vehicleId && !preselectedVehicleId) {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      if (vehicle) {
        setKm(vehicle.currentKm.toString());
      }
    }
  }, [vehicleId, vehicles, preselectedVehicleId]);

  // Auto-suggest next due km based on maintenance type
  useEffect(() => {
    if (type && km) {
      const currentKm = parseFloat(km) || 0;
      switch (type) {
        case "oil_change":
          setNextDueKm((currentKm + 5000).toString());
          break;
        case "tire_change":
          setNextDueKm((currentKm + 40000).toString());
          break;
        case "brake_service":
          setNextDueKm((currentKm + 20000).toString());
          break;
        case "general":
          setNextDueKm((currentKm + 10000).toString());
          break;
        default:
          setNextDueKm("");
      }
    }
  }, [type, km]);

  const handleSubmit = async () => {
    if (!vehicleId || !description || !cost) return;
    setLoading(true);
    try {
      await apiFetch(`/api/vehicles/${vehicleId}/maintenance`, {
        method: "POST",
        body: JSON.stringify({
          type,
          description,
          cost: parseFloat(cost),
          km: km ? parseFloat(km) : undefined,
          date,
          nextDueKm: nextDueKm ? parseFloat(nextDueKm) : undefined,
          nextDueDate: nextDueDate || undefined,
          reminderEnabled,
        }),
      });

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error creating maintenance record:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setVehicleId(preselectedVehicleId || "");
    setType("oil_change");
    setDescription("");
    setCost("");
    setKm("");
    setDate(getColombiaTodayString());
    setNextDueKm("");
    setNextDueDate("");
    setReminderEnabled(true);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Registrar Mantenimiento</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4 pb-6">
          {/* Vehicle */}
          <div className="space-y-2">
            <Label>Vehículo</Label>
            <Select value={vehicleId} onValueChange={setVehicleId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Seleccionar vehículo" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Maintenance Type */}
          <div className="space-y-2">
            <Label>Tipo de mantenimiento</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {maintenanceTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="maint-desc">Descripción</Label>
            <Textarea
              id="maint-desc"
              placeholder="Ej: Cambio de aceite sintético 10W-40"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl min-h-[60px]"
            />
          </div>

          {/* Cost & KM */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="maint-cost">Costo</Label>
              <CurrencyInput
                id="maint-cost"
                showPrefix
                placeholder="85000"
                value={cost}
                onChange={(v) => setCost(v)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maint-km">Kilometraje</Label>
              <Input
                id="maint-km"
                type="number"
                placeholder="Ej: 15000"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="maint-date">Fecha</Label>
            <Input
              id="maint-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Next Due */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Próximo mantenimiento
            </Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="maint-nextkm" className="text-[10px] text-gray-500">KM próx. cambio</Label>
                <Input
                  id="maint-nextkm"
                  type="number"
                  placeholder="Ej: 20000"
                  value={nextDueKm}
                  onChange={(e) => setNextDueKm(e.target.value)}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="maint-nextdate" className="text-[10px] text-gray-500">Fecha próx. cambio</Label>
                <Input
                  id="maint-nextdate"
                  type="date"
                  value={nextDueDate}
                  onChange={(e) => setNextDueDate(e.target.value)}
                  className="rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* Reminder Switch */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Recordatorio</Label>
              <p className="text-[10px] text-gray-400">
                Recibir aviso del próximo mantenimiento
              </p>
            </div>
            <Switch checked={reminderEnabled} onCheckedChange={setReminderEnabled} />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !vehicleId || !description || !cost}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            Registrar Mantenimiento
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
