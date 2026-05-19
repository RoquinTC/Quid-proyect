"use client";

import { useState, useMemo } from "react";
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

// Conversion rates relative to base units: kg for weight, l for volume
const weightConversions: Record<string, number> = {
  kg: 1,
  g: 0.001,
  lb: 0.453592,
  oz: 0.0283495,
};

const volumeConversions: Record<string, number> = {
  l: 1,
  ml: 0.001,
};

const weightUnits = Object.keys(weightConversions);
const volumeUnits = Object.keys(volumeConversions);

const unitLabels: Record<string, string> = {
  unit: "Unidad",
  lb: "Libra",
  kg: "Kilogramo",
  g: "Gramo",
  oz: "Onza",
  ml: "Mililitro",
  l: "Litro",
  package: "Paquete",
  bottle: "Botella",
  can: "Lata",
};

interface UnitConverterProps {
  unit?: string;
  quantity?: number;
}

export function UnitConverter({ unit: initialUnit = "kg", quantity: initialQuantity = 1 }: UnitConverterProps) {
  const [fromUnit, setFromUnit] = useState(initialUnit);
  const [toUnit, setToUnit] = useState("");
  const [fromValue, setFromValue] = useState(initialQuantity);

  const isWeight = (u: string) => u in weightConversions;
  const isVolume = (u: string) => u in volumeConversions;

  const availableToUnits = isWeight(fromUnit)
    ? weightUnits.filter((u) => u !== fromUnit)
    : isVolume(fromUnit)
    ? volumeUnits.filter((u) => u !== fromUnit)
    : [];

  const result = useMemo(() => {
    if (!toUnit || !fromValue) return null;

    const fromBase = isWeight(fromUnit) ? weightConversions[fromUnit] : volumeConversions[fromUnit];
    const toBase = isWeight(toUnit) ? weightConversions[toUnit] : volumeConversions[toUnit];

    if (!fromBase || !toBase) return null;

    const valueInBase = fromValue * fromBase;
    return valueInBase / toBase;
  }, [fromUnit, toUnit, fromValue]);

  if (!isWeight(fromUnit) && !isVolume(fromUnit)) {
    return (
      <p className="text-xs text-gray-500 italic">
        Conversión no disponible para la unidad &quot;{unitLabels[fromUnit]}&quot;
      </p>
    );
  }

  return (
    <Card className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10">
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
          <ArrowRightLeft className="size-3.5" />
          Conversor de unidades
        </div>

        <div className="grid grid-cols-3 gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-[10px]">Cantidad</Label>
            <Input
              type="number"
              step="0.1"
              value={fromValue}
              onChange={(e) => setFromValue(parseFloat(e.target.value) || 0)}
              className="rounded-lg h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">De</Label>
            <Select value={fromUnit} onValueChange={setFromUnit}>
              <SelectTrigger className="rounded-lg h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(isWeight(fromUnit) ? weightUnits : volumeUnits).map((u) => (
                  <SelectItem key={u} value={u}>
                    {unitLabels[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">A</Label>
            <Select value={toUnit} onValueChange={setToUnit}>
              <SelectTrigger className="rounded-lg h-8 text-xs">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {availableToUnits.map((u) => (
                  <SelectItem key={u} value={u}>
                    {unitLabels[u]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {result !== null && toUnit && (
          <div className="text-center p-2 bg-white dark:bg-gray-800 rounded-lg">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {fromValue} {unitLabels[fromUnit]} ={" "}
              {result % 1 === 0 ? result : result.toFixed(3)} {unitLabels[toUnit]}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
