"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowRightLeft } from "lucide-react";
import { UNITS, areUnitsCompatible, convertQuantity, unitLabel } from "@/lib/pantry/units";

/**
 * Conversor de unidades.
 *
 * Usa el catálogo compartido de `@/lib/pantry/units` — el mismo que resuelve el
 * precio de una línea cuando la tienda cobra en otra unidad. Antes tenía sus
 * propias tablas, así que el conversor y el motor de precios podían discrepar.
 *
 * Solo ofrece destinos de la **misma dimensión**: convertir kg a mililitros no
 * tiene sentido físico y ofrecerlo sería una trampa.
 */
interface UnitConverterProps {
  unit?: string;
  quantity?: number;
}

export function UnitConverter({ unit: initialUnit = "kg", quantity: initialQuantity = 1 }: UnitConverterProps) {
  const [fromUnit, setFromUnit] = useState(initialUnit);
  const [toUnit, setToUnit] = useState("");
  const [fromValue, setFromValue] = useState(initialQuantity);

  const fromDefinition = UNITS.find((u) => u.code === fromUnit);
  const convertible = fromDefinition?.dimension === "mass" || fromDefinition?.dimension === "volume";

  /** Solo unidades de la misma dimensión, sin repetir la de origen. */
  const availableToUnits = useMemo(
    () =>
      UNITS.filter(
        (u) => u.code !== fromUnit && areUnitsCompatible(fromUnit, u.code)
      ),
    [fromUnit]
  );

  const result = useMemo(() => {
    if (!toUnit || !fromValue) return null;
    const { quantity: converted, converted: ok } = convertQuantity(fromValue, fromUnit, toUnit);
    return ok ? converted : null;
  }, [fromUnit, toUnit, fromValue]);

  if (!convertible) {
    return (
      <p className="text-[11.5px] italic text-gray-500">
        &quot;{unitLabel(fromUnit)}&quot; es una unidad de conteo: no hay nada que convertir.
      </p>
    );
  }

  return (
    <Card className="border border-cyan-200 bg-cyan-50/50 dark:border-cyan-900 dark:bg-cyan-950/20">
      <CardContent className="space-y-3 p-3">
        <div className="flex items-center gap-2 text-[11.5px] font-medium text-cyan-700 dark:text-cyan-400">
          <ArrowRightLeft className="size-3.5" />
          Conversor de unidades
        </div>

        <div className="grid grid-cols-3 items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[11px]">Cantidad</Label>
            <Input
              type="number"
              step="0.001"
              value={fromValue}
              onChange={(e) => setFromValue(parseFloat(e.target.value) || 0)}
              className="h-8 rounded-lg text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">De</Label>
            <Select
              value={fromUnit}
              onValueChange={(v) => {
                setFromUnit(v);
                setToUnit("");
              }}
            >
              <SelectTrigger className="h-8 rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {UNITS.filter((u) => u.dimension === "mass" || u.dimension === "volume").map((u) => (
                  <SelectItem key={u.code} value={u.code}>
                    {unitLabel(u.code)} ({u.dimension === "mass" ? "peso" : "volumen"})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[11px]">A</Label>
            <Select value={toUnit} onValueChange={setToUnit}>
              <SelectTrigger className="h-8 rounded-lg text-xs">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {availableToUnits.map((u) => (
                  <SelectItem key={u.code} value={u.code}>
                    {unitLabel(u.code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {result !== null && toUnit && (
          <div className="rounded-lg bg-white p-2 text-center dark:bg-gray-800">
            <span className="text-[12.5px] font-semibold text-gray-900 dark:text-white">
              {fromValue} {unitLabel(fromUnit)} ={" "}
              {Math.round(result * 1000) / 1000} {unitLabel(toUnit)}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
