"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { DaySelect } from "@/components/ui/day-select";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Calendar,
  Landmark,
  RefreshCw,
  Info,
  Loader2,
  AlertTriangle,
  Upload,
  Download,
  Tags,
  ArrowRightLeft,
  Target,
  CreditCard,
  PiggyBank,
  ChevronRight,
  Database,
  Lock,
} from "lucide-react";
import { AccountManager } from "@/components/finance/account-manager";
import { CategoriesManager } from "@/components/finance/categories-manager";
import { apiFetch } from "@/lib/api";

type AppSettings = {
  budgetCutoffDay: number;
  respectHolidays: boolean;
  needsBudgetReset: boolean;
  lastBudgetReset?: string | null;
  currentPeriod?: {
    start: string;
    end: string;
  } | null;
};

type FinanceSettingsProps = {
  settings: AppSettings;
  updateSetting: (key: string, value: unknown) => Promise<void>;
  fetchSettings: () => Promise<void>;
  setResetResult: (msg: string | null) => void;
};

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Bogota",
  });
}

function SectionHeader({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  badge,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  title: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-3 w-full">
      <div className={`size-8 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`size-4 ${iconColor}`} />
      </div>
      <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
      {badge && (
        <Badge variant="secondary" className="text-xs ml-auto mr-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          {badge}
        </Badge>
      )}
    </div>
  );
}

export function FinanceSettings({
  settings,
  updateSetting,
  fetchSettings,
  setResetResult,
}: FinanceSettingsProps) {
  const [resetting, setResetting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState<string | null>(null);
  const [importingTransactions, setImportingTransactions] = useState(false);
  const [transactionImportResult, setTransactionImportResult] = useState<{
    success: boolean;
    result?: { total: number; created: number; skipped: number; errors: string[] };
  } | null>(null);

  const transactionFileRef = useRef<HTMLInputElement>(null);

  const handleResetBudgets = async () => {
    setResetting(true);
    try {
      const result = await apiFetch<{ message: string; reset: boolean; count: number }>("/api/settings/reset-budgets", {
        method: "POST",
      });
      if (result.reset) {
        setResetResult(`Se reiniciaron ${result.count} presupuesto(s)`);
        fetchSettings();
      } else {
        setResetResult(result.message);
      }
      setTimeout(() => setResetResult(null), 4000);
    } catch (error) {
      console.error("Error resetting budgets:", error);
      setResetResult("Error al reiniciar presupuestos");
    } finally {
      setResetting(false);
    }
  };

  const handleDownloadTemplate = async (type: string) => {
    setDownloadingTemplate(type);
    try {
      const response = await fetch(`/api/settings/import/template?type=${type}`);
      if (!response.ok) throw new Error("Error al descargar plantilla");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `quid-plantilla-${type}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download template error:", error);
    } finally {
      setDownloadingTemplate(null);
    }
  };

  const handleTransactionImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportingTransactions(true);
    setTransactionImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/settings/import/transactions", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();
      setTransactionImportResult(data);
      if (data.success) {
        setResetResult("¡Importación exitosa!");
        setTimeout(() => setResetResult(null), 3000);
      }
    } catch (error) {
      console.error("Transaction import error:", error);
      setTransactionImportResult({ success: false });
    } finally {
      setImportingTransactions(false);
      if (transactionFileRef.current) transactionFileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      <Accordion type="multiple" defaultValue={[]} className="space-y-2">
        {/* Ciclo y Presupuesto */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="ciclo" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Calendar} iconColor="text-teal-600" iconBg="bg-teal-100 dark:bg-teal-900/30" title="Ciclo y Parámetros Mensuales" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              {/* Día de Corte */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Calendar className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Día de corte del presupuesto</p>
                      <p className="text-xs text-gray-400">Día de inicio del ciclo financiero</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-1">
                    <Label className="text-xs text-gray-500 shrink-0">Día</Label>
                    <DaySelect
                      value={settings.budgetCutoffDay}
                      onValueChange={(d) => updateSetting("budgetCutoffDay", d)}
                      placeholder="Día"
                      className="w-24 rounded-xl h-9"
                    />
                    <span className="text-[11px] text-gray-400">de cada mes</span>
                  </div>
                  {settings.currentPeriod && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-2.5">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-0.5">Período actual activo</p>
                      <p className="text-[11px] text-gray-700 dark:text-gray-300">
                        {formatDateShort(settings.currentPeriod.start)} — {formatDateShort(settings.currentPeriod.end)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Considerar Días Festivos */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                        <Info className="size-3.5 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-gray-900 dark:text-white">Considerar días festivos</p>
                        <p className="text-xs text-gray-400">Mover corte a día hábil anterior</p>
                      </div>
                    </div>
                    <Switch
                      checked={settings.respectHolidays}
                      onCheckedChange={(val) => updateSetting("respectHolidays", val)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Reiniciar Presupuestos */}
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <RefreshCw className="size-3.5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Reiniciar presupuestos</p>
                      <p className="text-xs text-gray-400">Restablece acumulados de gastos</p>
                    </div>
                  </div>
                  {settings.needsBudgetReset && (
                    <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl p-2 flex items-start gap-2">
                      <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        Presupuestos pendientes por reiniciar en el ciclo actual.
                      </p>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    className="w-full rounded-xl text-xs gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-900/10 h-8"
                    onClick={handleResetBudgets}
                    disabled={resetting}
                  >
                    {resetting ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Reiniciar Ahora
                  </Button>
                  {settings.lastBudgetReset && (
                    <p className="text-xs text-center text-gray-400">
                      Último reinicio: {formatDateShort(settings.lastBudgetReset)}
                    </p>
                  )}
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Cuentas Financieras */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="cuentas" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Database} iconColor="text-teal-600" iconBg="bg-teal-100 dark:bg-teal-900/30" title="Gestión de Cuentas" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="size-8 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                      <Landmark className="size-3.5 text-teal-600 dark:text-teal-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Cuentas y Tarjetas</p>
                      <p className="text-xs text-gray-400">Ver saldos, editar límites y subcuentas</p>
                    </div>
                  </div>
                  <AccountManager />
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Categorías de Presupuesto */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="categorias" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Tags} iconColor="text-violet-600" iconBg="bg-violet-100 dark:bg-violet-900/30" title="Categorías y Subcategorías" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <Card className="border border-gray-100 dark:border-gray-700/50 shadow-none rounded-xl">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                      <Tags className="size-3.5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900 dark:text-white">Catálogo de Conceptos</p>
                      <p className="text-xs text-gray-400">Personaliza la clasificación de movimientos</p>
                    </div>
                  </div>
                  <CategoriesManager />
                </CardContent>
              </Card>
            </AccordionContent>
          </AccordionItem>
        </Card>

        {/* Importación y Cargue */}
        <Card className="border-0 shadow-sm rounded-xl overflow-hidden">
          <AccordionItem value="importacion" className="border-0">
            <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-gray-50 dark:hover:bg-gray-800/50">
              <SectionHeader icon={Upload} iconColor="text-indigo-600" iconBg="bg-indigo-100 dark:bg-indigo-900/30" title="Cargue e Importación Masiva" badge="Excel" />
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4 space-y-3">
              {/* Cargue de Movimientos */}
              <Card className="border border-emerald-200 dark:border-emerald-800/40 shadow-none rounded-xl">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <ArrowRightLeft className="size-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">Movimientos Financieros</p>
                      <p className="text-xs text-gray-400">Importación de históricos e ingresos/egresos</p>
                    </div>
                  </div>
                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl p-2.5 space-y-1.5">
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      Estructura requerida del Excel:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-[11px] bg-emerald-100 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md">Ingresos</span>
                      <span className="text-[11px] bg-rose-100 dark:bg-rose-900/20 text-rose-700 dark:text-rose-400 px-2 py-0.5 rounded-md">Gastos</span>
                      <span className="text-[11px] bg-blue-100 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-md">Transferencias</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1 rounded-xl text-xs gap-1.5 border-emerald-200 text-emerald-600 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 h-8"
                      onClick={() => handleDownloadTemplate("movimientos")}
                      disabled={downloadingTemplate === "movimientos"}
                    >
                      {downloadingTemplate === "movimientos" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                      Plantilla (.xlsx)
                    </Button>
                    <Button
                      className="flex-1 rounded-xl text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white h-8"
                      onClick={() => transactionFileRef.current?.click()}
                      disabled={importingTransactions}
                    >
                      {importingTransactions ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                      Subir Archivo
                    </Button>
                  </div>
                  <input
                    ref={transactionFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={handleTransactionImport}
                  />

                  {transactionImportResult && (
                    <div className={`rounded-xl p-2.5 ${transactionImportResult.success ? "bg-emerald-50 dark:bg-emerald-900/10" : "bg-red-50 dark:bg-red-900/10"}`}>
                      {transactionImportResult.result ? (
                        <div className="text-xs space-y-1">
                          <p className={transactionImportResult.success ? "text-emerald-600 dark:text-emerald-400 font-medium" : "text-red-600 dark:text-red-400 font-medium"}>
                            {transactionImportResult.result.created} creados de {transactionImportResult.result.total}
                          </p>
                          {transactionImportResult.result.skipped > 0 && (
                            <p className="text-amber-600 dark:text-amber-400">{transactionImportResult.result.skipped} omitidos</p>
                          )}
                          {transactionImportResult.result.errors.length > 0 && (
                            <div className="text-red-500 max-h-20 overflow-y-auto space-y-0.5">
                              {transactionImportResult.result.errors.slice(0, 3).map((err, i) => (
                                <p key={i}>{err}</p>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-red-600 dark:text-red-400">Error al procesar el archivo Excel.</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* CDTs, Deudas, Metas placeholders */}
              <div className="space-y-2 opacity-60">
                <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800/30 rounded-xl">
                  <div className="flex items-center gap-2">
                    <Target className="size-4 text-blue-500" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Presupuestos y Exclusiones</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-400 border-0">Próximamente</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800/30 rounded-xl">
                  <div className="flex items-center gap-2">
                    <CreditCard className="size-4 text-red-500" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Deudas y Tarjetas de Crédito</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-400 border-0">Próximamente</Badge>
                </div>
                <div className="flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-800/30 rounded-xl">
                  <div className="flex items-center gap-2">
                    <PiggyBank className="size-4 text-violet-500" />
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Metas de Ahorro y CDTs</span>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-gray-100 text-gray-400 border-0">Próximamente</Badge>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Card>
      </Accordion>
    </div>
  );
}
