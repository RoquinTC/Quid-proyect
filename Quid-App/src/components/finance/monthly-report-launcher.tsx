"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Copy,
  Share2,
  Loader2,
  Check,
  Sparkles,
  ImageDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  kpiChangeLabel,
  money,
  type KpiValue,
  type MonthlyReport,
} from "@/lib/finance/monthly-report";

const DONUT_COLORS = [
  "#0d9488", "#6366f1", "#f59e0b", "#e11d48", "#8b5cf6", "#0ea5e9",
  "#84cc16", "#f97316", "#14b8a6", "#a855f7",
];

function KpiCard({
  label,
  value,
  change,
  accent,
}: {
  label: string;
  value: KpiValue;
  change: string;
  accent: string;
}) {
  const positive = value.delta === null ? null : value.delta >= 0;
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-2.5">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className={`text-[15px] font-black leading-tight ${accent}`}>{money(value.value)}</p>
      <p className={`text-[10px] ${positive === null ? "text-gray-400" : positive ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
        {change}
      </p>
    </div>
  );
}

function Donut({ report }: { report: MonthlyReport }) {
  const top = report.distribution.slice(0, 6);
  let cursor = 0;
  const stops = top.map((entry, index) => {
    const start = cursor;
    cursor += entry.share;
    return `${DONUT_COLORS[index % DONUT_COLORS.length]} ${start}% ${cursor}%`;
  });
  if (cursor < 100) stops.push(`#e5e7eb ${cursor}% 100%`);

  const total = report.distribution.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="flex items-center gap-3">
      <div
        className="size-24 rounded-full shrink-0 relative"
        style={{ background: `conic-gradient(${stops.join(", ")})` }}
      >
        <div className="absolute inset-[22%] rounded-full bg-white dark:bg-gray-900 flex flex-col items-center justify-center">
          <span className="text-[9px] text-gray-400 leading-none">Gastos</span>
          <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200 leading-tight">
            {money(total)}
          </span>
        </div>
      </div>

      <div className="min-w-0 flex-1 space-y-1">
        {top.map((entry, index) => (
          <div key={entry.category} className="flex items-center gap-1.5 text-[11px]">
            <span
              className="size-2 rounded-full shrink-0"
              style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }}
            />
            <span className="truncate text-gray-600 dark:text-gray-300 flex-1">{entry.category}</span>
            <span className="text-gray-400 shrink-0">{Math.round(entry.share)} %</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Evolution({ report }: { report: MonthlyReport }) {
  const max = Math.max(...report.evolution.map((point) => Math.max(point.income, point.expense)), 1);

  return (
    <div className="flex items-end justify-between gap-2 h-28">
      {report.evolution.map((point) => (
        <div key={point.month} className="flex-1 flex flex-col items-center gap-1">
          <div className="flex items-end gap-0.5 h-20 w-full justify-center">
            <div
              className="w-1.5 rounded-t bg-emerald-400/80"
              style={{ height: `${Math.max(2, (point.income / max) * 100)}%` }}
              title={`Ingresos ${money(point.income)}`}
            />
            <div
              className="w-1.5 rounded-t bg-rose-400/80"
              style={{ height: `${Math.max(2, (point.expense / max) * 100)}%` }}
              title={`Gastos ${money(point.expense)}`}
            />
          </div>
          <span className="text-[9px] text-gray-400 capitalize">{point.label}</span>
        </div>
      ))}
    </div>
  );
}

function ReportBody({ report }: { report: MonthlyReport }) {
  const previousLabel = report.evolution.length > 1
    ? report.evolution[report.evolution.length - 2].label
    : "el mes anterior";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 p-4 text-white">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/70">Reporte mensual</p>
        <h3 className="text-lg font-black leading-tight capitalize">
          Así fueron tus finanzas en {report.label}
        </h3>
        <p className="mt-1.5 text-[11px] leading-relaxed text-white/90">{report.narrative}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard
          label="Ingresos"
          value={report.kpis.income}
          change={kpiChangeLabel(report.kpis.income, previousLabel)}
          accent="text-emerald-600 dark:text-emerald-400"
        />
        <KpiCard
          label="Gastos"
          value={report.kpis.expense}
          change={kpiChangeLabel(report.kpis.expense, previousLabel)}
          accent="text-rose-600 dark:text-rose-400"
        />
        <KpiCard
          label="Balance"
          value={report.kpis.balance}
          change={kpiChangeLabel(report.kpis.balance, previousLabel)}
          accent={report.kpis.balance.value >= 0 ? "text-gray-900 dark:text-white" : "text-rose-600 dark:text-rose-400"}
        />
        <div className="rounded-xl border border-gray-100 dark:border-gray-800 p-2.5">
          <p className="text-[10px] uppercase tracking-wider text-gray-400">Tasa de ahorro</p>
          <p className="text-[15px] font-black leading-tight text-gray-900 dark:text-white">
            {Math.round(report.kpis.savingRate.value)} %
          </p>
          <p className={`text-[10px] ${report.kpis.savingRate.delta === null ? "text-gray-400" : report.kpis.savingRate.delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
            {report.kpis.savingRate.delta === null
              ? "sin mes anterior"
              : `${report.kpis.savingRate.delta >= 0 ? "+" : ""}${Math.round(report.kpis.savingRate.delta)} puntos`}
          </p>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200">Últimos 6 meses</p>
          <div className="flex items-center gap-2 text-[9px] text-gray-400">
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-emerald-400" />Ingresos</span>
            <span className="flex items-center gap-1"><span className="size-1.5 rounded-full bg-rose-400" />Gastos</span>
          </div>
        </div>
        <Evolution report={report} />
      </div>

      {report.distribution.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 mb-1.5">A dónde se fue la plata</p>
          <Donut report={report} />
        </div>
      )}

      {report.expenses.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Gastos por categoría</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wider">
                  <th className="text-left font-semibold py-1">Categoría</th>
                  <th className="text-right font-semibold py-1">Ppto</th>
                  <th className="text-right font-semibold py-1">Ejecutado</th>
                  <th className="text-right font-semibold py-1">%</th>
                  <th className="text-right font-semibold py-1">Ant.</th>
                </tr>
              </thead>
              <tbody>
                {report.expenses.slice(0, 12).map((row) => {
                  const over = row.progress !== null && row.progress > 100;
                  return (
                    <tr key={row.category} className="border-t border-gray-50 dark:border-gray-800/60">
                      <td className="py-1 pr-2 text-gray-700 dark:text-gray-300 max-w-32 truncate">{row.category}</td>
                      <td className="py-1 text-right text-gray-400">{row.target > 0 ? money(row.target) : "—"}</td>
                      <td className="py-1 text-right font-semibold text-gray-800 dark:text-gray-100">{money(row.actual)}</td>
                      <td className={`py-1 text-right font-semibold ${over ? "text-rose-600 dark:text-rose-400" : "text-emerald-600 dark:text-emerald-400"}`}>
                        {row.progress === null ? "—" : `${Math.round(row.progress)} %`}
                      </td>
                      <td className="py-1 text-right text-gray-400">{money(row.previous)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report.incomes.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Ingresos por categoría</p>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-gray-400 uppercase tracking-wider">
                  <th className="text-left font-semibold py-1">Categoría</th>
                  <th className="text-right font-semibold py-1">Meta</th>
                  <th className="text-right font-semibold py-1">Recibido</th>
                  <th className="text-right font-semibold py-1">%</th>
                </tr>
              </thead>
              <tbody>
                {report.incomes.map((row) => (
                  <tr key={row.category} className="border-t border-gray-50 dark:border-gray-800/60">
                    <td className="py-1 pr-2 text-gray-700 dark:text-gray-300 max-w-32 truncate">{row.category}</td>
                    <td className="py-1 text-right text-gray-400">{row.target > 0 ? money(row.target) : "—"}</td>
                    <td className="py-1 text-right font-semibold text-emerald-600 dark:text-emerald-400">{money(row.actual)}</td>
                    <td className={`py-1 text-right font-semibold ${row.progress !== null && row.progress >= 100 ? "text-emerald-600 dark:text-emerald-400" : "text-gray-500 dark:text-gray-400"}`}>
                      {row.progress === null ? "—" : `${Math.round(row.progress)} %`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report.insights.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 mb-1.5">Lo que dicen las cifras</p>
          <div className="space-y-1">
            {report.insights.slice(0, 4).map((insight) => (
              <div key={insight.id} className="flex items-start gap-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-2">
                <Sparkles className="size-3 text-emerald-500 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100 leading-snug">{insight.title}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-snug line-clamp-2">{insight.body}</p>
                </div>
                {insight.metric && (
                  <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200 shrink-0">{insight.metric}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[9px] text-center text-gray-400">{report.footnote}</p>
    </div>
  );
}

function reportToText(report: MonthlyReport): string {
  const lines = [
    `Así fueron mis finanzas en ${report.label}`,
    "",
    `Ingresos: ${money(report.kpis.income.value)}`,
    `Gastos: ${money(report.kpis.expense.value)}`,
    `Balance: ${money(report.kpis.balance.value)}`,
    `Tasa de ahorro: ${Math.round(report.kpis.savingRate.value)} %`,
    "",
    report.narrative,
  ];

  if (report.distribution.length > 0) {
    lines.push("", "A dónde se fue la plata:");
    for (const entry of report.distribution.slice(0, 5)) {
      lines.push(`• ${entry.category}: ${money(entry.amount)} (${Math.round(entry.share)} %)`);
    }
  }

  lines.push("", "Generado con Quid");
  return lines.join("\n");
}

/**
 * F-09 · Reporte mensual compartible.
 *
 * La tarjeta abre el reporte del mes; se puede copiar o compartir como texto.
 * La imagen/PDF queda pendiente (necesita rasterizar el DOM).
 */
export function MonthlyReportLauncher() {
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [renderingImage, setRenderingImage] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<MonthlyReport>("/api/finance/monthly-report");
      setReport(data);
    } catch {
      toast.error("No se pudo cargar el reporte");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && !report) void load();
  }, [open, report, load]);

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(reportToText(report));
      setCopied(true);
      toast.success("Resumen copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const share = async () => {
    if (!report) return;
    const text = reportToText(report);
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: `Finanzas de ${report.label}`, text });
        return;
      } catch {
        // El usuario canceló: se cae a copiar.
      }
    }
    await copy();
  };

  /**
   * Imagen del reporte.
   *
   * Se rasteriza el DOM con `html-to-image` (cargado en diferido: no entra en
   * el arranque ni en el render del servidor).
   *
   * En el teléfono el `<a download>` de un blob NO guarda nada dentro del
   * WebView (el aviso anterior mentía). Ahí se escribe el PNG en la caché de la
   * app y se abre la hoja de compartir de Android, que es la que permite
   * guardarlo en Archivos, Drive o mandarlo por WhatsApp. En navegador se
   * mantiene la descarga directa.
   */
  const saveImage = async () => {
    const node = reportRef.current;
    if (!node || !report || renderingImage) return;

    setRenderingImage(true);
    try {
      const { toPng } = await import("html-to-image");
      const bodyBackground = getComputedStyle(document.body).backgroundColor;
      const background =
        bodyBackground && bodyBackground !== "rgba(0, 0, 0, 0)"
          ? bodyBackground
          : document.documentElement.classList.contains("dark")
            ? "#111827"
            : "#ffffff";
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: background,
      });

      const filename = `quid-reporte-${report.month}.png`;

      // ── Camino nativo (APK) ────────────────────────────────────────────
      let nativeFailed = false;
      if (Capacitor.isNativePlatform()) {
        try {
          const base64 = dataUrl.split(",")[1] ?? "";
          const saved = await Filesystem.writeFile({
            path: filename,
            data: base64,
            directory: Directory.Cache,
            recursive: true,
          });

          await Share.share({
            title: `Reporte de ${report.label}`,
            files: [saved.uri],
            dialogTitle: "Guardar o compartir el reporte",
          });
          toast.success("Elige dónde guardarlo o con quién compartirlo");
          return;
        } catch (nativeError) {
          // APK vieja sin los plugins: se avisa en vez de fingir una descarga.
          console.warn("[Reporte] Sin plugins nativos:", nativeError);
          nativeFailed = true;
        }
      }

      if (nativeFailed) {
        toast.error("Tu APK no puede guardar archivos. Actualízala en Ajustes → Buscar actualización.");
        return;
      }

      // ── Navegador ──────────────────────────────────────────────────────
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], filename, { type: "image/png" });

      const canShareFiles =
        typeof navigator !== "undefined" &&
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [file] });

      if (canShareFiles) {
        await navigator.share({
          files: [file],
          title: `Finanzas de ${report.label}`,
          text: report.narrative,
        });
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("Imagen descargada");
    } catch (error) {
      console.error("[Reporte] No se pudo generar la imagen:", error);
      // Se muestra el motivo: en el teléfono no hay consola a mano.
      const detail = error instanceof Error ? error.message : "error desconocido";
      toast.error(`No se pudo generar la imagen (${detail.slice(0, 70)})`);
    } finally {
      setRenderingImage(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900/40 p-3 text-left shadow-sm hover:border-emerald-200 dark:hover:border-emerald-900/50 transition-colors"
        >
          <div className="size-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shrink-0">
            <FileText className="size-4 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-gray-900 dark:text-white">Reporte del mes</p>
            <p className="text-[11px] text-gray-400">KPIs, evolución, distribución y hallazgos · listo para compartir</p>
          </div>
          <Badge variant="secondary" className="text-[10px] bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 shrink-0">
            Nuevo
          </Badge>
        </button>
      </SheetTrigger>

      <SheetContent side="bottom" className="h-[92vh] rounded-t-3xl p-0 flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <SheetTitle className="text-sm font-bold">Reporte mensual</SheetTitle>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-xl px-2 text-[11px] gap-1"
              onClick={() => void saveImage()}
              disabled={!report || renderingImage}
            >
              {renderingImage ? <Loader2 className="size-3 animate-spin" /> : <ImageDown className="size-3" />}
              Imagen
            </Button>
            <Button variant="outline" size="sm" className="h-7 rounded-xl px-2 text-[11px] gap-1" onClick={copy} disabled={!report}>
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              Copiar
            </Button>
            <Button size="sm" className="h-7 rounded-xl px-2 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={share} disabled={!report}>
              <Share2 className="size-3" />
              Compartir
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-emerald-500" />
            </div>
          )}

          {!loading && !report && (
            <div className="py-16 text-center">
              <p className="text-sm text-gray-500">No se pudo cargar el reporte.</p>
              <Button variant="outline" className="mt-3 rounded-xl text-xs" onClick={() => void load()}>
                Reintentar
              </Button>
            </div>
          )}

          {!loading && report && (
            <div ref={reportRef} className="bg-white dark:bg-gray-900 p-1">
              <ReportBody report={report} />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
