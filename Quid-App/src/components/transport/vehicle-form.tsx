"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { Loader2, AlertCircle, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { VehicleIcon, availableIconKeys, iconLabels } from "./vehicle-icon";

const vehicleTypes = [
  { value: "motorcycle", label: "Motocicleta" },
  { value: "car", label: "Carro" },
  { value: "truck", label: "Camión" },
  { value: "other", label: "Otro" },
];

const fuelTypes = [
  { value: "gasoline", label: "Gasolina" },
  { value: "diesel", label: "Diésel" },
  { value: "electric", label: "Eléctrico" },
];

const MAX_PHOTO_INPUT_MB = 12;
const MAX_PHOTO_EDGE = 1400;
const PHOTO_QUALITY = 0.78;

interface VehicleFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle?: {
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
    photoUrl?: string | null;
  } | null;
  onSuccess?: () => void;
}

export function VehicleForm({ open, onOpenChange, vehicle, onSuccess }: VehicleFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(vehicle?.name || "");
  const [type, setType] = useState(vehicle?.type || "motorcycle");
  const [brand, setBrand] = useState(vehicle?.brand || "");
  const [model, setModel] = useState(vehicle?.model || "");
  const [year, setYear] = useState(vehicle?.year?.toString() || "");
  const [color, setColor] = useState(vehicle?.color || "");
  const [plate, setPlate] = useState(vehicle?.plate || "");
  const [tankCapacity, setTankCapacity] = useState(vehicle?.tankCapacity?.toString() || "");
  const [fuelType, setFuelType] = useState(vehicle?.fuelType || "gasoline");
  const [currentKm, setCurrentKm] = useState(vehicle?.currentKm?.toString() || "0");
  const [icon, setIcon] = useState(vehicle?.icon || "");
  const [photoUrl, setPhotoUrl] = useState(vehicle?.photoUrl || "");

  // Sync form state when vehicle prop changes (e.g., editing a different vehicle)
  useEffect(() => {
    if (open) {
      setName(vehicle?.name || "");
      setType(vehicle?.type || "motorcycle");
      setBrand(vehicle?.brand || "");
      setModel(vehicle?.model || "");
      setYear(vehicle?.year?.toString() || "");
      setColor(vehicle?.color || "");
      setPlate(vehicle?.plate || "");
      setTankCapacity(vehicle?.tankCapacity?.toString() || "");
      setFuelType(vehicle?.fuelType || "gasoline");
      setCurrentKm(vehicle?.currentKm?.toString() || "0");
      setIcon(vehicle?.icon || "");
      setPhotoUrl(vehicle?.photoUrl || "");
      setError(null);
    }
  }, [vehicle, open]);

  const isEditing = !!vehicle;

  const compressVehiclePhoto = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => {
          const scale = Math.min(1, MAX_PHOTO_EDGE / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            reject(new Error("No se pudo preparar la imagen"));
            return;
          }
          context.drawImage(image, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", PHOTO_QUALITY));
        };
        image.onerror = () => reject(new Error("No se pudo leer la imagen"));
        if (typeof reader.result === "string") image.src = reader.result;
      };
      reader.onerror = () => reject(new Error("No se pudo cargar la foto"));
      reader.readAsDataURL(file);
    });

  const handlePhotoFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Archivo no válido", {
        description: "Selecciona una imagen en formato JPG, PNG o WebP.",
      });
      return;
    }
    if (file.size > MAX_PHOTO_INPUT_MB * 1024 * 1024) {
      toast.error("Imagen muy pesada", {
        description: `Usa una imagen de máximo ${MAX_PHOTO_INPUT_MB} MB.`,
      });
      return;
    }

    try {
      const compressed = await compressVehiclePhoto(file);
      setPhotoUrl(compressed);
      toast.success("Foto optimizada", {
        description: "La imagen se redujo para que Quid siga liviana.",
      });
    } catch (photoError) {
      toast.error(photoError instanceof Error ? photoError.message : "No se pudo cargar la foto");
    }
  };

  const handleSubmit = async () => {
    if (!name) return;
    setError(null);
    setLoading(true);
    try {
      const data = {
        name,
        type,
        brand: brand || null,
        model: model || null,
        year: year ? Number(year) : null,
        color: color || null,
        plate: plate || null,
        tankCapacity: tankCapacity ? Number(tankCapacity) : null,
        fuelType,
        currentKm: currentKm ? Number(currentKm) : 0,
        icon: icon || null,
        photoUrl: photoUrl || null,
      };

      if (isEditing) {
        await apiFetch(`/api/vehicles/${vehicle.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
        toast.success("Vehículo actualizado", {
          description: "Los cambios se guardaron correctamente",
        });
      } else {
        await apiFetch("/api/vehicles", {
          method: "POST",
          body: JSON.stringify(data),
        });
        toast.success("Vehículo creado", {
          description: "El vehículo se registró correctamente",
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (err) {
      console.error("Error saving vehicle:", err);
      setError(err instanceof Error ? err.message : "Error al guardar vehículo");
      toast.error("Error al guardar", {
        description: "No se pudo guardar el vehículo. Intenta de nuevo.",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!vehicle) {
      setName("");
      setType("motorcycle");
      setBrand("");
      setModel("");
      setYear("");
      setColor("");
      setPlate("");
      setTankCapacity("");
      setFuelType("gasoline");
      setCurrentKm("0");
      setIcon("");
      setPhotoUrl("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Vehículo" : "Nuevo Vehículo"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEditing ? "Formulario para editar vehículo" : "Formulario para crear vehículo"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="vehicle-name">Nombre</Label>
            <Input
              id="vehicle-name"
              placeholder="Ej: Mi Moto"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {vehicleTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Icon Selector */}
          <div className="space-y-2">
            <Label>Ícono</Label>
            <div className="grid grid-cols-6 gap-1.5">
              {availableIconKeys.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setIcon(icon === key ? "" : key)}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                    icon === key
                      ? "border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 shadow-sm"
                      : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
                  title={iconLabels[key]}
                >
                  <VehicleIcon icon={key} type={type} className={`size-5 ${icon === key ? "text-cyan-600 dark:text-cyan-400" : "text-gray-500 dark:text-gray-400"}`} />
                  <span className="text-[11px] mt-1 text-gray-500 dark:text-gray-400 leading-tight truncate w-full text-center">
                    {iconLabels[key]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Photo */}
          <div className="space-y-2">
            <Label>Foto del vehículo</Label>
            <div className="overflow-hidden rounded-2xl border border-dashed border-cyan-300/70 bg-cyan-50/40 dark:border-cyan-700/50 dark:bg-cyan-950/20">
              {photoUrl ? (
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photoUrl}
                    alt="Vista previa del vehículo"
                    className="h-36 w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoUrl("")}
                    className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition hover:bg-black/75"
                    aria-label="Quitar foto"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-cyan-500/12 text-cyan-600 dark:text-cyan-300">
                    <ImagePlus className="size-6" />
                  </span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">Cargar desde tu dispositivo</span>
                  <span className="text-[11px] text-gray-500">
                    JPG, PNG o WebP. Hasta {MAX_PHOTO_INPUT_MB} MB; Quid la optimiza.
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(event) => handlePhotoFile(event.target.files?.[0])}
                  />
                </label>
              )}
            </div>
            <Input
              id="vehicle-photo"
              placeholder="O pega una URL de imagen"
              value={photoUrl.startsWith("data:") ? "" : photoUrl}
              onChange={(e) => setPhotoUrl(e.target.value)}
              className="rounded-xl"
            />
            <p className="text-[10px] text-gray-500">
              La foto se verá en el detalle y en tarjetas destacadas del módulo.
            </p>
          </div>

          {/* Brand & Model */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vehicle-brand">Marca</Label>
              <Input
                id="vehicle-brand"
                placeholder="Ej: Honda"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-model">Modelo</Label>
              <Input
                id="vehicle-model"
                placeholder="Ej: CB 190R"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Year & Color */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vehicle-year">Año</Label>
              <Input
                id="vehicle-year"
                type="number"
                placeholder="Ej: 2023"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vehicle-color">Color</Label>
              <Input
                id="vehicle-color"
                placeholder="Ej: Rojo"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          {/* Plate */}
          <div className="space-y-2">
            <Label htmlFor="vehicle-plate">Placa</Label>
            <Input
              id="vehicle-plate"
              placeholder="Ej: ABC-123"
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              className="rounded-xl uppercase tracking-wider"
              maxLength={10}
            />
          </div>

          {/* Tank Capacity & Fuel Type */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="vehicle-tank">Capacidad del tanque (galones)</Label>
              <Input
                id="vehicle-tank"
                type="number"
                step="0.1"
                placeholder="Ej: 4.5"
                value={tankCapacity}
                onChange={(e) => setTankCapacity(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de combustible</Label>
              <Select value={fuelType} onValueChange={setFuelType}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fuelTypes.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Current KM */}
          <div className="space-y-2">
            <Label htmlFor="vehicle-km">Kilometraje actual</Label>
            <Input
              id="vehicle-km"
              type="number"
              placeholder="0"
              value={currentKm}
              onChange={(e) => setCurrentKm(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              <AlertCircle className="size-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !name}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Guardar Cambios" : "Crear Vehículo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
