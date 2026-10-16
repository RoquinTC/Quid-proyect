"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, toColombiaDateString } from "@/lib/api";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { UnitConverter } from "./unit-converter";
import { UNITS } from "@/lib/pantry/units";
import type { PantryItem, PantryLocation } from "@/lib/types/pantry";

const categoryOptions = [
  { value: "dairy", label: "Lácteos" },
  { value: "meat", label: "Carnes" },
  { value: "vegetables", label: "Verduras" },
  { value: "fruits", label: "Frutas" },
  { value: "grains", label: "Granos" },
  { value: "beverages", label: "Bebidas" },
  { value: "snacks", label: "Snacks" },
  { value: "condiments", label: "Condimentos" },
  { value: "other", label: "Otros" },
];

const locationOptions: { value: PantryLocation; label: string; hint: string }[] = [
  { value: "nevera", label: "Nevera", hint: "Refrigerado" },
  { value: "alacena", label: "Alacena", hint: "Seco" },
  { value: "congelador", label: "Congelador", hint: "Congelado" },
];

/** Etiquetas largas para el selector de unidad (el código corto va debajo). */
const unitLabelLong: Record<string, string> = {
  unit: "Unidad",
  dozen: "Docena",
  kg: "Kilogramo",
  g: "Gramo",
  lb: "Libra",
  oz: "Onza",
  l: "Litro",
  ml: "Mililitro",
  gal: "Galón",
  package: "Paquete",
  box: "Caja",
  bottle: "Botella",
  can: "Lata",
  bag: "Bolsa",
};

interface PantryItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: PantryItem | null;
  onSuccess?: () => void;
}

export function PantryItemForm({ open, onOpenChange, item, onSuccess }: PantryItemFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("other");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("unit");
  const [location, setLocation] = useState<PantryLocation>("nevera");
  const [expirationDate, setExpirationDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [priceUnitId, setPriceUnitId] = useState<string>("");
  const [minStock, setMinStock] = useState("");
  const [targetQuantity, setTargetQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [showConverter, setShowConverter] = useState(false);

  const isEditing = !!item;

  // Re-sincroniza cuando cambia el producto objetivo (no solo al montar).
  const itemId = item?.id ?? null;
  useEffect(() => {
    setLoading(false);
    setName(item?.name || "");
    setCategory(item?.category || "other");
    setQuantity(item?.quantity?.toString() || "1");
    setUnit(item?.unit || "unit");
    setLocation((item?.location as PantryLocation) || "nevera");
    setExpirationDate(item?.expirationDate ? toColombiaDateString(item.expirationDate) : "");
    setPurchasePrice(item?.purchasePrice?.toString() || "");
    setPriceUnitId(item?.priceUnitId || "");
    setMinStock(item?.minStock?.toString() || "");
    setTargetQuantity(item?.targetQuantity?.toString() || "");
    setNotes(item?.notes || "");
    setShowConverter(false);
  }, [itemId, open]);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      // `quantity` solo se envía al CREAR: al editar, la cantidad la gobierna
      // el ledger (/adjust, /consume) para que todo cambio tenga movimiento.
      const base = {
        name: name.trim(),
        category,
        unit,
        location,
        expirationDate: expirationDate || null,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
        priceUnitId: priceUnitId || null,
        minStock: minStock ? parseFloat(minStock) : null,
        targetQuantity: targetQuantity ? parseFloat(targetQuantity) : null,
        notes,
      };

      if (isEditing) {
        await apiFetch(`/api/pantry/${item.id}`, {
          method: "PUT",
          body: JSON.stringify(base),
        });
        toast.success("Producto actualizado");
      } else {
        await apiFetch("/api/pantry", {
          method: "POST",
          body: JSON.stringify({
            ...base,
            quantity: parseFloat(quantity) || 0,
            purchaseDate: new Date().toISOString(),
          }),
        });
        toast.success("Agregado a la nevera");
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      // El 409 de duplicado trae un mensaje útil del servidor ("ya existe con
      // X cantidad"). Se muestra tal cual en vez de un error genérico.
      const message =
        error instanceof Error && error.message
          ? error.message
          : "No se pudo guardar el producto";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    if (!item) {
      setName("");
      setCategory("other");
      setQuantity("1");
      setUnit("unit");
      setLocation("nevera");
      setExpirationDate("");
      setPurchasePrice("");
      setPriceUnitId("");
      setMinStock("");
      setTargetQuantity("");
      setNotes("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            {isEditing ? "Editar producto" : "Agregar a la nevera"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-[12.5px]">Nombre</Label>
            <Input
              id="name"
              placeholder="Ej: Leche deslactosada"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9 rounded-xl"
            />
          </div>

          {/* Ubicación + categoría */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Dónde está</Label>
              <Select value={location} onValueChange={(v) => setLocation(v as PantryLocation)}>
                <SelectTrigger className="h-9 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locationOptions.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label} <span className="text-gray-400">· {l.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Categoría</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-9 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Cantidad (solo alta) + unidad */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quantity" className="text-[12.5px]">
                {isEditing ? "Cantidad actual" : "Cantidad"}
              </Label>
              <Input
                id="quantity"
                type="number"
                step="0.001"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                disabled={isEditing}
                className="h-9 rounded-xl disabled:opacity-60"
              />
              {isEditing && (
                <p className="text-[10.5px] leading-tight text-gray-400">
                  Se cambia contando la nevera, para que cada cambio quede registrado.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12.5px]">Unidad</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="h-9 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => (
                    <SelectItem key={u.code} value={u.code}>
                      {unitLabelLong[u.code] ?? u.label}{" "}
                      <span className="text-gray-400">({u.label})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowConverter(!showConverter)}
            className="text-[11.5px] text-amber-600 hover:underline"
          >
            {showConverter ? "Ocultar conversor" : "Conversor de unidades"}
          </button>

          {showConverter && (
            <UnitConverter unit={unit} quantity={parseFloat(quantity) || 0} />
          )}

          {/* Precio + unidad de precio: juntos porque uno explica al otro */}
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="purchasePrice" className="text-[12.5px]">
                  Último precio
                </Label>
                <CurrencyInput
                  id="purchasePrice"
                  showPrefix
                  placeholder="0"
                  value={purchasePrice}
                  onChange={(v) => setPurchasePrice(v)}
                  className="h-9 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12.5px]">Cobran por</Label>
                <Select
                  value={priceUnitId || "__same__"}
                  onValueChange={(v) => setPriceUnitId(v === "__same__" ? "" : v)}
                >
                  <SelectTrigger className="h-9 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__same__">Igual a la unidad</SelectItem>
                    {UNITS.map((u) => (
                      <SelectItem key={u.code} value={u.code}>
                        {u.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {priceUnitId && priceUnitId !== unit && (
              <p className="text-[10.5px] leading-tight text-cyan-700 dark:text-cyan-400">
                Compras en {unit} y te cobran por {priceUnitId}: el precio se convierte solo.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expirationDate" className="text-[12.5px]">
              Vence (opcional)
            </Label>
            <Input
              id="expirationDate"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className="h-9 rounded-xl"
            />
          </div>

          {/* Umbrales: mínimo y objetivo, con la explicación de cada uno */}
          <div className="space-y-2 rounded-xl bg-gray-50 p-3 dark:bg-gray-800/60">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-[12.5px]">Mínimo</Label>
                <p className="text-[10.5px] leading-tight text-gray-400">
                  Te avisa cuando bajas de aquí
                </p>
              </div>
              <Input
                type="number"
                step="0.001"
                min="0"
                placeholder="—"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className="h-8 w-20 rounded-xl text-center"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <Label className="text-[12.5px]">Quiero tener</Label>
                <p className="text-[10.5px] leading-tight text-gray-400">
                  La lista de faltantes apunta a este valor
                </p>
              </div>
              <Input
                type="number"
                step="0.001"
                min="0"
                placeholder="—"
                value={targetQuantity}
                onChange={(e) => setTargetQuantity(e.target.value)}
                className="h-8 w-20 rounded-xl text-center"
              />
            </div>
            {!minStock && !targetQuantity && (
              <p className="text-[10.5px] leading-tight text-amber-600 dark:text-amber-400">
                Sin mínimo ni objetivo, este producto no entra en las listas de faltantes.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-[12.5px]">Notas (opcional)</Label>
            <Input
              id="notes"
              placeholder="Ej: la marca que le gusta a todos"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-9 rounded-xl"
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || !name.trim()}
            className="h-10 w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600"
          >
            {loading && <Loader2 className="size-4 animate-spin mr-2" />}
            {isEditing ? "Guardar cambios" : "Agregar a la nevera"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
