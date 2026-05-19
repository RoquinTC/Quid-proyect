"use client";

import { useState, useMemo } from "react";
import { formatCurrency } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  ArrowLeft,
  Calculator,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Info,
  PiggyBank,
  Zap,
  Scale,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

// ─── Financial math ──────────────────────────────────

/** French amortization: fixed monthly payment */
function calcFixedPayment(principal: number, annualRateEA: number, months: number): number {
  if (principal <= 0 || annualRateEA <= 0 || months <= 0) return 0;
  // Convert EA to monthly rate: (1+EA)^(1/12) - 1
  const monthlyRate = Math.pow(1 + annualRateEA / 100, 1 / 12) - 1;
  // PMT formula
  return principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1);
}

/** Generate full amortization table for fixed payments */
function amortizationFixed(principal: number, annualRateEA: number, months: number): Array<{ month: number; payment: number; capital: number; interest: number; balance: number }> {
  if (principal <= 0 || annualRateEA <= 0 || months <= 0) return [];
  const monthlyRate = Math.pow(1 + annualRateEA / 100, 1 / 12) - 1;
  const payment = calcFixedPayment(principal, annualRateEA, months);
  let balance = principal;
  const rows: Array<{ month: number; payment: number; capital: number; interest: number; balance: number }> = [];
  for (let i = 1; i <= months; i++) {
    const interest = balance * monthlyRate;
    const capital = payment - interest;
    balance -= capital;
    if (balance < 0) balance = 0;
    rows.push({
      month: i,
      payment,
      capital,
      interest,
      balance,
    });
  }
  return rows;
}

/** Generate full amortization table for decreasing/variable payments */
function amortizationVariable(principal: number, annualRateEA: number, months: number): Array<{ month: number; payment: number; capital: number; interest: number; balance: number }> {
  if (principal <= 0 || annualRateEA <= 0 || months <= 0) return [];
  const monthlyRate = Math.pow(1 + annualRateEA / 100, 1 / 12) - 1;
  const fixedCapital = principal / months; // Equal capital repayment each month
  let balance = principal;
  const rows: Array<{ month: number; payment: number; capital: number; interest: number; balance: number }> = [];
  for (let i = 1; i <= months; i++) {
    const interest = balance * monthlyRate;
    const payment = fixedCapital + interest;
    balance -= fixedCapital;
    if (balance < 0) balance = 0;
    rows.push({
      month: i,
      payment,
      capital: fixedCapital,
      interest,
      balance,
    });
  }
  return rows;
}

// ─── Component ────────────────────────────────────────
export function CreditSimulator() {
  const { setFinanceSubView } = useAppStore();
  const [amount, setAmount] = useState("");
  const [term, setTerm] = useState("");
  const [eaRate, setEaRate] = useState("");
  const [showTable, setShowTable] = useState<"fixed" | "variable" | null>(null);

  const principal = parseFloat(amount) || 0;
  const months = parseInt(term) || 0;
  const ea = parseFloat(eaRate) || 0;

  // Fixed payment calculations
  const fixedResults = useMemo(() => {
    if (principal <= 0 || months <= 0 || ea <= 0) return null;
    const monthlyPayment = calcFixedPayment(principal, ea, months);
    const totalPaid = monthlyPayment * months;
    const totalInterest = totalPaid - principal;
    const table = amortizationFixed(principal, ea, months);
    const firstPayment = table[0]?.payment || 0;
    const lastPayment = table[table.length - 1]?.payment || 0;
    // Interest percentage
    const interestPct = (totalInterest / principal) * 100;

    return { monthlyPayment, totalPaid, totalInterest, table, firstPayment, lastPayment, interestPct };
  }, [principal, months, ea]);

  // Variable/decreasing payment calculations
  const variableResults = useMemo(() => {
    if (principal <= 0 || months <= 0 || ea <= 0) return null;
    const table = amortizationVariable(principal, ea, months);
    const totalPaid = table.reduce((sum, r) => sum + r.payment, 0);
    const totalInterest = totalPaid - principal;
    const firstPayment = table[0]?.payment || 0;
    const lastPayment = table[table.length - 1]?.payment || 0;
    const interestPct = (totalInterest / principal) * 100;

    return { totalPaid, totalInterest, table, firstPayment, lastPayment, interestPct };
  }, [principal, months, ea]);

  // Comparison
  const comparison = useMemo(() => {
    if (!fixedResults || !variableResults) return null;
    const savesWithVariable = fixedResults.totalInterest - variableResults.totalInterest;
    const fixedFirstVsVariableFirst = fixedResults.monthlyPayment - variableResults.firstPayment;
    return { savesWithVariable, fixedFirstVsVariableFirst };
  }, [fixedResults, variableResults]);

  const isValid = principal > 0 && months > 0 && ea > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 space-y-4 pb-safe"
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="rounded-xl shrink-0"
          onClick={() => setFinanceSubView("overview")}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            Simulador de Crédito
          </h1>
          <p className="text-xs text-gray-400">
            Calcula tu cuota y compara opciones
          </p>
        </div>
      </div>

      {/* Input Form */}
      <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-violet-600 to-purple-500 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
        <CardContent className="p-5 relative z-10 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="size-4 text-violet-200" />
            <span className="text-sm text-violet-100">Datos del crédito</span>
          </div>

          <div>
            <label className="text-[11px] text-violet-200 mb-1 block">Monto del crédito</label>
            <CurrencyInput
              value={amount}
              onChange={setAmount}
              showPrefix
              placeholder="0"
              className="rounded-xl text-xl font-bold h-12 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-violet-200 mb-1 block">Plazo (meses)</label>
              <Input
                type="number"
                min={1}
                max={360}
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="24"
                className="rounded-xl h-11 text-base font-semibold bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40"
              />
            </div>
            <div>
              <label className="text-[11px] text-violet-200 mb-1 block">% EA anual</label>
              <Input
                type="number"
                min={0}
                step={0.1}
                value={eaRate}
                onChange={(e) => setEaRate(e.target.value)}
                placeholder="18.5"
                className="rounded-xl h-11 text-base font-semibold bg-white/10 border-white/20 text-white placeholder:text-white/50 focus:border-white/40"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {isValid && fixedResults && variableResults && (
        <>
          {/* Fixed Payment Card */}
          <Card className="border-0 shadow-md rounded-2xl overflow-hidden">
            <div
              className="px-4 py-3"
              style={{
                background: "linear-gradient(135deg, #8B5CF615, #8B5CF608)",
                borderLeft: "4px solid #8B5CF6",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                    <Scale className="size-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white block">
                      Cuota Fija
                    </span>
                    <span className="text-[10px] text-gray-400">Amortización francesa</span>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-gray-300 dark:text-gray-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-[11px] leading-relaxed bg-gray-800 dark:bg-gray-700 text-white">
                    Pagas lo mismo cada mes. Al inicio pagas más intereses, al final más capital.
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Monthly payment - hero number */}
              <div className="text-center py-3 bg-violet-50 dark:bg-violet-900/10 rounded-xl mb-3">
                <p className="text-[11px] text-violet-500 dark:text-violet-400 mb-1">Cuota mensual</p>
                <p className="text-2xl font-bold text-violet-700 dark:text-violet-300">
                  {formatCurrency(fixedResults.monthlyPayment)}
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-[10px] text-gray-400">Total a pagar</p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {formatCurrency(fixedResults.totalPaid)}
                  </p>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-[10px] text-gray-400">Total intereses</p>
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {formatCurrency(fixedResults.totalInterest)}
                  </p>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-[10px] text-gray-400">% en intereses</p>
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {fixedResults.interestPct.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Amortization table toggle */}
              <button
                onClick={() => setShowTable(showTable === "fixed" ? null : "fixed")}
                className="w-full flex items-center justify-center gap-1 text-[11px] text-violet-600 dark:text-violet-400 hover:underline"
              >
                Ver desglose mes a mes
                {showTable === "fixed" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </button>
            </div>

            <AnimatePresence>
              {showTable === "fixed" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
                        <tr className="text-gray-400">
                          <th className="py-2 px-3 text-left font-medium">Mes</th>
                          <th className="py-2 px-3 text-right font-medium">Cuota</th>
                          <th className="py-2 px-3 text-right font-medium">Capital</th>
                          <th className="py-2 px-3 text-right font-medium">Interés</th>
                          <th className="py-2 px-3 text-right font-medium">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fixedResults.table.map((row) => (
                          <tr key={row.month} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="py-1.5 px-3 text-gray-500">{row.month}</td>
                            <td className="py-1.5 px-3 text-right text-gray-700 dark:text-gray-300 font-medium">
                              {formatCurrency(row.payment)}
                            </td>
                            <td className="py-1.5 px-3 text-right text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(row.capital)}
                            </td>
                            <td className="py-1.5 px-3 text-right text-rose-500 dark:text-rose-400">
                              {formatCurrency(row.interest)}
                            </td>
                            <td className="py-1.5 px-3 text-right text-gray-500">
                              {formatCurrency(row.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* Variable Payment Card */}
          <Card className="border-0 shadow-md rounded-2xl overflow-hidden">
            <div
              className="px-4 py-3"
              style={{
                background: "linear-gradient(135deg, #F5970B15, #F5970B08)",
                borderLeft: "4px solid #F5970B",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <TrendingDown className="size-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-white block">
                      Cuota Variable
                    </span>
                    <span className="text-[10px] text-gray-400">Amortización decreciente</span>
                  </div>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 text-gray-300 dark:text-gray-600 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px] text-[11px] leading-relaxed bg-gray-800 dark:bg-gray-700 text-white">
                    Cada mes pagas la misma parte de capital + intereses sobre el saldo. La cuota va bajando cada mes.
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* First & last payment */}
              <div className="text-center py-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl mb-3">
                <p className="text-[11px] text-amber-500 dark:text-amber-400 mb-1">Primera cuota</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                  {formatCurrency(variableResults.firstPayment)}
                </p>
                <p className="text-[10px] text-gray-400 mt-1">
                  Última cuota: {formatCurrency(variableResults.lastPayment)}
                </p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-[10px] text-gray-400">Total a pagar</p>
                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    {formatCurrency(variableResults.totalPaid)}
                  </p>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-[10px] text-gray-400">Total intereses</p>
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {formatCurrency(variableResults.totalInterest)}
                  </p>
                </div>
                <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                  <p className="text-[10px] text-gray-400">% en intereses</p>
                  <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                    {variableResults.interestPct.toFixed(1)}%
                  </p>
                </div>
              </div>

              {/* Amortization table toggle */}
              <button
                onClick={() => setShowTable(showTable === "variable" ? null : "variable")}
                className="w-full flex items-center justify-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 hover:underline"
              >
                Ver desglose mes a mes
                {showTable === "variable" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </button>
            </div>

            <AnimatePresence>
              {showTable === "variable" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
                        <tr className="text-gray-400">
                          <th className="py-2 px-3 text-left font-medium">Mes</th>
                          <th className="py-2 px-3 text-right font-medium">Cuota</th>
                          <th className="py-2 px-3 text-right font-medium">Capital</th>
                          <th className="py-2 px-3 text-right font-medium">Interés</th>
                          <th className="py-2 px-3 text-right font-medium">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {variableResults.table.map((row) => (
                          <tr key={row.month} className="border-t border-gray-100 dark:border-gray-800">
                            <td className="py-1.5 px-3 text-gray-500">{row.month}</td>
                            <td className="py-1.5 px-3 text-right text-gray-700 dark:text-gray-300 font-medium">
                              {formatCurrency(row.payment)}
                            </td>
                            <td className="py-1.5 px-3 text-right text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(row.capital)}
                            </td>
                            <td className="py-1.5 px-3 text-right text-rose-500 dark:text-rose-400">
                              {formatCurrency(row.interest)}
                            </td>
                            <td className="py-1.5 px-3 text-right text-gray-500">
                              {formatCurrency(row.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>

          {/* Comparison / Recommendation */}
          {comparison && (
            <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="size-5 text-amber-600 dark:text-amber-400" />
                  <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">
                    Comparación
                  </h3>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Intereses con cuota fija
                      </span>
                    </div>
                    <span className="text-sm font-bold text-rose-600 dark:text-rose-400 shrink-0">
                      {formatCurrency(fixedResults.totalInterest)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Intereses con cuota variable
                      </span>
                    </div>
                    <span className="text-sm font-bold text-rose-600 dark:text-rose-400 shrink-0">
                      {formatCurrency(variableResults.totalInterest)}
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-amber-200/50 dark:border-amber-700/30 space-y-2">
                  {comparison.savesWithVariable > 0 && (
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 font-medium">
                      Con cuota variable pagas <strong>{formatCurrency(comparison.savesWithVariable)}</strong> menos en intereses, pero tu primera cuota es de <strong>{formatCurrency(variableResults.firstPayment)}</strong> (vs {formatCurrency(fixedResults.monthlyPayment)} fija).
                    </p>
                  )}
                  {comparison.savesWithVariable <= 0 && (
                    <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 font-medium">
                      En este caso ambas opciones pagan intereses similares. La cuota fija te da estabilidad mensual.
                    </p>
                  )}

                  {fixedResults.interestPct > 50 && (
                    <div className="bg-rose-50 dark:bg-rose-900/20 rounded-lg p-2.5">
                      <p className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">
                        Los intereses representan el {fixedResults.interestPct.toFixed(1)}% del monto. Considera un plazo más corto o una tasa menor.
                      </p>
                    </div>
                  )}

                  <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-2.5">
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                      <strong>Tip:</strong> Si puedes pagar extra cada mes, reduces el plazo y los intereses significativamente. Incluso {formatCurrency(fixedResults.monthlyPayment * 0.1)} adicionales mensuales hacen diferencia.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Visual: Interest vs Capital bar */}
          {fixedResults && (
            <Card className="border-0 shadow-sm rounded-2xl">
              <CardContent className="p-4">
                <p className="text-[11px] text-gray-400 mb-2 font-medium">Distribución del pago (cuota fija)</p>
                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-emerald-600 dark:text-emerald-400">Capital</span>
                      <span className="text-gray-500">{formatCurrency(principal)} ({((principal / fixedResults.totalPaid) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${(principal / fixedResults.totalPaid) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-rose-500 dark:text-rose-400">Intereses</span>
                      <span className="text-gray-500">{formatCurrency(fixedResults.totalInterest)} ({((fixedResults.totalInterest / fixedResults.totalPaid) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-400 rounded-full transition-all"
                        style={{ width: `${(fixedResults.totalInterest / fixedResults.totalPaid) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Disclaimer */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Cálculos basados en tasa efectiva anual (EA) con conversión a tasa mensual compuesta.
              Los valores reales pueden variar según la entidad financiera, seguros asociados,
              comisiones y otros cargos. Consulta siempre la tabla de amortización oficial.
            </p>
          </div>
        </>
      )}

      {/* No data state */}
      {!isValid && (
        <Card className="border-0 shadow-sm rounded-2xl">
          <CardContent className="p-8 text-center">
            <Calculator className="size-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              Ingresa monto, plazo y tasa para ver la simulación
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
