"use client";

import { useState } from "react";
import { formatCurrency, formatDate, calculateCDTInterest, calculateCDTReteFuente, getCDTBreakdown, getCurrentCDTInterest, getDaysBetween, getColombiaNow } from "@/lib/api";
import { useLocalQuery } from "@/lib/local/hooks/queries";
import { CDTForm } from "./cdt-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Landmark, Clock, TrendingUp, Calendar, Lightbulb, AlertTriangle, ShieldCheck, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import type { CDT, CDTGoal, CDTAccount } from "@/lib/types";

type CDTWithRelations = CDT & {
  goal: CDTGoal | null;
  account: CDTAccount | null;
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

function getStatusBadge(status: string) {
  const config: Record<string, { label: string; className: string }> = {
    active: { label: "Activo", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    matured: { label: "Vencido", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    withdrawn: { label: "Retirado", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
    renewed: { label: "Renovado", className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400" },
  };
  const c = config[status] || config.active;
  return <Badge className={`text-[10px] px-2 py-0.5 border-0 font-semibold ${c.className}`}>{c.label}</Badge>;
}

// All CDT calculations now use compound interest (correct for Tasa Efectiva Anual)
// Functions imported from @/lib/api: calculateCDTInterest, getCurrentCDTInterest, getCDTBreakdown, getDaysBetween

function calculateDaysToMaturity(endDate: string): number {
  return getDaysBetween(getColombiaNow(), endDate);
}

function calculateTimeProgress(startDate: string, endDate: string): number {
  const totalDays = getDaysBetween(startDate, endDate);
  const elapsedDays = getDaysBetween(startDate, getColombiaNow());
  if (totalDays <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((elapsedDays / totalDays) * 100)));
}

export function CDTView() {
  const { data: cdts, loading, refetch: fetchCDTs } = useLocalQuery<CDTWithRelations>("/api/cdts");
  const [showForm, setShowForm] = useState(false);
  const [editCDT, setEditCDT] = useState<CDTWithRelations | null>(null);

  // Defensive Number() wrappers: Prisma Decimal values may arrive as strings
  // if the NextResponse.json patch doesn't apply (e.g., Turbopack bundling).
  // This prevents string concatenation like "0" + "800000" = "0800000".
  const totalAmount = cdts.reduce((sum, c) => sum + Number(c.amount), 0);
  const totalInterestEarned = cdts.reduce(
    (sum, c) =>
      sum + getCurrentCDTInterest(Number(c.amount), Number(c.effectiveRate), c.startDate),
    0
  );

  const handleCardClick = (cdt: CDTWithRelations) => {
    setEditCDT(cdt);
    setShowForm(true);
  };

  const handleFormClose = (open: boolean) => {
    setShowForm(open);
    if (!open) setEditCDT(null);
  };

  const handleFormSuccess = () => {
    fetchCDTs();
    setShowForm(false);
    setEditCDT(null);
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-safe"
    >
      {/* Total CDT Header */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-teal-600 to-teal-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Landmark className="size-4 text-teal-200" />
              <span className="text-sm text-teal-100">Total Invertido en CDTs</span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold tracking-tight truncate">
              {formatCurrency(totalAmount)}
            </p>
            {totalInterestEarned > 0 && (
              <div className="flex items-center gap-1.5 mt-1">
                <TrendingUp className="size-3.5 text-teal-200" />
                <span className="text-[10px] text-teal-200">
                  Intereses generados: {formatCurrency(totalInterestEarned)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* CDT List */}
      {cdts.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg mb-4">
                <Landmark className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                Sin CDTs registrados
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Registra un Certificado de Depósito a Término para hacer seguimiento de tus inversiones
              </p>
              <Button
                onClick={() => setShowForm(true)}
                className="rounded-xl bg-gradient-to-r from-teal-600 to-teal-500"
              >
                <Plus className="size-4 mr-1" />
                Crear CDT
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {cdts.map((cdt) => {
            // Defensive Number() wrappers for Decimal/string safety
            const cdtAmount = Number(cdt.amount);
            const cdtRate = Number(cdt.effectiveRate);
            const cdtTermDays = Number(cdt.termDays);
            const interest = getCurrentCDTInterest(cdtAmount, cdtRate, cdt.startDate);
            const maturityBreakdown = getCDTBreakdown(cdtAmount, cdtRate, cdtTermDays);
            const daysToMaturity = calculateDaysToMaturity(cdt.endDate);
            const timeProgress = calculateTimeProgress(cdt.startDate, cdt.endDate);
            const isMatured = daysToMaturity === 0;

            return (
              <motion.div key={cdt.id} variants={itemVariants}>
                <motion.button
                  onClick={() => handleCardClick(cdt)}
                  className="w-full text-left"
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md border border-gray-100 dark:border-gray-700">
                    {/* Header: Bank + Amount + Rate */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="size-10 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: `${cdt.color}20` }}
                        >
                          <Landmark className="size-5" style={{ color: cdt.color }} />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                            {cdt.bank}
                          </h3>
                          <span className="text-[10px] text-gray-400">
                            {cdt.termDays} días
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-bold text-gray-900 dark:text-white">
                          {formatCurrency(cdtAmount)}
                        </p>
                        <Badge className="text-[10px] px-1.5 py-0 border-0 font-bold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                          {cdtRate}% EA
                        </Badge>
                      </div>
                    </div>

                    {/* Time Progress Bar */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-400">Tiempo transcurrido</span>
                        <span className="text-[10px] font-medium text-gray-600 dark:text-gray-300">
                          {timeProgress}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{ backgroundColor: cdt.color }}
                          initial={{ width: 0 }}
                          animate={{ width: `${timeProgress}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                        />
                      </div>
                    </div>

                    {/* Info Row */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Interest earned */}
                        <div className="flex items-center gap-1">
                          <TrendingUp className="size-3 text-teal-500" />
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            Ganancia actual: <span className="font-semibold text-teal-600 dark:text-teal-400">+{formatCurrency(interest)}</span>
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Days to maturity or Vencido badge */}
                        {isMatured ? (
                          <Badge className="text-[10px] px-1.5 py-0 border-0 font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            Vencido
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Clock className="size-3 text-gray-400" />
                            <span className="text-[10px] text-gray-500 dark:text-gray-400">
                              {daysToMaturity}d restantes
                            </span>
                          </div>
                        )}

                        {/* Status badge */}
                        {getStatusBadge(cdt.status)}
                      </div>
                    </div>

                    {/* Breakdown row: Rendimientos / ReteFuente / Total al vencer */}
                    <div className="mt-2 pt-2 border-t border-gray-50 dark:border-gray-700/50 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Rendimientos estimados</span>
                        <span className="text-[10px] font-semibold text-teal-600 dark:text-teal-400">+{formatCurrency(maturityBreakdown.grossInterest)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Retefuente (4%)</span>
                        <span className="text-[10px] font-semibold text-red-500">-{formatCurrency(maturityBreakdown.retefuente)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">Recibirás al vencer</span>
                        <span className="text-[10px] font-bold text-gray-900 dark:text-white">{formatCurrency(maturityBreakdown.netTotal)}</span>
                      </div>
                    </div>

                    {/* Dates row */}
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-50 dark:border-gray-700/50">
                      <div className="flex items-center gap-1">
                        <Calendar className="size-3 text-gray-300" />
                        <span className="text-[10px] text-gray-400">
                          {formatDate(cdt.startDate)} — {formatDate(cdt.endDate)}
                        </span>
                      </div>
                      {cdt.goal && (
                        <span className="text-[10px] text-gray-400 truncate">
                          🎯 {cdt.goal.name}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── CDT Tips / Consejos ── */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-teal-50 to-cyan-50 dark:from-teal-900/10 dark:to-cyan-900/10">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Lightbulb className="size-4 text-amber-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Consejos para tus CDTs
              </span>
            </div>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                <ShieldCheck className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>Los CDTs están protegidos por el Fondo de Garantías de Instituciones Financieras (Fogafin) hasta $50 millones por entidad.</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                <ArrowRight className="size-3.5 text-teal-500 shrink-0 mt-0.5" />
                <span>Retirar un CDT antes de su vencimiento puede generar penalidades que reducen significativamente tus rendimientos. Evita hacerlo si es posible.</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                <TrendingUp className="size-3.5 text-teal-500 shrink-0 mt-0.5" />
                <span>Compara tasas EA entre entidades antes de abrir un CDT. Diferencias de 0.5% pueden representar miles de pesos adicionales en plazos largos.</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>La retención en la fuente sobre rendimientos financieros es del 4% para personas naturales. Tenlo en cuenta al calcular tu ganancia neta.</span>
              </li>
              <li className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                <Calendar className="size-3.5 text-teal-500 shrink-0 mt-0.5" />
                <span>Aprovecha los CDTs a 180+ días para obtener mejores tasas. Los CDTs cortos suelen tener tasas más bajas que no compensan el bloqueo del dinero.</span>
              </li>
              {cdts.some(c => c.status === "matured") && (
                <li className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                  <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>Tienes CDTs vencidos. Renueva o retira pronto para no perder rendimientos — algunos bancos no pagan intereses después del vencimiento.</span>
                </li>
              )}
              {cdts.length >= 3 && (
                <li className="flex items-start gap-2 text-xs text-teal-600 dark:text-teal-400 font-medium">
                  <Lightbulb className="size-3.5 text-teal-500 shrink-0 mt-0.5" />
                  <span>Tienes {cdts.length} CDTs. Considera escalonar los vencimientos (ladder strategy) para tener liquidez periódica sin sacrificar tasas.</span>
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      </motion.div>

      {/* FAB */}
      {cdts.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Button
            onClick={() => {
              setEditCDT(null);
              setShowForm(true);
            }}
            className="size-14 rounded-full bg-gradient-to-br from-teal-600 to-teal-500 shadow-lg shadow-teal-500/30"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      {/* CDT Form Dialog */}
      <CDTForm
        open={showForm}
        onOpenChange={handleFormClose}
        onSuccess={handleFormSuccess}
        editCDT={editCDT as any}
      />
    </motion.div>
  );
}
