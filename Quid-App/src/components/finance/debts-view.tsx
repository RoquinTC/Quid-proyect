"use client";

import { useState, useCallback, useMemo } from "react";
import { formatCurrency, calcPercentage } from "@/lib/api";
import { useLocalQuery } from "@/lib/local/hooks/queries";
import { useAppStore } from "@/lib/store";
import { useDataEvent } from "@/hooks/use-data-event";
import { DebtCard } from "./debt-card";
import { DebtForm } from "./debt-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Plus, CreditCard, Zap, Sparkles, CalendarDays, TrendingDown, Info, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import type { Debt } from "@/lib/types";

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

export function DebtsView() {
  const { setFinanceSubView } = useAppStore();
  const { data: debts, loading, refetch: fetchDebts } = useLocalQuery<Debt>("/api/debts");
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [extraPayment, setExtraPayment] = useState(100000);
  const [payoffMethod, setPayoffMethod] = useState<"snowball" | "avalanche">("snowball");

  useDataEvent("debts", fetchDebts);
  useDataEvent("installments", fetchDebts);
  useDataEvent("transactions", fetchDebts);

  const totalDebt = debts.reduce((sum, d) => sum + d.currentBalance, 0);
  const totalCredit = debts
    .filter((d) => d.type === "credit_card")
    .reduce((sum, d) => sum + d.totalAmount, 0);
  const totalUsed = debts
    .filter((d) => d.type === "credit_card")
    .reduce((sum, d) => sum + d.currentBalance, 0);
  const loanBalance = debts
    .filter((d) => d.type === "loan")
    .reduce((sum, d) => sum + d.currentBalance, 0);

  const getProjectedDate = (monthsCount: number) => {
    if (monthsCount <= 0) return "Deuda Cero";
    const date = new Date();
    date.setMonth(date.getMonth() + monthsCount);
    return date.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  };

  const simulation = useMemo(() => {
    if (totalDebt <= 0) {
      return {
        monthsNormal: 0,
        interestNormal: 0,
        monthsAccelerated: 0,
        interestAccelerated: 0,
        savedInterest: 0,
        savedMonths: 0,
      };
    }

    // Weighted average interest rate
    const debtsWithInterest = debts.filter(
      (d) => d.interestRate !== undefined && d.interestRate !== null && d.interestRate > 0 && d.currentBalance > 0
    );
    const avgInterest =
      debtsWithInterest.length > 0
        ? debtsWithInterest.reduce((sum, d) => sum + d.interestRate! * d.currentBalance, 0) /
          debtsWithInterest.reduce((sum, d) => sum + d.currentBalance, 0)
        : 28; // Standard EA 28% in Colombia

    const monthlyInterestRate = Math.pow(1 + avgInterest / 100, 1 / 12) - 1;

    // Minimum payments
    const totalMin = debts.reduce(
      (sum, d) => sum + (d.monthlyPayment || d.currentBalance * 0.04),
      0
    );

    // Simulate Scenario A: Paying minimums only
    let balanceNormal = totalDebt;
    let monthsNormal = 0;
    let interestNormal = 0;
    while (balanceNormal > 0 && monthsNormal < 360) {
      monthsNormal++;
      const interest = balanceNormal * monthlyInterestRate;
      interestNormal += interest;
      const minPay = Math.min(totalMin, balanceNormal + interest);
      const principal = minPay - interest;
      const actualPrincipal = principal > 0 ? principal : balanceNormal * 0.02;
      const actualPayment = actualPrincipal + interest;
      balanceNormal = Math.max(0, balanceNormal + interest - actualPayment);
    }

    // Simulate Scenario B: Paying minimums + extra
    let balanceAcc = totalDebt;
    let monthsAcc = 0;
    let interestAcc = 0;
    const totalAccPayment = totalMin + extraPayment;
    while (balanceAcc > 0 && monthsAcc < 360) {
      monthsAcc++;
      const interest = balanceAcc * monthlyInterestRate;
      interestAcc += interest;
      const minPay = Math.min(totalAccPayment, balanceAcc + interest);
      const principal = minPay - interest;
      const actualPrincipal = principal > 0 ? principal : balanceAcc * 0.02;
      const actualPayment = actualPrincipal + interest;
      balanceAcc = Math.max(0, balanceAcc + interest - actualPayment);
    }

    return {
      monthsNormal,
      interestNormal,
      monthsAccelerated: monthsAcc,
      interestAccelerated: interestAcc,
      savedInterest: Math.max(0, interestNormal - interestAcc),
      savedMonths: Math.max(0, monthsNormal - monthsAcc),
    };
  }, [debts, totalDebt, extraPayment]);

  const sortedDebts = useMemo(() => {
    if (payoffMethod === "snowball") {
      // Smallest balance first
      return [...debts].sort((a, b) => a.currentBalance - b.currentBalance);
    } else {
      // Highest interest rate first
      return [...debts].sort((a, b) => (b.interestRate || 0) - (a.interestRate || 0));
    }
  }, [debts, payoffMethod]);

  const donutData = useMemo(() => {
    // One segment per debt with its own color
    const segments: Array<{ name: string; value: number; color: string; debtId: string | null }> = debts
      .filter((d) => d.currentBalance > 0)
      .map((d) => ({
        name: d.name,
        value: d.currentBalance,
        color: d.color,
        debtId: d.id,
      }));

    // Available credit segment (neutral color)
    const available = Math.max(totalCredit - totalUsed, 0);
    if (available > 0) {
      segments.push({
        name: "Disponible",
        value: available,
        color: "#94A3B8", // slate-400 — neutral, works on both light/dark
        debtId: null,
      });
    }

    return segments;
  }, [debts, totalUsed, totalCredit]);

  const handleDebtClick = useCallback((debtId: string) => {
    sessionStorage.setItem("selectedDebtId", debtId);
    setFinanceSubView("debt-detail");
  }, [setFinanceSubView]);

  const handleDonutClick = useCallback(
    (_data: unknown, index: number) => {
      const segment = donutData[index];
      if (!segment) return;
      if (segment.debtId) {
        handleDebtClick(segment.debtId);
      }
    },
    [donutData, handleDebtClick]
  );

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
      {/* Total Debt Header */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-4 relative z-10">
            <div className="flex items-center justify-between gap-4">
              {/* Left side: debt info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <CreditCard className="size-3.5 text-rose-200" />
                  <span className="text-xs text-rose-100 font-medium">Deuda Total</span>
                </div>
                <p className="text-2xl font-bold tracking-tight leading-none mb-1.5">
                  {formatCurrency(totalDebt)}
                </p>
                {totalCredit > 0 && (
                  <div className="flex items-center gap-1.5 text-[10px] text-rose-200 leading-none">
                    <span>Utilización: {calcPercentage(totalUsed, totalCredit)}%</span>
                  </div>
                )}
              </div>

              {/* Right side: donut chart */}
              {donutData.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="flex flex-col items-center shrink-0"
                >
                  <div className="relative" style={{ width: 96, height: 96 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={28}
                          outerRadius={44}
                          paddingAngle={2}
                          dataKey="value"
                          onClick={handleDonutClick}
                          cursor="pointer"
                          animationBegin={200}
                          animationDuration={800}
                        >
                          {donutData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.color}
                              stroke="rgba(255,255,255,0.3)"
                              strokeWidth={1}
                            />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-col gap-0.5 mt-1.5 w-full max-w-[130px] overflow-hidden">
                    {donutData.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-1 text-[10px] leading-tight">
                        <span
                          className="size-2 rounded-full shrink-0 border border-white/30"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-rose-100 truncate flex-1">{entry.name}</span>
                        <span className="text-rose-200/80 font-medium shrink-0 ml-1">{formatCurrency(entry.value)}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Debts List */}
      {debts.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50 dark:from-rose-900/20 dark:to-pink-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 shadow-lg mb-4">
                <CreditCard className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                Sin deudas registradas
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Agrega tus tarjetas de crédito o préstamos para llevar control
              </p>
              <Button
                onClick={() => setShowDebtForm(true)}
                className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-500"
              >
                <Plus className="size-4 mr-1" />
                Agregar Deuda
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <div
          data-carousel
          className="-mx-4 flex min-h-[205px] gap-3 overflow-x-auto overflow-y-visible px-4 pb-3 pt-1 no-scrollbar snap-x snap-mandatory scroll-smooth"
        >
          {debts.map((debt) => (
            <div key={debt.id} className="shrink-0 snap-center opacity-100">
              <DebtCard
                debt={debt}
                onClick={() => handleDebtClick(debt.id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Zero Debt Accelerator Widget */}
      {debts.length > 0 && (
        <motion.div variants={itemVariants} className="pb-16">
          <Card className="border border-gray-100 dark:border-zinc-800/80 shadow-md rounded-2xl bg-white dark:bg-zinc-900/30 overflow-hidden">
            <CardContent className="p-4 sm:p-5 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-zinc-800/60 pb-3">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                    <Zap className="size-4.5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-gray-900 dark:text-white leading-none">Acelerador de Deuda Cero</h3>
                    <p className="text-[10px] text-gray-400 mt-0.5">Simula abonos extra y optimiza tu libertad</p>
                  </div>
                </div>
                <Badge className="bg-rose-500/10 text-rose-500 border-none text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  <Sparkles className="size-2.5" />
                  Inteligente
                </Badge>
              </div>

              {/* Method Selector Tabs */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Estrategia de Pago</label>
                <div className="grid grid-cols-2 gap-1.5 bg-gray-50 dark:bg-zinc-950/40 p-1 rounded-xl">
                  <button
                    onClick={() => setPayoffMethod("snowball")}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      payoffMethod === "snowball"
                        ? "bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                    }`}
                  >
                    Bola de Nieve
                  </button>
                  <button
                    onClick={() => setPayoffMethod("avalanche")}
                    className={`py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      payoffMethod === "avalanche"
                        ? "bg-white dark:bg-zinc-800 text-rose-600 dark:text-rose-400 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                    }`}
                  >
                    Avalancha
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 italic px-1">
                  {payoffMethod === "snowball"
                    ? "❄️ Bola de Nieve: Enfócate en liquidar deudas de menor saldo para ganar victorias psicológicas rápidas."
                    : "⚡ Avalancha: Minimiza el costo pagando primero las deudas con mayor tasa de interés."}
                </p>
              </div>

              {/* Slider for Extra Payment */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Abono Extra Mensual</span>
                  <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none text-xs font-extrabold px-2 py-0.5">
                    + {formatCurrency(extraPayment)} / mes
                  </Badge>
                </div>
                <div className="px-1.5">
                  <Slider
                    value={[extraPayment]}
                    onValueChange={(val) => setExtraPayment(val[0])}
                    min={0}
                    max={1000000}
                    step={25000}
                    className="py-1 [&_[data-slot=slider-track]]:bg-gray-100 dark:[&_[data-slot=slider-track]]:bg-zinc-800 [&_[data-slot=slider-range]]:bg-rose-500 [&_[data-slot=slider-thumb]]:border-rose-500"
                  />
                </div>
                <div className="flex justify-between text-[9px] text-gray-400 px-1">
                  <span>Sin abono</span>
                  <span>$250K</span>
                  <span>$500K</span>
                  <span>$750K</span>
                  <span>$1M COP</span>
                </div>
              </div>

              {/* Key Metrics Grid */}
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {/* Metric 1: Saved Interest */}
                  <div className="bg-emerald-500/5 dark:bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-2.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 mb-1">
                      <TrendingDown className="size-3.5 shrink-0" />
                      <span className="text-[9px] font-bold uppercase tracking-tight leading-none">Ahorro Interés</span>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 truncate">
                        {formatCurrency(simulation.savedInterest)}
                      </p>
                      <p className="text-[8px] text-gray-400 leading-tight mt-0.5">
                        {simulation.savedInterest > 0 ? "Intereses evitados" : "Suma abono extra"}
                      </p>
                    </div>
                  </div>

                  {/* Metric 2: Freedom Speed-up */}
                  <div className="bg-rose-500/5 dark:bg-rose-500/5 border border-rose-500/15 rounded-xl p-2.5 flex flex-col justify-between">
                    <div className="flex items-center gap-1 text-rose-500 mb-1">
                      <Zap className="size-3.5 shrink-0" />
                      <span className="text-[9px] font-bold uppercase tracking-tight leading-none">Tiempo Ganado</span>
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-black text-rose-500 truncate">
                        {simulation.savedMonths > 0 ? `${simulation.savedMonths} meses` : "Mismo plazo"}
                      </p>
                      <p className="text-[8px] text-gray-400 leading-tight mt-0.5">
                        {simulation.savedMonths > 0 ? "¡Liquidación anticipada!" : "Paga mínimo"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Metric 3: Debt Free Date (Full Width Bar) */}
                <div className="bg-blue-500/5 dark:bg-blue-500/5 border border-blue-500/15 rounded-xl p-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-blue-500">
                    <CalendarDays className="size-4 shrink-0 text-blue-500" />
                    <div className="text-left">
                      <span className="text-[9px] font-bold uppercase tracking-tight leading-none text-blue-500 block">Deuda Cero Proyectada</span>
                      <span className="text-[8px] text-gray-400 leading-none mt-0.5 block">Simulado en {simulation.monthsAccelerated} meses</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs sm:text-sm font-black text-blue-600 dark:text-blue-400 capitalize">
                      {getProjectedDate(simulation.monthsAccelerated)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Priority Payoff Roadmap */}
              {sortedDebts.length > 0 && (
                <div className="bg-gray-50/50 dark:bg-zinc-950/20 border border-gray-100 dark:border-zinc-800/40 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1">
                    <Info className="size-3.5 text-gray-400" />
                    <span className="text-[11px] font-bold text-gray-500">Hoja de Ruta de Pagos</span>
                  </div>
                  <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1 no-scrollbar">
                    {sortedDebts.map((d, index) => {
                      const isFocus = index === 0;
                      return (
                        <div
                          key={d.id}
                          className={`flex items-center justify-between p-2 rounded-lg text-xs transition-all ${
                            isFocus
                              ? "bg-rose-500/10 border border-rose-500/30 text-rose-800 dark:text-rose-300 font-bold"
                              : "bg-white dark:bg-zinc-900 text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-zinc-800/20"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`size-5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                              isFocus
                                ? "bg-rose-500 text-white"
                                : "bg-gray-100 dark:bg-zinc-800 text-gray-500"
                            }`}>
                              {index + 1}
                            </span>
                            <div className="truncate">
                              <p className="truncate font-semibold">{d.name}</p>
                              {d.interestRate !== undefined && d.interestRate !== null && d.interestRate > 0 && (
                                <p className="text-[9px] text-gray-400 font-normal">Tasa: {d.interestRate}% EA</p>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            {isFocus ? (
                              <Badge className="bg-rose-500 text-white text-[9px] px-1.5 py-0 border-none font-bold rounded-md">
                                {extraPayment > 0
                                  ? `Abonar Mínimo + ${formatCurrency(extraPayment)}`
                                  : "Foco Principal"}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-gray-400">
                                Mínimo ({formatCurrency(d.monthlyPayment || (d.currentBalance * 0.04))})
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* FAB - Add Debt */}
      {debts.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 md:right-8 z-40"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: "spring" }}
        >
          <Button
            onClick={() => setShowDebtForm(true)}
            className="size-14 rounded-full bg-gradient-to-br from-rose-500 to-pink-500 shadow-lg shadow-rose-500/30"
            size="icon"
          >
            <Plus className="size-6 text-white" />
          </Button>
        </motion.div>
      )}

      <DebtForm
        open={showDebtForm}
        onOpenChange={setShowDebtForm}
        onSuccess={fetchDebts}
      />
    </motion.div>
  );
}
