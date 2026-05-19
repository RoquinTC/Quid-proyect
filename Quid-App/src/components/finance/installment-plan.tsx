"use client";

import { useState, useMemo, useEffect } from "react";
import { formatCurrency, formatDate, calcPercentage } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CheckCircle2,
  Clock,
  Wallet,
  Loader2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  PiggyBank,
  Receipt,
  Pencil,
  Trash2,
  LayoutList,
  CalendarDays,
  Landmark,
  Undo2,
  HandCoins,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { Installment } from "@/lib/types";

interface BillingCycle {
  cycleKey: string; // e.g. "2026-04"
  cycleLabel: string; // e.g. "Abril 2026"
  cutoffDate: Date; // Date of the cutoff (20 de Abril)
  paymentDueDate: Date; // Date payment is due (4 de Mayo)
  installments: Installment[];
}

interface InstallmentPlanProps {
  installments: Installment[];
  cutoffDate?: number | null;
  paymentDate?: number | null;
  debtType?: string | null;
  onPay?: () => void;
  paying?: boolean;
  onReversePay?: () => void;
  reversing?: boolean;
  hasPaidInstallments?: boolean;
  onEdit?: (installment: Installment) => void;
  onDelete?: (installment: Installment) => void;
  getAccountName?: (accountId: string | null | undefined) => string;
  getSubAccountName?: (
    accountId: string | null | undefined,
    subAccountId: string | null | undefined
  ) => string | null;
  // Partial payment selection
  selectedInstallmentIds?: Set<string>;
  onToggleSelection?: (id: string) => void;
  onSelectAllDue?: () => void;
  onDeselectAllDue?: () => void;
  // Default interest rate from the card
  debtInterestRate?: number | null;
  // Abono a capital
  onAbono?: () => void;
  // Abono history
  onAbonoHistory?: () => void;
  abonoCount?: number;
}

type ViewMode = "cycles" | "dates" | "accounts";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const VIEW_OPTIONS: { key: ViewMode; label: string; icon: typeof LayoutList }[] = [
  { key: "cycles", label: "Ciclos", icon: Receipt },
  { key: "dates", label: "Fechas", icon: CalendarDays },
  { key: "accounts", label: "Cuentas", icon: Landmark },
];

/**
 * Determine which billing cycle an installment CURRENTLY belongs to,
 * based on its nextPaymentDate (not purchaseDate).
 *
 * For multi-installment purchases, after paying an installment the
 * nextPaymentDate advances to the next cycle, so the installment
 * correctly moves to the next billing cycle.
 *
 * Logic: work backwards from the payment date to find the cycle month.
 *   If paymentDay > cutoffDay → payment is SAME month as cycle
 *     e.g. cutoff=3, payment=23 → payment May 23 → cycle May
 *   If paymentDay <= cutoffDay → payment is NEXT month after cycle
 *     e.g. cutoff=20, payment=4  → payment May 4  → cycle April
 */
function getCycleFromPaymentDate(
  nextPaymentDate: Date,
  cutoffDay: number,
  paymentDay: number
): { year: number; month: number } {
  if (paymentDay > cutoffDay) {
    // Payment same month as cycle
    return { year: nextPaymentDate.getFullYear(), month: nextPaymentDate.getMonth() };
  } else {
    // Payment next month after cycle
    let month = nextPaymentDate.getMonth() - 1;
    let year = nextPaymentDate.getFullYear();
    if (month < 0) { month = 11; year -= 1; }
    return { year, month };
  }
}

export function InstallmentPlan({
  installments,
  cutoffDate,
  paymentDate,
  debtType,
  onPay,
  paying = false,
  onReversePay,
  reversing = false,
  hasPaidInstallments = false,
  onEdit,
  onDelete,
  getAccountName,
  getSubAccountName,
  selectedInstallmentIds,
  onToggleSelection,
  onSelectAllDue,
  onDeselectAllDue,
  debtInterestRate,
  onAbono,
  onAbonoHistory,
  abonoCount,
}: InstallmentPlanProps) {
  const today = new Date();

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>("cycles");

  // Collapse states
  const [expandedCycles, setExpandedCycles] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [expandedPaid, setExpandedPaid] = useState(false);
  const [expandedPaidGroups, setExpandedPaidGroups] = useState<Record<string, boolean>>({});
  const [expandedDateGroups, setExpandedDateGroups] = useState<Record<string, boolean>>({});
  const [expandedAccountGroups, setExpandedAccountGroups] = useState<Record<string, boolean>>({});

  const toggleCycle = (key: string) => {
    setExpandedCycles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const togglePaidGroup = (key: string) => {
    setExpandedPaidGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleDateGroup = (key: string) => {
    setExpandedDateGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAccountGroup = (key: string) => {
    setExpandedAccountGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Separate paid/unpaid
  const unpaidInstallments = installments.filter((inst) => !inst.isPaid);
  const paidInstallments = installments.filter((inst) => inst.isPaid);

  // ── Determine if credit card with cycles ──
  const hasCycles = !!(cutoffDate && paymentDate);

  // ── Billing cycles for unpaid installments ──
  const billingCycles = useMemo(() => {
    if (!hasCycles) {
      return null;
    }

    // Group unpaid installments into billing cycles
    const cycleMap = new Map<string, BillingCycle>();

    for (const inst of unpaidInstallments) {
      const nextPayDate = new Date(inst.nextPaymentDate);
      const { year, month } = getCycleFromPaymentDate(nextPayDate, cutoffDate!, paymentDate!);
      const cycleKey = `${year}-${String(month + 1).padStart(2, "0")}`;

      if (!cycleMap.has(cycleKey)) {
        // Cutoff date: cutoffDate day of the cycle month
        const cutoff = new Date(year, month, cutoffDate!, 12, 0, 0);
        // Payment due date depends on relationship between paymentDate and cutoffDate
        // If paymentDate > cutoffDate → payment same month as cycle (e.g. cutoff=3, payment=23)
        // If paymentDate <= cutoffDate → payment next month after cycle (e.g. cutoff=20, payment=4)
        let payMonth: number;
        let payYear: number;
        if (paymentDate! > cutoffDate!) {
          payMonth = month;
          payYear = year;
        } else {
          payMonth = month + 1;
          payYear = year;
          if (payMonth > 11) {
            payMonth = 0;
            payYear = year + 1;
          }
        }
        const paymentDue = new Date(payYear, payMonth, paymentDate!, 12, 0, 0);

        cycleMap.set(cycleKey, {
          cycleKey,
          cycleLabel: `${MONTH_NAMES[month]} ${year}`,
          cutoffDate: cutoff,
          paymentDueDate: paymentDue,
          installments: [],
        });
      }

      cycleMap.get(cycleKey)!.installments.push(inst);
    }

    // Sort cycles by cutoff date (ascending)
    const cycles = Array.from(cycleMap.values()).sort(
      (a, b) => a.cutoffDate.getTime() - b.cutoffDate.getTime()
    );

    return cycles;
  }, [unpaidInstallments, cutoffDate, paymentDate, hasCycles]);

  // ── Auto-expand current cycle (useEffect to avoid infinite render loop) ──
  useEffect(() => {
    if (!billingCycles) return;
    setExpandedCycles((prev) => {
      // Only auto-expand if user hasn't manually toggled yet
      if (Object.keys(prev).length > 0) return prev;
      const autoExpanded: Record<string, boolean> = {};
      for (const cycle of billingCycles) {
        if (cycle.paymentDueDate >= new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5)) {
          autoExpanded[cycle.cycleKey] = true;
        }
      }
      return autoExpanded;
    });
  }, [billingCycles, today]);

  // ── Auto-expand current date groups (today and recent) ──
  useEffect(() => {
    if (viewMode !== "dates") return;
    setExpandedDateGroups((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const autoExpanded: Record<string, boolean> = {};
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      // Auto-expand today's group if exists
      if (dateGroups.some(([key]) => key === todayStr)) {
        autoExpanded[todayStr] = true;
      }
      // Also expand the most recent date group
      if (dateGroups.length > 0 && !autoExpanded[dateGroups[0][0]]) {
        autoExpanded[dateGroups[0][0]] = true;
      }
      return autoExpanded;
    });
  }, [viewMode]);

  // ── Auto-expand account groups ──
  useEffect(() => {
    if (viewMode !== "accounts") return;
    setExpandedAccountGroups((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const autoExpanded: Record<string, boolean> = {};
      // Auto-expand the first account group
      if (allAccountGroups.length > 0) {
        autoExpanded[allAccountGroups[0][0]] = true;
      }
      return autoExpanded;
    });
  }, [viewMode]);

  // ── Group paid installments by account ──
  const paidGroups = useMemo(() => {
    const groups: Record<string, {
      accountId: string | null;
      subAccountId: string | null;
      accountName: string;
      subAccountName: string | null;
      installments: Installment[];
      totalAmount: number;
    }> = {};

    for (const inst of paidInstallments) {
      const key = `${inst.accountId || "none"}-${inst.subAccountId || "none"}`;
      if (!groups[key]) {
        groups[key] = {
          accountId: inst.accountId || null,
          subAccountId: inst.subAccountId || null,
          accountName: getAccountName?.(inst.accountId) || "Sin cuenta",
          subAccountName: getSubAccountName?.(inst.accountId, inst.subAccountId) || null,
          installments: [],
          totalAmount: 0,
        };
      }
      groups[key].installments.push(inst);
      groups[key].totalAmount += inst.installmentAmount;
    }

    return Object.entries(groups);
  }, [paidInstallments, getAccountName, getSubAccountName]);

  // ── Group unpaid installments by purchase date ──
  const dateGroups = useMemo(() => {
    const groups: Record<string, {
      dateKey: string;
      dateLabel: string;
      date: Date;
      installments: Installment[];
      totalAmount: number;
    }> = {};

    for (const inst of unpaidInstallments) {
      const d = new Date(inst.purchaseDate);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      if (!groups[dateKey]) {
        groups[dateKey] = {
          dateKey,
          dateLabel: `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`,
          date: d,
          installments: [],
          totalAmount: 0,
        };
      }
      groups[dateKey].installments.push(inst);
      groups[dateKey].totalAmount += inst.installmentAmount;
    }

    // Sort by date descending (most recent first)
    return Object.entries(groups)
      .sort(([, a], [, b]) => b.date.getTime() - a.date.getTime());
  }, [unpaidInstallments]);

  // ── Group unpaid installments by account/subaccount ──
  const allAccountGroups = useMemo(() => {
    const groups: Record<string, {
      accountId: string | null;
      subAccountId: string | null;
      accountName: string;
      subAccountName: string | null;
      installments: Installment[];
      totalAmount: number;
    }> = {};

    for (const inst of unpaidInstallments) {
      const key = `${inst.accountId || "none"}-${inst.subAccountId || "none"}`;
      if (!groups[key]) {
        groups[key] = {
          accountId: inst.accountId || null,
          subAccountId: inst.subAccountId || null,
          accountName: getAccountName?.(inst.accountId) || "Sin cuenta asignada",
          subAccountName: getSubAccountName?.(inst.accountId, inst.subAccountId) || null,
          installments: [],
          totalAmount: 0,
        };
      }
      groups[key].installments.push(inst);
      groups[key].totalAmount += inst.installmentAmount;
    }

    // Sort: accounts with sub-accounts first, then by total amount descending
    return Object.entries(groups).sort(([, a], [, b]) => {
      // Accounts without sub-account come first
      if (!a.subAccountId && b.subAccountId) return -1;
      if (a.subAccountId && !b.subAccountId) return 1;
      return b.totalAmount - a.totalAmount;
    });
  }, [unpaidInstallments, getAccountName, getSubAccountName]);

  // ── Calculate due installments for pay button ──
  const dueInstallments = useMemo(() => {
    if (hasCycles && billingCycles) {
      // Include past cycles AND the next upcoming cycle
      // (user should be able to pay even before the cutoff date)
      const pastCycles = billingCycles
        .filter((c) => c.cutoffDate <= today);
      const upcomingCycles = billingCycles
        .filter((c) => c.cutoffDate > today);

      const result = pastCycles.flatMap((c) => c.installments);
      // Also include the first upcoming cycle so user can pay early
      if (upcomingCycles.length > 0) {
        result.push(...upcomingCycles[0].installments);
      }
      return result;
    }
    // For non-cycle debts: include due + next upcoming
    const due = unpaidInstallments.filter(
      (inst) => new Date(inst.nextPaymentDate) <= today
    );
    if (due.length > 0) return due;
    // If none are past due, include the next upcoming one
    const nextUnpaid = unpaidInstallments
      .sort((a, b) => new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime());
    return nextUnpaid.length > 0 ? [nextUnpaid[0]] : [];
  }, [hasCycles, billingCycles, unpaidInstallments, today]);

  const totalDue = dueInstallments.reduce((sum, i) => sum + i.installmentAmount, 0);

  // Selected due installments for partial payment
  const selectedDue = selectedInstallmentIds
    ? dueInstallments.filter((inst) => selectedInstallmentIds.has(inst.id))
    : dueInstallments;
  const selectedTotal = selectedDue.reduce((sum, i) => sum + i.installmentAmount, 0);

  // ── Helper: determine installment status ──
  const getInstallmentStatus = (inst: Installment): "due" | "future" | "paid" => {
    if (inst.isPaid) return "paid";
    return new Date(inst.nextPaymentDate) <= today ? "due" : "future";
  };

  // ── Render a single installment row ──
  const renderInstallment = (inst: Installment, status: "due" | "future" | "paid", showAccount = true) => {
    const progress = calcPercentage(inst.currentInstallment, inst.totalInstallments);
    const accountName = inst.accountId ? getAccountName?.(inst.accountId) : null;
    const subAccountName = inst.accountId && inst.subAccountId
      ? getSubAccountName?.(inst.accountId, inst.subAccountId)
      : null;
    const isSelected = selectedInstallmentIds?.has(inst.id) ?? true;
    const showCheckbox = status === "due" && onToggleSelection && selectedInstallmentIds;

    return (
      <motion.div
        key={inst.id}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <Card className={`border-0 shadow-sm rounded-xl mb-2 ${
          status === "due" && !isSelected
            ? "bg-gray-50 dark:bg-gray-800/30 opacity-60"
            :
          status === "due"
            ? "bg-red-50 dark:bg-red-900/10"
            : status === "paid"
            ? "bg-gray-50 dark:bg-gray-800/50"
            : ""
        }`}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              {/* Checkbox for selection */}
              {showCheckbox && (
                <button
                  onClick={(e) => { e.stopPropagation(); onToggleSelection(inst.id); }}
                  className={`mt-1 flex-shrink-0 size-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    isSelected
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "border-gray-300 dark:border-gray-600 hover:border-emerald-400"
                  }`}
                >
                  {isSelected && (
                    <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {status === "paid" ? (
                    <CheckCircle2 className="size-4 text-emerald-500 flex-shrink-0" />
                  ) : status === "due" ? (
                    <Clock className="size-4 text-red-500 flex-shrink-0" />
                  ) : (
                    <Calendar className="size-4 text-amber-500 flex-shrink-0" />
                  )}
                  <span className={`text-sm font-medium truncate ${
                    status === "paid" ? "text-gray-400 line-through" : "text-gray-900 dark:text-white"
                  }`}>
                    {inst.description}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-gray-500 ml-6 flex-wrap">
                  <span className="inline-flex items-center gap-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-md font-medium">
                    <Calendar className="size-2.5" />
                    {formatDate(inst.purchaseDate)}
                  </span>
                  <span>
                    Cuota {inst.currentInstallment}/{inst.totalInstallments}
                  </span>
                  <span>•</span>
                  <span>{formatCurrency(inst.installmentAmount)}/mes{inst.totalInstallments > 1 ? " capital" : ""}</span>
                  {inst.totalInstallments > 1 && inst.remainingBalance != null && (
                    <>
                      <span>•</span>
                      <span className="text-amber-500">Saldo: {formatCurrency(inst.remainingBalance)}</span>
                    </>
                  )}
                  {inst.interestAmount != null && inst.interestAmount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-red-500">+Interés: {formatCurrency(inst.interestAmount)}</span>
                    </>
                  )}
                  {inst.otherChargesAmount != null && inst.otherChargesAmount > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-gray-500">+Otros: {formatCurrency(inst.otherChargesAmount)}</span>
                    </>
                  )}
                </div>

                {/* Show paid amount breakdown for paid installments with interest */}
                {inst.isPaid && inst.interestAmount != null && inst.interestAmount > 0 && (
                  <div className="flex items-center gap-2 text-[10px] text-gray-400 ml-6 mt-0.5">
                    <span>Pagado: {formatCurrency(inst.paidAmount)}</span>
                    <span>(Capital: {formatCurrency(inst.installmentAmount)} + Interés: {formatCurrency(inst.interestAmount)}{inst.otherChargesAmount ? ` + Otros: ${formatCurrency(inst.otherChargesAmount)}` : ""})</span>
                  </div>
                )}

                {/* Account info */}
                {showAccount && accountName && (
                  <div className="flex items-center gap-1 ml-6 mt-1">
                    <Wallet className="size-3 text-gray-400" />
                    <span className="text-[10px] text-gray-400">
                      Paga desde: {accountName}
                      {subAccountName && ` → ${subAccountName}`}
                    </span>
                  </div>
                )}

                {/* Progress bar */}
                <div className="mt-2 ml-6">
                  <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        status === "paid"
                          ? "bg-emerald-400"
                          : status === "due"
                          ? "bg-red-400"
                          : "bg-amber-400"
                      }`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
                {status === "due" && (
                  <Badge variant="destructive" className="text-[10px]">
                    Vencida
                  </Badge>
                )}
                {status === "future" && (
                  <span className="text-[10px] text-gray-400">
                    {formatDate(inst.nextPaymentDate)}
                  </span>
                )}
                {status === "paid" && (
                  <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Pagada
                  </Badge>
                )}
                {/* Edit/Delete buttons — only for non-paid installments */}
                {status !== "paid" && (onEdit || onDelete) && (
                  <div className="flex items-center gap-0.5">
                    {onEdit && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onEdit(inst); }}
                        className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="size-3 text-gray-400 hover:text-blue-500" />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDelete(inst); }}
                        className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        title="Eliminar"
                      >
                        <Trash2 className="size-3 text-gray-400 hover:text-red-500" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  // ── Render cycle-based view (for credit cards with cutoff/payment dates) ──
  const renderCyclesView = () => {
    if (!billingCycles) return null;

    return (
      <div className="space-y-3">
        {billingCycles.map((cycle) => {
          const isExpanded = expandedCycles[cycle.cycleKey] ?? false;
          const isCutoffPassed = cycle.cutoffDate <= today;
          const isPaymentDuePassed = cycle.paymentDueDate <= today;

          // Group installments within this cycle by account/subaccount
          const accountGroups = getAccountGroups(cycle.installments);
          const cycleTotal = cycle.installments.reduce((sum, i) => sum + i.installmentAmount, 0);

          return (
            <div key={cycle.cycleKey}>
              {/* Cycle Header */}
              <button
                onClick={() => toggleCycle(cycle.cycleKey)}
                className="w-full"
              >
                <Card className={`border-0 shadow-sm rounded-xl transition-all ${
                  isCutoffPassed && !isPaymentDuePassed
                    ? "bg-amber-50 dark:bg-amber-900/10 ring-1 ring-amber-200 dark:ring-amber-800"
                    : isPaymentDuePassed
                    ? "bg-red-50 dark:bg-red-900/10 ring-1 ring-red-200 dark:ring-red-800"
                    : ""
                }`}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="size-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="size-4 text-gray-400" />
                        )}
                        <div className="text-left">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              Ciclo {cycle.cycleLabel}
                            </span>
                            {isCutoffPassed && !isPaymentDuePassed && (
                              <Badge className="text-[9px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">
                                Corte pasado
                              </Badge>
                            )}
                            {isPaymentDuePassed && (
                              <Badge variant="destructive" className="text-[9px]">
                                Pago vencido
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-gray-500 mt-0.5 ml-6">
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3" />
                              Corte: {formatDate(cycle.cutoffDate)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Receipt className="size-3" />
                              Pago: {formatDate(cycle.paymentDueDate)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {formatCurrency(cycleTotal)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </button>

              {/* Expanded: Account groups within cycle */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden ml-2 mt-1"
                  >
                    {accountGroups.map(([groupKey, group]) => {
                      const isGroupExpanded = expandedGroups[`${cycle.cycleKey}-${groupKey}`] ?? false;
                      const groupTotal = group.installments.reduce((sum, i) => sum + i.installmentAmount, 0);

                      return (
                        <div key={groupKey} className="mb-2">
                          {/* Account group header */}
                          <button
                            onClick={() => toggleGroup(`${cycle.cycleKey}-${groupKey}`)}
                            className="w-full"
                          >
                            <div className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                              isGroupExpanded
                                ? "bg-gray-100 dark:bg-gray-800"
                                : "bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}>
                              <div className="flex items-center gap-2">
                                {isGroupExpanded ? (
                                  <ChevronDown className="size-3.5 text-gray-400" />
                                ) : (
                                  <ChevronRight className="size-3.5 text-gray-400" />
                                )}
                                <div className="flex items-center gap-1.5">
                                  {group.subAccountId ? (
                                    <PiggyBank className="size-3.5 text-purple-400" />
                                  ) : (
                                    <Wallet className="size-3.5 text-blue-400" />
                                  )}
                                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                    {group.accountName}
                                  </span>
                                  {group.subAccountName && (
                                    <span className="text-[10px] text-gray-400">
                                      → {group.subAccountName}
                                    </span>
                                  )}
                                  <Badge variant="secondary" className="text-[9px] ml-1">
                                    {group.installments.length} compra{group.installments.length > 1 ? "s" : ""}
                                  </Badge>
                                </div>
                              </div>
                              <span className="text-xs font-bold text-gray-900 dark:text-white">
                                {formatCurrency(groupTotal)}
                              </span>
                            </div>
                          </button>

                          {/* Expanded: Individual installments */}
                          <AnimatePresence>
                            {isGroupExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden ml-2 mt-1"
                              >
                                {group.installments.map((inst) => {
                                  const status = isCutoffPassed ? "due" : "future";
                                  return renderInstallment(inst, status);
                                })}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Render dates view (chronological by purchase date) ──
  const renderDatesView = () => {
    if (dateGroups.length === 0) return null;

    return (
      <div className="space-y-2">
        {dateGroups.map(([dateKey, group]) => {
          const isExpanded = expandedDateGroups[dateKey] ?? true; // Default expanded
          const hasDue = group.installments.some((i) => getInstallmentStatus(i) === "due");

          return (
            <div key={dateKey}>
              {/* Date header */}
              <button
                onClick={() => toggleDateGroup(dateKey)}
                className="w-full"
              >
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                  hasDue
                    ? "bg-red-50 dark:bg-red-900/10"
                    : "bg-gray-50 dark:bg-gray-800/50"
                }`}>
                  <div className="flex items-center gap-2.5">
                    {isExpanded ? (
                      <ChevronDown className="size-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="size-4 text-gray-400" />
                    )}
                    <div className="flex items-center justify-center size-8 rounded-lg bg-white dark:bg-gray-700 shadow-sm">
                      <CalendarDays className="size-4 text-blue-500" />
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {group.dateLabel}
                      </span>
                      <div className="text-[10px] text-gray-500">
                        {group.installments.length} compra{group.installments.length > 1 ? "s" : ""}
                        {hasDue && (
                          <span className="text-red-500 ml-1">
                            • Vencida{group.installments.filter((i) => getInstallmentStatus(i) === "due").length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${hasDue ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                    {formatCurrency(group.totalAmount)}
                  </span>
                </div>
              </button>

              {/* Expanded: Installments for this date */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden ml-4 mt-1"
                  >
                    {group.installments
                      .sort((a, b) => {
                        const statusA = getInstallmentStatus(a);
                        const statusB = getInstallmentStatus(b);
                        // Due first, then future
                        const order = { due: 0, future: 1, paid: 2 };
                        return order[statusA] - order[statusB];
                      })
                      .map((inst) => renderInstallment(inst, getInstallmentStatus(inst)))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Render accounts view (grouped by account/subaccount) ──
  const renderAccountsView = () => {
    if (allAccountGroups.length === 0) return null;

    return (
      <div className="space-y-2">
        {allAccountGroups.map(([groupKey, group]) => {
          const isExpanded = expandedAccountGroups[groupKey] ?? true; // Default expanded
          const hasDue = group.installments.some((i) => getInstallmentStatus(i) === "due");

          return (
            <div key={groupKey}>
              {/* Account header */}
              <button
                onClick={() => toggleAccountGroup(groupKey)}
                className="w-full"
              >
                <div className={`flex items-center justify-between px-3 py-2.5 rounded-xl transition-colors ${
                  hasDue
                    ? "bg-red-50 dark:bg-red-900/10"
                    : "bg-gray-50 dark:bg-gray-800/50"
                }`}>
                  <div className="flex items-center gap-2.5">
                    {isExpanded ? (
                      <ChevronDown className="size-4 text-gray-400" />
                    ) : (
                      <ChevronRight className="size-4 text-gray-400" />
                    )}
                    <div className="flex items-center justify-center size-8 rounded-lg bg-white dark:bg-gray-700 shadow-sm">
                      {group.subAccountId ? (
                        <PiggyBank className="size-4 text-purple-500" />
                      ) : (
                        <Landmark className="size-4 text-blue-500" />
                      )}
                    </div>
                    <div className="text-left">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">
                        {group.accountName}
                      </span>
                      {group.subAccountName && (
                        <div className="text-[10px] text-gray-400">
                          → {group.subAccountName}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-500">
                        {group.installments.length} compra{group.installments.length > 1 ? "s" : ""}
                        {hasDue && (
                          <span className="text-red-500 ml-1">
                            • Vencida{group.installments.filter((i) => getInstallmentStatus(i) === "due").length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-bold ${hasDue ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"}`}>
                    {formatCurrency(group.totalAmount)}
                  </span>
                </div>
              </button>

              {/* Expanded: Installments for this account */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden ml-4 mt-1"
                  >
                    {group.installments
                      .sort((a, b) => {
                        const statusA = getInstallmentStatus(a);
                        const statusB = getInstallmentStatus(b);
                        const order = { due: 0, future: 1, paid: 2 };
                        if (order[statusA] !== order[statusB]) return order[statusA] - order[statusB];
                        // Within same status, sort by purchase date descending
                        return new Date(b.purchaseDate).getTime() - new Date(a.purchaseDate).getTime();
                      })
                      .map((inst) => renderInstallment(inst, getInstallmentStatus(inst), false))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Render simple view (no cutoff/payment dates — non-credit-card debts) ──
  const renderSimpleView = () => {
    const dueInst = unpaidInstallments.filter(
      (inst) => new Date(inst.nextPaymentDate) <= today
    );
    const futureInst = unpaidInstallments.filter(
      (inst) => new Date(inst.nextPaymentDate) > today
    );

    return (
      <div className="space-y-4">
        {/* Due Installments */}
        {dueInst.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="size-4 text-red-500" />
              <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                Cuotas Vencidas ({dueInst.length})
              </span>
            </div>
            {dueInst.map((inst) => renderInstallment(inst, "due"))}
          </div>
        )}

        {/* Future Installments */}
        {futureInst.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="size-4 text-amber-500" />
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                Próximas Cuotas ({futureInst.length})
              </span>
            </div>
            {futureInst.map((inst) => renderInstallment(inst, "future"))}
          </div>
        )}
      </div>
    );
  };

  // ── Helper: Group installments by account ──
  function getAccountGroups(insts: Installment[]) {
    const groups: Record<string, {
      accountId: string | null;
      subAccountId: string | null;
      accountName: string;
      subAccountName: string | null;
      installments: Installment[];
    }> = {};

    for (const inst of insts) {
      const key = `${inst.accountId || "none"}-${inst.subAccountId || "none"}`;
      if (!groups[key]) {
        groups[key] = {
          accountId: inst.accountId || null,
          subAccountId: inst.subAccountId || null,
          accountName: getAccountName?.(inst.accountId) || "Sin cuenta asignada",
          subAccountName: getSubAccountName?.(inst.accountId, inst.subAccountId) || null,
          installments: [],
        };
      }
      groups[key].installments.push(inst);
    }

    return Object.entries(groups);
  }

  // ── Determine which view to render for unpaid installments ──
  const renderActiveView = () => {
    // For non-credit-card debts (no cycles), only show simple view
    if (!hasCycles) {
      return renderSimpleView();
    }

    switch (viewMode) {
      case "cycles":
        return renderCyclesView();
      case "dates":
        return renderDatesView();
      case "accounts":
        return renderAccountsView();
      default:
        return renderCyclesView();
    }
  };

  return (
    <div className="space-y-4">
      {/* ── View Mode Selector (only for credit cards with cycles) ── */}
      {hasCycles && unpaidInstallments.length > 0 && (
        <div className="flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl">
          {VIEW_OPTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                viewMode === key
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Active view for unpaid installments ── */}
      {renderActiveView()}

      {/* ── Selection controls + Pay / Reverse buttons ── */}
      {/* For loans: these buttons are handled by the debt-detail component instead */}
      {debtType !== "loan" && (
      <div className="space-y-2 mt-2">
        {/* Selection controls */}
        {dueInstallments.length > 0 && onToggleSelection && selectedInstallmentIds && (
          <div className="flex items-center justify-between px-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {selectedDue.length} de {dueInstallments.length} cuota{dueInstallments.length !== 1 ? "s" : ""} seleccionada{selectedDue.length !== 1 ? "s" : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onSelectAllDue}
                className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                Todas
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <button
                onClick={onDeselectAllDue}
                className="text-[10px] text-gray-500 hover:underline"
              >
                Ninguna
              </button>
            </div>
          </div>
        )}

        {dueInstallments.length > 0 && onPay && (
          <Button
            onClick={() => { if (!paying) onPay(); }}
            disabled={paying || selectedDue.length === 0}
            className="w-full rounded-xl h-11 bg-gradient-to-r from-emerald-500 to-green-500 disabled:opacity-50"
          >
            {paying ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Procesando...
              </>
            ) : (
              <>
                {selectedDue.length < dueInstallments.length
                  ? `Pagar ${selectedDue.length} de ${dueInstallments.length} (${formatCurrency(selectedTotal)})`
                  : `Generar Pago: ${dueInstallments.length} Cuota(s) (${formatCurrency(totalDue)})`
                }
              </>
            )}
          </Button>
        )}

        {hasPaidInstallments && onReversePay && (
          <Button
            onClick={onReversePay}
            disabled={reversing}
            variant="outline"
            className="w-full rounded-xl h-11 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
          >
            {reversing ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Revirtiendo...
              </>
            ) : (
              <>
                <Undo2 className="size-4 mr-2" />
                Reversar Último Pago
              </>
            )}
          </Button>
        )}

        {onAbono && (
          <Button
            onClick={onAbono}
            variant="outline"
            className="w-full rounded-xl h-11 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <HandCoins className="size-4 mr-2" />
            Abono a Capital
          </Button>
        )}

        {onAbonoHistory && (abonoCount ?? 0) > 0 && (
          <Button
            onClick={onAbonoHistory}
            variant="outline"
            className="w-full rounded-xl h-11 border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/20"
          >
            <CalendarDays className="size-4 mr-2" />
            Historial de Abonos ({abonoCount})
          </Button>
        )}
      </div>
      )} {/* End debtType !== "loan" conditional */}

      {/* ── Paid Installments Section (collapsible) ── */}
      {paidInstallments.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setExpandedPaid(!expandedPaid)}
            className="w-full"
          >
            <Card className="border-0 shadow-sm rounded-xl bg-gray-50 dark:bg-gray-800/30">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {expandedPaid ? (
                      <ChevronDown className="size-4 text-emerald-500" />
                    ) : (
                      <ChevronRight className="size-4 text-emerald-500" />
                    )}
                    <CheckCircle2 className="size-4 text-emerald-500" />
                    <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      Cuotas Pagadas ({paidInstallments.length})
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatCurrency(paidInstallments.reduce((sum, i) => sum + i.installmentAmount, 0))}
                  </span>
                </div>
              </CardContent>
            </Card>
          </button>

          <AnimatePresence>
            {expandedPaid && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden ml-2"
              >
                {/* Group paid by account */}
                {paidGroups.map(([groupKey, group]) => {
                  const isGroupExpanded = expandedPaidGroups[groupKey] ?? false;
                  const groupTotal = group.installments.reduce((sum, i) => sum + i.installmentAmount, 0);

                  return (
                    <div key={groupKey} className="mb-2">
                      <button
                        onClick={() => togglePaidGroup(groupKey)}
                        className="w-full"
                      >
                        <div className={`flex items-center justify-between px-3 py-2 rounded-lg transition-colors ${
                          isGroupExpanded
                            ? "bg-emerald-50 dark:bg-emerald-900/10"
                            : "bg-gray-50 dark:bg-gray-800/50 hover:bg-emerald-50 dark:hover:bg-emerald-900/5"
                        }`}>
                          <div className="flex items-center gap-2">
                            {isGroupExpanded ? (
                              <ChevronDown className="size-3.5 text-emerald-400" />
                            ) : (
                              <ChevronRight className="size-3.5 text-emerald-400" />
                            )}
                            <div className="flex items-center gap-1.5">
                              {group.subAccountId ? (
                                <PiggyBank className="size-3.5 text-purple-400" />
                              ) : (
                                <Wallet className="size-3.5 text-blue-400" />
                              )}
                              <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                {group.accountName}
                              </span>
                              {group.subAccountName && (
                                <span className="text-[10px] text-gray-400">
                                  → {group.subAccountName}
                                </span>
                              )}
                              <Badge variant="secondary" className="text-[9px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 ml-1">
                                {group.installments.length}
                              </Badge>
                            </div>
                          </div>
                          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(groupTotal)}
                          </span>
                        </div>
                      </button>

                      <AnimatePresence>
                        {isGroupExpanded && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden ml-2 mt-1"
                          >
                            {group.installments.map((inst) => renderInstallment(inst, "paid"))}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {installments.length === 0 && (
        <div className="text-center py-6">
          <p className="text-sm text-gray-400">No hay cuotas registradas</p>
        </div>
      )}
    </div>
  );
}
