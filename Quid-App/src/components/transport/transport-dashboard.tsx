"use client";

/**
 * Transport Dashboard — the module's landing view, Drivvo-style.
 *
 * Layout is adapted from Drivvo's report/insight cards (icon box + label +
 * sub-label + big colored value + two-column footer) but rebuilt with Quid's
 * Tailwind tokens and dark mode. Everything shown here is either already
 * computed by the page (KPI values passed as props, so there is a single source
 * of truth) or produced by the pure prediction engine in
 * `@/lib/transport-prediction`.
 *
 * The hero card with the vehicle photo, plate and odometer is intentionally NOT
 * part of this component: it stays in the page, above the dashboard.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock,
  DollarSign,
  FileText,
  Fuel,
  Gauge,
  HelpCircle,
  Plus,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { formatCurrency } from "@/lib/api";
import { describeEfficiencyQuality, bucketEfficiency, type EfficiencySummary } from "@/lib/fuel-efficiency";
import {
  countActionable,
  describeDays,
  describeKm,
  describeProjection,
  type UpcomingItem,
  type UpcomingSeverity,
} from "@/lib/transport-prediction";

// ─── Prop types (structural, so the page keeps ownership of its own types) ───

export interface DashboardVehicle {
  id: string;
  name: string;
  plate?: string | null;
  currentKm: number;
  tankCapacity?: number | null;
  fuelType?: string | null;
  fuelLevel?: number;
  currentFuel?: number;
  estimatedRange?: number;
  avgKmPerGallon?: number;
  avgKmPerDay?: number;
  daysUntilRefuel?: number | null;
  refuelByDate?: string | null;
  gallonsToRefuel?: number;
  isLowFuel?: boolean;
  isLearning?: boolean;
  anomalyDetected?: boolean;
  lastPricePerGallon?: number;
  fuelLogs?: Array<{ id: string; date: string; km: number; amount: number }>;
  // Why the fuel level says what it says.
  fuelModel?: "full-tank" | "rough" | "none";
  assumedTankCapacity?: number;
  kmSinceFullTank?: number;
  consumedSinceFullTank?: number;
  partialsAddedSinceFullTank?: number;
  daysSinceLastLog?: number | null;
  fuelConfidence?: "high" | "medium" | "low";
  fuelConfidenceReasons?: string[];
}

export interface TransportDashboardProps {
  vehicle: DashboardVehicle;
  /** Blended cost per km (fuel + maintenance), already computed by the page. */
  costPerKm: number | null;
  /** Fuel + maintenance spend for the current month. */
  monthlyCost: number;
  monthlyFuelCost?: number;
  monthlyMaintenanceCost?: number;
  totalSpent?: number;
  /** Unified forecast, from `buildUpcoming`. */
  upcoming: UpcomingItem[];
  /** Tank-to-tank efficiency detail, from `summarizeEfficiency`. */
  efficiency?: EfficiencySummary | null;
  /** Km captured between the first and last fuel log. */
  trackedKm?: number;
  onLogFuel: () => void;
  onLogMaintenance: () => void;
  onRegisterDocument: () => void;
  onCreateReminder: () => void;
  onUpdateKm?: () => void;
  onOpenFuelDetails?: () => void;
  onOpenUpcoming?: (item: UpcomingItem) => void;
}

// ─── Tone maps (explicit class strings: Tailwind cannot see built-up names) ───

type Tone = "amber" | "cyan" | "rose" | "emerald" | "violet";

const TONE_STYLES: Record<
  Tone,
  { box: string; label: string; value: string; ring: string }
> = {
  amber: {
    box: "bg-amber-500/90 text-white",
    label: "text-amber-700 dark:text-amber-300",
    value: "text-amber-700 dark:text-amber-300",
    ring: "border-amber-200/70 dark:border-amber-900/50",
  },
  cyan: {
    box: "bg-cyan-500/90 text-white",
    label: "text-cyan-700 dark:text-cyan-300",
    value: "text-cyan-700 dark:text-cyan-300",
    ring: "border-cyan-200/70 dark:border-cyan-900/50",
  },
  rose: {
    box: "bg-rose-500/90 text-white",
    label: "text-rose-700 dark:text-rose-300",
    value: "text-rose-700 dark:text-rose-300",
    ring: "border-rose-200/70 dark:border-rose-900/50",
  },
  emerald: {
    box: "bg-emerald-500/90 text-white",
    label: "text-emerald-700 dark:text-emerald-300",
    value: "text-emerald-700 dark:text-emerald-300",
    ring: "border-emerald-200/70 dark:border-emerald-900/50",
  },
  violet: {
    box: "bg-violet-500/90 text-white",
    label: "text-violet-700 dark:text-violet-300",
    value: "text-violet-700 dark:text-violet-300",
    ring: "border-violet-200/70 dark:border-violet-900/50",
  },
};

const SEVERITY_STYLES: Record<
  UpcomingSeverity,
  { bar: string; text: string; chip: string; label: string }
> = {
  danger: {
    bar: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    chip: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
    label: "Vencido",
  },
  warning: {
    bar: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    label: "Próximo",
  },
  soon: {
    bar: "bg-cyan-500",
    text: "text-cyan-600 dark:text-cyan-400",
    chip: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
    label: "En camino",
  },
  ok: {
    bar: "bg-gray-300 dark:bg-gray-600",
    text: "text-gray-500 dark:text-gray-400",
    chip: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    label: "Al día",
  },
};

const KIND_ICONS = {
  reminder: Bell,
  maintenance: Wrench,
  document: FileText,
} as const;

// ─── Metric card (Drivvo's ReportCard template) ──────────────────────────────

function MetricCard({
  icon: Icon,
  tone,
  label,
  sublabel,
  value,
  footer,
  hint,
}: {
  icon: typeof Fuel;
  tone: Tone;
  label: string;
  sublabel?: string;
  value: string;
  footer?: Array<{ label: string; value: string; tone?: "good" | "bad" | "neutral" }>;
  hint?: string | null;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <div className={`flex flex-col rounded-2xl border bg-white p-3 dark:bg-gray-900 ${styles.ring}`}>
      <div className="flex items-center gap-2">
        <span className={`flex size-9 shrink-0 items-center justify-center rounded-[0.6rem] ${styles.box}`}>
          <Icon className="size-4" />
        </span>
        <span className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${styles.label}`}>{label}</span>
      </div>

      {sublabel && <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">{sublabel}</p>}
      <p className={`mt-0.5 text-[22px] font-black leading-tight tracking-tight ${styles.value}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-gray-400 dark:text-gray-500">{hint}</p>}

      {footer && footer.length > 0 && (
        <>
          <div className="my-2 h-px bg-gray-100 dark:bg-gray-800" />
          <div className="flex items-start justify-between gap-2">
            {footer.map((entry) => (
              <div key={entry.label} className="min-w-0">
                <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{entry.label}</p>
                <p
                  className={`truncate text-[12px] font-semibold ${
                    entry.tone === "good"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : entry.tone === "bad"
                        ? "text-red-500 dark:text-red-400"
                        : "text-gray-700 dark:text-gray-200"
                  }`}
                >
                  {entry.value}
                </p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Refuel forecast ────────────────────────────────────────────────────────

// The fuel level is an estimate, so it wears its trust level openly. Drivvo
// shows a comparable "quality" bar; here it is a chip plus the reasons.
const FUEL_CONFIDENCE_STYLES: Record<"high" | "medium" | "low", { label: string; chip: string }> = {
  high: {
    label: "Confianza alta",
    chip: "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  },
  medium: {
    label: "Confianza media",
    chip: "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  },
  low: {
    label: "Confianza baja",
    chip: "rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:bg-red-950/50 dark:text-red-300",
  },
};

function RefuelForecast({
  vehicle,
  onOpen,
}: {
  vehicle: DashboardVehicle;
  onOpen?: () => void;
}) {
  const [showWhy, setShowWhy] = useState(false);
  const level = Math.max(0, Math.min(100, vehicle.fuelLevel ?? 0));
  const hasTank = (vehicle.tankCapacity ?? 0) > 0;
  const isLearning = vehicle.isLearning ?? true;
  const days = vehicle.daysUntilRefuel ?? null;
  const gallons = vehicle.gallonsToRefuel ?? 0;
  const price = vehicle.lastPricePerGallon ?? 0;
  const refillCost = gallons > 0 && price > 0 ? gallons * price : null;
  const confidence = vehicle.fuelConfidence ?? "low";
  const confidenceStyle = FUEL_CONFIDENCE_STYLES[confidence];
  const reasons = vehicle.fuelConfidenceReasons ?? [];
  const partials = vehicle.partialsAddedSinceFullTank ?? 0;
  const isRough = (vehicle.fuelModel ?? "none") === "rough";

  const levelColor = level <= 15 ? "bg-red-500" : level <= 30 ? "bg-amber-500" : "bg-cyan-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mt-3 rounded-2xl border border-cyan-200/70 bg-white p-4 dark:border-cyan-900/50 dark:bg-gray-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-[0.6rem] bg-cyan-500/90 text-white">
            <Fuel className="size-4" />
          </span>
          <div>
            <p className="text-[13px] font-semibold text-cyan-700 dark:text-cyan-300">Próximo tanqueo</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500">Estimado con tu historial</p>
          </div>
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-semibold text-cyan-700 transition-colors hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-950/40"
          >
            Detalle
            <ChevronRight className="size-3" />
          </button>
        )}
      </div>

      {hasTank ? (
        <>
          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="text-[22px] font-black tracking-tight text-gray-900 dark:text-gray-100">
              {Math.round(level)}%
            </span>
            {(vehicle.estimatedRange ?? 0) > 0 && (
              <span className="text-[12px] font-semibold text-gray-500 dark:text-gray-400">
                ~{(vehicle.estimatedRange ?? 0).toLocaleString("es-CO")} km de autonomía
              </span>
            )}
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <motion.div
              className={`h-full rounded-full ${levelColor}`}
              initial={{ width: 0 }}
              animate={{ width: `${level}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-800/60">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Faltan</p>
              <p className="text-[13px] font-bold text-gray-800 dark:text-gray-100">
                {gallons > 0 ? `${gallons.toFixed(1)} gal` : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 p-2.5 dark:bg-gray-800/60">
              <p className="text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500">Llenar cuesta</p>
              <p className="text-[13px] font-bold text-gray-800 dark:text-gray-100">
                {refillCost != null ? formatCurrency(refillCost) : "—"}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-2 rounded-xl bg-cyan-50 px-3 py-2 dark:bg-cyan-950/30">
            <Clock className="size-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
            <p className="text-[12px] font-semibold text-cyan-800 dark:text-cyan-200">
              {isLearning || days == null
                ? "Aún aprendiendo tu ritmo de manejo"
                : days <= 0
                  ? "Ya deberías haber tanqueado"
                  : `Te queda${days === 1 ? "" : "n"} ~${days} día${days === 1 ? "" : "s"}`}
            </p>
          </div>
          {isLearning && (
            <p className="mt-1.5 text-[11px] leading-snug text-gray-400 dark:text-gray-500">
              Se necesitan al menos dos tanqueos en días distintos para estimar la fecha con precisión.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-[12px] text-gray-500 dark:text-gray-400">
          Cargá la capacidad del tanque en el vehículo para ver nivel, autonomía y pronóstico.
        </p>
      )}

      {/* The level is derived, so it shows its work. A gauge the user cannot
          interrogate is a gauge they learn to distrust. */}
      {hasTank && (
        <div className="mt-3 border-t border-gray-100 pt-2 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setShowWhy((value) => !value)}
            className="flex w-full items-center justify-between gap-2 text-left"
            aria-expanded={showWhy}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
              <HelpCircle className="size-3.5" />
              {showWhy ? "Ocultar el cálculo" : "¿Por qué este nivel?"}
            </span>
            <span className={confidenceStyle.chip}>{confidenceStyle.label}</span>
          </button>

          {showWhy && (
            <div className="mt-2 space-y-1.5 rounded-xl bg-gray-50 p-2.5 dark:bg-gray-800/60">
              <p className="text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                {isRough ? "Estimación gruesa, sin tanque lleno" : "Desde el último tanque lleno"}
              </p>

              {reasons.map((reason, index) => (
                <p
                  key={index}
                  className="flex items-start gap-1.5 text-[11px] leading-snug text-gray-600 dark:text-gray-300"
                >
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-gray-400" />
                  {reason}
                </p>
              ))}

              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-gray-200 pt-2 text-[10px] dark:border-gray-700">
                <span className="text-gray-400">Tanque asumido</span>
                <span className="text-right font-semibold text-gray-600 dark:text-gray-300">
                  {(vehicle.assumedTankCapacity ?? 0)} gal
                </span>

                <span className="text-gray-400">Km desde el lleno</span>
                <span className="text-right font-semibold text-gray-600 dark:text-gray-300">
                  {(vehicle.kmSinceFullTank ?? 0).toLocaleString("es-CO")} km
                </span>

                <span className="text-gray-400">Consumo estimado</span>
                <span className="text-right font-semibold text-gray-600 dark:text-gray-300">
                  {(vehicle.consumedSinceFullTank ?? 0).toFixed(2)} gal
                </span>

                {partials > 0 && (
                  <>
                    <span className="text-gray-400">Cargas parciales</span>
                    <span className="text-right font-semibold text-gray-600 dark:text-gray-300">
                      +{partials.toFixed(2)} gal
                    </span>
                  </>
                )}

                <span className="text-gray-400">Rendimiento usado</span>
                <span className="text-right font-semibold text-gray-600 dark:text-gray-300">
                  {(vehicle.avgKmPerGallon ?? 0) > 0
                    ? `${(vehicle.avgKmPerGallon ?? 0).toFixed(1)} km/gal`
                    : "—"}
                </span>

                <span className="text-gray-400">Último registro</span>
                <span className="text-right font-semibold text-gray-600 dark:text-gray-300">
                  {vehicle.daysSinceLastLog == null
                    ? "—"
                    : vehicle.daysSinceLastLog === 0
                      ? "hoy"
                      : `hace ${vehicle.daysSinceLastLog} días`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {vehicle.anomalyDetected && (
        <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 dark:bg-red-950/30">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-500" />
          <p className="text-[11px] font-semibold leading-snug text-red-700 dark:text-red-300">
            El consumo real viene por encima del esperado. Revisá presión de llantas o filtros.
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ─── Upcoming list (the prediction surface) ─────────────────────────────────

function UpcomingRow({ item, onOpen }: { item: UpcomingItem; onOpen?: (item: UpcomingItem) => void }) {
  const styles = SEVERITY_STYLES[item.severity];
  const Icon = KIND_ICONS[item.kind];

  // Drivvo shows the distance as the primary signal when a km target exists,
  // and the calendar as the secondary one. A projection is always secondary.
  const kmText = describeKm(item.kmRemaining);
  const dateText = describeDays(item.daysRemaining);
  const projectionText = describeProjection(item.projectedDays, item.confidence);

  const primary = kmText ?? dateText;
  const secondary = kmText ? dateText : null;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(item)}
      className="group flex w-full items-stretch gap-3 rounded-xl border border-gray-200/70 bg-white p-3 text-left transition-colors hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
    >
      <span className={`w-[3px] shrink-0 rounded-full ${styles.bar}`} aria-hidden="true" />
      <span className="flex size-7 shrink-0 items-center justify-center self-start rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
        <Icon className="size-3.5" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">
            {item.title}
          </span>
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${styles.chip}`}>
            {styles.label}
          </span>
        </span>

        {item.subtitle && (
          <span className="mt-0.5 block truncate text-[11px] text-gray-400 dark:text-gray-500">{item.subtitle}</span>
        )}

        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
          {primary && <span className={`text-[12px] font-semibold ${styles.text}`}>{primary}</span>}
          {secondary && <span className="text-[11px] text-gray-400 dark:text-gray-500">· {secondary}</span>}
          {!item.daysRemaining && projectionText && (
            <span className="flex items-center gap-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              <CalendarDays className="size-2.5" />
              {projectionText}
            </span>
          )}
        </span>

        {item.dueKm != null && item.progress != null && (
          <span className="mt-1.5 block h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <span
              className={`block h-full rounded-full ${styles.bar}`}
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </span>
        )}
      </span>
    </button>
  );
}

// ─── Quick actions ──────────────────────────────────────────────────────────

function QuickAction({
  icon: Icon,
  label,
  tone,
  onClick,
}: {
  icon: typeof Fuel;
  label: string;
  tone: Tone;
  onClick: () => void;
}) {
  const styles = TONE_STYLES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 rounded-2xl border border-gray-200/70 bg-white p-3 transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
    >
      <span className={`flex size-10 items-center justify-center rounded-full ${styles.box}`}>
        <Icon className="size-5" />
      </span>
      <span className="text-center text-[11px] font-semibold leading-tight text-gray-700 dark:text-gray-200">
        {label}
      </span>
    </button>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export function TransportDashboard({
  vehicle,
  costPerKm,
  monthlyCost,
  monthlyFuelCost = 0,
  monthlyMaintenanceCost = 0,
  totalSpent,
  upcoming,
  efficiency = null,
  trackedKm = 0,
  onLogFuel,
  onLogMaintenance,
  onRegisterDocument,
  onCreateReminder,
  onUpdateKm,
  onOpenFuelDetails,
  onOpenUpcoming,
}: TransportDashboardProps) {
  const actionable = countActionable(upcoming);
  const avgKmPerGallon = vehicle.avgKmPerGallon ?? 0;
  const avgKmPerDay = vehicle.avgKmPerDay ?? 0;
  const range = vehicle.estimatedRange ?? 0;
  const fuelLogs = vehicle.fuelLogs?.length ?? 0;

  // Efficiency is the one metric where "low" is bad, so the footer colours are
  // inverted on purpose — the same convention Drivvo uses.
  //
  // The hint answers the money question first: when two or more stations have
  // enough history, "which one gives me the most km per gallon" beats a generic
  // data-quality note.
  const bestStation = efficiency
    ? bucketEfficiency(efficiency.cycles, (cycle) => cycle.station, { minSamples: 2 })[0] ?? null
    : null;

  const efficiencyHint = bestStation
    ? `Mejor estación: ${bestStation.key} · ${bestStation.efficiency.toFixed(1)} km/gal`
    : !efficiency || efficiency.isLearning
      ? (fuelLogs < 2
          ? "Se calcula entre dos tanques llenos"
          : efficiency
            ? describeEfficiencyQuality(efficiency)
            : null)
      : efficiency.lastCycle
        ? `Último ciclo: ${efficiency.lastCycle.efficiency.toFixed(1)} km/gal${
            efficiency.lastCycle.partialFills > 0
              ? ` · ${efficiency.lastCycle.partialFills} carga${efficiency.lastCycle.partialFills === 1 ? "" : "s"} parcial${efficiency.lastCycle.partialFills === 1 ? "" : "es"}`
              : ""
          }`
        : null;

  const efficiencySublabel = efficiency?.fromCycles
    ? `${efficiency.cycles.length} ciclo${efficiency.cycles.length === 1 ? "" : "s"} reciente${efficiency.cycles.length === 1 ? "" : "s"}`
    : "Promedio general";

  const efficiencyFooter: Array<{ label: string; value: string; tone?: "good" | "bad" }> = efficiency?.fromCycles
    ? [
        { label: "Mejor", value: efficiency.best != null ? `${efficiency.best.toFixed(1)}` : "—", tone: "good" },
        { label: "Peor", value: efficiency.worst != null ? `${efficiency.worst.toFixed(1)}` : "—", tone: "bad" },
      ]
    : [
        { label: "Por día", value: avgKmPerDay > 0 ? `${Math.round(avgKmPerDay)} km` : "—" },
        { label: "Autonomía", value: range > 0 ? `${range.toLocaleString("es-CO")} km` : "—" },
      ];

  return (
    <div className="space-y-3">
      {/* ── KPI grid ── */}
      <div className="grid grid-cols-2 gap-2.5">
        <MetricCard
          icon={TrendingUp}
          tone="amber"
          label="Rendimiento"
          sublabel={efficiencySublabel}
          value={avgKmPerGallon > 0 ? `${avgKmPerGallon.toFixed(1)} km/gal` : "—"}
          hint={efficiencyHint}
          footer={efficiencyFooter}
        />

        <MetricCard
          icon={DollarSign}
          tone="cyan"
          label="Costo por km"
          sublabel={trackedKm > 0 ? `Sobre ${trackedKm.toLocaleString("es-CO")} km` : "Sin distancia aún"}
          value={costPerKm != null ? formatCurrency(costPerKm) : "—"}
          hint={costPerKm == null ? "Necesitás al menos dos registros de km" : null}
          footer={[
            { label: "Este mes", value: formatCurrency(monthlyCost) },
            {
              label: "Total",
              value: totalSpent != null ? formatCurrency(totalSpent) : "—",
            },
          ]}
        />

        <MetricCard
          icon={Activity}
          tone="rose"
          label="Gasto del mes"
          sublabel="Combustible + mantenimiento"
          value={formatCurrency(monthlyCost)}
          footer={[
            { label: "Combustible", value: formatCurrency(monthlyFuelCost) },
            { label: "Mantenim.", value: formatCurrency(monthlyMaintenanceCost) },
          ]}
        />

        <MetricCard
          icon={Gauge}
          tone="violet"
          label="Odómetro"
          sublabel="Kilometraje actual"
          value={`${(vehicle.currentKm ?? 0).toLocaleString("es-CO")} km`}
          footer={[
            { label: "Registros", value: `${fuelLogs} tanqueos` },
            {
              label: "Ritmo",
              value: avgKmPerDay > 0 ? `${Math.round(avgKmPerDay)} km/día` : "—",
            },
          ]}
        />
      </div>

      {/* ── Refuel forecast ── */}
      <RefuelForecast vehicle={vehicle} onOpen={onOpenFuelDetails} />

      {/* ── Upcoming (prediction) ── */}
      <div className="mt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-[0.6rem] bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900">
              <CalendarDays className="size-3.5" />
            </span>
            <div>
              <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100">Próximos vencimientos</p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">Mantenimiento, recordatorios y documentos</p>
            </div>
          </div>
          {actionable > 0 && (
            <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              {actionable} por atender
            </span>
          )}
        </div>

        {upcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 p-4 text-center dark:border-gray-700">
            <p className="text-[12px] font-semibold text-gray-500 dark:text-gray-400">Nada pendiente</p>
            <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">
              Creá un recordatorio o cargá un mantenimiento con próximo vencimiento.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {upcoming.slice(0, 5).map((item) => (
              <UpcomingRow key={item.id} item={item} onOpen={onOpenUpcoming} />
            ))}
          </div>
        )}
      </div>

      {/* ── Quick actions ── */}
      <div className="mt-3">
        <p className="mb-2 text-[13px] font-semibold text-gray-900 dark:text-gray-100">Registrar</p>
        <div className="grid grid-cols-4 gap-2">
          <QuickAction icon={Fuel} label="Tanqueo" tone="amber" onClick={onLogFuel} />
          <QuickAction icon={Wrench} label="Mantenim." tone="cyan" onClick={onLogMaintenance} />
          <QuickAction icon={FileText} label="Documento" tone="violet" onClick={onRegisterDocument} />
          <QuickAction icon={Bell} label="Recordatorio" tone="rose" onClick={onCreateReminder} />
        </div>
        {onUpdateKm && (
          <button
            type="button"
            onClick={onUpdateKm}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-gray-300 py-2.5 text-[12px] font-semibold text-gray-600 transition-colors hover:border-cyan-400 hover:text-cyan-700 dark:border-gray-700 dark:text-gray-300 dark:hover:border-cyan-600 dark:hover:text-cyan-300"
          >
            <Plus className="size-3.5" />
            Actualizar kilometraje
          </button>
        )}
      </div>
    </div>
  );
}
