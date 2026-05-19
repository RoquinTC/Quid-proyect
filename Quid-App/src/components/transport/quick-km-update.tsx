"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { Loader2, Gauge, TrendingUp } from "lucide-react";

interface QuickKmUpdateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicleId: string;
  vehicleName: string;
  currentKm: number;
  onSuccess?: () => void;
}

export function QuickKmUpdate({
  open,
  onOpenChange,
  vehicleId,
  vehicleName,
  currentKm,
  onSuccess,
}: QuickKmUpdateProps) {
  const [loading, setLoading] = useState(false);
  const [newKm, setNewKm] = useState("");

  const kmDiff = newKm ? parseFloat(newKm) - currentKm : 0;
  const isValid = newKm && parseFloat(newKm) > currentKm;

  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await apiFetch(`/api/vehicles/${vehicleId}`, {
        method: "PUT",
        body: JSON.stringify({ currentKm: parseFloat(newKm) }),
      });

      onSuccess?.();
      onOpenChange(false);
      setNewKm("");
    } catch (error) {
      console.error("Error updating km:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Actualizar Kilometraje</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-4 pb-6">
          {/* Vehicle name */}
          <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl">
            <Gauge className="size-4 text-cyan-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {vehicleName}
            </span>
            <span className="text-xs text-gray-400 ml-auto">
              Actual: {currentKm.toLocaleString("es-CO")} km
            </span>
          </div>

          {/* New KM input */}
          <div className="space-y-2">
            <Label htmlFor="new-km">Nuevo kilometraje</Label>
            <Input
              id="new-km"
              type="number"
              placeholder={`Ej: ${(currentKm + 100).toLocaleString("es-CO")}`}
              value={newKm}
              onChange={(e) => setNewKm(e.target.value)}
              className="rounded-xl text-lg font-semibold"
              autoFocus
            />
          </div>

          {/* KM difference preview */}
          {isValid && (
            <div className="flex items-center gap-2 p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-xl">
              <TrendingUp className="size-4 text-cyan-600" />
              <span className="text-sm text-cyan-700 dark:text-cyan-300">
                +{kmDiff.toLocaleString("es-CO")} km desde la última lectura
              </span>
            </div>
          )}

          {/* Error message */}
          {newKm && !isValid && parseFloat(newKm) <= currentKm && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <span className="text-sm text-red-600 dark:text-red-400">
                El nuevo kilometraje debe ser mayor a {currentKm.toLocaleString("es-CO")} km
              </span>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || !isValid}
            className="w-full rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            Actualizar Kilometraje
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
