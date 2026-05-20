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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, getColombiaTodayString, formatCurrency } from "@/lib/api";
import type {
  Vehicle,
  MaintenanceRecord,
  MaintenanceItem,
  PaymentMethodType,
} from "@/lib/types/transport";
import { MAINTENANCE_TYPES } from "@/lib/types/transport";
import { PaymentMethodSelector } from "@/components/transport/payment-method-selector";
import {
  Loader2, Plus, X, Wrench, ShoppingCart, ChevronDown, ChevronRight,
  Search, Check, Calculator, MapPin, Clock, Gauge, Calendar,
} from "lucide-react";
import { toast } from "sonner";

// ─── Selected service shape (catalog-based) ───

interface SelectedService {
  id: string;           // local-only key
  typeKey: string;      // e.g. "oil_change", "alignment", or "custom-XXX"
  label: string;        // display name
  price: string;        // raw numeric string for CurrencyInput
  isCustom?: boolean;   // true if user added this via + button
}

let _nextId = 0;
function createId(): string {
  _nextId += 1;
  return `svc-${_nextId}-${Date.now()}`;
}

// ─── Component Props ───

interface MaintenanceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preselectedVehicleId?: string | null;
  record?: MaintenanceRecord | null;
  onSuccess?: () => void;
}

export function MaintenanceForm({
  open,
  onOpenChange,
  preselectedVehicleId,
  record,
  onSuccess,
}: MaintenanceFormProps) {
  // ─── Step management ──
  // "main" = basic info (date, km) + service list + payment
  // "catalog" = service type catalog with search & checkboxes
  const [step, setStep] = useState<"main" | "catalog">("main");

  // ─── Core form state ───
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [vehicleId, setVehicleId] = useState(preselectedVehicleId || "");
  const [description, setDescription] = useState("");
  const [cost, setCost] = useState("");
  const [km, setKm] = useState("");
  const [date, setDate] = useState(getColombiaTodayString());
  const [time, setTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [nextDueKm, setNextDueKm] = useState("");
  const [nextDueDate, setNextDueDate] = useState("");
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [workshopName, setWorkshopName] = useState("");

  // ─── Selected services (catalog-based) ───
  const [selectedServices, setSelectedServices] = useState<SelectedService[]>([]);

  // ─── Custom service dialog ───
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customServiceName, setCustomServiceName] = useState("");

  // ─── Payment method state ───
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

  const isEditing = !!record;

  // ─── Derived: total cost from selected services ───
  const servicesTotal = useMemo(
    () => selectedServices.reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0),
    [selectedServices]
  );

  // When services exist, cost mirrors the total
  useEffect(() => {
    if (selectedServices.length > 0) {
      setCost(servicesTotal > 0 ? servicesTotal.toString() : "");
    }
  }, [servicesTotal, selectedServices.length]);

  // ─── Primary maintenance type (for nextDue auto-suggest) ───
  const primaryType = useMemo(() => {
    if (selectedServices.length === 0) return null;
    // Use the first selected service's type for nextDue suggestions
    const firstKey = selectedServices[0].typeKey;
    if (firstKey.startsWith("custom-")) return null;
    return MAINTENANCE_TYPES.find(t => t.value === firstKey) || null;
  }, [selectedServices]);

  // ─── Fetch vehicles ───
  const fetchVehicles = useCallback(async () => {
    try {
      const data = await apiFetch<Vehicle[]>("/api/vehicles");
      setVehicles(data);
    } catch (error) {
      console.error("Error fetching vehicles:", error);
    }
  }, []);

  useEffect(() => {
    if (open) fetchVehicles();
  }, [open, fetchVehicles]);

  // ─── Pre-fill form when editing ───
  useEffect(() => {
    if (open && record) {
      setVehicleId(preselectedVehicleId || "");
      setDescription(record.description || "");
      setCost(record.cost?.toString() || "");
      setKm(record.km?.toString() || "");
      setDate(record.date ? record.date.split("T")[0] : getColombiaTodayString());
      setNextDueKm(record.nextDueKm?.toString() || "");
      setNextDueDate(record.nextDueDate ? record.nextDueDate.split("T")[0] : "");
      setReminderEnabled(record.reminderEnabled ?? true);

      // Pre-fill items from existing record as selected services
      if (record.items && record.items.length > 0) {
        setSelectedServices(
          record.items.map((item: MaintenanceItem) => ({
            id: createId(),
            typeKey: item.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, ""),
            label: item.name,
            price: item.unitPrice.toString(),
            isCustom: true,
          }))
        );
      } else {
        // Try to match the record type to a catalog entry
        const typeConfig = MAINTENANCE_TYPES.find(t => t.value === record.type);
        setSelectedServices([{
          id: createId(),
          typeKey: record.type || "other",
          label: typeConfig?.label || record.type || "Servicio",
          price: record.cost?.toString() || "0",
          isCustom: !typeConfig,
        }]);
      }

      // Pre-fill payment data
      setPaymentData({
        paymentType: record.debtId ? "credit_card" : "account",
        accountId: record.accountId || null,
        subAccountId: record.subAccountId || null,
        debtId: record.debtId || null,
        installmentCount: record.installmentCount || null,
      });
    }
  }, [open, record, preselectedVehicleId]);

  // ─── Auto-fill km when vehicle changes (create mode only) ───
  useEffect(() => {
    if (preselectedVehicleId && !isEditing) {
      setVehicleId(preselectedVehicleId);
      const vehicle = vehicles.find((v) => v.id === preselectedVehicleId);
      if (vehicle) setKm(vehicle.currentKm.toString());
    }
  }, [preselectedVehicleId, vehicles, isEditing]);

  useEffect(() => {
    if (vehicleId && !preselectedVehicleId && !isEditing) {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      if (vehicle) setKm(vehicle.currentKm.toString());
    }
  }, [vehicleId, vehicles, preselectedVehicleId, isEditing]);

  // ─── Auto-suggest next due km & date based on primary service type (create mode only) ───
  useEffect(() => {
    if (!isEditing && primaryType && km) {
      const currentKm = parseFloat(km) || 0;
      if (primaryType.nextKmInterval > 0) {
        setNextDueKm((currentKm + primaryType.nextKmInterval).toString());
      } else {
        setNextDueKm("");
      }

      if (primaryType.nextMonthInterval > 0) {
        const baseDate = date ? new Date(date + "T12:00:00") : new Date();
        const dueDate = new Date(baseDate);
        dueDate.setMonth(dueDate.getMonth() + primaryType.nextMonthInterval);
        const yyyy = dueDate.getFullYear();
        const mm = String(dueDate.getMonth() + 1).padStart(2, "0");
        const dd = String(dueDate.getDate()).padStart(2, "0");
        setNextDueDate(`${yyyy}-${mm}-${dd}`);
      } else {
        setNextDueDate("");
      }
    }
  }, [primaryType, km, isEditing, date]);

  // ─── Service catalog handlers ───

  const toggleService = useCallback((typeKey: string, label: string) => {
    setSelectedServices(prev => {
      const exists = prev.find(s => s.typeKey === typeKey);
      if (exists) {
        return prev.filter(s => s.typeKey !== typeKey);
      }
      return [...prev, { id: createId(), typeKey, label, price: "" }];
    });
  }, []);

  const updateServicePrice = useCallback((id: string, price: string) => {
    setSelectedServices(prev =>
      prev.map(s => s.id === id ? { ...s, price } : s)
    );
  }, []);

  const removeService = useCallback((id: string) => {
    setSelectedServices(prev => prev.filter(s => s.id !== id));
  }, []);

  const addCustomService = useCallback(() => {
    if (!customServiceName.trim()) return;
    const key = `custom-${customServiceName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z_]/g, "")}`;
    setSelectedServices(prev => {
      if (prev.find(s => s.typeKey === key)) return prev;
      return [...prev, { id: createId(), typeKey: key, label: customServiceName.trim(), price: "", isCustom: true }];
    });
    setCustomServiceName("");
    setShowCustomInput(false);
  }, [customServiceName]);

  // ─── Submit handler ───

  const handleSubmit = async () => {
    if (!vehicleId || !cost) return;
    if (selectedServices.length > 0 && selectedServices.some(s => !s.price || parseFloat(s.price) <= 0)) {
      toast.error("Completa el precio de todos los servicios seleccionados");
      return;
    }

    setLoading(true);
    try {
      // Build items payload from selected services
      const itemsPayload = selectedServices
        .filter(s => parseFloat(s.price) > 0)
        .map(s => ({
          name: s.label,
          quantity: 1,
          unitPrice: parseFloat(s.price) || 0,
          totalPrice: parseFloat(s.price) || 0,
        }));

      // Determine the primary maintenance type
      const maintType = selectedServices.length > 0 && !selectedServices[0].typeKey.startsWith("custom-")
        ? selectedServices[0].typeKey
        : "other";

      const payload: Record<string, unknown> = {
        type: maintType,
        description: description || selectedServices.map(s => s.label).join(", "),
        cost: parseFloat(cost),
        km: km ? parseFloat(km) : undefined,
        date,
        nextDueKm: nextDueKm ? parseFloat(nextDueKm) : undefined,
        nextDueDate: nextDueDate || undefined,
        reminderEnabled,
        // ── Itemized list ──
        ...(itemsPayload.length > 0 ? { items: itemsPayload } : {}),
        // ── Workshop name (stored in notes for now) ──
        ...(workshopName ? { notes: `Taller: ${workshopName}` } : {}),
        // ── Finance integration ──
        paymentType: paymentData.paymentType,
        accountId: paymentData.accountId,
        subAccountId: paymentData.subAccountId,
        debtId: paymentData.debtId,
        installmentCount: paymentData.installmentCount,
      };

      if (isEditing && record) {
        await apiFetch(
          `/api/vehicles/${vehicleId}/maintenance/${record.id}`,
          {
            method: "PUT",
            body: JSON.stringify(payload),
          }
        );

        toast.success("Mantenimiento actualizado", {
          description: "Los cambios se guardaron correctamente",
        });
      } else {
        await apiFetch(`/api/vehicles/${vehicleId}/maintenance`, {
          method: "POST",
          body: JSON.stringify(payload),
        });

        toast.success("Mantenimiento registrado", {
          description: "El registro de mantenimiento se guardó correctamente",
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving maintenance record:", error);
      toast.error(isEditing ? "Error al actualizar" : "Error al registrar", {
        description:
          "No se pudo guardar el registro de mantenimiento. Intenta de nuevo.",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!isEditing) {
      setVehicleId(preselectedVehicleId || "");
      setDescription("");
      setCost("");
      setKm("");
      setDate(getColombiaTodayString());
      setTime(() => {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      });
      setNextDueKm("");
      setNextDueDate("");
      setReminderEnabled(true);
      setWorkshopName("");
      setSelectedServices([]);
      setStep("main");
      setShowCustomInput(false);
      setCustomServiceName("");
      setPaymentData({
        paymentType: "account",
        accountId: null,
        subAccountId: null,
        debtId: null,
        installmentCount: null,
      });
    }
  };

  // ─── Selected vehicle info ───
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  // ─── Catalog search filter ───
  const [catalogSearch, setCatalogSearch] = useState("");

  const filteredTypes = useMemo(() => {
    if (!catalogSearch.trim()) return MAINTENANCE_TYPES;
    const q = catalogSearch.toLowerCase();
    return MAINTENANCE_TYPES.filter(t =>
      t.label.toLowerCase().includes(q) || t.value.toLowerCase().includes(q)
    );
  }, [catalogSearch]);

  // ─── RENDER: Service Catalog Screen ───
  if (step === "catalog") {
    return (
      <Sheet open={open} onOpenChange={(v) => { if (!v) { setStep("main"); onOpenChange(false); } }}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ShoppingCart className="size-5 text-cyan-600" />
              Seleccionar Servicios
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-3 mt-4 pb-6">
            {/* Search filter */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
              <Input
                placeholder="Buscar servicio..."
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                className="rounded-xl pl-9 h-10"
              />
            </div>

            {/* Service list with checkboxes */}
            <div className="space-y-1.5">
              {filteredTypes.map((type) => {
                const isSelected = selectedServices.some(s => s.typeKey === type.value);
                const selectedService = selectedServices.find(s => s.typeKey === type.value);

                return (
                  <div
                    key={type.value}
                    className={`rounded-xl border transition-all ${
                      isSelected
                        ? "border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                    }`}
                  >
                    {/* Checkbox row */}
                    <button
                      type="button"
                      onClick={() => toggleService(type.value, type.label)}
                      className="w-full flex items-center gap-3 p-3 text-left"
                    >
                      <div className={`size-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected
                          ? "border-cyan-500 bg-cyan-500"
                          : "border-gray-300 dark:border-gray-600"
                      }`}>
                        {isSelected && <Check className="size-3 text-white" />}
                      </div>
                      <span className={`text-sm font-medium flex-1 ${
                        isSelected ? "text-cyan-700 dark:text-cyan-300" : "text-gray-700 dark:text-gray-300"
                      }`}>
                        {type.label}
                      </span>
                      {type.nextKmInterval > 0 && (
                        <span className="text-[9px] text-gray-400">
                          Cada {type.nextKmInterval.toLocaleString()} km
                        </span>
                      )}
                    </button>

                    {/* Price input when selected */}
                    {isSelected && selectedService && (
                      <div className="px-3 pb-3 pt-0">
                        <div className="flex items-center gap-2 ml-8">
                          <Label className="text-[10px] text-gray-500 flex-shrink-0">Valor:</Label>
                          <CurrencyInput
                            showPrefix
                            placeholder="0"
                            value={selectedService.price}
                            onChange={(v) => updateServicePrice(selectedService.id, v)}
                            className="rounded-lg h-8 text-sm flex-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Add custom service */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
              {!showCustomInput ? (
                <button
                  type="button"
                  onClick={() => setShowCustomInput(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:text-cyan-600 hover:border-cyan-400 dark:hover:border-cyan-600 transition-colors text-xs font-medium"
                >
                  <Plus className="size-3.5" />
                  Añadir servicio personalizado
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Nombre del servicio"
                    value={customServiceName}
                    onChange={(e) => setCustomServiceName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCustomService()}
                    className="rounded-xl h-9 text-sm flex-1"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    onClick={addCustomService}
                    disabled={!customServiceName.trim()}
                    className="rounded-lg bg-cyan-600 hover:bg-cyan-700 h-9"
                  >
                    <Plus className="size-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setShowCustomInput(false); setCustomServiceName(""); }}
                    className="rounded-lg h-9"
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Selected count + confirm button */}
            {selectedServices.length > 0 && (
              <div className="sticky bottom-0 bg-white dark:bg-gray-900 pt-2 pb-1 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                    {selectedServices.length} servicio{selectedServices.length > 1 ? "s" : ""} seleccionado{selectedServices.length > 1 ? "s" : ""}
                  </span>
                  {servicesTotal > 0 && (
                    <span className="text-sm font-bold text-cyan-700 dark:text-cyan-300">
                      {formatCurrency(servicesTotal)}
                    </span>
                  )}
                </div>
                <Button
                  onClick={() => setStep("main")}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
                >
                  <Check className="size-4 mr-1.5" />
                  Confirmar servicios
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // ─── RENDER: Main Form Screen ───
  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) { setStep("main"); onOpenChange(false); } }}>
      <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wrench className="size-5 text-cyan-600" />
            {isEditing ? "Editar Mantenimiento" : "Registrar Mantenimiento"}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4 pb-6">
          {/* ─── 1. Vehicle Selector ─── */}
          <div className="space-y-2">
            <Label>Vehículo</Label>
            {vehicles.length === 1 || isEditing ? (
              <div className="h-10 px-3 rounded-xl bg-gray-50 dark:bg-gray-800 flex items-center gap-2">
                <Wrench className="size-4 text-cyan-500" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {selectedVehicle?.name || vehicles[0]?.name || "Vehículo"}
                </span>
                {selectedVehicle?.plate && (
                  <span className="text-[10px] text-gray-400 ml-auto">
                    {selectedVehicle.plate}
                  </span>
                )}
              </div>
            ) : (
              <Select value={vehicleId} onValueChange={setVehicleId} disabled={isEditing}>
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

          {/* ─── 2. Date, Time, KM ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Calendar className="size-3 text-gray-400" />
                Fecha
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Clock className="size-3 text-gray-400" />
                Hora
              </Label>
              <Input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Gauge className="size-3 text-gray-400" />
                Odómetro
              </Label>
              <Input
                type="number"
                placeholder="Ej: 15000"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* ─── 3. Service Type Selection (Drivoo-style) ─── */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de servicio</Label>

            {selectedServices.length === 0 ? (
              /* No services selected yet → Show the + button */
              <button
                type="button"
                onClick={() => setStep("catalog")}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:text-cyan-600 hover:border-cyan-400 dark:hover:border-cyan-600 transition-colors"
              >
                <Plus className="size-5" />
                <span className="text-sm font-medium">Añadir servicio</span>
              </button>
            ) : (
              /* Services selected → show list with edit/add buttons */
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                {/* Selected services list */}
                <div className="p-2 space-y-1.5">
                  {selectedServices.map((service) => (
                    <div
                      key={service.id}
                      className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                    >
                      {/* Checkbox indicator */}
                      <div className="size-4 rounded border-2 border-cyan-500 bg-cyan-500 flex items-center justify-center flex-shrink-0">
                        <Check className="size-2.5 text-white" />
                      </div>
                      {/* Service name */}
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300 flex-1 truncate">
                        {service.label}
                      </span>
                      {/* Price */}
                      <span className="text-xs font-bold text-gray-900 dark:text-white flex-shrink-0">
                        {service.price && parseFloat(service.price) > 0
                          ? formatCurrency(parseFloat(service.price))
                          : "—"
                        }
                      </span>
                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeService(service.id)}
                        className="p-1 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}

                  {/* Total */}
                  {servicesTotal > 0 && (
                    <div className="flex items-center justify-between p-2.5 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg mt-1">
                      <span className="text-xs font-medium text-cyan-700 dark:text-cyan-300">
                        Total
                      </span>
                      <span className="text-sm font-bold text-cyan-700 dark:text-cyan-300">
                        {formatCurrency(servicesTotal)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Add more / edit button */}
                <div className="border-t border-gray-200 dark:border-gray-700 p-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("catalog")}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-cyan-600 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 transition-colors text-xs font-medium"
                  >
                    <Plus className="size-3.5" />
                    Añadir otro servicio
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ─── 4. Workshop Name ─── */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5">
              <MapPin className="size-3.5 text-gray-400" />
              Taller
            </Label>
            <Input
              placeholder="Nombre del taller (opcional)"
              value={workshopName}
              onChange={(e) => setWorkshopName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* ─── 5. Cost (auto from services, or manual) ─── */}
          <div className="space-y-2">
            <Label>
              Costo total{" "}
              {selectedServices.length > 0 && (
                <span className="text-[9px] text-cyan-500 font-normal">(auto)</span>
              )}
            </Label>
            <CurrencyInput
              showPrefix
              placeholder="85000"
              value={cost}
              onChange={(v) => setCost(v)}
              className="rounded-xl"
              disabled={selectedServices.length > 0}
            />
          </div>

          {/* ─── 6. Description (optional) ─── */}
          <div className="space-y-2">
            <Label>Descripción <span className="text-gray-400 font-normal text-[10px]">(opcional)</span></Label>
            <Input
              placeholder="Ej: Cambio de aceite sintético 10W-40"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* ─── 7. Next Due (KM + Date) + Reminder Toggle ─── */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Próximo mantenimiento
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="maint-nextkm" className="text-[10px] text-gray-500">
                  KM próx. cambio
                </Label>
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
                <Label htmlFor="maint-nextdate" className="text-[10px] text-gray-500">
                  Fecha próx. cambio
                </Label>
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
            <Switch
              checked={reminderEnabled}
              onCheckedChange={setReminderEnabled}
            />
          </div>

          {/* ─── 8. Payment Method Selector ─── */}
          <PaymentMethodSelector
            vehicleId={vehicleId}
            defaultPaymentType={record?.debtId ? "credit_card" : "account"}
            defaultAccountId={record?.accountId}
            defaultSubAccountId={record?.subAccountId}
            defaultDebtId={record?.debtId}
            defaultInstallmentCount={record?.installmentCount}
            onChange={setPaymentData}
          />

          {/* ─── 9. Submit Button (sticky) ─── */}
          <div className="sticky bottom-0 bg-white dark:bg-gray-900 pt-2 pb-1 -mx-6 px-6 border-t border-gray-200 dark:border-gray-700">
            <Button
              onClick={handleSubmit}
              disabled={loading || !vehicleId || !cost || (selectedServices.length > 0 && selectedServices.some(s => !s.price || parseFloat(s.price) <= 0))}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
            >
              {loading ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : null}
              {isEditing ? "Guardar Cambios" : "Registrar Mantenimiento"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
