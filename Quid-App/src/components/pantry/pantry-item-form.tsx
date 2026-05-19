"use client";

import { useState } from "react";
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
import { UnitConverter } from "./unit-converter";

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

const unitOptions = [
  { value: "unit", label: "Unidad" },
  { value: "lb", label: "Libra" },
  { value: "kg", label: "Kilogramo" },
  { value: "g", label: "Gramo" },
  { value: "oz", label: "Onza" },
  { value: "ml", label: "Mililitro" },
  { value: "l", label: "Litro" },
  { value: "package", label: "Paquete" },
  { value: "bottle", label: "Botella" },
  { value: "can", label: "Lata" },
];

interface PantryItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: {
    id: string;
    name: string;
    category: string | null;
    quantity: number;
    unit: string;
    expirationDate: string | null;
    purchaseDate: string | null;
    purchasePrice: number | null;
    minStock: number | null;
  } | null;
  onSuccess?: () => void;
}

export function PantryItemForm({ open, onOpenChange, item, onSuccess }: PantryItemFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "other");
  const [quantity, setQuantity] = useState(item?.quantity?.toString() || "1");
  const [unit, setUnit] = useState(item?.unit || "unit");
  const [expirationDate, setExpirationDate] = useState(
    item?.expirationDate ? toColombiaDateString(item.expirationDate) : ""
  );
  const [purchasePrice, setPurchasePrice] = useState(
    item?.purchasePrice?.toString() || ""
  );
  const [minStock, setMinStock] = useState(item?.minStock?.toString() || "");
  const [showConverter, setShowConverter] = useState(false);

  const isEditing = !!item;

  const handleSubmit = async () => {
    if (!name) return;
    setLoading(true);
    try {
      const data = {
        name,
        category,
        quantity: parseFloat(quantity) || 0,
        unit,
        expirationDate: expirationDate || null,
        purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null,
        minStock: minStock ? parseFloat(minStock) : null,
      };

      if (isEditing) {
        await apiFetch(`/api/pantry/${item.id}`, {
          method: "PUT",
          body: JSON.stringify(data),
        });
      } else {
        await apiFetch("/api/pantry", {
          method: "POST",
          body: JSON.stringify({ ...data, purchaseDate: new Date().toISOString() }),
        });
      }

      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving pantry item:", error);
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
      setExpirationDate("");
      setPurchasePrice("");
      setMinStock("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Producto" : "Nuevo Producto"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input
              id="name"
              placeholder="Ej: Leche deslactosada"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Categoría</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="rounded-xl">
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

          {/* Quantity + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="quantity">Cantidad</Label>
              <Input
                id="quantity"
                type="number"
                step="0.1"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Unidad</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unitOptions.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Unit converter */}
          <button
            type="button"
            onClick={() => setShowConverter(!showConverter)}
            className="text-xs text-amber-600 hover:underline"
          >
            {showConverter ? "Ocultar conversor" : "🔄 Conversor de unidades"}
          </button>

          {showConverter && (
            <UnitConverter unit={unit} quantity={parseFloat(quantity) || 0} />
          )}

          {/* Expiration Date */}
          <div className="space-y-2">
            <Label htmlFor="expirationDate">Fecha de vencimiento (opcional)</Label>
            <Input
              id="expirationDate"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Purchase Price */}
          <div className="space-y-2">
            <Label htmlFor="purchasePrice">Precio de compra (opcional)</Label>
            <CurrencyInput
              id="purchasePrice"
              showPrefix
              placeholder="0"
              value={purchasePrice}
              onChange={(v) => setPurchasePrice(v)}
              className="rounded-xl"
            />
          </div>

          {/* Min Stock */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <div>
              <Label className="text-sm">Stock mínimo</Label>
              <p className="text-[10px] text-gray-400">
                Alerta cuando la cantidad baje de este valor
              </p>
            </div>
            <Input
              type="number"
              step="0.5"
              min="0"
              placeholder="0"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              className="w-20 rounded-xl h-8 text-center"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !name}
            className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            {isEditing ? "Guardar Cambios" : "Agregar Producto"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
