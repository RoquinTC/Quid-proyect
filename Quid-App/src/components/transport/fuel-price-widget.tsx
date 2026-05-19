"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { Fuel, Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/api";

interface FuelPriceData {
  id: string;
  fuelType: string;
  pricePerGallon: number;
  updatedAt: string;
}

export function FuelPriceWidget() {
  const [fuelPrices, setFuelPrices] = useState<FuelPriceData[]>([]);
  const [editingPrice, setEditingPrice] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchFuelPrices = useCallback(async () => {
    try {
      const data = await apiFetch<FuelPriceData[]>("/api/fuel-prices");
      setFuelPrices(data);
    } catch (error) {
      console.error("Error fetching fuel prices:", error);
    }
  }, []);

  useEffect(() => {
    fetchFuelPrices();
  }, [fetchFuelPrices]);

  const gasolinePrice = fuelPrices.find((p) => p.fuelType === "gasoline");
  const dieselPrice = fuelPrices.find((p) => p.fuelType === "diesel");

  const handleSave = async (fuelType: string) => {
    if (!editValue) return;
    setSaving(true);
    try {
      await apiFetch("/api/fuel-prices", {
        method: "POST",
        body: JSON.stringify({ fuelType, pricePerGallon: parseFloat(editValue) }),
      });
      await fetchFuelPrices();
      setEditingPrice(null);
      setEditValue("");
    } catch (error) {
      console.error("Error saving fuel price:", error);
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (price: FuelPriceData) => {
    setEditingPrice(price.fuelType);
    setEditValue(price.pricePerGallon.toString());
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="size-8 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
          <Fuel className="size-4 text-white" />
        </div>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Precio del Combustible
        </h3>
      </div>

      <div className="space-y-2">
        {/* Gasoline */}
        <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
          <span className="text-xs text-gray-500 dark:text-gray-400">Gasolina /gal</span>
          {editingPrice === "gasoline" ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                step="0.01"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-7 w-24 text-xs rounded-lg"
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => handleSave("gasoline")}
                disabled={saving}
              >
                <Check className="size-3.5 text-emerald-500" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => setEditingPrice(null)}
              >
                <X className="size-3.5 text-red-500" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {gasolinePrice ? formatCurrency(gasolinePrice.pricePerGallon) : "—"}
              </span>
              <button
                onClick={() => gasolinePrice ? startEditing(gasolinePrice) : setEditingPrice("gasoline")}
                className="size-6 rounded-md bg-gray-200 dark:bg-gray-600 flex items-center justify-center"
              >
                {gasolinePrice ? (
                  <Pencil className="size-3 text-gray-500 dark:text-gray-400" />
                ) : (
                  <Plus className="size-3 text-gray-500 dark:text-gray-400" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Diesel */}
        <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
          <span className="text-xs text-gray-500 dark:text-gray-400">Diésel /gal</span>
          {editingPrice === "diesel" ? (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                step="0.01"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-7 w-24 text-xs rounded-lg"
              />
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => handleSave("diesel")}
                disabled={saving}
              >
                <Check className="size-3.5 text-emerald-500" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => setEditingPrice(null)}
              >
                <X className="size-3.5 text-red-500" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-gray-900 dark:text-white">
                {dieselPrice ? formatCurrency(dieselPrice.pricePerGallon) : "—"}
              </span>
              <button
                onClick={() => dieselPrice ? startEditing(dieselPrice) : setEditingPrice("diesel")}
                className="size-6 rounded-md bg-gray-200 dark:bg-gray-600 flex items-center justify-center"
              >
                {dieselPrice ? (
                  <Pencil className="size-3 text-gray-500 dark:text-gray-400" />
                ) : (
                  <Plus className="size-3 text-gray-500 dark:text-gray-400" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Last updated */}
        {gasolinePrice && (
          <p className="text-[10px] text-gray-400 text-right">
            Actualizado: {formatDate(gasolinePrice.updatedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function Plus({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M5 12h14" /><path d="M12 5v14" />
    </svg>
  );
}
