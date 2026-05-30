"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ShoppingCart,
  Refrigerator,
  Sparkles,
  Scale,
  ListPlus,
} from "lucide-react";

type PantrySettingsProps = {
  setResetResult: (msg: string | null) => void;
};

export function PantrySettings({ setResetResult }: PantrySettingsProps) {
  const [minStockBuffer, setMinStockBuffer] = useState("30");
  const [metricSystem, setMetricSystem] = useState("metric");
  const [allergyAlerts, setAllergyAlerts] = useState(false);
  const [autoShoppingList, setAutoShoppingList] = useState(true);

  const saveSettings = () => {
    setResetResult("Ajustes de despensa guardados");
    setTimeout(() => setResetResult(null), 2000);
  };

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={[]} className="space-y-2">
        {/* Inventario de Alimentos */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="inventario" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <Refrigerator className="size-4 text-amber-600" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Inventario y Stock Ideal</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center">
                        <Refrigerator className="size-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Margen de stock mínimo</p>
                        <p className="text-xs text-gray-400">Comprar cuando el stock caiga del</p>
                      </div>
                    </div>
                    <Select value={minStockBuffer} onValueChange={setMinStockBuffer}>
                      <SelectTrigger className="w-24 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10%</SelectItem>
                        <SelectItem value="20">20%</SelectItem>
                        <SelectItem value="30">30%</SelectItem>
                        <SelectItem value="50">50%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center">
                        <Scale className="size-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Sistema de unidades</p>
                        <p className="text-xs text-gray-400">Unidades de peso y volumen</p>
                      </div>
                    </div>
                    <Select value={metricSystem} onValueChange={setMetricSystem}>
                      <SelectTrigger className="w-28 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="metric">Métrico (g, ml, kg)</SelectItem>
                        <SelectItem value="imperial">Imperial (oz, lb, fl oz)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Automatizaciones de Compra y Perfiles */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="recetas" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <ListPlus className="size-4 text-emerald-600" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Lista de Mercado y Perfiles</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 flex items-center justify-center">
                        <ShoppingCart className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Auto-relleno de Mercado</p>
                        <p className="text-xs text-gray-400">Agregar agotados a la lista de compras</p>
                      </div>
                    </div>
                    <Switch checked={autoShoppingList} onCheckedChange={setAutoShoppingList} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center">
                        <Sparkles className="size-3.5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Alertas Alergénicas</p>
                        <p className="text-xs text-gray-400">Advertir ingredientes incompatibles</p>
                      </div>
                    </div>
                    <Switch checked={allergyAlerts} onCheckedChange={setAllergyAlerts} />
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>
      </Accordion>

      <Button
        className="w-full bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white rounded-xl py-5 shadow-md shadow-amber-500/10 font-bold text-xs"
        onClick={saveSettings}
      >
        Guardar Configuración de Despensa
      </Button>
    </div>
  );
}
