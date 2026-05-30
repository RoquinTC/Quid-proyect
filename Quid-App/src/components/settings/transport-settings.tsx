"use client";

import { useRef, useState } from "react";
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
  Car,
  Fuel,
  Wrench,
  ShieldAlert,
  Loader2,
  Settings,
  Bell,
  Gauge,
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

type TransportSettingsProps = {
  setResetResult: (msg: string | null) => void;
};

export function TransportSettings({ setResetResult }: TransportSettingsProps) {
  const [fuelPrice, setFuelPrice] = useState("15500");
  const [fuelUnit, setFuelUnit] = useState("galon");
  const [oilInterval, setOilInterval] = useState("5000");
  const [tireRotationInterval, setTireRotationInterval] = useState("10000");
  const [alertSoat, setAlertSoat] = useState(true);
  const [alertTecno, setAlertTecno] = useState(true);
  const [alertDaysBefore, setAlertDaysBefore] = useState("15");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    total: number;
    created: number;
    skipped: number;
    fuelLogs: number;
    maintenanceRecords: number;
    documents: number;
    errors: string[];
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const saveSettings = () => {
    setResetResult("Ajustes de transporte guardados");
    setTimeout(() => setResetResult(null), 2000);
  };

  const downloadTemplate = async () => {
    try {
      const response = await fetch("/api/vehicles/import/template");
      if (!response.ok) throw new Error("No se pudo descargar la plantilla");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "quid-plantilla-transporte.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setResetResult(error instanceof Error ? error.message : "No se pudo descargar la plantilla");
    }
  };

  const importHistory = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/vehicles/import/history", { method: "POST", body: formData });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo importar el historial");
      setImportResult(data.result);
      setResetResult(`Carga histórica completada: ${data.result.created} registros creados`);
      setTimeout(() => setResetResult(null), 4000);
    } catch (error) {
      setResetResult(error instanceof Error ? error.message : "No se pudo importar el historial");
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={[]} className="space-y-2">
        {/* Combustible */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="combustible" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  <Fuel className="size-4 text-blue-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Precios y Unidades de Combustible</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fuel-price" className="text-xs text-gray-500">Precio promedio de combustible por defecto</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">$</span>
                        <input
                          id="fuel-price"
                          type="number"
                          value={fuelPrice}
                          onChange={(e) => setFuelPrice(e.target.value)}
                          className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl pl-6 pr-4 py-2 text-xs font-semibold outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                      <Select value={fuelUnit} onValueChange={setFuelUnit}>
                        <SelectTrigger className="w-28 rounded-xl text-xs h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="galon">Galón</SelectItem>
                          <SelectItem value="litro">Litro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Recordatorios de Mantenimiento */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="mantenimiento" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                  <Wrench className="size-4 text-violet-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Alertas de Mantenimiento</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-violet-50 dark:bg-violet-950/20 flex items-center justify-center">
                        <Gauge className="size-3.5 text-violet-600 dark:text-violet-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Cambio de Aceite</p>
                        <p className="text-xs text-gray-400">Recomendar cambio cada</p>
                      </div>
                    </div>
                    <Select value={oilInterval} onValueChange={setOilInterval}>
                      <SelectTrigger className="w-28 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5000">5.000 Km</SelectItem>
                        <SelectItem value="8000">8.000 Km</SelectItem>
                        <SelectItem value="10000">10.000 Km</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-blue-50 dark:bg-blue-950/20 flex items-center justify-center">
                        <Gauge className="size-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Rotación de Llantas</p>
                        <p className="text-xs text-gray-400">Recomendar rotación cada</p>
                      </div>
                    </div>
                    <Select value={tireRotationInterval} onValueChange={setTireRotationInterval}>
                      <SelectTrigger className="w-28 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5000">5.000 Km</SelectItem>
                        <SelectItem value="10000">10.000 Km</SelectItem>
                        <SelectItem value="15000">15.000 Km</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Documentos Legales */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="documentos" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center shrink-0">
                  <ShieldAlert className="size-4 text-rose-500" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Vencimiento de Documentos</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-rose-50 dark:bg-rose-950/20 flex items-center justify-center">
                        <ShieldAlert className="size-3.5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Alertas SOAT</p>
                        <p className="text-xs text-gray-400">Recordar renovación anual</p>
                      </div>
                    </div>
                    <Switch checked={alertSoat} onCheckedChange={setAlertSoat} />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-amber-50 dark:bg-amber-950/20 flex items-center justify-center">
                        <ShieldAlert className="size-3.5 text-amber-600 dark:text-amber-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Alertas Técnico-Mecánica</p>
                        <p className="text-xs text-gray-400">Revisión anual obligatoria</p>
                      </div>
                    </div>
                    <Switch checked={alertTecno} onCheckedChange={setAlertTecno} />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Label htmlFor="days-before" className="text-xs text-gray-500">Antelación del recordatorio</Label>
                    <Select value={alertDaysBefore} onValueChange={setAlertDaysBefore}>
                      <SelectTrigger className="w-24 rounded-xl text-xs h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="7">7 días</SelectItem>
                        <SelectItem value="15">15 días</SelectItem>
                        <SelectItem value="30">30 días</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Cargue histórico */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="importacion" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <div className="flex items-center gap-3 w-full">
                <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="size-4 text-emerald-600" />
                </div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white">Cargue de Historial</span>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-900 dark:text-white">Importa datos de Drivvo u otra aplicación</p>
                    <p className="text-[11px] leading-relaxed text-gray-400 mt-1">
                      Descarga la plantilla, completa combustible, mantenimientos o documentos y vuelve a cargarla.
                      Los históricos no modifican saldos financieros.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button type="button" variant="outline" className="rounded-xl gap-2 text-xs" onClick={downloadTemplate}>
                      <Download className="size-3.5" />
                      Descargar plantilla
                    </Button>
                    <Button
                      type="button"
                      className="rounded-xl gap-2 text-xs bg-emerald-600 hover:bg-emerald-700"
                      disabled={importing}
                      onClick={() => importInputRef.current?.click()}
                    >
                      {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                      {importing ? "Importando..." : "Cargar Excel"}
                    </Button>
                    <input
                      ref={importInputRef}
                      type="file"
                      className="hidden"
                      accept=".xlsx,.xls"
                      onChange={importHistory}
                    />
                  </div>
                </CardContent>
              </Card>

              {importResult && (
                <div className="rounded-xl border border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/70 dark:bg-emerald-950/10 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-4 text-emerald-600" />
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                      {importResult.created} de {importResult.total} registros creados
                    </p>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {importResult.fuelLogs} tanqueos · {importResult.maintenanceRecords} mantenimientos · {importResult.documents} documentos
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="text-[11px] text-amber-600">{importResult.skipped} registros omitidos por duplicados o datos incompletos.</p>
                  )}
                  {importResult.errors.slice(0, 4).map((error, index) => (
                    <p key={`${error}-${index}`} className="flex gap-1 text-[11px] text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="size-3 shrink-0 mt-0.5" />
                      {error}
                    </p>
                  ))}
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Card>
      </Accordion>

      <Button
        className="w-full bg-gradient-to-br from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-xl py-5 shadow-md shadow-blue-500/10 font-bold text-xs"
        onClick={saveSettings}
      >
        Guardar Configuración de Transporte
      </Button>
    </div>
  );
}
