"use client";

import { useState, useMemo } from "react";
import { formatCurrency, formatDate, getColombiaNow, createColombiaDate } from "@/lib/api";
import { useLocalQuery } from "@/lib/local/hooks/queries";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft,
  Calculator,
  CreditCard,
  TrendingDown,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  HandCoins,
  Zap,
  Calendar,
  Wallet,
  Sparkles,
  Eye,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Debt } from "@/lib/types";

// ─── Financial Math ──────────────────────────────────

interface AmortizationRow {
  month: number;
  date: string; // YYYY-MM-DD
  payment: number; // Total cuota normal
  capital: number; // Capital from normal cuota
  interest: number; // Interest from normal cuota
  extraPayment: number; // Abono extra this month
  extraCapital: number; // Capital portion of abono (no interest)
  balance: number; // Remaining balance after this month
  isPaidOff: boolean; // Whether the debt is fully paid after this row
}

interface ProjectionResult {
  rows: AmortizationRow[];
  totalPaid: number; // Total of all normal cuotas
  totalInterest: number; // Total interest paid
  totalExtraPayments: number; // Total of all extra abonos
  totalOverall: number; // Grand total (paid + interest + extras)
  monthsSaved: number; // How many months early the debt is paid off
  interestSaved: number; // How much interest is saved vs no extras
  originalMonths: number; // How many months it would take without extras
  projectedMonths: number; // How many months it actually takes with extras
}

interface ExtraPayment {
  id: string;
  amount: number;
  type: "one-time" | "recurring";
  date: string; // For one-time: specific date, for recurring: day of month
  label: string;
}

/**
 * Get the next payment date for a debt from a given reference date.
 * Uses the debt's paymentDate (day of month) if available, otherwise 1st of next month.
 */
function getNextPaymentDate(debt: Debt, fromDate: Date): Date {
  const paymentDay = debt.paymentDate ?? 1;
  const year = fromDate.getFullYear();
  const month = fromDate.getMonth();

  // Try this month's payment date
  let candidate = new Date(year, month, paymentDay, 12, 0, 0);
  if (candidate <= fromDate) {
    // This month's date has passed, use next month
    candidate = new Date(year, month + 1, paymentDay, 12, 0, 0);
  }
  return candidate;
}

/**
 * Add months to a date
 */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Format month for display
 */
function formatMonth(dateStr: string): string {
  const d = createColombiaDate(dateStr);
  return new Intl.DateTimeFormat("es-CO", {
    month: "short",
    year: "2-digit",
    timeZone: "America/Bogota",
  }).format(d);
}

// ─── Projection Engine ──────────────────────────────────

function projectLoanFixed(
  debt: Debt,
  extraPayments: ExtraPayment[]
): ProjectionResult {
  const balance = debt.currentBalance;
  if (balance <= 0) return emptyResult();

  const annualRateNMV = debt.interestRate ?? 0;
  const monthlyRate = annualRateNMV > 0 ? annualRateNMV / 12 / 100 : 0;
  const cuota = debt.monthlyPayment ?? 0;
  const otherCharges = debt.otherCharges ?? 0;

  if (cuota <= 0) return emptyResult();

  // First, calculate original projection (no extras) for comparison
  let originalMonths = 0;
  {
    let b = balance;
    while (b > 0 && originalMonths < 600) {
      const interest = b * monthlyRate;
      const capital = Math.min(cuota - interest - otherCharges, b);
      b -= capital;
      originalMonths++;
    }
  }

  // Now calculate with extras
  const rows: AmortizationRow[] = [];
  let currentBalance = balance;
  let totalPaid = 0;
  let totalInterest = 0;
  let totalExtraPayments = 0;
  let month = 0;

  const now = getColombiaNow();
  const startDate = getNextPaymentDate(debt, now);

  while (currentBalance > 0 && month < 600) {
    month++;
    const payDate = addMonths(startDate, month - 1);
    const dateStr = payDate.toISOString().split("T")[0];

    // Calculate interest and capital for normal cuota
    const interest = currentBalance * monthlyRate;
    let capital = cuota - interest - otherCharges;

    // If capital is negative (cuota doesn't cover interest + charges), just pay interest
    if (capital < 0) capital = 0;

    // Calculate extra payments for this month
    let extraThisMonth = 0;
    for (const ep of extraPayments) {
      if (ep.type === "recurring") {
        // Recurring: apply every month
        extraThisMonth += ep.amount;
      } else {
        // One-time: apply only on the specific date
        const epDate = createColombiaDate(ep.date);
        const payDateColombia = createColombiaDate(dateStr);
        // Same month and year
        if (
          epDate.getMonth() === payDateColombia.getMonth() &&
          epDate.getFullYear() === payDateColombia.getFullYear()
        ) {
          extraThisMonth += ep.amount;
        }
      }
    }

    // Cap extra payment at remaining balance (after normal capital)
    const maxExtra = Math.max(currentBalance - capital, 0);
    const actualExtra = Math.min(extraThisMonth, maxExtra);

    // Update balance
    currentBalance -= capital + actualExtra;
    if (currentBalance < 0) currentBalance = 0;

    totalPaid += cuota;
    totalInterest += interest;
    totalExtraPayments += actualExtra;

    const isPaidOff = currentBalance <= 0;

    rows.push({
      month,
      date: dateStr,
      payment: cuota,
      capital,
      interest,
      extraPayment: actualExtra,
      extraCapital: actualExtra, // All extra goes to capital
      balance: currentBalance,
      isPaidOff,
    });

    if (isPaidOff) break;
  }

  // Calculate original total interest for comparison
  let originalTotalInterest = 0;
  {
    let b = balance;
    for (let i = 0; i < originalMonths; i++) {
      const interest = b * monthlyRate;
      const capital = Math.min(cuota - interest - otherCharges, b);
      originalTotalInterest += interest;
      b -= capital;
    }
  }

  const interestSaved = Math.max(originalTotalInterest - totalInterest, 0);
  const monthsSaved = Math.max(originalMonths - month, 0);

  return {
    rows,
    totalPaid,
    totalInterest,
    totalExtraPayments,
    totalOverall: totalPaid + totalExtraPayments,
    monthsSaved,
    interestSaved,
    originalMonths,
    projectedMonths: month,
  };
}

function projectCreditCard(
  debt: Debt,
  extraPayments: ExtraPayment[]
): ProjectionResult {
  // For credit cards, we track each installment's remaining balance
  // Each month: pay the installment amount (capital portion) + any extra
  const unpaidInstallments = debt.installments.filter(
    (inst) => !inst.isPaid && (inst.remainingBalance ?? 0) > 0
  );

  if (unpaidInstallments.length === 0) return emptyResult();

  // Track installment states
  const instStates = unpaidInstallments.map((inst) => ({
    id: inst.id,
    description: inst.description,
    remainingBalance: inst.remainingBalance ?? inst.totalAmount,
    installmentAmount: inst.installmentAmount,
    interestRate: inst.interestRate ?? debt.interestRate ?? 0,
    monthlyInterest: 0 as number,
  }));

  // Calculate monthly interest for each installment
  for (const inst of instStates) {
    if (inst.interestRate > 0 && inst.remainingBalance > 0) {
      // For credit cards, interestRate is monthly %
      inst.monthlyInterest = inst.remainingBalance * (inst.interestRate / 100);
    }
  }

  // Calculate original months (max remaining installments)
  const originalMonths = Math.max(
    ...unpaidInstallments.map((inst) => inst.totalInstallments - inst.currentInstallment + 1),
    0
  );

  // Project month by month
  const rows: AmortizationRow[] = [];
  let totalPaid = 0;
  let totalInterest = 0;
  let totalExtraPayments = 0;
  let month = 0;

  const now = getColombiaNow();
  const startDate = getNextPaymentDate(debt, now);

  // First, calculate original total interest for comparison
  let originalTotalInterest = 0;
  {
    const tempStates = instStates.map((s) => ({ ...s }));
    for (let i = 0; i < originalMonths + 60; i++) {
      let allPaid = true;
      for (const inst of tempStates) {
        if (inst.remainingBalance <= 0) continue;
        allPaid = false;
        const interest = inst.remainingBalance * (inst.interestRate / 100);
        originalTotalInterest += interest;
        const capital = Math.min(inst.installmentAmount - interest, inst.remainingBalance);
        inst.remainingBalance -= capital;
      }
      if (allPaid) break;
    }
  }

  while (month < originalMonths + 120) {
    month++;
    const payDate = addMonths(startDate, month - 1);
    const dateStr = payDate.toISOString().split("T")[0];

    const totalBalance = instStates.reduce((sum, s) => sum + Math.max(s.remainingBalance, 0), 0);
    if (totalBalance <= 0) break;

    // Calculate extra payments for this month
    let extraThisMonth = 0;
    for (const ep of extraPayments) {
      if (ep.type === "recurring") {
        extraThisMonth += ep.amount;
      } else {
        const epDate = createColombiaDate(ep.date);
        const payDateColombia = createColombiaDate(dateStr);
        if (
          epDate.getMonth() === payDateColombia.getMonth() &&
          epDate.getFullYear() === payDateColombia.getFullYear()
        ) {
          extraThisMonth += ep.amount;
        }
      }
    }

    // Process each installment
    let monthCapital = 0;
    let monthInterest = 0;
    let monthPayment = 0;
    let remainingExtra = extraThisMonth;

    // Sort installments by interest rate descending (pay highest interest first)
    const sortedStates = [...instStates]
      .filter((s) => s.remainingBalance > 0)
      .sort((a, b) => b.interestRate - a.interestRate);

    for (const inst of sortedStates) {
      if (inst.remainingBalance <= 0) continue;

      // Calculate interest
      const interest = inst.remainingBalance * (inst.interestRate / 100);
      const capitalFromCuota = Math.min(
        inst.installmentAmount - interest,
        inst.remainingBalance
      );
      const cuotaTotal = Math.min(inst.installmentAmount, inst.remainingBalance + interest);

      // Apply extra to this installment (Avalanche method: highest interest first)
      let extraToThis = 0;
      if (remainingExtra > 0) {
        const maxExtraForInst = Math.max(inst.remainingBalance - capitalFromCuota, 0);
        extraToThis = Math.min(remainingExtra, maxExtraForInst);
        remainingExtra -= extraToThis;
      }

      inst.remainingBalance -= capitalFromCuota + extraToThis;
      if (inst.remainingBalance < 0) inst.remainingBalance = 0;

      monthCapital += capitalFromCuota + extraToThis;
      monthInterest += interest;
      monthPayment += cuotaTotal;
    }

    totalPaid += monthPayment;
    totalInterest += monthInterest;
    totalExtraPayments += extraThisMonth - remainingExtra; // Only count what was actually applied

    const newTotalBalance = instStates.reduce((sum, s) => sum + Math.max(s.remainingBalance, 0), 0);
    const isPaidOff = newTotalBalance <= 0;

    rows.push({
      month,
      date: dateStr,
      payment: monthPayment,
      capital: monthCapital,
      interest: monthInterest,
      extraPayment: extraThisMonth - remainingExtra,
      extraCapital: extraThisMonth - remainingExtra,
      balance: newTotalBalance,
      isPaidOff,
    });

    if (isPaidOff) break;
  }

  const interestSaved = Math.max(originalTotalInterest - totalInterest, 0);
  const monthsSaved = Math.max(originalMonths - month, 0);

  return {
    rows,
    totalPaid,
    totalInterest,
    totalExtraPayments,
    totalOverall: totalPaid + totalExtraPayments,
    monthsSaved,
    interestSaved,
    originalMonths,
    projectedMonths: month,
  };
}

function emptyResult(): ProjectionResult {
  return {
    rows: [],
    totalPaid: 0,
    totalInterest: 0,
    totalExtraPayments: 0,
    totalOverall: 0,
    monthsSaved: 0,
    interestSaved: 0,
    originalMonths: 0,
    projectedMonths: 0,
  };
}

function generateId(): string {
  return `ep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Component ────────────────────────────────────────

export function DebtSimulator() {
  const { setFinanceSubView } = useAppStore();
  const { data: debts, loading } = useLocalQuery<Debt>("/api/debts");

  // Step 1: Select debt
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);

  // Step 2: Extra payments
  const [extraPayments, setExtraPayments] = useState<ExtraPayment[]>([]);

  // UI state
  const [showTable, setShowTable] = useState(false);
  const [showAddExtra, setShowAddExtra] = useState(false);
  const [newExtraAmount, setNewExtraAmount] = useState("");
  const [newExtraType, setNewExtraType] = useState<"one-time" | "recurring">("recurring");
  const [newExtraDate, setNewExtraDate] = useState(() => {
    const now = getColombiaNow();
    return now.toISOString().split("T")[0];
  });

  const selectedDebt = debts.find((d) => d.id === selectedDebtId) ?? null;

  // Projection
  const projection = useMemo(() => {
    if (!selectedDebt) return emptyResult();
    if (selectedDebt.type === "loan" && selectedDebt.paymentType === "fixed") {
      return projectLoanFixed(selectedDebt, extraPayments);
    }
    if (selectedDebt.type === "credit_card") {
      return projectCreditCard(selectedDebt, extraPayments);
    }
    // For other debt types, try loan projection as fallback
    return projectLoanFixed(selectedDebt, extraPayments);
  }, [selectedDebt, extraPayments]);

  const handleAddExtra = () => {
    const amount = parseFloat(newExtraAmount);
    if (isNaN(amount) || amount <= 0) return;

    const ep: ExtraPayment = {
      id: generateId(),
      amount,
      type: newExtraType,
      date: newExtraDate,
      label:
        newExtraType === "recurring"
          ? `Abono recurrente de ${formatCurrency(amount)}/mes`
          : `Abono único de ${formatCurrency(amount)} el ${formatDate(newExtraDate)}`,
    };

    setExtraPayments((prev) => [...prev, ep]);
    setNewExtraAmount("");
    setShowAddExtra(false);
  };

  const handleRemoveExtra = (id: string) => {
    setExtraPayments((prev) => prev.filter((ep) => ep.id !== id));
  };

  // ─── Step 1: Debt Selection ─────────────────────────
  if (!selectedDebtId) {
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
              Simulador de Abonos
            </h1>
            <p className="text-xs text-gray-400">
              Selecciona una deuda para simular abonos
            </p>
          </div>
        </div>

        {/* Info Card */}
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_70%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <HandCoins className="size-5 text-rose-200" />
              <span className="text-sm text-rose-100 font-medium">
                ¿Qué pasaría si...?
              </span>
            </div>
            <p className="text-xs text-rose-100/90 leading-relaxed">
              Simula cómo los abonos extra a capital aceleran el pago de tus deudas.
              Ve cuánto ahorrarías en intereses y cuántos meses adelantarías tu libertad financiera.
            </p>
          </CardContent>
        </Card>

        {/* Debt List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
            ))}
          </div>
        ) : debts.length === 0 ? (
          <Card className="border-0 shadow-md rounded-2xl">
            <CardContent className="p-8 text-center">
              <CreditCard className="size-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
              <p className="text-sm text-gray-400">
                No tienes deudas registradas para simular
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {debts
              .filter((d) => d.currentBalance > 0)
              .map((debt) => {
                const isCreditCard = debt.type === "credit_card";
                const isLoan = debt.type === "loan";
                const unpaidInstallments = debt.installments?.filter(
                  (i) => !i.isPaid
                ).length ?? 0;

                return (
                  <motion.button
                    key={debt.id}
                    onClick={() => setSelectedDebtId(debt.id)}
                    className="w-full text-left"
                    whileTap={{ scale: 0.98 }}
                  >
                    <Card className="border-0 shadow-md rounded-2xl overflow-hidden hover:shadow-lg transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3">
                          <div
                            className="size-11 rounded-xl flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${debt.color}20` }}
                          >
                            {isCreditCard ? (
                              <CreditCard className="size-5" style={{ color: debt.color }} />
                            ) : (
                              <Wallet className="size-5" style={{ color: debt.color }} />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {debt.name}
                              </span>
                              <Badge variant="secondary" className="text-[9px] shrink-0">
                                {isCreditCard ? "TC" : isLoan ? "Préstamo" : "Otra"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              {debt.bank && <span>{debt.bank}</span>}
                              {isLoan && debt.remainingPayments && (
                                <span>{debt.remainingPayments} cuotas</span>
                              )}
                              {isCreditCard && unpaidInstallments > 0 && (
                                <span>{unpaidInstallments} compras</span>
                              )}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-gray-900 dark:text-white">
                              {formatCurrency(debt.currentBalance)}
                            </p>
                            {debt.interestRate && (
                              <p className="text-[10px] text-gray-400">
                                {isLoan ? `${debt.interestRate}% NMV` : `${debt.interestRate}% mensual`}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.button>
                );
              })}
          </div>
        )}
      </motion.div>
    );
  }

  // ─── Step 2: Simulator View ─────────────────────────
  // Guard: selectedDebt must exist before we use its properties
  if (!selectedDebt) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-500 dark:text-gray-400">Deuda no encontrada</p>
        <Button
          variant="ghost"
          onClick={() => {
            setSelectedDebtId(null);
            setExtraPayments([]);
            setShowTable(false);
          }}
          className="mt-2"
        >
          <ArrowLeft className="size-4 mr-1" />
          Volver
        </Button>
      </div>
    );
  }

  const isCreditCard = selectedDebt.type === "credit_card";
  const isLoan = selectedDebt.type === "loan";
  const isLoanFixed = isLoan && selectedDebt.paymentType === "fixed";

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
          onClick={() => {
            setSelectedDebtId(null);
            setExtraPayments([]);
            setShowTable(false);
          }}
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">
            {selectedDebt.name}
          </h1>
          <p className="text-xs text-gray-400">
            {selectedDebt.bank && `${selectedDebt.bank} · `}
            {isCreditCard ? "Tarjeta de Crédito" : isLoanFixed ? "Préstamo Cuota Fija" : "Préstamo"}
          </p>
        </div>
      </div>

      {/* Current Debt Summary */}
      <Card className="border-0 shadow-lg rounded-2xl overflow-hidden">
        <div
          className="px-4 py-4"
          style={{
            background: `linear-gradient(135deg, ${selectedDebt.color}15, ${selectedDebt.color}08)`,
            borderLeft: `4px solid ${selectedDebt.color}`,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div
                className="size-9 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: `${selectedDebt.color}20` }}
              >
                {isCreditCard ? (
                  <CreditCard className="size-4" style={{ color: selectedDebt.color }} />
                ) : (
                  <Wallet className="size-4" style={{ color: selectedDebt.color }} />
                )}
              </div>
              <div>
                <span className="text-sm font-semibold text-gray-900 dark:text-white block">
                  Saldo Actual
                </span>
                {isLoanFixed && (
                  <span className="text-[10px] text-gray-400">
                    Cuota: {formatCurrency(selectedDebt.monthlyPayment ?? 0)}/mes
                    {selectedDebt.otherCharges && selectedDebt.otherCharges > 0 &&
                      ` (+${formatCurrency(selectedDebt.otherCharges)} otros)`}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white truncate">
                {formatCurrency(selectedDebt.currentBalance)}
              </p>
              {selectedDebt.interestRate && (
                <p className="text-[10px] text-gray-400">
                  {isLoan
                    ? `${selectedDebt.interestRate}% NMV anual`
                    : `${selectedDebt.interestRate}% mensual`}
                </p>
              )}
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-[10px] text-gray-400">
                {isCreditCard ? "Compras activas" : "Cuotas restantes"}
              </p>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {isCreditCard
                  ? selectedDebt.installments?.filter((i) => !i.isPaid).length ?? 0
                  : selectedDebt.remainingPayments ?? "—"}
              </p>
            </div>
            <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-[10px] text-gray-400">Sin abonos extra</p>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {projection.originalMonths > 0 ? `${projection.originalMonths} meses` : "—"}
              </p>
            </div>
            <div className="text-center p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
              <p className="text-[10px] text-gray-400">Tasa mensual</p>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                {isLoan
                  ? `${((selectedDebt.interestRate ?? 0) / 12).toFixed(4)}%`
                  : `${selectedDebt.interestRate ?? 0}%`}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Extra Payments Section */}
      <Card className="border-0 shadow-md rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HandCoins className="size-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Abonos Extra
              </span>
            </div>
            <Button
              size="sm"
              onClick={() => setShowAddExtra(true)}
              className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500"
            >
              <Plus className="size-3.5 mr-1" />
              Agregar
            </Button>
          </div>

          {extraPayments.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-gray-400">
                Agrega abonos extra para ver cómo se acelera el pago
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {extraPayments.map((ep) => (
                <motion.div
                  key={ep.id}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/10 rounded-xl p-3"
                >
                  <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    {ep.type === "recurring" ? (
                      <Calendar className="size-3.5 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <Zap className="size-3.5 text-amber-600 dark:text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {ep.type === "recurring" ? "Cada mes" : "Pago único"}
                    </p>
                    <p className="text-[10px] text-gray-400 truncate">
                      {formatCurrency(ep.amount)}
                      {ep.type === "one-time" && ` · ${formatDate(ep.date)}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 rounded-lg text-red-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    onClick={() => handleRemoveExtra(ep.id)}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Extra Payment Dialog */}
      <AnimatePresence>
        {showAddExtra && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
          >
            <Card className="border-0 shadow-lg rounded-2xl border-l-4 border-l-amber-400">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                    Nuevo Abono Extra
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddExtra(false)}
                    className="text-xs text-gray-400"
                  >
                    Cancelar
                  </Button>
                </div>

                {/* Type selector */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setNewExtraType("recurring")}
                    className={`flex-1 p-2.5 rounded-xl text-xs font-medium transition-all ${newExtraType === "recurring"
                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-500 border border-transparent"
                      }`}
                  >
                    <Calendar className="size-3.5 mx-auto mb-1" />
                    Cada mes
                  </button>
                  <button
                    onClick={() => setNewExtraType("one-time")}
                    className={`flex-1 p-2.5 rounded-xl text-xs font-medium transition-all ${newExtraType === "one-time"
                      ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-500 border border-transparent"
                      }`}
                  >
                    <Zap className="size-3.5 mx-auto mb-1" />
                    Una vez
                  </button>
                </div>

                {/* Amount */}
                <div>
                  <label className="text-[11px] text-gray-500 mb-1 block">
                    Monto del abono
                  </label>
                  <CurrencyInput
                    value={newExtraAmount}
                    onChange={setNewExtraAmount}
                    showPrefix
                    placeholder="0"
                    className="rounded-xl h-11 text-base font-semibold"
                  />
                </div>

                {/* Date (for one-time) */}
                {newExtraType === "one-time" && (
                  <div>
                    <label className="text-[11px] text-gray-500 mb-1 block">
                      Fecha del abono
                    </label>
                    <Input
                      type="date"
                      value={newExtraDate}
                      onChange={(e) => setNewExtraDate(e.target.value)}
                      className="rounded-xl h-11"
                    />
                  </div>
                )}

                <Button
                  onClick={handleAddExtra}
                  disabled={!newExtraAmount || parseFloat(newExtraAmount) <= 0}
                  className="w-full rounded-xl h-11 bg-gradient-to-r from-amber-500 to-orange-500"
                >
                  <Plus className="size-4 mr-1" />
                  Agregar Abono
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Projection Results */}
      {projection.rows.length > 0 && (
        <>
          {/* Savings Summary Card */}
          <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 overflow-hidden">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  Proyección con Abonos
                </h3>
              </div>

              {/* Hero stats */}
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                  <p className="text-[10px] text-gray-400 mb-1">Tiempo total</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {projection.projectedMonths}
                  </p>
                  <p className="text-[10px] text-gray-400">meses</p>
                </div>
                <div className="text-center p-3 bg-white dark:bg-gray-800 rounded-xl shadow-sm">
                  <p className="text-[10px] text-gray-400 mb-1">Total a pagar</p>
                  <p className="text-base sm:text-lg font-bold text-gray-900 dark:text-white truncate">
                    {formatCurrency(projection.totalOverall)}
                  </p>
                </div>
              </div>

              {/* Comparison: with vs without extras */}
              {extraPayments.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <TrendingDown className="size-4 text-emerald-500" />
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        Meses ahorrados
                      </span>
                    </div>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                      {projection.monthsSaved} meses
                    </span>
                  </div>
                  <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <Zap className="size-4 text-amber-500" />
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                        Intereses ahorrados
                      </span>
                    </div>
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                      {formatCurrency(projection.interestSaved)}
                    </span>
                  </div>
                </div>
              )}

              {/* Cost breakdown */}
              <div className="space-y-1.5 pt-2 border-t border-emerald-200/50 dark:border-emerald-700/30">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Cuotas normales:</span>
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {formatCurrency(projection.totalPaid)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Intereses totales:</span>
                  <span className="font-medium text-rose-600 dark:text-rose-400">
                    {formatCurrency(projection.totalInterest)}
                  </span>
                </div>
                {projection.totalExtraPayments > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Abonos extra:</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {formatCurrency(projection.totalExtraPayments)}
                    </span>
                  </div>
                )}
              </div>

              {/* Visual bar: interest vs capital */}
              {projection.totalOverall > 0 && (
                <div className="space-y-2 pt-1">
                  <div>
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-emerald-600 dark:text-emerald-400">Capital</span>
                      <span className="text-gray-500">
                        {formatCurrency(selectedDebt.currentBalance)} ({((selectedDebt.currentBalance / projection.totalOverall) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${(selectedDebt.currentBalance / projection.totalOverall) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-rose-500 dark:text-rose-400">Intereses</span>
                      <span className="text-gray-500">
                        {formatCurrency(projection.totalInterest)} ({((projection.totalInterest / projection.totalOverall) * 100).toFixed(1)}%)
                      </span>
                    </div>
                    <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rose-400 rounded-full transition-all"
                        style={{ width: `${(projection.totalInterest / projection.totalOverall) * 100}%` }}
                      />
                    </div>
                  </div>
                  {projection.totalExtraPayments > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-blue-500 dark:text-blue-400">Abonos extra</span>
                        <span className="text-gray-500">
                          {formatCurrency(projection.totalExtraPayments)} ({((projection.totalExtraPayments / projection.totalOverall) * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-400 rounded-full transition-all"
                          style={{ width: `${(projection.totalExtraPayments / projection.totalOverall) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tips Card */}
          {extraPayments.length > 0 && projection.interestSaved > 0 && (
            <Card className="border-0 shadow-md rounded-2xl">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="size-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-sm font-semibold text-violet-700 dark:text-violet-400">
                    Dato clave
                  </span>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                  Con estos abonos extra, tu deuda se pagaría <strong className="text-emerald-600 dark:text-emerald-400">{projection.monthsSaved} meses antes</strong> y
                  ahorrarías <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(projection.interestSaved)}</strong> en intereses.
                  Cada peso extra que abonas al capital reduce los intereses de los meses siguientes.
                </p>
                {projection.interestSaved > selectedDebt.currentBalance * 0.1 && (
                  <div className="mt-2 bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-2.5">
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium">
                      <strong>Excelente estrategia:</strong> Los abonos extra representan más del 10% del saldo actual en ahorro de intereses. Sigue así y serás libre de deudas mucho antes.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Amortization Table */}
          <Card className="border-0 shadow-md rounded-2xl overflow-hidden">
            <div className="px-4 py-3" style={{ background: `linear-gradient(135deg, ${selectedDebt.color}10, ${selectedDebt.color}05)` }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calculator className="size-4" style={{ color: selectedDebt.color }} />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    Tabla de Amortización Proyectada
                  </span>
                </div>
                <button
                  onClick={() => setShowTable(!showTable)}
                  className="flex items-center gap-1 text-[11px] font-medium hover:underline"
                  style={{ color: selectedDebt.color }}
                >
                  {showTable ? "Ocultar" : "Ver detalle"}
                  {showTable ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
              </div>

              {/* Compact preview (always visible) */}
              {!showTable && (
                <div className="mt-3 space-y-1">
                  {/* Show first 3 and last 2 rows */}
                  {projection.rows.slice(0, 3).map((row) => (
                    <div
                      key={row.month}
                      className="flex items-center justify-between text-[11px] py-1.5 px-2 bg-white dark:bg-gray-800 rounded-lg"
                    >
                      <span className="text-gray-500 w-16">
                        {formatMonth(row.date)}
                      </span>
                      <span className="text-gray-700 dark:text-gray-300 font-medium w-20 text-right">
                        {formatCurrency(row.payment + row.extraPayment)}
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 w-20 text-right">
                        {formatCurrency(row.capital + row.extraCapital)}
                      </span>
                      <span className="text-gray-400 w-20 text-right">
                        {formatCurrency(row.balance)}
                      </span>
                    </div>
                  ))}
                  {projection.rows.length > 5 && (
                    <div className="text-center text-[10px] text-gray-400 py-1">
                      ··· {projection.rows.length - 5} meses más ···
                    </div>
                  )}
                  {projection.rows.slice(-2).map((row) => (
                    <div
                      key={row.month}
                      className={`flex items-center justify-between text-[11px] py-1.5 px-2 rounded-lg ${row.isPaidOff
                        ? "bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800"
                        : "bg-white dark:bg-gray-800"
                        }`}
                    >
                      <span className={row.isPaidOff ? "text-emerald-600 font-medium w-16" : "text-gray-500 w-16"}>
                        {formatMonth(row.date)} {row.isPaidOff ? "✓" : ""}
                      </span>
                      <span className="text-gray-700 dark:text-gray-300 font-medium w-20 text-right">
                        {formatCurrency(row.payment + row.extraPayment)}
                      </span>
                      <span className="text-emerald-600 dark:text-emerald-400 w-20 text-right">
                        {formatCurrency(row.capital + row.extraCapital)}
                      </span>
                      <span className={row.isPaidOff ? "text-emerald-600 font-medium w-20 text-right" : "text-gray-400 w-20 text-right"}>
                        {row.isPaidOff ? "0" : formatCurrency(row.balance)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Full table (expandable) */}
            <AnimatePresence>
              {showTable && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="max-h-80 overflow-y-auto overflow-x-auto">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900">
                        <tr className="text-gray-400">
                          <th className="py-2 px-2 text-left font-medium">Mes</th>
                          <th className="py-2 px-2 text-right font-medium">Cuota</th>
                          <th className="py-2 px-2 text-right font-medium">Capital</th>
                          <th className="py-2 px-2 text-right font-medium">Interés</th>
                          {extraPayments.length > 0 && (
                            <th className="py-2 px-2 text-right font-medium">Abono</th>
                          )}
                          <th className="py-2 px-2 text-right font-medium">Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projection.rows.map((row) => (
                          <tr
                            key={row.month}
                            className={`border-t ${row.isPaidOff
                              ? "border-t-emerald-200 dark:border-t-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10"
                              : "border-gray-100 dark:border-gray-800"
                              }`}
                          >
                            <td className={`py-1.5 px-2 ${row.isPaidOff ? "text-emerald-600 font-semibold" : "text-gray-500"}`}>
                              {formatMonth(row.date)} {row.isPaidOff ? "✓" : ""}
                            </td>
                            <td className="py-1.5 px-2 text-right text-gray-700 dark:text-gray-300 font-medium">
                              {formatCurrency(row.payment)}
                            </td>
                            <td className="py-1.5 px-2 text-right text-emerald-600 dark:text-emerald-400">
                              {formatCurrency(row.capital)}
                            </td>
                            <td className="py-1.5 px-2 text-right text-rose-500 dark:text-rose-400">
                              {formatCurrency(row.interest)}
                            </td>
                            {extraPayments.length > 0 && (
                              <td className="py-1.5 px-2 text-right text-blue-600 dark:text-blue-400 font-medium">
                                {row.extraPayment > 0 ? formatCurrency(row.extraPayment) : "—"}
                              </td>
                            )}
                            <td className={`py-1.5 px-2 text-right ${row.isPaidOff ? "text-emerald-600 font-semibold" : "text-gray-500"}`}>
                              {row.isPaidOff ? "0" : formatCurrency(row.balance)}
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

          {/* Installment Breakdown for Credit Cards */}
          {isCreditCard && selectedDebt.installments.filter((i) => !i.isPaid).length > 0 && (
            <Card className="border-0 shadow-md rounded-2xl">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 text-rose-600 dark:text-rose-400" />
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">
                    Desglose por Compra
                  </span>
                </div>
                <div className="space-y-2">
                  {selectedDebt.installments
                    .filter((inst) => !inst.isPaid)
                    .sort((a, b) => new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime())
                    .map((inst) => {
                      const progress = inst.totalAmount > 0
                        ? ((inst.paidAmount / inst.totalAmount) * 100)
                        : 0;
                      return (
                        <div
                          key={inst.id}
                          className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1">
                              {inst.description}
                            </span>
                            <span className="text-[10px] text-gray-400 shrink-0 ml-2">
                              Cuota {inst.currentInstallment}/{inst.totalInstallments}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-gray-400">
                              Saldo: {formatCurrency(inst.remainingBalance ?? inst.totalAmount)}
                            </span>
                            <span className="text-gray-400">
                              {formatCurrency(inst.installmentAmount)}/mes
                            </span>
                          </div>
                          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-rose-400 rounded-full transition-all"
                              style={{ width: `${Math.min(progress, 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Disclaimer */}
          <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3">
            <p className="text-[10px] text-gray-400 leading-relaxed">
              Esta proyección es una simulación referencial basada en los datos actuales de tu deuda.
              Los valores reales pueden variar según cambios en la tasa de interés, pagos parciales,
              seguros asociados y otros factores. Para préstamos con cuota fija, se asume que la cuota
              se mantiene constante hasta que el saldo se agota. Para tarjetas de crédito, los abonos
              extra se aplican primero a las compras con mayor tasa de interés (método avalancha).
            </p>
          </div>
        </>
      )}

      {/* No projection possible */}
      {projection.rows.length === 0 && selectedDebt && (
        <Card className="border-0 shadow-md rounded-2xl">
          <CardContent className="p-8 text-center">
            <Calculator className="size-12 text-gray-200 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              No se puede generar la proyección con los datos actuales.
              Asegúrate de que la deuda tenga cuota mensual y tasa de interés configuradas.
            </p>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
