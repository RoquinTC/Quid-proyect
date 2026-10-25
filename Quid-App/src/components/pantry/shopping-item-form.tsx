"use client";

import { useState, useEffect } from "react";
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
import { apiFetch } from "@/lib/api";
import type { PantryItem } from "@/lib/types";
import { Loader2, Sparkles } from "lucide-react";
import { UNITS } from "@/lib/pantry/units";
import { lineTotal } from "@/lib/pantry/line-total";

/** Etiquetas largas para los selectores de unidad. */
const unitLabels: Record<string, string> = {
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

interface ShoppingItemFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  onSuccess?: () => void;
}

export function ShoppingItemForm({ open, onOpenChange, listId, onSuccess }: ShoppingItemFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("unit");
  const [estimatedPrice, setEstimatedPrice] = useState("");
  // Unidad en que la tienda cobra. Clave para carnes, verduras y frutas: se
  // compra en gramos o libras, pero el precio está por kilo.
  const [priceUnitId, setPriceUnitId] = useState<string>("");
  // Descuento de la tienda en ESTE producto (no el total de la compra).
  const [discountType, setDiscountType] = useState<"FIXED" | "PERCENT">("FIXED");
  const [discountValue, setDiscountValue] = useState("");
  const [pantryItemId, setPantryItemId] = useState<string | null>(null);
  const [lowStockItems, setLowStockItems] = useState<PantryItem[]>([]);

  useEffect(() => {
    if (open) {
      apiFetch<{ items: PantryItem[]; lowStockItems: PantryItem[] }>("/api/pantry")
        .then((data) => setLowStockItems(data.lowStockItems))
        .catch(console.error);
    }
  }, [open]);

  const handleSelectLowStock = (item: PantryItem) => {
    setName(item.name);
    setUnit(item.unit);
    setPantryItemId(item.id);
    // Hereda la unidad de precio del producto de la nevera: si el café se
    // cobra por kilo, la línea debe saberlo.
    setPriceUnitId(item.priceUnitId || "");
    if (item.purchasePrice != null) setEstimatedPrice(String(item.purchasePrice));
    const needed = item.minStock !== null && item.minStock !== undefined ? item.minStock - item.quantity : 1;
    setQuantity(Math.max(needed, 0.001).toString());
  };

  /** Importe real de esta línea, con la conversión aplicada. */
  const previewTotal = lineTotal({
    quantity: parseFloat(quantity) || 0,
    price: estimatedPrice ? parseFloat(estimatedPrice) : 0,
    unit,
    priceUnitId: priceUnitId || null,
    discountType: discountValue ? discountType : null,
    discountValue: discountValue ? parseFloat(discountValue) : null,
  });

  const handleSubmit = async () => {
    if (!name) return;
    setLoading(true);
    try {
      await apiFetch(`/api/shopping-lists/${listId}/items`, {
        method: "POST",
        body: JSON.stringify({
          name,
          quantity: parseFloat(quantity) || 1,
          unit,
          estimatedPrice: estimatedPrice ? parseFloat(estimatedPrice) : null,
          priceUnitId: priceUnitId || null,
    discountType: discountValue ? discountType : null,
    discountValue: discountValue ? parseFloat(discountValue) : null,
          pantryItemId,
        }),
      });
      onSuccess?.();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error adding item:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName("");
    setQuantity("1");
    setUnit("unit");
    setEstimatedPrice("");
    setPriceUnitId("");
    setDiscountValue("");
    setPantryItemId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>Agregar Item</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Low stock suggestions */}
          {lowStockItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <Sparkles className="size-3" />
                <span className="font-medium">Sugerencias (stock bajo)</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {lowStockItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelectLowStock(item)}
                    className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                  >
                    {item.name} ({item.quantity} {item.unit})
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="itemName">Nombre</Label>
            <Input
              id="itemName"
              placeholder="Ej: Leche"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-xl"
            />
          </div>

          {/* Quantity + Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="itemQty">Cantidad</Label>
              <Input
                id="itemQty"
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
                  {UNITS.map((u) => (
                    <SelectItem key={u.code} value={u.code}>
                      {unitLabels[u.code] ?? u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Precio + unidad de cobro.
              El caso de carnes, verduras y frutas: compras 800 g de pollo pero
              el precio está por kilo. Sin la unidad de cobro la línea multiplica
              800 × 14.200 y el total sale 800 veces más grande. */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="itemPrice">Precio</Label>
              <CurrencyInput
                id="itemPrice"
                showPrefix
                placeholder="0"
                value={estimatedPrice}
                onChange={(v) => setEstimatedPrice(v)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Cobran por</Label>
              <Select
                value={priceUnitId || "__same__"}
                onValueChange={(v) => setPriceUnitId(v === "__same__" ? "" : v)}
              >
                <SelectTrigger className="rounded-xl">
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

          {/* Descuento de la tienda en ESTE producto. El descuento por el total
              de la compra se pone al confirmar, no aquí. */}
          <div className="space-y-2">
            <Label>Descuento de este producto (opcional)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="0"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                className="rounded-xl text-right"
              />
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as "FIXED" | "PERCENT")}
              >
                <SelectTrigger className="w-[118px] rounded-xl text-[12px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXED">Monto $</SelectItem>
                  <SelectItem value="PERCENT">Porcentaje %</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Importe real calculado con la conversión: es el número que verá
              la lista, así que se muestra aquí para que no haya sorpresas. */}
          {previewTotal > 0 && (
            <div className="flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-900/10">
              <span className="text-[11.5px] text-amber-700 dark:text-amber-400">
                {priceUnitId && priceUnitId !== unit
                  ? `${quantity} ${unit} a ${estimatedPrice}/${priceUnitId}`
                  : `${quantity} ${unit}`}
              </span>
              <span className="text-[13.5px] font-bold tabular-nums text-gray-900 dark:text-white">
                ${previewTotal.toLocaleString("es-CO")}
              </span>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !name}
            className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-orange-500 hover:from-amber-700 hover:to-orange-600"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            Agregar a la Lista
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
