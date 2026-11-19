"use client";

import { formatCurrency } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  GripVertical,
  RotateCcw,
  Settings2,
} from "lucide-react";

/**
 * F-56 · Piezas visuales del resumen de Finanzas.
 *
 * Se separaron de `finance-overview.tsx` para que el componente principal
 * quede con los datos y el layout, no con los detalles de cada widget.
 */

export const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

export const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function CircularProgress({
  percentage,
  size = 64,
  strokeWidth = 6,
  color,
  children,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const clampedPct = Math.min(percentage, 999);
  const offset = circumference - (clampedPct / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>
      {children && (
        <div className="absolute inset-0 flex items-center justify-center">
          {children}
        </div>
      )}
    </div>
  );
}

export function FinancialEvolutionTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const monthLabel = label || "";
  const [, mm] = monthLabel.split("-");
  const displayMonth = mm ? FULL_MONTH_NAMES[mm] || monthLabel : monthLabel;

  return (
    <div className="max-w-[200px] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-xs">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{displayMonth}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 mb-0.5">
          <div className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500 dark:text-gray-400">
            {entry.dataKey === "income" ? "Ingresos" : "Gastos"}:
          </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function CashFlowTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number; dataKey: string; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const monthLabel = label || "";
  const [, mm] = monthLabel.split("-");
  const displayMonth = mm ? FULL_MONTH_NAMES[mm] || monthLabel : monthLabel;

  return (
    <div className="max-w-[200px] bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 px-3 py-2.5 text-xs">
      <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{displayMonth}</p>
      {payload.map((entry, idx) => (
        <div key={idx} className="flex items-center gap-2 mb-0.5">
          <div className="size-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-gray-500 dark:text-gray-400">
            {entry.dataKey === "historical" ? "Histórico" : "Proyectado"}:
          </span>
          <span className="font-semibold text-gray-900 dark:text-gray-100">
            {formatCurrency(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WidgetCustomizationDialog({
  open,
  onOpenChange,
  widgetConfig,
  setWidgetConfig,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  widgetConfig: WidgetConfig[];
  setWidgetConfig: (config: WidgetConfig[]) => void;
}) {
  const toggleVisibility = (id: string) => {
    // Balance widget cannot be hidden
    if (id === "balance") return;
    setWidgetConfig(
      widgetConfig.map((w) =>
        w.id === id ? { ...w, visible: !w.visible } : w
      )
    );
  };

  const moveUp = (order: number) => {
    const sorted = [...widgetConfig].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((w) => w.order === order);
    if (idx <= 0) return;
    const prev = sorted[idx - 1];
    const curr = sorted[idx];
    setWidgetConfig(
      widgetConfig.map((w) => {
        if (w.id === prev.id) return { ...w, order: curr.order };
        if (w.id === curr.id) return { ...w, order: prev.order };
        return w;
      })
    );
  };

  const moveDown = (order: number) => {
    const sorted = [...widgetConfig].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((w) => w.order === order);
    if (idx >= sorted.length - 1) return;
    const curr = sorted[idx];
    const next = sorted[idx + 1];
    setWidgetConfig(
      widgetConfig.map((w) => {
        if (w.id === curr.id) return { ...w, order: next.order };
        if (w.id === next.id) return { ...w, order: curr.order };
        return w;
      })
    );
  };

  const resetToDefaults = () => {
    setWidgetConfig(DEFAULT_WIDGETS.map((w) => ({ ...w })));
  };

  const sorted = [...widgetConfig].sort((a, b) => a.order - b.order);
  const maxOrder = sorted.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="size-5 text-emerald-500" />
            Personalizar Widgets
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2 max-h-[60vh] overflow-y-auto">
          {sorted.map((widget) => {
            const isBalance = widget.id === "balance";
            return (
              <div
                key={widget.id}
                className={`flex items-center gap-2 p-2.5 rounded-xl transition-colors ${
                  widget.visible
                    ? "bg-gray-50 dark:bg-gray-800/60"
                    : "bg-gray-50/50 dark:bg-gray-800/30 opacity-60"
                }`}
              >
                <GripVertical className="size-4 text-gray-300 dark:text-gray-600 flex-shrink-0" />
                <span className={`flex-1 text-sm font-medium ${
                  widget.visible
                    ? "text-gray-900 dark:text-gray-100"
                    : "text-gray-400 dark:text-gray-500"
                }`}>
                  {widget.title}
                  {isBalance && (
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-1.5">
                      (siempre visible)
                    </span>
                  )}
                </span>
                <button
                  onClick={() => toggleVisibility(widget.id)}
                  disabled={isBalance}
                  className={`p-1.5 rounded-lg transition-colors ${
                    isBalance
                      ? "text-emerald-500 cursor-default"
                      : "hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400"
                  }`}
                >
                  {widget.visible ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                </button>
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveUp(widget.order)}
                    disabled={widget.order === 0}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 disabled:opacity-30 disabled:cursor-default transition-colors"
                  >
                    <ChevronUp className="size-3" />
                  </button>
                  <button
                    onClick={() => moveDown(widget.order)}
                    disabled={widget.order === maxOrder}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 disabled:opacity-30 disabled:cursor-default transition-colors"
                  >
                    <ChevronDown className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetToDefaults}
            className="w-full text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <RotateCcw className="size-3.5 mr-1.5" />
            Restablecer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export const FULL_MONTH_NAMES: Record<string, string> = {
  "01": "Enero",
  "02": "Febrero",
  "03": "Marzo",
  "04": "Abril",
  "05": "Mayo",
  "06": "Junio",
  "07": "Julio",
  "08": "Agosto",
  "09": "Septiembre",
  "10": "Octubre",
  "11": "Noviembre",
  "12": "Diciembre",
};

export interface WidgetConfig {
  id: string;
  title: string;
  visible: boolean;
  order: number;
}

export const DEFAULT_WIDGETS: WidgetConfig[] = [
  { id: "balance", title: "Balance", visible: true, order: 0 },
  { id: "health-score", title: "Salud Financiera", visible: true, order: 1 },
  { id: "waterfall", title: "Gráfico de Cascada", visible: true, order: 2 },
  { id: "evolution", title: "Evolución Financiera", visible: true, order: 3 },
  { id: "cashflow", title: "Proyección de Flujo de Caja", visible: true, order: 4 },
  { id: "expenses", title: "Tus Gastos", visible: true, order: 5 },
  { id: "heatmap", title: "Mapa de Gastos", visible: true, order: 6 },
  { id: "budgets", title: "Progreso de Presupuestos", visible: true, order: 7 },
  { id: "transactions", title: "Transacciones Recientes", visible: true, order: 8 },
  { id: "bills", title: "Próximos Pagos", visible: true, order: 9 },
];
