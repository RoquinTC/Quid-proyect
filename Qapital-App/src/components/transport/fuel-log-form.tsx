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
import { apiFetch, formatCurrency, getColombiaTodayString } from "@/lib/api";
import type { Vehicle } from "@/lib/types";
import { Loader2, Calculator } from "lucide-react";

interface FuelLogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedVehicleId?: string | null;
  onSuccess?: () => void;
}

export function FuelLogForm({ open, onOpenChange, preselectedVehicleId, onSuccess }: FuelLogFormProps) {
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId || "");
  const [date, setDate] = useState(getColombiaTodayString());
  const [km, setKm] = useState("");
  const [amount, setAmount] = useState("");
  const [pricePerGallon, setPricePerGallon] = useState("");
  const [isFullTank, setIsFullTank] = useState(true);
  const [notes, setNotes] = useState("");

  const fetchVehicles = useCallback(async () => {
    try {
      const data = await apiFetch<Vehicle[]>("/api/vehicles");
      setVehicles(data);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    }
  }, []);

  const fetchFuelPrice = useCallback(async () => {
    try {
      const data = await apiFetch<Array<{ fuelType: string; pricePerGallon: number }>>("/api/fuel-prices");
      const gasolinePrice = data.find((p) => p.fuelType === "gasoline");
      if (gasolinePrice && !pricePerGallon) {
        setPricePerGallon(gasolinePrice.pricePerGallon.toString());
      }
    } catch (error) {
      console.error("Error fetching fuel price:", error);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchVehicles();
      fetchFuelPrice();
    }
  }, [open, fetchVehicles, fetchFuelPrice]);

  useEffect(() => {
    if (preselectedVehicleId) {
      setVehicleId(preselectedVehicleId);
      const vehicle = vehicles.find((v) => v.id === preselectedVehicleId);
      if (vehicle) {
        setKm(vehicle.currentKm.toString());
      }
    }
  }, [preselectedVehicleId, vehicles]);

  // Auto-fill km when vehicle changes
  useEffect(() => {
    if (vehicleId && !preselectedVehicleId) {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      if (vehicle) {
        setKm(vehicle.currentKm.toString());
      }
    }
  }, [vehicleId, vehicles, preselectedVehicleId]);

  const gallons = amount && pricePerGallon && parseFloat(pricePerGallon) > 0
    ? Math.round((parseFloat(amount) / parseFloat(pricePerGallon)) * 100) / 100
    : 0;

  // Project next refill
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const tankCapacity = selectedVehicle?.tankCapacity;

  const handleSubmit = async () => {
    if (!vehicleId || !amount || !pricePerGallon) return;
    setLoading(true);
    try {
      await apiFetch(`/api/vehicles/${vehicleId}/fuel-logs`, {
        method: "POST",
        body: JSON.stringify({
          date,
          km: km || undefined,
          amount: parseFloat(amount),
          pricePerGallon: parseFloat(pricePerGallon),
          isFullTank,
          notes: notes || undefined,
        }),
      });

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error creating fuel log:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setVehicleId(preselectedVehicleId || "");
    setDate(getColombiaTodayString());
    setKm("");
    setAmount("");
    setPricePerGallon("");
    setIsFullTank(true);
    setNotes("");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Registrar Recarga</SheetTitle>
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

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="fuel-date">Fecha</Label>
            <Input
              id="fuel-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* KM */}
          <div className="space-y-2">
            <Label htmlFor="fuel-km">KM actual</Label>
            <Input
              id="fuel-km"
              type="number"
              placeholder="Ej: 15000"
              value={km}
              onChange={(e) => setKm(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Amount & Price per gallon */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="fuel-amount">Valor pagado</Label>
              <CurrencyInput
                id="fuel-amount"
                showPrefix
                placeholder="25000"
                value={amount}
                onChange={(v) => setAmount(v)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="fuel-price">Precio por galón</Label>
              <CurrencyInput
                id="fuel-price"
                showPrefix
                placeholder="10500"
                value={pricePerGallon}
                onChange={(v) => setPricePerGallon(v)}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Gallons calculation */}
          {gallons > 0 && (
            <div className="flex items-center gap-2 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl">
              <Calculator className="size-4 text-cyan-600" />
              <span className="text-sm text-cyan-700 dark:text-cyan-300">
                Galones calculados: <strong>{gallons.toFixed(2)} gal</strong>
              </span>
            </div>
          )}

          {/* Tank capacity info */}
          {tankCapacity && gallons > 0 && (
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>Capacidad: {tankCapacity} gal</span>
                <span>{Math.round((gallons / tankCapacity) * 100)}% del tanque</span>
              </div>
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min((gallons / tankCapacity) * 100, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Full Tank Switch */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Tanque lleno</Label>
              <p className="text-[10px] text-gray-400">
                Marca si llenaste el tanque completo
              </p>
            </div>
            <Switch checked={isFullTank} onCheckedChange={setIsFullTank} />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="fuel-notes">Notas</Label>
            <Textarea
              id="fuel-notes"
              placeholder="Notas opcionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-xl min-h-[60px]"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !vehicleId || !amount || !pricePerGallon}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            Registrar Recarga
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
