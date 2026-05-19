"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import type { Vehicle, FuelLog, PaymentMethodType } from "@/lib/types/transport";
import { PaymentMethodSelector } from "@/components/transport/payment-method-selector";
import { Loader2, Calculator, Fuel, Gauge, TrendingUp, AlertTriangle, MapPin } from "lucide-react";
import { toast } from "sonner";

interface FuelLogFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedVehicleId?: string | null;
  fuelLog?: FuelLog | null;
  currentFuelLevel?: number;
  currentFuelGallons?: number;
  tankCapacity?: number | null;
  estimatedRange?: number;
  avgKmPerGallon?: number;
  onSuccess?: () => void;
}

export function FuelLogForm({
  open,
  onOpenChange,
  preselectedVehicleId,
  fuelLog,
  currentFuelLevel,
  currentFuelGallons,
  tankCapacity,
  estimatedRange,
  avgKmPerGallon,
  onSuccess,
}: FuelLogFormProps) {
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId || "");
  const [date, setDate] = useState(getColombiaTodayString());
  const [km, setKm] = useState("");
  const [amount, setAmount] = useState("");
  const [pricePerGallon, setPricePerGallon] = useState("");
  const [isFullTank, setIsFullTank] = useState(true);
  const [station, setStation] = useState("");
  const [notes, setNotes] = useState("");

  // ── Finance integration state ──
  const [paymentData, setPaymentData] = useState<{
    paymentType: PaymentMethodType;
    accountId: string | null;
    subAccountId: string | null;
    debtId: string | null;
    installmentCount: number | null;
  }>({
    paymentType: "account",
    accountId: null,
    subAccountId: null,
    debtId: null,
    installmentCount: null,
  });

  const isEditing = !!fuelLog;

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
      if (!isEditing) {
        fetchFuelPrice();
      }
    }
  }, [open, fetchVehicles, fetchFuelPrice, isEditing]);

  // Pre-fill form when editing
  useEffect(() => {
    if (open && fuelLog) {
      setVehicleId(preselectedVehicleId || "");
      setDate(fuelLog.date ? fuelLog.date.split("T")[0] : getColombiaTodayString());
      setKm(fuelLog.km?.toString() || "");
      setAmount(fuelLog.amount?.toString() || "");
      setPricePerGallon(fuelLog.pricePerGallon?.toString() || "");
      setIsFullTank(fuelLog.isFullTank ?? true);
      setStation(fuelLog.station || "");
      setNotes(fuelLog.notes || "");
      // Pre-fill payment data from existing record
      setPaymentData({
        paymentType: fuelLog.debtId ? "credit_card" : "account",
        accountId: fuelLog.accountId || null,
        subAccountId: fuelLog.subAccountId || null,
        debtId: fuelLog.debtId || null,
        installmentCount: fuelLog.installmentCount || null,
      });
    }
  }, [open, fuelLog, preselectedVehicleId]);

  // Auto-select vehicle if only one exists and no preselection
  useEffect(() => {
    if (!preselectedVehicleId && !isEditing && vehicles.length === 1 && !vehicleId) {
      setVehicleId(vehicles[0].id);
      setKm(vehicles[0].currentKm.toString());
    }
  }, [vehicles, preselectedVehicleId, vehicleId, isEditing]);

  useEffect(() => {
    if (preselectedVehicleId && !isEditing) {
      setVehicleId(preselectedVehicleId);
      const vehicle = vehicles.find((v) => v.id === preselectedVehicleId);
      if (vehicle) {
        setKm(vehicle.currentKm.toString());
      }
    }
  }, [preselectedVehicleId, vehicles, isEditing]);

  // Auto-fill km when vehicle changes (create mode only)
  useEffect(() => {
    if (vehicleId && !preselectedVehicleId && !isEditing) {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      if (vehicle) {
        setKm(vehicle.currentKm.toString());
      }
    }
  }, [vehicleId, vehicles, preselectedVehicleId, isEditing]);

  const gallons = amount && pricePerGallon && parseFloat(pricePerGallon) > 0
    ? Math.round((parseFloat(amount) / parseFloat(pricePerGallon)) * 100) / 100
    : 0;

  // Project next refill
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);
  const vehicleTankCapacity = selectedVehicle?.tankCapacity ?? tankCapacity ?? 0;

  // ─── Fuel level projection ──────────────────────────────────────
  const fuelProjection = useMemo(() => {
    if (isEditing) return null;
    if (!vehicleTankCapacity || vehicleTankCapacity <= 0) return null;

    const currentFuelGal = currentFuelGallons ?? 0;
    const currentLvl = currentFuelLevel ?? 0;

    // Projected fuel after this refill
    let projectedFuel = currentFuelGal + gallons;
    let willOverflow = projectedFuel > vehicleTankCapacity;
    projectedFuel = Math.min(projectedFuel, vehicleTankCapacity);

    const projectedLevel = (projectedFuel / vehicleTankCapacity) * 100;
    const projectedRange = avgKmPerGallon && avgKmPerGallon > 0
      ? Math.round(projectedFuel * avgKmPerGallon)
      : 0;

    return {
      currentFuelGal,
      currentLvl,
      projectedFuel,
      projectedLevel,
      projectedRange,
      willOverflow,
      tankCapacity: vehicleTankCapacity,
    };
  }, [isEditing, vehicleTankCapacity, currentFuelGallons, currentFuelLevel, gallons, avgKmPerGallon]);

  const getFuelColor = (level: number) => {
    if (level > 50) return "bg-emerald-500";
    if (level > 25) return "bg-amber-500";
    return "bg-red-500";
  };
  const getFuelTextColor = (level: number) => {
    if (level > 50) return "text-emerald-500";
    if (level > 25) return "text-amber-500";
    return "text-red-500";
  };

  const handleSubmit = async () => {
    if (!vehicleId || !amount || !pricePerGallon) return;
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        date,
        km: km !== "" && km !== undefined ? parseFloat(km) : undefined,
        amount: parseFloat(amount),
        pricePerGallon: parseFloat(pricePerGallon),
        isFullTank,
        station: station || null,
        notes: notes || undefined,
        // ── Finance integration ──
        paymentType: paymentData.paymentType,
        accountId: paymentData.accountId,
        subAccountId: paymentData.subAccountId,
        debtId: paymentData.debtId,
        installmentCount: paymentData.installmentCount,
      };

      if (isEditing && fuelLog) {
        await apiFetch(`/api/vehicles/${vehicleId}/fuel-logs/${fuelLog.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });

        toast.success("Recarga actualizada", {
          description: "Los cambios se guardaron correctamente",
        });
      } else {
        await apiFetch(`/api/vehicles/${vehicleId}/fuel-logs`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        toast.success("Recarga registrada", {
          description: "El registro de combustible se guardó correctamente",
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving fuel log:", error);
      toast.error(isEditing ? "Error al actualizar" : "Error al registrar", {
        description: "No se pudo guardar el registro de combustible. Intenta de nuevo.",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!isEditing) {
      setVehicleId(preselectedVehicleId || "");
      setDate(getColombiaTodayString());
      setKm("");
      setAmount("");
      setPricePerGallon("");
      setIsFullTank(true);
      setStation("");
      setNotes("");
      setPaymentData({
        paymentType: "account",
        accountId: null,
        subAccountId: null,
        debtId: null,
        installmentCount: null,
      });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Editar Recarga" : "Registrar Recarga"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4 pb-6">
          {/* ─── Current Fuel Estimation (NEW log only) ──────────── */}
          {!isEditing && fuelProjection && fuelProjection.currentLvl > 0 && (
            <div className="rounded-xl bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 border border-cyan-100 dark:border-cyan-900/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Fuel className="size-3.5 text-cyan-600" />
                <span className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
                  Combustible actual (estimado)
                </span>
              </div>

              <div className="flex items-center gap-3">
                {/* Fuel bar */}
                <div className="flex-1">
                  <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-1">
                    <div
                      className={`h-full rounded-full ${getFuelColor(fuelProjection.currentLvl)} transition-all`}
                      style={{ width: `${Math.min(fuelProjection.currentLvl, 100)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-gray-400">
                    <span>0 gal</span>
                    <span>{fuelProjection.tankCapacity} gal</span>
                  </div>
                </div>
                <div className="text-right min-w-[56px]">
                  <span className={`text-sm font-bold ${getFuelTextColor(fuelProjection.currentLvl)}`}>
                    {Math.round(fuelProjection.currentLvl)}%
                  </span>
                  <p className="text-[9px] text-gray-400">
                    {fuelProjection.currentFuelGal.toFixed(1)} gal
                  </p>
                </div>
              </div>

              {estimatedRange && estimatedRange > 0 && (
                <div className="flex items-center gap-1 mt-1.5">
                  <Gauge className="size-3 text-cyan-500" />
                  <span className="text-[10px] text-cyan-600 dark:text-cyan-400">
                    Autonomía: ~{estimatedRange} km
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Vehicle */}
          <div className="space-y-2">
            <Label>Vehículo</Label>
            {vehicles.length === 1 || isEditing ? (
              <div className="h-10 px-3 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
                <Fuel className="size-4 text-cyan-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {selectedVehicle?.name || vehicles[0]?.name || "Vehículo"}
                </span>
                {vehicleTankCapacity > 0 && (
                  <span className="text-[10px] text-gray-400 ml-auto">Tanque: {vehicleTankCapacity} gal</span>
                )}
              </div>
            ) : (
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
            )}
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

          {/* ─── Projected Fuel Level After Refill (NEW log only) ── */}
          {!isEditing && fuelProjection && gallons > 0 && (
            <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-cyan-50 dark:from-emerald-900/20 dark:to-cyan-900/20 border border-emerald-100 dark:border-emerald-900/30 p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="size-3.5 text-emerald-600" />
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  Nivel proyectado después de la recarga
                </span>
              </div>

              {/* Before → After comparison */}
              <div className="flex items-center gap-2 mb-2">
                <div className="flex-1">
                  <p className="text-[9px] text-gray-400 mb-0.5">Antes</p>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getFuelColor(fuelProjection.currentLvl)} transition-all`}
                      style={{ width: `${Math.min(fuelProjection.currentLvl, 100)}%` }}
                    />
                  </div>
                </div>
                <span className="text-[10px] text-gray-400">→</span>
                <div className="flex-1">
                  <p className="text-[9px] text-gray-400 mb-0.5">Después</p>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getFuelColor(fuelProjection.projectedLevel)} transition-all`}
                      style={{ width: `${Math.min(fuelProjection.projectedLevel, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className={`text-sm font-bold ${getFuelTextColor(fuelProjection.projectedLevel)}`}>
                    {Math.round(fuelProjection.projectedLevel)}%
                  </span>
                  <span className="text-[10px] text-gray-400">
                    ({fuelProjection.projectedFuel.toFixed(1)} gal)
                  </span>
                </div>
                {fuelProjection.projectedRange > 0 && (
                  <div className="flex items-center gap-1">
                    <Gauge className="size-3 text-emerald-500" />
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
                      ~{fuelProjection.projectedRange} km
                    </span>
                  </div>
                )}
              </div>

              {/* Overflow warning */}
              {fuelProjection.willOverflow && (
                <div className="flex items-center gap-1.5 mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                  <AlertTriangle className="size-3 text-amber-500 flex-shrink-0" />
                  <span className="text-[10px] text-amber-600 dark:text-amber-400">
                    Los galones añadidos superarían la capacidad del tanque ({fuelProjection.tankCapacity} gal)
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tank capacity info (existing - kept as-is for when no projection is available) */}
          {!isEditing && !fuelProjection && vehicleTankCapacity > 0 && gallons > 0 && (
            <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>Capacidad: {vehicleTankCapacity} gal</span>
                <span>{Math.round((gallons / vehicleTankCapacity) * 100)}% del tanque</span>
              </div>
              <div className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min((gallons / vehicleTankCapacity) * 100, 100)}%` }}
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

          {/* Gas Station */}
          <div className="space-y-2">
            <Label htmlFor="fuel-station" className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-gray-400" />
              Gasolinera
            </Label>
            <Input
              id="fuel-station"
              placeholder="Ej: Terpel, Shell, Texaco..."
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* ─── Payment Method ── */}
          <PaymentMethodSelector
            vehicleId={vehicleId}
            defaultPaymentType={fuelLog?.debtId ? "credit_card" : "account"}
            defaultAccountId={fuelLog?.accountId}
            defaultSubAccountId={fuelLog?.subAccountId}
            defaultDebtId={fuelLog?.debtId}
            defaultInstallmentCount={fuelLog?.installmentCount}
            onChange={setPaymentData}
          />

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
            {isEditing ? "Guardar Cambios" : "Registrar Recarga"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
