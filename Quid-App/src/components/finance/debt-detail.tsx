"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency, formatDate } from "@/lib/api";
import { useLocalSingleQuery, useLocalQuery } from "@/lib/local/hooks/queries";
import { useAppStore } from "@/lib/store";
import { DebtCard } from "./debt-card";
import { DebtForm } from "./debt-form";
import { InstallmentPlan } from "./installment-plan";
import { InstallmentForm } from "./installment-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  CreditCard,
  Calendar,
  Percent,
  Wallet,
  Plus,
  Loader2,
  Undo2,
  Calculator,
  HandCoins,
  CalendarDays,
} from "lucide-react";
import { motion } from "framer-motion";
import { CurrencyInput } from "@/components/ui/currency-input";
import type { Debt, Installment, Account, Abono, AbonoDetail } from "@/lib/types";

/**
 * Determine which billing cycle an installment belongs to based on nextPaymentDate.
 * Same logic as InstallmentPlan component.
 */
function getCycleFromPaymentDate(
  nextPaymentDate: Date,
  cutoffDay: number,
  paymentDay: number
): { year: number; month: number } {
  if (paymentDay > cutoffDay) {
    return { year: nextPaymentDate.getFullYear(), month: nextPaymentDate.getMonth() };
  } else {
    let month = nextPaymentDate.getMonth() - 1;
    let year = nextPaymentDate.getFullYear();
    if (month < 0) { month = 11; year -= 1; }
    return { year, month };
  }
}

/**
 * Determine which installments are due for payment, using the same cycle-based
 * logic as the InstallmentPlan component. For credit cards with cutoff/payment dates,
 * an installment is due when its billing cycle's cutoff date has passed.
 */
function getDueInstallments(debt: Debt, today: Date): Installment[] {
  const unpaid = debt.installments.filter((inst) => !inst.isPaid);

  if (debt.cutoffDate && debt.paymentDate) {
    // Credit card with billing cycle: use cycle logic
    const cycleMap = new Map<string, { installments: Installment[]; cutoffDate: Date }>();

    for (const inst of unpaid) {
      const nextPayDate = new Date(inst.nextPaymentDate);
      const { year, month } = getCycleFromPaymentDate(nextPayDate, debt.cutoffDate, debt.paymentDate);
      const cycleKey = `${year}-${String(month + 1).padStart(2, "0")}`;

      if (!cycleMap.has(cycleKey)) {
        const cutoff = new Date(year, month, debt.cutoffDate, 12, 0, 0);
        cycleMap.set(cycleKey, { installments: [], cutoffDate: cutoff });
      }
      cycleMap.get(cycleKey)!.installments.push(inst);
    }

    // Return installments from cycles whose cutoff has passed
    return Array.from(cycleMap.values())
      .filter((cycle) => cycle.cutoffDate <= today)
      .flatMap((cycle) => cycle.installments);
  } else {
    // Non-credit-card: simple date comparison
    return unpaid.filter((inst) => new Date(inst.nextPaymentDate) <= today);
  }
}

export function DebtDetail() {
  const { setFinanceSubView } = useAppStore();
  const [paying, setPaying] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [editingInstallment, setEditingInstallment] = useState<Installment | null>(null);
  const [deletingInstallment, setDeletingInstallment] = useState<Installment | null>(null);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [debtIdReady, setDebtIdReady] = useState(false);
  const [showInterestDialog, setShowInterestDialog] = useState(false);
  const [interestRates, setInterestRates] = useState<Record<string, string>>({}); // installmentId -> rate string

  // ── Loan fixed cuota: confirmed values ──
  const [confirmedCapital, setConfirmedCapital] = useState<Record<string, string>>({}); // installmentId -> capital string
  const [confirmedInterest, setConfirmedInterest] = useState<Record<string, string>>({}); // installmentId -> interest string
  const [confirmedOtherCharges, setConfirmedOtherCharges] = useState<Record<string, string>>({}); // installmentId -> other charges string
  const [confirmedRate, setConfirmedRate] = useState<Record<string, string>>({}); // installmentId -> monthly rate % string

  // ── Loan payment: account selection ──
  const [payAccountId, setPayAccountId] = useState<string>("");
  const [paySubAccountId, setPaySubAccountId] = useState<string>("");

  // ── Selection state for partial payment ──
  const [selectedInstallmentIds, setSelectedInstallmentIds] = useState<Set<string>>(new Set());

  // ── Abono a capital state ──
  const [showAbonoDialog, setShowAbonoDialog] = useState(false);
  const [abonoSelections, setAbonoSelections] = useState<Record<string, { selected: boolean; amount: string }>>({});
  const [abonoAccountId, setAbonoAccountId] = useState<string>("");
  const [abonoSubAccountId, setAbonoSubAccountId] = useState<string>("");
  const [abonoDate, setAbonoDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [processingAbono, setProcessingAbono] = useState(false);

  // ── Abono history & reverse state ──
  const [showAbonoHistory, setShowAbonoHistory] = useState(false);
  const [reversingAbonoId, setReversingAbonoId] = useState<string | null>(null);

  // Read selectedDebtId from sessionStorage after mount (avoids SSR/hydration issues)
  useEffect(() => {
    const id = sessionStorage.getItem("selectedDebtId");
    setSelectedDebtId(id);
    setDebtIdReady(true);
  }, []);

  const { data: debt, loading: debtLoading, refetch: refetchDebt } = useLocalSingleQuery<Debt>(
    selectedDebtId ? `/api/debts/${selectedDebtId}` : "",
    selectedDebtId,
    "debts"
  );
  const { data: accounts, refetch: refetchAccounts } = useLocalQuery<Account>("/api/accounts");

  const fetchData = useCallback(async () => {
    await Promise.all([refetchDebt(), refetchAccounts()]);
  }, [refetchDebt, refetchAccounts]);

  // ── Auto-select all due installments when debt changes ──
  useEffect(() => {
    if (!debt) return;
    const today = new Date();
    const dueInsts = getDueInstallments(debt, today);
    if (debt.type === "loan") {
      // For loans: auto-select the next unpaid installment (even if not due yet)
      const nextUnpaid = debt.installments
        .filter(inst => !inst.isPaid)
        .sort((a, b) => new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime());
      if (nextUnpaid.length > 0) {
        setSelectedInstallmentIds(new Set([nextUnpaid[0].id]));
      }
    } else {
      setSelectedInstallmentIds(new Set(dueInsts.map((inst) => inst.id)));
    }
  }, [debt]);

  const getAccountName = (accountId: string | null | undefined): string => {
    if (!accountId) return "Sin cuenta";
    const acc = accounts.find((a) => a.id === accountId);
    return acc?.name || "Cuenta";
  };

  const getSubAccountName = (
    accountId: string | null | undefined,
    subAccountId: string | null | undefined
  ): string | null => {
    if (!accountId || !subAccountId) return null;
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return null;
    const sub = acc.subAccounts.find((s) => s.id === subAccountId);
    return sub?.name || null;
  };

  const toggleInstallmentSelection = (id: string) => {
    setSelectedInstallmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllDue = () => {
    if (!debt) return;
    const today = new Date();
    const dueInsts = getDueInstallments(debt, today);
    setSelectedInstallmentIds(new Set(dueInsts.map((inst) => inst.id)));
  };

  const deselectAllDue = () => {
    setSelectedInstallmentIds(new Set());
  };

  const handlePay = async () => {
    if (!debt || paying) return;

    const today = new Date();
    let dueInsts = getDueInstallments(debt, today);

    // ── For loans: if no due installments, include the next upcoming one ──
    // Loans should always be payable when there's an upcoming cuota
    if (debt.type === "loan" && dueInsts.length === 0) {
      const nextUnpaid = debt.installments
        .filter(inst => !inst.isPaid)
        .sort((a, b) => new Date(a.nextPaymentDate).getTime() - new Date(b.nextPaymentDate).getTime());
      if (nextUnpaid.length > 0) {
        dueInsts = [nextUnpaid[0]];
        // Auto-select this installment
        setSelectedInstallmentIds(new Set([nextUnpaid[0].id]));
      }
    }

    const selectedDueInsts = dueInsts.filter((inst) => selectedInstallmentIds.has(inst.id));

    if (selectedDueInsts.length === 0 && dueInsts.length === 0) {
      return; // Nothing to pay
    }

    // Use dueInsts if no selection, otherwise use selected
    const instsToPay = selectedDueInsts.length > 0 ? selectedDueInsts : dueInsts;

    const isLoanFixed = debt.type === "loan" && debt.paymentType === "fixed";

    // Check if we need to show the confirmation dialog
    if (isLoanFixed && !showInterestDialog) {
      // Pre-fill estimated values for loan fixed cuota
      // interestRate for loans is NMV (annual nominal), monthly rate = NMV / 12
      const annualRate = debt.interestRate ?? 0;
      const monthlyRate = annualRate > 0 ? annualRate / 12 : 0;
      const fixedCuota = debt.monthlyPayment ?? 0;
      const defaultOther = debt.otherCharges ?? 0;

      const newCapital: Record<string, string> = {};
      const newInterest: Record<string, string> = {};
      const newOther: Record<string, string> = {};
      const newRates: Record<string, string> = {};

      for (const inst of instsToPay) {
        const balance = inst.remainingBalance ?? debt.currentBalance;
        const estimatedInt = monthlyRate > 0 ? balance * (monthlyRate / 100) : 0;
        const estimatedCap = Math.max(fixedCuota - estimatedInt - defaultOther, 0);

        newCapital[inst.id] = confirmedCapital[inst.id] ?? estimatedCap.toFixed(0);
        newInterest[inst.id] = confirmedInterest[inst.id] ?? estimatedInt.toFixed(0);
        newOther[inst.id] = confirmedOtherCharges[inst.id] ?? defaultOther.toFixed(0);
        newRates[inst.id] = confirmedRate[inst.id] ?? monthlyRate.toFixed(4);
      }

      setConfirmedCapital(newCapital);
      setConfirmedInterest(newInterest);
      setConfirmedOtherCharges(newOther);
      setConfirmedRate(newRates);
      // Pre-fill account from debt or first installment
      const defaultAccountId = debt.accountId || instsToPay[0]?.accountId || "";
      const defaultSubAccountId = debt.subAccountId || instsToPay[0]?.subAccountId || "";
      setPayAccountId(defaultAccountId);
      setPaySubAccountId(defaultSubAccountId);
      setShowInterestDialog(true);
      return;
    }

    // Check if there are multi-installment purchases selected (need interest rate input) — credit card flow
    if (!isLoanFixed) {
      const multiDue = selectedDueInsts.filter(
        (inst) => inst.totalInstallments > 1
      );

      if (multiDue.length > 0 && !showInterestDialog) {
        // Pre-fill interest rates with debt's default rate if available
        if (debt.interestRate && Object.keys(interestRates).length === 0) {
          const defaults: Record<string, string> = {};
          for (const inst of multiDue) {
            if (!interestRates[inst.id]) {
              defaults[inst.id] = String(debt.interestRate);
            }
          }
          setInterestRates((prev) => ({ ...defaults, ...prev }));
        }
        setShowInterestDialog(true);
        return;
      }
    }

    setPaying(true);
    setShowInterestDialog(false);
    try {
      // Build interestRates object: { installmentId: ratePercent }
      const ratesToSend: Record<string, number> = {};
      for (const [instId, rateStr] of Object.entries(interestRates)) {
        const rate = parseFloat(rateStr);
        if (!isNaN(rate) && rate > 0) {
          ratesToSend[instId] = rate;
        }
      }

      // Build confirmed values for loan fixed cuota
      const payload: Record<string, unknown> = {
        interestRates: ratesToSend,
        selectedInstallmentIds: Array.from(selectedInstallmentIds),
      };

      if (isLoanFixed) {
        const capitalToSend: Record<string, number> = {};
        const interestToSend: Record<string, number> = {};
        const otherToSend: Record<string, number> = {};

        for (const [instId, capStr] of Object.entries(confirmedCapital)) {
          const cap = parseFloat(capStr);
          if (!isNaN(cap)) capitalToSend[instId] = cap;
        }
        for (const [instId, intStr] of Object.entries(confirmedInterest)) {
          const int = parseFloat(intStr);
          if (!isNaN(int)) interestToSend[instId] = int;
        }
        for (const [instId, othStr] of Object.entries(confirmedOtherCharges)) {
          const oth = parseFloat(othStr);
          if (!isNaN(oth)) otherToSend[instId] = oth;
        }

        payload.confirmedCapital = capitalToSend;
        payload.confirmedInterest = interestToSend;
        payload.confirmedOtherCharges = otherToSend;
        payload.payAccountId = payAccountId || null;
        payload.paySubAccountId = paySubAccountId === "__none__" ? null : (paySubAccountId || null);
      }

      const result = await apiFetch<{
        success: boolean;
        totalPayment: number;
        paidInstallments: number;
        details?: Array<{
          id: string;
          description: string;
          capital: number;
          interestRate: number | null;
          interestAmount: number | null;
          otherChargesAmount?: number | null;
          totalAmount: number;
          currentInstallment: number;
          totalInstallments: number;
          accountId: string | null;
          subAccountId: string | null;
        }>;
      }>(`/api/debts/${debt.id}/pay`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      console.log("💳 Pago procesado:", {
        total: result.totalPayment,
        cuotas: result.paidInstallments,
        detalle: result.details?.map(d =>
          `${d.description} (cuota ${d.currentInstallment}/${d.totalInstallments}) capital=${d.capital}${d.interestAmount ? ` + interés=${d.interestAmount}` : ""}${d.otherChargesAmount ? ` + otros=${d.otherChargesAmount}` : ""} = ${d.totalAmount}`
        ),
      });
      // Clear state after successful payment
      setInterestRates({});
      setConfirmedCapital({});
      setConfirmedInterest({});
      setConfirmedOtherCharges({});
      setConfirmedRate({});
      setPayAccountId("");
      setPaySubAccountId("");
      await fetchData();
      return result;
    } catch (error) {
      console.error("Error paying debt:", error);
      throw error;
    } finally {
      setPaying(false);
    }
  };

  const handleOpenAbono = () => {
    if (!debt) return;
    // Pre-select all unpaid installments with empty amounts
    const initial: Record<string, { selected: boolean; amount: string }> = {};
    for (const inst of debt.installments) {
      if (!inst.isPaid) {
        initial[inst.id] = { selected: false, amount: "" };
      }
    }
    setAbonoSelections(initial);
    setAbonoAccountId("");
    setAbonoSubAccountId("");
    setAbonoDate(new Date().toISOString().split("T")[0]);
    setShowAbonoDialog(true);
  };

  const handleAbono = async () => {
    if (!debt || processingAbono) return;

    const payments = Object.entries(abonoSelections)
      .filter(([, sel]) => sel.selected && parseFloat(sel.amount) > 0)
      .map(([id, sel]) => ({ installmentId: id, amount: parseFloat(sel.amount) }));

    if (payments.length === 0) return;

    if (!abonoAccountId) {
      return; // Need an account
    }

    setProcessingAbono(true);
    try {
      const result = await apiFetch<{
        success: boolean;
        totalAbono: number;
        processedPayments: number;
        details: Array<{
          installmentId: string;
          description: string;
          abonoAmount: number;
          previousBalance: number;
          newBalance: number;
        }>;
      }>(`/api/debts/${debt.id}/abono`, {
        method: "POST",
        body: JSON.stringify({
          payments,
          accountId: abonoAccountId,
          subAccountId: abonoSubAccountId || undefined,
          date: abonoDate || undefined,
        }),
      });

      console.log("💰 Abono procesado:", {
        total: result.totalAbono,
        cuotas: result.processedPayments,
        detalle: result.details?.map(d =>
          `${d.description} abono=${d.abonoAmount} saldo=${d.previousBalance}→${d.newBalance}`
        ),
      });

      setShowAbonoDialog(false);
      await fetchData();
    } catch (error) {
      console.error("Error processing abono:", error);
    } finally {
      setProcessingAbono(false);
    }
  };

  const handleReversePay = async () => {
    if (!debt || reversing) return;
    setReversing(true);
    try {
      const result = await apiFetch<{ success: boolean; totalReversed: number; reversedInstallments: number }>(`/api/debts/${debt.id}/reverse-pay`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await fetchData();
      return result;
    } catch (error) {
      console.error("Error reversing debt payment:", error);
      throw error;
    } finally {
      setReversing(false);
    }
  };

  const handleReverseAbono = async (abonoId: string) => {
    if (!debt || reversingAbonoId) return;
    setReversingAbonoId(abonoId);
    try {
      await apiFetch<{ success: boolean; totalReversed: number; reversedDetails: number }>(`/api/debts/${debt.id}/reverse-abono`, {
        method: "POST",
        body: JSON.stringify({ abonoId }),
      });
      await fetchData();
    } catch (error) {
      console.error("Error reversing abono:", error);
    } finally {
      setReversingAbonoId(null);
    }
  };

  const handleDelete = async () => {
    if (!debt) return;
    try {
      await apiFetch(`/api/debts/${debt.id}`, { method: "DELETE" });
      setFinanceSubView("debts");
    } catch (error) {
      console.error("Error deleting debt:", error);
    }
  };

  const handleEditInstallment = (inst: Installment) => {
    setEditingInstallment(inst);
  };

  const handleDeleteInstallment = (inst: Installment) => {
    setDeletingInstallment(inst);
  };

  const confirmDeleteInstallment = async () => {
    if (!deletingInstallment) return;
    try {
      await apiFetch(`/api/installments/${deletingInstallment.id}`, { method: "DELETE" });
      await fetchData();
    } catch (error) {
      console.error("Error deleting installment:", error);
    } finally {
      setDeletingInstallment(null);
    }
  };

  if (!debtIdReady || (debtLoading && !debt)) {
    return (
      <div className="p-4 space-y-3 pb-safe">
        <div className="h-8 w-24 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-48 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
      </div>
    );
  }

  if (!selectedDebtId || !debt) {
    return (
      <div className="p-4 text-center">
        <p className="text-gray-500 dark:text-gray-400">Deuda no encontrada</p>
        <Button
          variant="ghost"
          onClick={() => setFinanceSubView("debts")}
          className="mt-2"
        >
          <ArrowLeft className="size-4 mr-1" />
          Volver
        </Button>
      </div>
    );
  }

  const isCreditCard = debt.type === "credit_card";
  const isLoan = debt.type === "loan";
  const isLoanFixed = isLoan && debt.paymentType === "fixed";
  const cupo = debt.totalAmount - debt.currentBalance;
  const today = new Date();
  const dueInstallments = getDueInstallments(debt, today);
  // For loans: selected installments include ALL unpaid selected (not just due ones)
  // because loans should be payable even when the cuota isn't technically due yet
  const selectedDueInstallments = isLoan
    ? debt.installments.filter((inst) => !inst.isPaid && selectedInstallmentIds.has(inst.id))
    : dueInstallments.filter((inst) => selectedInstallmentIds.has(inst.id));
  const hasPaidInstallments = debt.installments.some((inst) => inst.paidAmount > 0);

  // Build payment summary: group SELECTED due installments by their account
  const paymentSummary: Record<string, { accountName: string; subAccountName: string | null; amount: number; purchases: string[] }> = {};
  for (const inst of selectedDueInstallments) {
    const key = `${inst.accountId || "none"}-${inst.subAccountId || "none"}`;
    if (!paymentSummary[key]) {
      paymentSummary[key] = {
        accountName: getAccountName(inst.accountId),
        subAccountName: getSubAccountName(inst.accountId, inst.subAccountId),
        amount: 0,
        purchases: [],
      };
    }
    paymentSummary[key].amount += inst.installmentAmount;
    paymentSummary[key].purchases.push(inst.description);
  }

  const totalDue = selectedDueInstallments.reduce((sum, i) => {
    let amount = i.installmentAmount;
    const rate = parseFloat(interestRates[i.id] || "0");
    if (!isNaN(rate) && rate > 0 && i.totalInstallments > 1) {
      const balance = i.remainingBalance ?? i.totalAmount;
      amount += balance * (rate / 100);
    }
    return sum + amount;
  }, 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 space-y-4 pb-safe"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFinanceSubView("debts")}
          className="rounded-xl"
        >
          <ArrowLeft className="size-4 mr-1" />
          Volver
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-xl"
            onClick={() => setShowEditForm(true)}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 rounded-xl text-red-500 hover:text-red-600"
            onClick={() => setShowDeleteDialog(true)}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      {/* Debt Card */}
      <DebtCard debt={debt} />

      {/* Balance Info Card */}
      <Card className="border-0 shadow-md rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {isCreditCard ? "Saldo en Deuda" : "Saldo Actual"}
            </span>
            <span className="text-lg font-bold text-gray-900 dark:text-white">
              {formatCurrency(debt.currentBalance)}
            </span>
          </div>

          {isCreditCard && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                Cupo Disponible
              </span>
              <span className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(cupo)}
              </span>
            </div>
          )}

          {debt.interestRate && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Percent className="size-3.5" />
              <span>Tasa: {debt.interestRate}% {isLoan ? `NMV anual (${((debt.interestRate ?? 0) / 12).toFixed(4)}% mensual)` : "mensual"}</span>
              {isLoanFixed && (
                <span className="text-[10px] text-gray-400">(nominal mes vencido)</span>
              )}
            </div>
          )}

          {isCreditCard && debt.cutoffDate && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Calendar className="size-3.5" />
              <span>Corte: día {debt.cutoffDate}</span>
            </div>
          )}

          {isCreditCard && debt.paymentDate && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Calendar className="size-3.5" />
              <span>Pago: día {debt.paymentDate}</span>
            </div>
          )}

          {isLoan && debt.paymentDate && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Calendar className="size-3.5" />
              <span>Pago: día {debt.paymentDate} de cada mes</span>
            </div>
          )}

          {isLoanFixed && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Wallet className="size-3.5" />
              <span>Cuota fija: {formatCurrency(debt.monthlyPayment ?? 0)}</span>
              {debt.remainingPayments && (
                <Badge variant="secondary" className="text-[10px]">
                  {debt.remainingPayments} cuotas restantes
                </Badge>
              )}
            </div>
          )}

          {isLoanFixed && debt.otherCharges && debt.otherCharges > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="text-[10px]">
                Otros gastos fijos: {formatCurrency(debt.otherCharges)}/mes (seguro, papelería, IVA)
              </span>
            </div>
          )}

          {!isLoanFixed && debt.monthlyPayment && (
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <Wallet className="size-3.5" />
              <span>Cuota: {formatCurrency(debt.monthlyPayment)}</span>
              {debt.remainingPayments && (
                <Badge variant="secondary" className="text-[10px]">
                  {debt.remainingPayments} restantes
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installments Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            {isLoan ? "Plan de Pagos" : "Compras en Cuotas"}
          </h3>
          {!isLoan && (
            <Button
              size="sm"
              onClick={() => setShowInstallmentForm(true)}
              className="rounded-xl bg-gradient-to-r from-rose-500 to-pink-500"
            >
              <Plus className="size-3.5 mr-1" />
              Agregar
            </Button>
          )}
        </div>

        {debt.installments.length > 0 ? (
          <InstallmentPlan
            installments={debt.installments}
            cutoffDate={debt.cutoffDate}
            paymentDate={debt.paymentDate}
            debtType={debt.type}
            onPay={handlePay}
            paying={paying}
            onReversePay={handleReversePay}
            reversing={reversing}
            hasPaidInstallments={hasPaidInstallments}
            onEdit={handleEditInstallment}
            onDelete={handleDeleteInstallment}
            getAccountName={getAccountName}
            getSubAccountName={getSubAccountName}
            selectedInstallmentIds={selectedInstallmentIds}
            onToggleSelection={toggleInstallmentSelection}
            onSelectAllDue={selectAllDue}
            onDeselectAllDue={deselectAllDue}
            debtInterestRate={debt.interestRate}
            onAbono={handleOpenAbono}
            onAbonoHistory={() => setShowAbonoHistory(true)}
            abonoCount={debt.abonos?.filter(a => !a.isReversed).length ?? 0}
          />
        ) : (
          <Card className="border-0 shadow-md rounded-2xl">
            <CardContent className="p-6 text-center">
              {isLoan ? (
                <>
                  <Wallet className="size-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No hay cuotas registradas aún
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    La primera cuota se crea automáticamente al registrar el préstamo
                  </p>
                </>
              ) : (
                <>
                  <CreditCard className="size-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No hay compras en cuotas registradas
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Loan: Cuota Breakdown Card + Pagar Cuota button (always visible when there are unpaid installments) ── */}
      {isLoan && debt.installments.some(inst => !inst.isPaid) && (
        <div className="space-y-3">
          {/* Cuota Breakdown Card */}
          {isLoanFixed && debt.monthlyPayment && (
            <Card className="border-0 shadow-md rounded-2xl border-l-4 border-l-blue-400">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400">
                    Desglose de la Cuota
                  </h4>
                  <Badge variant="secondary" className="text-[10px]">
                    Cuota fija
                  </Badge>
                </div>
                {(() => {
                  const balance = debt.currentBalance;
                  // interestRate for loans is NMV (annual nominal), monthly rate = NMV / 12
                  const annualRate = debt.interestRate ?? 0;
                  const monthlyRate = annualRate > 0 ? annualRate / 12 : 0;
                  const otherNum = debt.otherCharges ?? 0;
                  const estInterest = monthlyRate > 0 ? balance * (monthlyRate / 100) : 0;
                  const estCapital = Math.max((debt.monthlyPayment ?? 0) - estInterest - otherNum, 0);
                  const nextInst = debt.installments.find(inst => !inst.isPaid);
                  const nextPayDate = nextInst ? formatDate(nextInst.nextPaymentDate) : null;

                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">Capital estimado:</span>
                        <span className="text-emerald-600 font-medium">{formatCurrency(estCapital)}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500 dark:text-gray-400">Intereses ({monthlyRate.toFixed(4)}% mensual):</span>
                        <span className="text-amber-600 font-medium">{formatCurrency(estInterest)}</span>
                      </div>
                      {otherNum > 0 && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-500 dark:text-gray-400">Otros gastos (seguro, papelería, IVA):</span>
                          <span className="text-gray-600 font-medium">{formatCurrency(otherNum)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs pt-1.5 border-t">
                        <span className="text-gray-900 dark:text-white font-semibold">Cuota total:</span>
                        <span className="text-gray-900 dark:text-white font-bold">{formatCurrency(debt.monthlyPayment ?? 0)}</span>
                      </div>
                      {nextPayDate && (
                        <div className="flex items-center gap-1 text-[10px] text-gray-400 mt-1">
                          <Calendar className="size-3" />
                          <span>Próximo pago: {nextPayDate}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {/* Pay Cuota Button */}
          <Button
            onClick={handlePay}
            disabled={paying || (dueInstallments.length === 0 ? false : selectedDueInstallments.length === 0)}
            className="w-full rounded-xl h-12 bg-gradient-to-r from-emerald-500 to-green-500"
          >
            {paying ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : null}
            {paying
              ? "Procesando..."
              : dueInstallments.length > 0
              ? `Pagar Cuota: ${formatCurrency(debt.monthlyPayment ?? totalDue)}`
              : `Pagar Próxima Cuota: ${formatCurrency(debt.monthlyPayment ?? 0)}`
            }
          </Button>

          {/* Reverse button — shown when there are paid installments */}
          {hasPaidInstallments && (
            <Button
              onClick={handleReversePay}
              disabled={reversing}
              variant="outline"
              className="w-full rounded-xl h-12 border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
            >
              {reversing ? (
                <Loader2 className="size-4 animate-spin mr-2" />
              ) : (
                <Undo2 className="size-4 mr-2" />
              )}
              {reversing ? "Revirtiendo..." : "Reversar Último Pago"}
            </Button>
          )}

          <Button
            onClick={handleOpenAbono}
            variant="outline"
            className="w-full rounded-xl h-12 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
          >
            <HandCoins className="size-4 mr-2" />
            Abono a Capital
          </Button>

          {/* Abono History button — always visible when there are abonos */}
          {(debt.abonos?.filter(a => !a.isReversed).length ?? 0) > 0 && (
            <Button
              onClick={() => setShowAbonoHistory(true)}
              variant="outline"
              className="w-full rounded-xl h-12 border-purple-300 text-purple-700 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-900/20"
            >
              <CalendarDays className="size-4 mr-2" />
              Historial de Abonos ({debt.abonos?.filter(a => !a.isReversed).length ?? 0})
            </Button>
          )}
        </div>
      )}

      {/* ── Credit Card / Other: Pay/Reverse/Abono buttons are handled by InstallmentPlan component ── */}
      {/* The InstallmentPlan component renders its own pay/reverse/abono buttons for non-loan debts */}
      {/* This section was removed to avoid duplicate buttons */}

      {/* Payment Summary — only for selected installments */}
      {selectedDueInstallments.length > 0 && (
        <Card className="border-0 shadow-md rounded-2xl border-l-4 border-l-amber-400">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                Resumen de Pago
              </h4>
              <Badge variant="secondary" className="text-[10px]">
                {selectedDueInstallments.length} de {dueInstallments.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {Object.entries(paymentSummary).map(([key, group]) => (
                <div
                  key={key}
                  className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-xl p-3"
                >
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Wallet className="size-3.5 text-gray-500" />
                      <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        {group.accountName}
                      </span>
                    </div>
                    {group.subAccountName && (
                      <span className="text-[10px] text-gray-400 ml-5">
                        🐷 {group.subAccountName}
                      </span>
                    )}
                    <div className="text-[10px] text-gray-400 ml-5 mt-0.5">
                      Compras: {group.purchases.join(", ")}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-900 dark:text-white">
                    {formatCurrency(group.amount)}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Total a Pagar
              </span>
              <span className="text-base font-bold text-gray-900 dark:text-white">
                {formatCurrency(totalDue)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta deuda?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la deuda &quot;{debt.name}&quot; y todas sus cuotas asociadas. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="rounded-xl bg-red-500 hover:bg-red-600"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Form */}
      <DebtForm
        open={showEditForm}
        onOpenChange={setShowEditForm}
        onSuccess={fetchData}
        editDebt={debt}
      />

      {/* Installment Form (Create) */}
      <InstallmentForm
        open={showInstallmentForm}
        onOpenChange={setShowInstallmentForm}
        debtId={debt.id}
        onSuccess={fetchData}
      />

      {/* Installment Form (Edit) */}
      <InstallmentForm
        open={!!editingInstallment}
        onOpenChange={(open) => { if (!open) setEditingInstallment(null); }}
        debtId={debt.id}
        editInstallment={editingInstallment}
        onSuccess={fetchData}
      />

      {/* Delete Installment Dialog */}
      <AlertDialog open={!!deletingInstallment} onOpenChange={(open) => { if (!open) setDeletingInstallment(null); }}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar esta compra?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará &quot;{deletingInstallment?.description}&quot;{deletingInstallment && deletingInstallment.paidAmount > 0 ? ` (se reversarán los pagos ya realizados de ${formatCurrency(deletingInstallment.paidAmount)})` : ""}. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteInstallment}
              className="rounded-xl bg-red-500 hover:bg-red-600"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Interest Rate / Loan Payment Confirmation Dialog */}
      <AlertDialog open={showInterestDialog} onOpenChange={(open) => { if (!open) setShowInterestDialog(false); }}>
        <AlertDialogContent className="rounded-2xl max-w-md max-h-[85vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Calculator className="size-5 text-amber-500" />
              {debt && debt.type === "loan" && debt.paymentType === "fixed"
                ? "Confirmar Pago del Préstamo"
                : "Tasa de Interés"
              }
            </AlertDialogTitle>
            <AlertDialogDescription>
              {debt && debt.type === "loan" && debt.paymentType === "fixed"
                ? "Confirma los valores del extracto bancario. Puedes ajustar cada valor según lo que aparece en tu extracto."
                : "Ingresa la tasa de interés mensual del extracto bancario."
              }
              {debt && debt.interestRate && debt.type !== "loan" && (
                <span className="block mt-1 text-blue-600 dark:text-blue-400">
                  Tasa por defecto de la tarjeta: {debt.interestRate}% mensual
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            {debt && debt.type === "loan" && debt.paymentType === "fixed" ? (
              // ── Loan Fixed Cuota: Full confirmation dialog ──
              <>
              {selectedDueInstallments.map((inst) => {
                const balance = inst.remainingBalance ?? debt.currentBalance;
                const capStr = confirmedCapital[inst.id] ?? "0";
                const intStr = confirmedInterest[inst.id] ?? "0";
                const othStr = confirmedOtherCharges[inst.id] ?? "0";
                const rateStr = confirmedRate[inst.id] ?? "0";
                const capNum = parseFloat(capStr) || 0;
                const intNum = parseFloat(intStr) || 0;
                const othNum = parseFloat(othStr) || 0;
                const totalForThis = capNum + intNum + othNum;
                const fixedCuota = debt.monthlyPayment ?? 0;
                const diff = totalForThis - fixedCuota;

                return (
                  <div key={inst.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {inst.description}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        Cuota {inst.currentInstallment}/{inst.totalInstallments}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      Saldo pendiente: {formatCurrency(balance)}
                    </div>

                    {/* Monthly Rate Input (editable) */}
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-gray-500 w-16 flex-shrink-0">Tasa mensual:</label>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          step="0.0001"
                          min="0"
                          value={rateStr}
                          onChange={(e) => {
                            const newRate = e.target.value;
                            setConfirmedRate(prev => ({ ...prev, [inst.id]: newRate }));
                            // Auto-recalculate interest and capital from rate
                            const rateNum = parseFloat(newRate) || 0;
                            const newInterest = rateNum > 0 ? balance * (rateNum / 100) : 0;
                            const newCapital = Math.max(fixedCuota - newInterest - othNum, 0);
                            setConfirmedInterest(prev => ({ ...prev, [inst.id]: newInterest.toFixed(0) }));
                            setConfirmedCapital(prev => ({ ...prev, [inst.id]: newCapital.toFixed(0) }));
                          }}
                          className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm pr-8"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                      </div>
                    </div>

                    {/* Interest Input */}
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-gray-500 w-16 flex-shrink-0">Intereses:</label>
                      <div className="flex-1">
                        <CurrencyInput
                          value={intStr}
                          onChange={(v) => {
                            setConfirmedInterest(prev => ({ ...prev, [inst.id]: v }));
                            // Auto-adjust capital: capital = cuota - interest - otros
                            const newIntNum = parseFloat(v) || 0;
                            const newCapital = Math.max(fixedCuota - newIntNum - othNum, 0);
                            setConfirmedCapital(prev => ({ ...prev, [inst.id]: newCapital.toFixed(0) }));
                          }}
                          showPrefix
                          placeholder="0"
                          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 h-8 text-sm"
                        />
                      </div>
                    </div>

                    {/* Other Charges Input */}
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-gray-500 w-16 flex-shrink-0">Otros:</label>
                      <div className="flex-1">
                        <CurrencyInput
                          value={othStr}
                          onChange={(v) => {
                            setConfirmedOtherCharges(prev => ({ ...prev, [inst.id]: v }));
                            // Auto-adjust capital: capital = cuota - interest - otros
                            const newOthNum = parseFloat(v) || 0;
                            const newCapital = Math.max(fixedCuota - intNum - newOthNum, 0);
                            setConfirmedCapital(prev => ({ ...prev, [inst.id]: newCapital.toFixed(0) }));
                          }}
                          showPrefix
                          placeholder="0"
                          className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 h-8 text-sm"
                        />
                      </div>
                    </div>

                    {/* Capital Input (auto-calculated but editable) */}
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-gray-500 w-16 flex-shrink-0">Capital:</label>
                      <div className="flex-1">
                        <CurrencyInput
                          value={capStr}
                          onChange={(v) => setConfirmedCapital(prev => ({ ...prev, [inst.id]: v }))}
                          showPrefix
                          placeholder="0"
                          className="rounded-lg border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 h-8 text-sm font-medium"
                        />
                      </div>
                    </div>

                    <p className="text-[9px] text-gray-400">
                      Al editar intereses u otros, el capital se ajusta automáticamente: capital = cuota - intereses - otros
                    </p>

                    {/* Summary */}
                    <div className="text-xs space-y-0.5 bg-white dark:bg-gray-900 rounded-lg p-2">
                      <div className="flex justify-between text-gray-500">
                        <span>Abono a capital:</span>
                        <span className="text-emerald-600 font-medium">{formatCurrency(capNum)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Intereses ({rateStr}%):</span>
                        <span className="text-amber-600 font-medium">{formatCurrency(intNum)}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Otros gastos:</span>
                        <span>{formatCurrency(othNum)}</span>
                      </div>
                      <div className="flex justify-between text-gray-900 dark:text-white font-medium pt-1 border-t">
                        <span>Total a pagar:</span>
                        <span className="text-emerald-600">{formatCurrency(totalForThis)}</span>
                      </div>
                      {Math.abs(diff) > 1 && (
                        <div className={`flex justify-between text-[10px] mt-1 ${diff > 0 ? 'text-amber-600' : 'text-red-600'}`}>
                          <span>Diferencia con cuota fija:</span>
                          <span>{diff > 0 ? '+' : ''}{formatCurrency(diff)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                        <span>Cuota fija del préstamo:</span>
                        <span>{formatCurrency(fixedCuota)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ── Account selection for payment ── */}
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3 space-y-2 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-1.5">
                  <Wallet className="size-3.5 text-blue-500" />
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Cuenta de Pago</span>
                </div>
                <Select value={payAccountId} onValueChange={(val) => { setPayAccountId(val); setPaySubAccountId(""); }}>
                  <SelectTrigger className="rounded-xl h-9 text-sm">
                    <SelectValue placeholder="Seleccionar cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id}>
                        {acc.name} ({formatCurrency(acc.balance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {payAccountId && (() => {
                  const selectedAcc = accounts.find(a => a.id === payAccountId);
                  const subAccounts = selectedAcc?.subAccounts || [];
                  if (subAccounts.length === 0) return null;
                  return (
                    <Select value={paySubAccountId} onValueChange={setPaySubAccountId}>
                      <SelectTrigger className="rounded-xl h-9 text-sm">
                        <SelectValue placeholder="Seleccionar subcuenta" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Cuenta principal</SelectItem>
                        {subAccounts.map((sub) => (
                          <SelectItem key={sub.id} value={sub.id}>
                            {sub.name} ({formatCurrency(sub.balance)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                })()}
              </div>
              </>
            ) : (
              // ── Credit Card: Interest rate input (original) ──
              selectedDueInstallments
                .filter((inst) => inst.totalInstallments > 1)
                .map((inst) => {
                  const balance = inst.remainingBalance ?? inst.totalAmount;
                  const rate = interestRates[inst.id] ?? (debt?.interestRate ? String(debt.interestRate) : "");
                  const rateNum = parseFloat(rate) || 0;
                  const estimatedInterest = rateNum > 0 ? balance * (rateNum / 100) : 0;
                  const totalWithInterest = inst.installmentAmount + estimatedInterest;

                  return (
                    <div key={inst.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {inst.description}
                        </span>
                        <Badge variant="secondary" className="text-[10px]">
                          Cuota {inst.currentInstallment}/{inst.totalInstallments}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-gray-500">
                        Capital fijo: {formatCurrency(inst.installmentAmount)} • Saldo pendiente: {formatCurrency(balance)}
                      </div>

                      {/* Interest Rate Input */}
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] text-gray-500 w-12 flex-shrink-0">Tasa:</label>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            placeholder={debt?.interestRate ? String(debt.interestRate) : "Ej: 1.89"}
                            value={rate}
                            onChange={(e) => setInterestRates(prev => ({ ...prev, [inst.id]: e.target.value }))}
                            className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-1.5 text-sm pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                        </div>
                      </div>

                      {/* Summary calculation */}
                      {rateNum > 0 && (
                        <div className="text-xs space-y-0.5 bg-white dark:bg-gray-900 rounded-lg p-2">
                          <div className="flex justify-between text-gray-500">
                            <span>Capital fijo:</span>
                            <span>{formatCurrency(inst.installmentAmount)}</span>
                          </div>
                          <div className="flex justify-between text-gray-500">
                            <span>Interés estimado ({rateNum}%):</span>
                            <span className="text-amber-600 font-medium">{formatCurrency(estimatedInterest)}</span>
                          </div>
                          <div className="flex justify-between text-gray-900 dark:text-white font-medium pt-1 border-t">
                            <span>Total a pagar:</span>
                            <span className="text-emerald-600">{formatCurrency(totalWithInterest)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
            )}
          </div>

          <AlertDialogFooter className="flex-col gap-2">
            <AlertDialogAction
              onClick={handlePay}
              className="rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 w-full"
            >
              Confirmar Pago ({selectedDueInstallments.length} cuota{selectedDueInstallments.length !== 1 ? "s" : ""} — {formatCurrency(totalDue)})
            </AlertDialogAction>
            <AlertDialogCancel
              className="rounded-xl w-full"
              onClick={() => {
                setShowInterestDialog(false);
              }}
            >
              Cancelar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Abono a Capital Dialog ── */}
      <AlertDialog open={showAbonoDialog} onOpenChange={(open) => { if (!open) setShowAbonoDialog(false); }}>
        <AlertDialogContent className="rounded-2xl max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HandCoins className="size-5 text-blue-500" />
              Abono a Capital
            </AlertDialogTitle>
            <AlertDialogDescription>
              Selecciona las cuotas a las que deseas hacer un abono extra. El abono reduce el saldo pendiente y disminuye el interés de los próximos pagos.
              El dinero sale de la cuenta que elijas y se registra como gasto.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            {/* List of unpaid installments */}
            {debt.installments.filter((inst) => !inst.isPaid).length === 0 ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400">No hay cuotas pendientes</p>
              </div>
            ) : (
              debt.installments
                .filter((inst) => !inst.isPaid)
                .map((inst) => {
                  const sel = abonoSelections[inst.id] || { selected: false, amount: "" };
                  const balance = inst.remainingBalance ?? inst.totalAmount;
                  const abonoNum = parseFloat(sel.amount) || 0;
                  const newBalance = Math.max(balance - abonoNum, 0);

                  return (
                    <div key={inst.id} className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setAbonoSelections(prev => ({
                              ...prev,
                              [inst.id]: { ...prev[inst.id], selected: !prev[inst.id]?.selected }
                            }))}
                            className={`flex-shrink-0 size-5 rounded-md border-2 flex items-center justify-center transition-all ${
                              sel.selected
                                ? "bg-blue-500 border-blue-500 text-white"
                                : "border-gray-300 dark:border-gray-600 hover:border-blue-400"
                            }`}
                          >
                            {sel.selected && (
                              <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {inst.description}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">
                          Cuota {inst.currentInstallment}/{inst.totalInstallments}
                        </Badge>
                      </div>
                      <div className="text-[10px] text-gray-500 ml-7">
                        Saldo pendiente: {formatCurrency(balance)} • Capital: {formatCurrency(inst.installmentAmount)}
                      </div>

                      {/* Amount input — only when selected */}
                      {sel.selected && (
                        <div className="ml-7 space-y-2">
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-gray-500 w-12 flex-shrink-0">Abono:</label>
                            <div className="flex-1">
                              <CurrencyInput
                                value={sel.amount}
                                onChange={(v) => setAbonoSelections(prev => ({
                                  ...prev,
                                  [inst.id]: { ...prev[inst.id], amount: v }
                                }))}
                                showPrefix
                                placeholder="Monto del abono"
                                className="rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-900 h-8 text-sm focus:ring-1 focus:ring-blue-400"
                              />
                            </div>
                          </div>

                          {/* Show resulting balance */}
                          {abonoNum > 0 && (
                            <div className="text-xs space-y-0.5 bg-white dark:bg-gray-900 rounded-lg p-2">
                              <div className="flex justify-between text-gray-500">
                                <span>Saldo actual:</span>
                                <span>{formatCurrency(balance)}</span>
                              </div>
                              <div className="flex justify-between text-blue-600 dark:text-blue-400">
                                <span>Abono a capital:</span>
                                <span>-{formatCurrency(abonoNum)}</span>
                              </div>
                              <div className="flex justify-between text-gray-900 dark:text-white font-medium pt-1 border-t">
                                <span>Nuevo saldo:</span>
                                <span className="text-emerald-600">{formatCurrency(newBalance)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
            )}

            {/* Account selection */}
            {Object.values(abonoSelections).some(s => s.selected) && (
              <div className="space-y-2 pt-2 border-t">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Cuenta de origen
                </div>
                <select
                  value={abonoAccountId}
                  onChange={(e) => {
                    setAbonoAccountId(e.target.value);
                    setAbonoSubAccountId("");
                  }}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                >
                  <option value="">Selecciona cuenta</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatCurrency(acc.balance)})
                    </option>
                  ))}
                </select>

                {/* Sub-account selection */}
                {abonoAccountId && (() => {
                  const acc = accounts.find(a => a.id === abonoAccountId);
                  return acc && acc.subAccounts.length > 0 ? (
                    <select
                      value={abonoSubAccountId}
                      onChange={(e) => setAbonoSubAccountId(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                    >
                      <option value="">Cuenta principal</option>
                      {acc.subAccounts.map((sub) => (
                        <option key={sub.id} value={sub.id}>
                          {sub.name} ({formatCurrency(sub.balance)})
                        </option>
                      ))}
                    </select>
                  ) : null;
                })()}

                {/* Date */}
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-gray-400" />
                  <input
                    type="date"
                    value={abonoDate}
                    onChange={(e) => setAbonoDate(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            )}

            {/* Total summary */}
            {Object.values(abonoSelections).some(s => s.selected && parseFloat(s.amount) > 0) && (
              <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-3 space-y-1">
                <div className="flex justify-between text-sm font-semibold">
                  <span className="text-blue-700 dark:text-blue-400">Total abono:</span>
                  <span className="text-blue-700 dark:text-blue-400">
                    {formatCurrency(
                      Object.entries(abonoSelections)
                        .filter(([, s]) => s.selected)
                        .reduce((sum, [, s]) => sum + (parseFloat(s.amount) || 0), 0)
                    )}
                  </span>
                </div>
                <div className="text-[10px] text-gray-500">
                  Se registrará como gasto en la categoría Deudas
                </div>
              </div>
            )}
          </div>

          <AlertDialogFooter className="flex-col gap-2">
            <AlertDialogAction
              onClick={handleAbono}
              disabled={
                processingAbono ||
                !Object.values(abonoSelections).some(s => s.selected && parseFloat(s.amount) > 0) ||
                !abonoAccountId
              }
              className="rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 w-full disabled:opacity-50"
            >
              {processingAbono ? (
                <>
                  <Loader2 className="size-4 animate-spin mr-2" />
                  Procesando...
                </>
              ) : (
                <>
                  Confirmar Abono (
                  {formatCurrency(
                    Object.entries(abonoSelections)
                      .filter(([, s]) => s.selected)
                      .reduce((sum, [, s]) => sum + (parseFloat(s.amount) || 0), 0)
                  )})
                </>
              )}
            </AlertDialogAction>
            <AlertDialogCancel
              className="rounded-xl w-full"
              onClick={() => setShowAbonoDialog(false)}
            >
              Cancelar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Abono History Dialog ── */}
      <AlertDialog open={showAbonoHistory} onOpenChange={(open) => { if (!open) setShowAbonoHistory(false); }}>
        <AlertDialogContent className="rounded-2xl max-w-md max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CalendarDays className="size-5 text-purple-500" />
              Historial de Abonos
            </AlertDialogTitle>
            <AlertDialogDescription>
              Registro de todos los abonos a capital realizados. Puedes reversar un abono si fue un error.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-3 py-2">
            {(!debt.abonos || debt.abonos.length === 0) ? (
              <div className="text-center py-4">
                <p className="text-sm text-gray-400">No hay abonos registrados</p>
              </div>
            ) : (
              debt.abonos
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .map((abono) => {
                  const isReversing = reversingAbonoId === abono.id;
                  const accountName = getAccountName(abono.accountId);
                  const subAccountName = getSubAccountName(abono.accountId, abono.subAccountId);

                  return (
                    <div
                      key={abono.id}
                      className={`rounded-xl p-3 space-y-2 ${
                        abono.isReversed
                          ? "bg-gray-100 dark:bg-gray-800/50 opacity-60"
                          : "bg-gray-50 dark:bg-gray-800"
                      }`}
                    >
                      {/* Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {formatCurrency(abono.totalAmount)}
                          </span>
                          {abono.isReversed && (
                            <Badge variant="secondary" className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                              Reversado
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-400">
                          {formatDate(abono.date)}
                        </span>
                      </div>

                      {/* Account info */}
                      <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
                        <Wallet className="size-3" />
                        <span>{accountName}{subAccountName ? ` / ${subAccountName}` : ""}</span>
                      </div>

                      {/* Details per installment */}
                      <div className="space-y-1">
                        {abono.details.map((detail) => {
                          const inst = debt.installments.find(i => i.id === detail.installmentId);
                          return (
                            <div key={detail.id} className="text-[10px] text-gray-500 flex items-center justify-between bg-white dark:bg-gray-900 rounded-lg px-2 py-1">
                              <span className="truncate max-w-[60%]">
                                {inst?.description || "Cuota"} (cuota {inst?.currentInstallment || "?"}/{inst?.totalInstallments || "?"})
                              </span>
                              <span className="flex items-center gap-1">
                                <span className="text-blue-600 dark:text-blue-400">-{formatCurrency(detail.amount)}</span>
                                <span className="text-gray-400">
                                  ({formatCurrency(detail.previousBalance)} → {formatCurrency(detail.newBalance)})
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Reverse button — only for non-reversed abonos */}
                      {!abono.isReversed && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={isReversing}
                          onClick={() => handleReverseAbono(abono.id)}
                          className="w-full rounded-lg h-8 text-xs border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
                        >
                          {isReversing ? (
                            <Loader2 className="size-3 animate-spin mr-1" />
                          ) : (
                            <Undo2 className="size-3 mr-1" />
                          )}
                          {isReversing ? "Revirtiendo..." : "Reversar este abono"}
                        </Button>
                      )}
                    </div>
                  );
                })
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel
              className="rounded-xl w-full"
              onClick={() => setShowAbonoHistory(false)}
            >
              Cerrar
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  );
}
