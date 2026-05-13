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
    const needed = item.minStock ? item.minStock - item.quantity : 1;
    setQuantity(Math.max(needed, 1).toString());
  };

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
                  {unitOptions.map((u) => (
                    <SelectItem key={u.value} value={u.value}>
                      {u.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Estimated Price */}
          <div className="space-y-2">
            <Label htmlFor="itemPrice">Precio estimado (opcional)</Label>
            <CurrencyInput
              id="itemPrice"
              showPrefix
              placeholder="0"
              value={estimatedPrice}
              onChange={(v) => setEstimatedPrice(v)}
              className="rounded-xl"
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
            Agregar a la Lista
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
