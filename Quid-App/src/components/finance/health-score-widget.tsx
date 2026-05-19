"use client";

import { useMemo } from "react";
import { formatCurrency } from "@/lib/api";
import { Shield, TrendingUp, CreditCard, CalendarDays, Sparkles } from "lucide-react";
import { motion } from "framer-motion";

// ============================================================
// TYPES
// ============================================================

interface HealthIndicator {
  id: string;
  label: string;
  value: string;
  status: "healthy" | "warning" | "danger";
  tip: string;
}

interface HealthScoreResult {
  score: number;
  status: "healthy" | "warning" | "danger";
  indicators: HealthIndicator[];
  advice: string;
}

interface HealthScoreWidgetProps {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyDebtPayments: number;
  totalDebt: number;
  totalBalance: number;
}

// ============================================================
// SCORING LOGIC
// ============================================================

function calculateHealthScore({
  monthlyIncome,
  monthlyExpenses,
  monthlyDebtPayments,
  totalDebt,
  totalBalance,
}: HealthScoreWidgetProps): HealthScoreResult {
  // Guard: not enough data
  if (monthlyIncome <= 0) {
    return {
      score: 0,
      status: "danger",
      indicators: [],
      advice: "Registra tus ingresos para calcular tu salud financiera.",
    };
  }

  // ── IMPORTANT: Separate living expenses from debt payments ──
  // Debt payments (category "Deudas") are already measured by the Debt/Income
  // indicator. Including them in "expenses" would double-count:
  //   once as expense → hurts Savings ratio
  //   once as debt balance → hurts Debt ratio
  // So we calculate Savings based on living expenses ONLY.
  const livingExpenses = monthlyExpenses - monthlyDebtPayments;

  // ── 1. Savings Ratio (ahorro / ingreso) ──
  // Uses living expenses only (debt payments measured separately)
  const monthlySavings = monthlyIncome - livingExpenses;
  const savingsRatio = monthlySavings / monthlyIncome; // 0..1 (can be negative)
  let savingsScore: number;
  let savingsStatus: "healthy" | "warning" | "danger";
  let savingsTip: string;

  if (savingsRatio >= 0.2) {
    savingsScore = 100;
    savingsStatus = "healthy";
    savingsTip = "Ahorras 20%+ de tu ingreso. ¡Excelente hábito!";
  } else if (savingsRatio >= 0.1) {
    savingsScore = 60;
    savingsStatus = "warning";
    savingsTip = "Intenta ahorrar al menos 20% de tus ingresos.";
  } else if (savingsRatio >= 0) {
    savingsScore = 30;
    savingsStatus = "danger";
    savingsTip = "Tu ahorro es mínimo. Busca recortar gastos hormiga.";
  } else {
    savingsScore = 0;
    savingsStatus = "danger";
    savingsTip = "Gastas más de lo que ganas. Prioriza reducir gastos.";
  }

  // ── 2. Debt-to-Income Ratio ──
  const debtToIncome = totalDebt / monthlyIncome;
  let debtScore: number;
  let debtStatus: "healthy" | "warning" | "danger";
  let debtTip: string;

  if (debtToIncome <= 1) {
    debtScore = 100;
    debtStatus = "healthy";
    debtTip = "Tu deuda es menor a 1 mes de ingreso. Bien.";
  } else if (debtToIncome <= 3) {
    debtScore = 60;
    debtStatus = "warning";
    debtTip = "Tu deuda equivale a 1-3 meses de ingreso. Cuidado.";
  } else if (debtToIncome <= 6) {
    debtScore = 30;
    debtStatus = "danger";
    debtTip = "Deuda alta (3-6 meses de ingreso). Prioriza pagarla.";
  } else {
    debtScore = 0;
    debtStatus = "danger";
    debtTip = "Deuda muy alta (+6 meses de ingreso). Busca asesoría.";
  }

  // ── 3. Runway Days (días de colchón) ──
  // Uses ALL expenses (including debt payments) because if you lose income,
  // you still need to make debt payments to survive.
  const dailyExpenses = monthlyExpenses / 30;
  const runwayDays = dailyExpenses > 0 ? Math.floor(totalBalance / dailyExpenses) : 0;
  let runwayScore: number;
  let runwayStatus: "healthy" | "warning" | "danger";
  let runwayTip: string;

  if (runwayDays >= 90) {
    runwayScore = 100;
    runwayStatus = "healthy";
    runwayTip = "Tienes 3+ meses de colchón financiero. ¡Solido!";
  } else if (runwayDays >= 60) {
    runwayScore = 75;
    runwayStatus = "healthy";
    runwayTip = "2-3 meses de colchón. Estás bien preparado.";
  } else if (runwayDays >= 30) {
    runwayScore = 50;
    runwayStatus = "warning";
    runwayTip = "1 mes de colchón. Intenta aumentar tu reserva.";
  } else if (runwayDays >= 7) {
    runwayScore = 25;
    runwayStatus = "danger";
    runwayTip = "Menos de 1 mes de colchón. Construye un fondo de emergencia.";
  } else {
    runwayScore = 0;
    runwayStatus = "danger";
    runwayTip = "Casi sin colchón. Prioriza crear un fondo de emergencia.";
  }

  // ── Weighted average score ──
  // Savings: 35%, Debt: 35%, Runway: 30%
  const score = Math.round(
    savingsScore * 0.35 + debtScore * 0.35 + runwayScore * 0.30
  );
  const clampedScore = Math.max(0, Math.min(100, score));

  // ── Overall status ──
  const status: "healthy" | "warning" | "danger" =
    clampedScore >= 70 ? "healthy" : clampedScore >= 40 ? "warning" : "danger";

  // ── Contextual advice ──
  let advice: string;
  if (clampedScore >= 80) {
    advice = "Tu salud financiera es excelente. Sigue así y considera invertir parte de tus ahorros.";
  } else if (clampedScore >= 70) {
    advice = "Buena salud financiera. Un poco más de ahorro y estarás en la zona óptima.";
  } else if (clampedScore >= 55) {
    advice = "Vas por buen camino pero hay margen de mejora. Enfócate en reducir deudas y ahorrar más.";
  } else if (clampedScore >= 40) {
    advice = "Atención: tu situación es frágil. Prioriza reducir gastos y construir un colchón.";
  } else if (clampedScore >= 20) {
    advice = "Tu salud financiera está en riesgo. Necesitas un plan: reduce gastos y paga deudas.";
  } else {
    advice = "Situación crítica. Busca asesoría financiera y toma acción inmediata.";
  }

  const indicators: HealthIndicator[] = [
    {
      id: "savings",
      label: "Ahorro / Ingreso",
      value: savingsRatio >= 0 ? `${Math.round(savingsRatio * 100)}%` : `${Math.round(savingsRatio * 100)}%`,
      status: savingsStatus,
      tip: savingsTip,
    },
    {
      id: "debt",
      label: "Deuda / Ingreso",
      value: `${debtToIncome.toFixed(1)}x`,
      status: debtStatus,
      tip: debtTip,
    },
    {
      id: "runway",
      label: "Días de Colchón",
      value: `${runwayDays} días`,
      status: runwayStatus,
      tip: runwayTip,
    },
  ];

  return { score: clampedScore, status, indicators, advice };
}

// ============================================================
// CIRCULAR SCORE GAUGE (SVG)
// ============================================================

function ScoreGauge({
  score,
  status,
}: {
  score: number;
  status: "healthy" | "warning" | "danger";
}) {
  const size = 130;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;

  const colors = {
    healthy: { stroke: "#10B981", bg: "rgba(16,185,129,0.1)", glow: "rgba(16,185,129,0.3)" },
    warning: { stroke: "#F59E0B", bg: "rgba(245,158,11,0.1)", glow: "rgba(245,158,11,0.3)" },
    danger: { stroke: "#EF4444", bg: "rgba(239,68,68,0.1)", glow: "rgba(239,68,68,0.3)" },
  };

  const c = colors[status];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Glow effect */}
      <div
        className="absolute inset-2 rounded-full blur-md"
        style={{ backgroundColor: c.glow }}
      />
      <svg width={size} height={size} className="-rotate-90 relative z-10">
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Score arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={c.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <motion.span
          className="text-3xl font-black leading-none"
          style={{ color: c.stroke }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
        >
          {score}
        </motion.span>
        <span className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 font-medium">
          de 100
        </span>
      </div>
    </div>
  );
}

// ============================================================
// STATUS DOT
// ============================================================

function StatusDot({ status }: { status: "healthy" | "warning" | "danger" }) {
  const colors = {
    healthy: "bg-emerald-500 shadow-emerald-500/50",
    warning: "bg-amber-500 shadow-amber-500/50",
    danger: "bg-red-500 shadow-red-500/50",
  };
  return (
    <span className={`size-2.5 rounded-full shadow-sm ${colors[status]}`} />
  );
}

// ============================================================
// STATUS BADGE
// ============================================================

function StatusBadge({ status }: { status: "healthy" | "warning" | "danger" }) {
  const config = {
    healthy: { label: "Saludable", bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-400", icon: "🟢" },
    warning: { label: "Atención", bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400", icon: "🟡" },
    danger: { label: "Peligro", bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-400", icon: "🔴" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.bg} ${c.text}`}>
      {c.icon} {c.label}
    </span>
  );
}

// ============================================================
// INDICATOR ICON
// ============================================================

function IndicatorIcon({ id }: { id: string }) {
  switch (id) {
    case "savings":
      return <TrendingUp className="size-3.5" />;
    case "debt":
      return <CreditCard className="size-3.5" />;
    case "runway":
      return <CalendarDays className="size-3.5" />;
    default:
      return null;
  }
}

// ============================================================
// MAIN WIDGET COMPONENT
// ============================================================

export function HealthScoreWidget({
  monthlyIncome,
  monthlyExpenses,
  monthlyDebtPayments,
  totalDebt,
  totalBalance,
}: HealthScoreWidgetProps) {
  const result = useMemo(
    () =>
      calculateHealthScore({
        monthlyIncome,
        monthlyExpenses,
        monthlyDebtPayments,
        totalDebt,
        totalBalance,
      }),
    [monthlyIncome, monthlyExpenses, monthlyDebtPayments, totalDebt, totalBalance]
  );

  // Not enough data to show
  if (monthlyIncome <= 0) {
    return (
      <Card className="border-0 shadow-md rounded-2xl overflow-hidden">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="size-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
              <Shield className="size-4 text-white" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Salud Financiera
            </h3>
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
            Registra ingresos para calcular tu salud financiera
          </p>
        </CardContent>
      </Card>
    );
  }

  // Background gradient based on status
  const bgGradients = {
    healthy: "from-emerald-50 to-teal-50 dark:from-emerald-900/10 dark:to-teal-900/10",
    warning: "from-amber-50 to-yellow-50 dark:from-amber-900/10 dark:to-yellow-900/10",
    danger: "from-red-50 to-rose-50 dark:from-red-900/10 dark:to-rose-900/10",
  };

  return (
    <div className="border-0 shadow-md rounded-2xl overflow-hidden">
      {/* Top gradient header */}
      <div className={`bg-gradient-to-br ${bgGradients[result.status]} px-5 pt-4 pb-2`}>
        <div className="flex items-start justify-between gap-4">
          {/* Left: title + badge */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <div className="size-7 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
                <Shield className="size-3.5 text-white" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Salud Financiera
              </h3>
            </div>
            <StatusBadge status={result.status} />
          </div>

          {/* Right: circular score */}
          <ScoreGauge score={result.score} status={result.status} />
        </div>
      </div>

      {/* Bottom: indicators */}
      <div className="bg-white dark:bg-gray-900 px-5 py-4 space-y-3">
        {result.indicators.map((ind) => (
          <div key={ind.id} className="flex items-center gap-3">
            <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${
              ind.status === "healthy"
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                : ind.status === "warning"
                ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                : "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
            }`}>
              <IndicatorIcon id={ind.id} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {ind.label}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-gray-900 dark:text-gray-100">
                    {ind.value}
                  </span>
                  <StatusDot status={ind.status} />
                </div>
              </div>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">
                {ind.tip}
              </p>
            </div>
          </div>
        ))}

        {/* Advice section */}
        <div className="mt-2 pt-3 border-t border-gray-100 dark:border-gray-800">
          <div className="flex items-start gap-2">
            <Sparkles className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
              {result.advice}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Need Card import for the empty state
import { Card, CardContent } from "@/components/ui/card";
