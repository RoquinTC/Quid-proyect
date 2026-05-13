"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiFetch, formatCurrency, formatDate, toColombiaDateString, getColombiaTodayString } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { RecurringForm } from "./recurring-form";
import { PayrollForm } from "./payroll-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import {
  Plus,
  Repeat,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  Clock,
  CreditCard,
  Wallet,
  Trash2,
  Loader2,
  ArrowLeftRight,
  RotateCcw,
  Pencil,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  CheckSquare,
  Square,
  CalendarDays,
  ChevronLeft,
  LayoutList,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { RecurringPayment, PayrollGroup } from "@/lib/types";

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0 },
};

const frequencyConfig: Record<string, { label: string; color: string; bgClass: string }> = {
  monthly: { label: "Mensual", color: "text-blue-700 dark:text-blue-400", bgClass: "bg-blue-100 dark:bg-blue-900/30" },
  weekly: { label: "Semanal", color: "text-green-700 dark:text-green-400", bgClass: "bg-green-100 dark:bg-green-900/30" },
  yearly: { label: "Anual", color: "text-purple-700 dark:text-purple-400", bgClass: "bg-purple-100 dark:bg-purple-900/30" },
  one_time: { label: "Único", color: "text-gray-700 dark:text-gray-400", bgClass: "bg-gray-100 dark:bg-gray-800/30" },
  biweekly: { label: "Quincenal", color: "text-indigo-700 dark:text-indigo-400", bgClass: "bg-indigo-100 dark:bg-indigo-900/30" },
};

const statusConfig: Record<string, { label: string; color: string; bgClass: string }> = {
  pending: { label: "Pendiente", color: "text-amber-700 dark:text-amber-400", bgClass: "bg-amber-100 dark:bg-amber-900/30" },
  confirmed: { label: "Confirmado", color: "text-green-700 dark:text-green-400", bgClass: "bg-green-100 dark:bg-green-900/30" },
  cancelled: { label: "Cancelado", color: "text-red-700 dark:text-red-400", bgClass: "bg-red-100 dark:bg-red-900/30" },
};

const typeConfig: Record<string, { label: string; color: string; bgClass: string; icon: typeof ArrowLeftRight }> = {
  expense: { label: "Gasto", color: "text-rose-600 dark:text-rose-400", bgClass: "bg-rose-100 dark:bg-rose-900/30", icon: CreditCard },
  transfer: { label: "Transferencia", color: "text-blue-600 dark:text-blue-400", bgClass: "bg-blue-100 dark:bg-blue-900/30", icon: ArrowLeftRight },
  income: { label: "Ingreso", color: "text-emerald-600 dark:text-emerald-400", bgClass: "bg-emerald-100 dark:bg-emerald-900/30", icon: TrendingUp },
};

function getDaysUntil(dateStr: string): number {
  const datePart = dateStr.split("T")[0];
  const [y, m, d] = datePart.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - todayLocal.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getDaysLabel(days: number): string {
  if (days < 0) return `Vencido hace ${Math.abs(days)}d`;
  if (days === 0) return "Hoy";
  if (days === 1) return "Mañana";
  return `En ${days}d`;
}

/** Get the YYYY-MM label for a date string, in Colombia timezone */
function getMonthKey(dateStr: string): string {
  const colombiaStr = toColombiaDateString(dateStr);
  return colombiaStr.substring(0, 7); // "YYYY-MM"
}

/** Format a YYYY-MM key into a readable month label */
function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return date.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
}

export function RecurringView() {
  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState<RecurringPayment | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmActualAmount, setConfirmActualAmount] = useState("");
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmDestAccountId, setConfirmDestAccountId] = useState<string>("");
  const [confirmDestSubAccountId, setConfirmDestSubAccountId] = useState<string>("");
  const [confirmGoalLinkedAccounts, setConfirmGoalLinkedAccounts] = useState<Array<{ accountId: string; subAccountId: string | null; accountName: string; subAccountName: string | null }>>([]);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);
  const [reverseLoading, setReverseLoading] = useState<string | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [showPayrollForm, setShowPayrollForm] = useState(false);
  const [editingPayrollGroup, setEditingPayrollGroup] = useState<PayrollGroup | null>(null);

  // Scope dialog state (for edit/delete recurring series)
  const [scopeDialogOpen, setScopeDialogOpen] = useState(false);
  const [scopeAction, setScopeAction] = useState<"edit" | "delete">("delete");
  const [scopePayment, setScopePayment] = useState<RecurringPayment | null>(null);
  const [scopeLoading, setScopeLoading] = useState(false);

  // Payroll groups
  const [payrollGroups, setPayrollGroups] = useState<PayrollGroup[]>([]);

  // Multi-select batch confirm state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiConfirmLoading, setMultiConfirmLoading] = useState(false);

  // Calendar view state
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);

  const fetchPayments = useCallback(async () => {
    try {
      const data = await apiFetch<RecurringPayment[]>("/api/recurring");
      setPayments(data);
    } catch (error) {
      console.error("Error fetching recurring payments:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPayrollGroups = useCallback(async () => {
    try {
      const data = await apiFetch<PayrollGroup[]>("/api/payroll");
      setPayrollGroups(data);
    } catch (error) {
      console.error("Error fetching payroll groups:", error);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPayments().then(() => { if (cancelled) return; });
    fetchPayrollGroups().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchPayments, fetchPayrollGroups]);

  // Filter pending payments to only show current month (+ overdue from prev months)
  const currentMonthStr = getColombiaTodayString().substring(0, 7); // "YYYY-MM"
  const pendingPayments = payments
    .filter((p) => {
      if (p.status !== "pending") return false;
      const paymentMonth = getMonthKey(p.scheduledDate);
      // Show if: same month as current, or if scheduled date is in the past (overdue)
      return paymentMonth === currentMonthStr || new Date(p.scheduledDate) <= new Date();
    })
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  // Group confirmed payments by month (Colombia timezone)
  const confirmedPayments = payments.filter((p) => p.status === "confirmed" && p.confirmedDate);
  
  const confirmedByMonth: Record<string, RecurringPayment[]> = {};
  for (const p of confirmedPayments) {
    const monthKey = getMonthKey(p.confirmedDate!);
    if (!confirmedByMonth[monthKey]) confirmedByMonth[monthKey] = [];
    confirmedByMonth[monthKey].push(p);
  }

  // Sort months descending (most recent first) and only show current + previous month
  const currentMonthKey = getMonthKey(getColombiaTodayString());
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
  
  const visibleMonths = Object.keys(confirmedByMonth)
    .filter((mk) => mk === currentMonthKey || mk === prevMonthKey || confirmedByMonth[mk].length > 0)
    .sort((a, b) => b.localeCompare(a)); // descending

  // Confirmed months start collapsed — user can expand manually

  const totalPendingByType = {
    income: pendingPayments.filter((p) => p.type === "income"),
    expense: pendingPayments.filter((p) => p.type === "expense"),
    transfer: pendingPayments.filter((p) => p.type === "transfer"),
  };
  const totalPendingAmounts = {
    income: totalPendingByType.income.reduce((sum, p) => sum + p.amount, 0),
    expense: totalPendingByType.expense.reduce((sum, p) => sum + p.amount, 0),
    transfer: totalPendingByType.transfer.reduce((sum, p) => sum + p.amount, 0),
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths((prev) => ({ ...prev, [monthKey]: !prev[monthKey] }));
  };

  const handleConfirm = async (payment: RecurringPayment) => {
    if (showForm) {
      setShowForm(false);
      setEditingPayment(null);
    }
    setConfirmingId(payment.id);
    setConfirmActualAmount(payment.amount.toString());
    setConfirmError(null);
    setConfirmDestAccountId("");
    setConfirmDestSubAccountId("");
    setConfirmGoalLinkedAccounts([]);

    // If this is a savings goal transfer, fetch the linked accounts
    if (payment.category === "Ahorros" && payment.subCategory) {
      try {
        // Find the goal by name
        const goals = await apiFetch<Array<{ id: string; name: string; linkedAccounts: Array<{ accountId: string; subAccountId: string | null; account: { id: string; name: string }; subAccount: { id: string; name: string } | null }> }>>("/api/savings");
        const goal = goals.find((g) => g.name === payment.subCategory);
        if (goal) {
          const linked = goal.linkedAccounts.map((la) => ({
            accountId: la.account.id,
            subAccountId: la.subAccountId,
            accountName: la.account.name,
            subAccountName: la.subAccount?.name || null,
          }));
          setConfirmGoalLinkedAccounts(linked);
        }
      } catch (e) {
        console.error("Error fetching savings goal linked accounts:", e);
      }
    }

    setConfirmDialogOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!confirmingId) return;
    setConfirmLoading(true);
    setConfirmError(null);
    try {
      const actual = parseFloat(confirmActualAmount);
      const bodyData: Record<string, unknown> = {};
      if (!isNaN(actual) && actual > 0) {
        bodyData.actualAmount = actual;
      }
      // If savings goal transfer, send the selected destination
      if (confirmingPayment?.category === "Ahorros" && confirmDestAccountId) {
        bodyData.destinationAccountId = confirmDestAccountId;
        bodyData.destinationSubAccountId = confirmDestSubAccountId || null;
      }
      await apiFetch<{ success: boolean; confirmedAmount: number }>(`/api/recurring/${confirmingId}/confirm`, {
        method: "POST",
        body: JSON.stringify(bodyData),
      });
      setConfirmDialogOpen(false);
      setConfirmingId(null);
      setConfirmActualAmount("");
      setConfirmDestAccountId("");
      setConfirmDestSubAccountId("");
      setConfirmGoalLinkedAccounts([]);
      fetchPayments();
    } catch (error: any) {
      console.error("Error confirming payment:", error);
      setConfirmError(error?.message || "Error al confirmar el pago. Intenta de nuevo.");
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleDelete = async (id: string, scope: string = "single") => {
    setDeleteLoading(id);
    try {
      await apiFetch(`/api/recurring/${id}?scope=${scope}`, { method: "DELETE" });
      fetchPayments();
      fetchPayrollGroups();
    } catch (error) {
      console.error("Error deleting payment:", error);
    } finally {
      setDeleteLoading(null);
    }
  };

  const handleDeleteWithScope = (payment: RecurringPayment) => {
    if (payment.payrollGroupId && payment.isRecurring && payment.status === "pending") {
      setScopePayment(payment);
      setScopeAction("delete");
      setScopeDialogOpen(true);
    } else {
      handleDelete(payment.id);
    }
  };

  const handleReverse = async (id: string) => {
    setReverseLoading(id);
    try {
      await apiFetch(`/api/recurring/${id}/reverse`, { method: "POST" });
      fetchPayments();
    } catch (error) {
      console.error("Error reversing payment:", error);
    } finally {
      setReverseLoading(null);
    }
  };

  const handleEdit = (payment: RecurringPayment, scope: string = "single") => {
    if (scope === "series" && payment.payrollGroupId && payment.isRecurring && payment.status === "pending") {
      // Edit with series scope - open the payroll form with the group
      setEditingPayment(payment);
      setShowForm(true);
    } else {
      setEditingPayment(payment);
      setShowForm(true);
    }
  };

  const handleEditWithScope = (payment: RecurringPayment) => {
    if (payment.payrollGroupId && payment.isRecurring && payment.status === "pending") {
      setScopePayment(payment);
      setScopeAction("edit");
      setScopeDialogOpen(true);
    } else {
      handleEdit(payment);
    }
  };

  const confirmingPayment = payments.find((p) => p.id === confirmingId);

  // ---- Feature 1: Progress Bar computations ----
  const totalPendingAmount = pendingPayments.reduce((sum, p) => sum + p.amount, 0);

  // Confirmed payments for the current month only
  const currentMonthConfirmed = confirmedPayments.filter((p) => {
    if (!p.confirmedDate) return false;
    const mk = getMonthKey(p.confirmedDate);
    return mk === currentMonthStr;
  });

  const confirmedIncomeAmount = currentMonthConfirmed
    .filter((p) => p.type === "income")
    .reduce((sum, p) => sum + (p.actualAmount ?? p.amount), 0);
  const confirmedExpenseAmount = currentMonthConfirmed
    .filter((p) => p.type === "expense")
    .reduce((sum, p) => sum + (p.actualAmount ?? p.amount), 0);
  const confirmedTransferAmount = currentMonthConfirmed
    .filter((p) => p.type === "transfer")
    .reduce((sum, p) => sum + (p.actualAmount ?? p.amount), 0);
  const totalConfirmedAmount = confirmedIncomeAmount + confirmedExpenseAmount + confirmedTransferAmount;
  const totalAllAmount = totalPendingAmount + totalConfirmedAmount;
  const confirmedPercent = totalAllAmount > 0 ? Math.round((totalConfirmedAmount / totalAllAmount) * 100) : 0;

  // ---- Feature 2: Multi-select batch confirm ----
  const handleMultiConfirm = async () => {
    if (selectedIds.size === 0) return;
    setMultiConfirmLoading(true);
    try {
      const promises = Array.from(selectedIds).map((id) => {
        const payment = payments.find((p) => p.id === id);
        if (!payment) return Promise.resolve();
        return apiFetch<{ success: boolean }>(`/api/recurring/${id}/confirm`, {
          method: "POST",
          body: JSON.stringify({ actualAmount: payment.amount }),
        });
      });
      await Promise.all(promises);
      setSelectedIds(new Set());
      setMultiSelectMode(false);
      fetchPayments();
    } catch (error) {
      console.error("Error confirming multiple payments:", error);
    } finally {
      setMultiConfirmLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // ---- Feature 3: Calendar computations ----
  // All pending payments for the calendar month (not just current month)
  const calendarPendingPayments = useMemo(() => {
    return payments.filter((p) => {
      if (p.status !== "pending") return false;
      const datePart = p.scheduledDate.split("T")[0];
      const [y, m] = datePart.split("-").map(Number);
      return y === calendarYear && m === calendarMonth + 1;
    });
  }, [payments, calendarYear, calendarMonth]);

  // Map: day -> types present on that day
  const calendarDayTypes = useMemo(() => {
    const map: Record<number, Set<string>> = {};
    for (const p of calendarPendingPayments) {
      const datePart = p.scheduledDate.split("T")[0];
      const day = parseInt(datePart.split("-")[2], 10);
      if (!map[day]) map[day] = new Set();
      map[day].add(p.type);
    }
    return map;
  }, [calendarPendingPayments]);

  // Payments for the selected calendar day
  const selectedDayPayments = useMemo(() => {
    if (selectedCalendarDay === null) return [];
    return calendarPendingPayments.filter((p) => {
      const datePart = p.scheduledDate.split("T")[0];
      const day = parseInt(datePart.split("-")[2], 10);
      return day === selectedCalendarDay;
    });
  }, [calendarPendingPayments, selectedCalendarDay]);

  const calendarMonthLabel = new Date(calendarYear, calendarMonth, 1).toLocaleDateString("es-CO", {
    month: "long",
    year: "numeric",
  });

  const handlePrevMonth = () => {
    if (calendarMonth === 0) {
      setCalendarMonth(11);
      setCalendarYear((y) => y - 1);
    } else {
      setCalendarMonth((m) => m - 1);
    }
    setSelectedCalendarDay(null);
  };

  const handleNextMonth = () => {
    if (calendarMonth === 11) {
      setCalendarMonth(0);
      setCalendarYear((y) => y + 1);
    } else {
      setCalendarMonth((m) => m + 1);
    }
    setSelectedCalendarDay(null);
  };

  // Days in month and first day of week (Mon=0 ... Sun=6)
  const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
  const firstDayOfWeek = (() => {
    const jsDay = new Date(calendarYear, calendarMonth, 1).getDay(); // 0=Sun
    return jsDay === 0 ? 6 : jsDay - 1; // convert to Mon=0
  })();

  const calendarWeekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  // Render a confirmed payment card (reused in each month group)
  const renderConfirmedCard = (payment: RecurringPayment) => {
    const freq = frequencyConfig[payment.frequency] || frequencyConfig.one_time;
    const hasDiff =
      payment.actualAmount !== null &&
      payment.actualAmount !== payment.amount;
    const payType = typeConfig[payment.type] || typeConfig.expense;
    const TypeIcon = payType.icon;
    const isTransfer = payment.type === "transfer";
    const isIncome = payment.type === "income";

    return (
      <Card key={payment.id} className={`border-0 shadow-sm rounded-xl ${isTransfer ? "ring-1 ring-blue-200 dark:ring-blue-800" : isIncome ? "ring-1 ring-emerald-200 dark:ring-emerald-800" : ""}`}>
        <CardContent className="p-3">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <h4 className="font-medium text-sm text-gray-900 dark:text-white truncate">
                  {payment.description}
                </h4>
                <Badge
                  className={`${payType.bgClass} ${payType.color} text-[9px] border-0 px-1.5 py-0`}
                >
                  <TypeIcon className="size-2.5 mr-0.5" />
                  {payType.label}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                {isTransfer ? (
                  <>
                    {payment.account && (
                      <span className="flex items-center gap-1">
                        <Wallet className="size-3" />
                        {payment.account.name}
                      </span>
                    )}
                    <ArrowLeftRight className="size-3 text-blue-400" />
                    {payment.destinationAccount && (
                      <span className="flex items-center gap-1">
                        <Wallet className="size-3" />
                        {payment.destinationAccount.name}
                      </span>
                    )}
                  </>
                ) : isIncome ? (
                  <>
                    {payment.account && (
                      <span className="flex items-center gap-1">
                        <Wallet className="size-3" />
                        {payment.account.name}
                      </span>
                    )}
                    {payment.category && (
                      <>
                        <span>•</span>
                        <span>{payment.category}</span>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    {payment.account && (
                      <span className="flex items-center gap-1">
                        <Wallet className="size-3" />
                        {payment.account.name}
                      </span>
                    )}
                    {payment.debt && !payment.account && (
                      <span className="flex items-center gap-1">
                        <CreditCard className="size-3" />
                        {payment.debt.name}
                      </span>
                    )}
                    {payment.category && (
                      <>
                        <span>•</span>
                        <span>{payment.category}</span>
                      </>
                    )}
                  </>
                )}
              </div>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5 block">
                Programado: {formatDate(payment.scheduledDate)}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`font-bold text-sm ${
                isTransfer ? "text-blue-600 dark:text-blue-400" : isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-green-600 dark:text-green-400"
              }`}>
                {formatCurrency(payment.actualAmount ?? payment.amount)}
              </span>
              {hasDiff && (
                <span className="text-[9px] text-gray-400 line-through">
                  {formatCurrency(payment.amount)}
                </span>
              )}
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-gray-400 hover:text-amber-500"
                  onClick={() => handleReverse(payment.id)}
                  disabled={reverseLoading === payment.id}
                  title="Reversar pago"
                >
                  {reverseLoading === payment.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <RotateCcw className="size-3" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-gray-400 hover:text-red-500"
                  onClick={() => handleDelete(payment.id)}
                  disabled={deleteLoading === payment.id}
                  title="Eliminar"
                >
                  {deleteLoading === payment.id ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Trash2 className="size-3" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-24"
    >
      {/* Summary Cards by Type */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-3 gap-2">
          {/* Ingresos Card */}
          <Card className="border-0 shadow-md rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 text-white overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
            <CardContent className="p-3 relative z-10">
              <div className="flex items-center gap-1 mb-0.5">
                <TrendingUp className="size-3 text-emerald-200" />
                <span className="text-[10px] text-emerald-100">Ingresos</span>
              </div>
              <p className="text-base font-bold tracking-tight">
                {formatCurrency(totalPendingAmounts.income)}
              </p>
              <span className="text-[9px] text-emerald-200">
                {totalPendingByType.income.length} pendiente{totalPendingByType.income.length !== 1 ? "s" : ""}
              </span>
            </CardContent>
          </Card>

          {/* Gastos Card */}
          <Card className="border-0 shadow-md rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 text-white overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
            <CardContent className="p-3 relative z-10">
              <div className="flex items-center gap-1 mb-0.5">
                <CreditCard className="size-3 text-rose-200" />
                <span className="text-[10px] text-rose-100">Gastos</span>
              </div>
              <p className="text-base font-bold tracking-tight">
                {formatCurrency(totalPendingAmounts.expense)}
              </p>
              <span className="text-[9px] text-rose-200">
                {totalPendingByType.expense.length} pendiente{totalPendingByType.expense.length !== 1 ? "s" : ""}
              </span>
            </CardContent>
          </Card>

          {/* Transferencias Card */}
          <Card className="border-0 shadow-md rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white overflow-hidden relative">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
            <CardContent className="p-3 relative z-10">
              <div className="flex items-center gap-1 mb-0.5">
                <ArrowLeftRight className="size-3 text-blue-200" />
                <span className="text-[10px] text-blue-100">Transfer.</span>
              </div>
              <p className="text-base font-bold tracking-tight">
                {formatCurrency(totalPendingAmounts.transfer)}
              </p>
              <span className="text-[9px] text-blue-200">
                {totalPendingByType.transfer.length} pendiente{totalPendingByType.transfer.length !== 1 ? "s" : ""}
              </span>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      {/* Payroll Groups Section */}
      {payrollGroups.length > 0 && (
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="size-4 text-emerald-600" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Nóminas
            </h2>
          </div>
          <div className="space-y-2">
            {payrollGroups.map((pg) => {
              const freqLabels: Record<string, string> = { monthly: "Mensual", biweekly: "Quincenal", weekly: "Semanal" };
              const nextPayment = pg.recurringPayments?.[0];
              // Parse schedules for display
              let scheduleText = "";
              try {
                const scheds = JSON.parse(pg.schedules);
                if (pg.frequency === "monthly" && scheds[0]?.day) {
                  scheduleText = `Día ${scheds[0].day}`;
                } else if (pg.frequency === "biweekly" && scheds.length === 2) {
                  scheduleText = `Días ${scheds[0].day} y ${scheds[1].day}`;
                } else if (pg.frequency === "weekly" && scheds[0]?.dayOfWeek !== undefined) {
                  const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
                  scheduleText = `Cada ${dayNames[scheds[0].dayOfWeek]}`;
                }
              } catch {}

              return (
                <Card key={pg.id} className="border-0 shadow-md rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-sm text-emerald-800 dark:text-emerald-300">{pg.description}</h3>
                          <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[9px] border-0 px-1.5 py-0">
                            {freqLabels[pg.frequency] || pg.frequency}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                          {scheduleText && (
                            <p>{scheduleText}</p>
                          )}
                          {pg.account && (
                            <p>Cuenta: {pg.account.name}{pg.subAccount ? ` / ${pg.subAccount.name}` : ""}</p>
                          )}
                          {pg.category && (
                            <p>Categoría: {pg.category}{pg.subCategory ? ` / ${pg.subCategory}` : ""}</p>
                          )}
                          {nextPayment && (
                            <p>Próximo pago: {formatDate(nextPayment.scheduledDate)}</p>
                          )}
                          {pg.adjustToBusinessDay && (
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400">
                              Ajuste: día hábil {pg.businessDayDirection === "before" ? "anterior" : "siguiente"} (Ley Emiliani)
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className="text-lg font-bold text-emerald-600">
                          {formatCurrency(pg.totalAmount)}
                          <span className="text-[10px] font-normal text-emerald-500 ml-0.5">/mes</span>
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-blue-500"
                            onClick={() => {
                              setEditingPayrollGroup(pg);
                              setShowPayrollForm(true);
                            }}
                            title="Editar nómina"
                          >
                            <Pencil className="size-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                            onClick={async () => {
                              if (confirm("¿Eliminar esta nómina? Se eliminarán todos los pagos futuros pendientes.")) {
                                try {
                                  await apiFetch(`/api/payroll/${pg.id}`, { method: "DELETE" });
                                  fetchPayrollGroups();
                                  fetchPayments();
                                } catch (e) {
                                  console.error("Error deleting payroll group:", e);
                                }
                              }
                            }}
                            title="Eliminar nómina"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Upcoming Payments Section */}
      {pendingPayments.length > 0 && (
        <motion.div variants={itemVariants}>
          {/* Header with title, view toggle, and multi-select toggle */}
          <div className="flex items-center gap-2 mb-3">
            <CalendarClock className="size-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Próximos Pagos
            </h2>
            <Badge
              variant="secondary"
              className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
            >
              {pendingPayments.length}
            </Badge>

            {/* View Mode Toggle: Lista / Calendario */}
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                className={`h-6 px-2 text-[10px] rounded-lg ${viewMode === "list" ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400" : "text-gray-400"}`}
                onClick={() => setViewMode("list")}
              >
                <LayoutList className="size-3 mr-0.5" />
                Lista
              </Button>
              <Button
                variant={viewMode === "calendar" ? "default" : "ghost"}
                size="sm"
                className={`h-6 px-2 text-[10px] rounded-lg ${viewMode === "calendar" ? "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400" : "text-gray-400"}`}
                onClick={() => setViewMode("calendar")}
              >
                <CalendarDays className="size-3 mr-0.5" />
                Calendario
              </Button>
            </div>

            {/* Multi-select Toggle */}
            {viewMode === "list" && (
              <Button
                variant={multiSelectMode ? "default" : "ghost"}
                size="sm"
                className={`h-6 px-2 text-[10px] rounded-lg ${
                  multiSelectMode
                    ? "bg-amber-500 text-white hover:bg-amber-600"
                    : "text-gray-400 hover:text-amber-600"
                }`}
                onClick={() => {
                  setMultiSelectMode(!multiSelectMode);
                  setSelectedIds(new Set());
                }}
              >
                {multiSelectMode ? (
                  <>
                    <X className="size-3 mr-0.5" />
                    Cancelar
                  </>
                ) : (
                  <>
                    <CheckSquare className="size-3 mr-0.5" />
                    Seleccionar
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Feature 1: Progress Bar */}
          {totalAllAmount > 0 && (
            <div className="mb-3">
              <div className="h-3 rounded-full overflow-hidden bg-gray-200 dark:bg-gray-700 flex">
                {confirmedIncomeAmount > 0 && (
                  <div
                    style={{ width: `${(confirmedIncomeAmount / totalAllAmount) * 100}%`, background: "linear-gradient(to right, #10b981, #14b8a6)" }}
                    className="h-full first:rounded-l-full"
                  />
                )}
                {confirmedExpenseAmount > 0 && (
                  <div
                    style={{ width: `${(confirmedExpenseAmount / totalAllAmount) * 100}%`, background: "linear-gradient(to right, #e11d48, #f43f5e)" }}
                    className="h-full"
                  />
                )}
                {confirmedTransferAmount > 0 && (
                  <div
                    style={{ width: `${(confirmedTransferAmount / totalAllAmount) * 100}%`, background: "linear-gradient(to right, #3b82f6, #06b6d4)" }}
                    className="h-full"
                  />
                )}
                {totalPendingAmount > 0 && (
                  <div
                    style={{ width: `${(totalPendingAmount / totalAllAmount) * 100}%`, background: "#e5e7eb" }}
                    className="h-full last:rounded-r-full dark:bg-gray-600"
                  />
                )}
              </div>
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[10px] text-gray-500 dark:text-gray-400">
                  {formatCurrency(totalConfirmedAmount)} de {formatCurrency(totalAllAmount)} confirmados ({confirmedPercent}%)
                </p>
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-0.5">
                    <span className="inline-block size-2 rounded-full" style={{ background: "#10b981" }} />
                    <span className="text-[8px] text-gray-400">Ingreso</span>
                  </span>
                  <span className="flex items-center gap-0.5">
                    <span className="inline-block size-2 rounded-full" style={{ background: "#e11d48" }} />
                    <span className="text-[8px] text-gray-400">Gasto</span>
                  </span>
                  <span className="flex items-center gap-0.5">
                    <span className="inline-block size-2 rounded-full" style={{ background: "#3b82f6" }} />
                    <span className="text-[8px] text-gray-400">Transf.</span>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Feature 3: Calendar View */}
          {viewMode === "calendar" && (
            <div className="space-y-3">
              {/* Calendar navigation */}
              <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handlePrevMonth}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">
                  {calendarMonthLabel}
                </span>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleNextMonth}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-0.5">
                {/* Week day headers */}
                {calendarWeekDays.map((wd) => (
                  <div key={wd} className="text-center text-[9px] font-medium text-gray-400 dark:text-gray-500 py-1">
                    {wd}
                  </div>
                ))}

                {/* Empty cells before first day */}
                {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}

                {/* Day cells */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const types = calendarDayTypes[day];
                  const hasPayments = !!types && types.size > 0;
                  const isSelected = selectedCalendarDay === day;
                  const isToday =
                    calendarYear === new Date().getFullYear() &&
                    calendarMonth === new Date().getMonth() &&
                    day === new Date().getDate();

                  return (
                    <button
                      key={day}
                      className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs relative transition-all ${
                        isSelected
                          ? "bg-amber-100 dark:bg-amber-900/30 ring-1 ring-amber-400"
                          : hasPayments
                          ? "hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                          : "text-gray-300 dark:text-gray-600"
                      } ${isToday ? "font-bold text-amber-600 dark:text-amber-400" : ""}`}
                      onClick={() => {
                        if (hasPayments) {
                          setSelectedCalendarDay(selectedCalendarDay === day ? null : day);
                        }
                      }}
                    >
                      <span className={`${hasPayments ? "text-gray-700 dark:text-gray-200" : ""}`}>
                        {day}
                      </span>
                      {hasPayments && (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {types.has("income") && (
                            <span className="inline-block size-1.5 rounded-full" style={{ background: "#10b981" }} />
                          )}
                          {types.has("expense") && (
                            <span className="inline-block size-1.5 rounded-full" style={{ background: "#e11d48" }} />
                          )}
                          {types.has("transfer") && (
                            <span className="inline-block size-1.5 rounded-full" style={{ background: "#3b82f6" }} />
                          )}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Selected day payments */}
              <AnimatePresence>
                {selectedCalendarDay !== null && selectedDayPayments.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-2 overflow-hidden"
                  >
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      Pagos del {selectedCalendarDay} de {calendarMonthLabel}
                    </p>
                    {selectedDayPayments.map((payment) => {
                      const payType = typeConfig[payment.type] || typeConfig.expense;
                      const TypeIcon = payType.icon;
                      const isTransfer = payment.type === "transfer";
                      const isIncome = payment.type === "income";

                      return (
                        <Card key={payment.id} className={`border-0 shadow-sm rounded-xl ${isTransfer ? "ring-1 ring-blue-200 dark:ring-blue-800" : isIncome ? "ring-1 ring-emerald-200 dark:ring-emerald-800" : ""}`}>
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge className={`${payType.bgClass} ${payType.color} text-[9px] border-0 px-1.5 py-0`}>
                                  <TypeIcon className="size-2.5 mr-0.5" />
                                  {payType.label}
                                </Badge>
                                <span className="text-xs font-medium text-gray-900 dark:text-white truncate">
                                  {payment.description}
                                </span>
                              </div>
                              <span className={`text-xs font-bold ${
                                isTransfer ? "text-blue-600 dark:text-blue-400" : isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-white"
                              }`}>
                                {formatCurrency(payment.amount)}
                              </span>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Feature 2 & Original: List View with multi-select */}
          {viewMode === "list" && (
            <div className="space-y-3">
              <AnimatePresence>
                {pendingPayments.map((payment) => {
                  const daysUntil = getDaysUntil(payment.scheduledDate);
                  const freq = frequencyConfig[payment.frequency] || frequencyConfig.one_time;
                  const daysLabel = getDaysLabel(daysUntil);
                  const isOverdue = daysUntil < 0;
                  const payType = typeConfig[payment.type] || typeConfig.expense;
                  const TypeIcon = payType.icon;
                  const isTransfer = payment.type === "transfer";
                  const isIncome = payment.type === "income";
                  const isSelected = selectedIds.has(payment.id);

                  return (
                    <motion.div
                      key={payment.id}
                      variants={itemVariants}
                      initial="hidden"
                      animate="show"
                      exit={{ opacity: 0, x: -20 }}
                      layout
                    >
                      <Card
                        className={`border-0 shadow-md rounded-2xl ${
                          multiSelectMode && isSelected
                            ? "ring-2 ring-amber-400 dark:ring-amber-500"
                            : isTransfer
                            ? "ring-1 ring-blue-200 dark:ring-blue-800"
                            : isIncome
                            ? "ring-1 ring-emerald-200 dark:ring-emerald-800"
                            : ""
                        }`}
                        onClick={multiSelectMode ? () => toggleSelection(payment.id) : undefined}
                        style={{ cursor: multiSelectMode ? "pointer" : undefined }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            {/* Multi-select checkbox */}
                            {multiSelectMode && (
                              <div className="mr-2 mt-0.5 flex-shrink-0">
                                {isSelected ? (
                                  <CheckSquare className="size-5 text-amber-500" />
                                ) : (
                                  <Square className="size-5 text-gray-300 dark:text-gray-600" />
                                )}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <h3 className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                                  {payment.description}
                                </h3>
                                <Badge
                                  className={`${payType.bgClass} ${payType.color} text-[10px] border-0 px-1.5 py-0`}
                                >
                                  <TypeIcon className="size-2.5 mr-0.5" />
                                  {payType.label}
                                </Badge>
                                <Badge
                                  className={`${freq.bgClass} ${freq.color} text-[10px] border-0 px-1.5 py-0`}
                                >
                                  {freq.label}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                                {isTransfer ? (
                                  <>
                                    {payment.account && (
                                      <span className="flex items-center gap-1">
                                        <Wallet className="size-3" />
                                        {payment.account.name}
                                      </span>
                                    )}
                                    <ArrowLeftRight className="size-3 text-blue-400" />
                                    {payment.destinationAccount && (
                                      <span className="flex items-center gap-1">
                                        <Wallet className="size-3" />
                                        {payment.destinationAccount.name}
                                      </span>
                                    )}
                                  </>
                                ) : isIncome ? (
                                  <>
                                    {payment.account && (
                                      <span className="flex items-center gap-1">
                                        <Wallet className="size-3" />
                                        {payment.account.name}
                                      </span>
                                    )}
                                    {payment.category && (
                                      <>
                                        <span>•</span>
                                        <span>{payment.category}</span>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  <>
                                    {payment.account && (
                                      <span className="flex items-center gap-1">
                                        <Wallet className="size-3" />
                                        {payment.account.name}
                                      </span>
                                    )}
                                    {payment.debt && !payment.account && (
                                      <span className="flex items-center gap-1">
                                        <CreditCard className="size-3" />
                                        {payment.debt.name}
                                      </span>
                                    )}
                                    {payment.category && (
                                      <>
                                        <span>•</span>
                                        <span>{payment.category}</span>
                                      </>
                                    )}
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                  {formatDate(payment.scheduledDate)}
                                </span>
                                <span
                                  className={`text-[10px] font-medium ${
                                    isOverdue
                                      ? "text-red-500"
                                      : daysUntil <= 3
                                      ? "text-amber-500"
                                      : "text-gray-400"
                                  }`}
                                >
                                  {daysLabel}
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className={`font-bold text-base ${
                                isTransfer ? "text-blue-600 dark:text-blue-400" : isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-gray-900 dark:text-white"
                              }`}>
                                {formatCurrency(payment.amount)}
                              </span>
                              {!multiSelectMode && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-gray-400 hover:text-blue-500"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleEditWithScope(payment);
                                    }}
                                    title="Editar"
                                  >
                                    <Pencil className="size-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteWithScope(payment);
                                    }}
                                    disabled={deleteLoading === payment.id}
                                    title="Eliminar"
                                  >
                                    {deleteLoading === payment.id ? (
                                      <Loader2 className="size-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="size-3" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    style={{
                                      background: isTransfer
                                        ? "linear-gradient(to right, #3b82f6, #06b6d4)"
                                        : isIncome
                                        ? "linear-gradient(to right, #10b981, #14b8a6)"
                                        : "linear-gradient(to right, #e11d48, #f43f5e)",
                                    }}
                                    className="rounded-xl text-white text-xs h-7 px-3"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleConfirm(payment);
                                    }}
                                  >
                                    <CheckCircle2 className="size-3 mr-1" />
                                    Confirmar
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </motion.div>
      )}

      {/* Feature 2: Floating multi-confirm action bar */}
      <AnimatePresence>
        {multiSelectMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed bottom-24 left-4 right-4 z-50"
          >
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  {selectedIds.size} pago{selectedIds.size !== 1 ? "s" : ""} seleccionado{selectedIds.size !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Total: {formatCurrency(
                    Array.from(selectedIds).reduce((sum, id) => {
                      const p = payments.find((pay) => pay.id === id);
                      return sum + (p?.amount ?? 0);
                    }, 0)
                  )}
                </p>
              </div>
              <Button
                style={{ background: "linear-gradient(to right, #f59e0b, #f97316)" }}
                className="rounded-xl text-white text-xs h-9 px-4"
                onClick={handleMultiConfirm}
                disabled={multiConfirmLoading}
              >
                {multiConfirmLoading ? (
                  <Loader2 className="size-4 animate-spin mr-1" />
                ) : (
                  <CheckCircle2 className="size-4 mr-1" />
                )}
                Confirmar {selectedIds.size} pago{selectedIds.size !== 1 ? "s" : ""}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Confirmed Payments - Accordion by Month */}
      {confirmedPayments.length > 0 && (
        <motion.div variants={itemVariants}>
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="size-4 text-green-600" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
              Pagos Confirmados
            </h2>
            <Badge
              variant="secondary"
              className="ml-auto text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
            >
              {confirmedPayments.length}
            </Badge>
          </div>

          <div className="space-y-2">
            {visibleMonths.map((monthKey) => {
              const monthPayments = confirmedByMonth[monthKey] || [];
              const isExpanded = expandedMonths[monthKey] ?? false;
              const monthTotal = monthPayments.reduce(
                (sum, p) => sum + (p.actualAmount ?? p.amount),
                0
              );
              const isCurrentMonth = monthKey === currentMonthKey;

              return (
                <div key={monthKey} className="space-y-1">
                  {/* Month Header - Clickable to expand */}
                  <Card
                    className={`border-0 shadow-sm rounded-xl cursor-pointer transition-all ${
                      isCurrentMonth
                        ? "bg-green-50 dark:bg-green-900/20"
                        : "bg-gray-50 dark:bg-gray-800/50"
                    }`}
                    onClick={() => toggleMonth(monthKey)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {isExpanded ? (
                            <ChevronDown className="size-4 text-gray-500" />
                          ) : (
                            <ChevronRight className="size-4 text-gray-500" />
                          )}
                          <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white capitalize">
                              {getMonthLabel(monthKey)}
                            </p>
                            <p className="text-[10px] text-gray-500">
                              {monthPayments.length} pago{monthPayments.length !== 1 ? "s" : ""} confirmado{monthPayments.length !== 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-green-600 dark:text-green-400">
                          {formatCurrency(monthTotal)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Expanded payments for this month */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="space-y-1.5 overflow-hidden"
                      >
                        {monthPayments
                          .sort((a, b) => new Date(b.confirmedDate!).getTime() - new Date(a.confirmedDate!).getTime())
                          .map((payment) => renderConfirmedCard(payment))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Empty State */}
      {payments.length === 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20">
            <CardContent className="p-8 text-center">
              <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 shadow-lg mb-4">
                <Repeat className="size-7 text-white" />
              </div>
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">
                Sin pagos recurrentes
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Configura tus pagos recurrentes para llevar un mejor control de
                tus gastos fijos, transferencias e ingresos
              </p>
              <Button
                onClick={() => {
                  setEditingPayment(null);
                  setShowForm(true);
                }}
                className="rounded-xl bg-gradient-to-r from-amber-600 to-orange-500"
              >
                <Plus className="size-4 mr-1" />
                Crear Pago Recurrente
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* FAB - Two buttons */}
      <motion.div
        className="fixed bottom-24 right-4 z-40 flex flex-col gap-2"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3, type: "spring" }}
      >
        <Button
          onClick={() => {
            setEditingPayrollGroup(null);
            setShowPayrollForm(true);
          }}
          className="size-12 rounded-full bg-gradient-to-br from-emerald-600 to-teal-500 shadow-lg shadow-emerald-500/30"
          size="icon"
          title="Asistente de Nómina"
        >
          <Briefcase className="size-5 text-white" />
        </Button>
        <Button
          onClick={() => {
            setEditingPayment(null);
            setShowForm(true);
          }}
          className="size-12 rounded-full bg-gradient-to-br from-amber-600 to-orange-500 shadow-lg shadow-amber-500/30"
          size="icon"
          title="Nuevo Pago Recurrente"
        >
          <Plus className="size-5 text-white" />
        </Button>
      </motion.div>

      {/* Recurring Form Dialog */}
      <RecurringForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setEditingPayment(null);
        }}
        onSuccess={fetchPayments}
        editingPayment={editingPayment as any}
      />

      {/* Scope Dialog - Edit/Delete Series vs Single */}
      <Dialog open={scopeDialogOpen} onOpenChange={setScopeDialogOpen}>
        <DialogContent className="sm:max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {scopeAction === "delete" ? (
                <Trash2 className="size-5 text-red-500" />
              ) : (
                <Pencil className="size-5 text-blue-500" />
              )}
              {scopeAction === "delete" ? "Eliminar pago recurrente" : "Editar pago recurrente"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Este pago pertenece a la nómina <strong>"{scopePayment?.description}"</strong>. ¿Qué deseas hacer?
            </p>
            <div className="space-y-2">
              {scopeAction === "delete" ? (
                <>
                  <Button
                    variant="outline"
                    className="w-full justify-start rounded-xl h-auto py-3"
                    onClick={async () => {
                      setScopeLoading(true);
                      await handleDelete(scopePayment!.id, "single");
                      setScopeLoading(false);
                      setScopeDialogOpen(false);
                    }}
                    disabled={scopeLoading}
                  >
                    <div className="text-left">
                      <p className="font-medium text-sm">Solo este evento</p>
                      <p className="text-[10px] text-gray-400">Elimina solo este pago pendiente</p>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start rounded-xl h-auto py-3 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20"
                    onClick={async () => {
                      setScopeLoading(true);
                      await handleDelete(scopePayment!.id, "series");
                      setScopeLoading(false);
                      setScopeDialogOpen(false);
                    }}
                    disabled={scopeLoading}
                  >
                    <div className="text-left">
                      <p className="font-medium text-sm text-red-600 dark:text-red-400">Toda la serie futura</p>
                      <p className="text-[10px] text-gray-400">Elimina este y todos los pagos futuros de esta nómina</p>
                    </div>
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="w-full justify-start rounded-xl h-auto py-3"
                    onClick={() => {
                      setScopeDialogOpen(false);
                      handleEdit(scopePayment!, "single");
                    }}
                    disabled={scopeLoading}
                  >
                    <div className="text-left">
                      <p className="font-medium text-sm">Solo este evento</p>
                      <p className="text-[10px] text-gray-400">Edita solo este pago, los demás no cambian</p>
                    </div>
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-start rounded-xl h-auto py-3 border-blue-200 hover:bg-blue-50 dark:border-blue-800 dark:hover:bg-blue-900/20"
                    onClick={() => {
                      setScopeDialogOpen(false);
                      handleEdit(scopePayment!, "series");
                    }}
                    disabled={scopeLoading}
                  >
                    <div className="text-left">
                      <p className="font-medium text-sm text-blue-600 dark:text-blue-400">Toda la serie futura</p>
                      <p className="text-[10px] text-gray-400">Aplica los cambios a todos los pagos futuros de esta nómina</p>
                    </div>
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payroll Form Dialog */}
      <PayrollForm
        open={showPayrollForm}
        onOpenChange={(open) => {
          setShowPayrollForm(open);
          if (!open) setEditingPayrollGroup(null);
        }}
        onSuccess={() => { fetchPayments(); fetchPayrollGroups(); }}
        editingGroup={editingPayrollGroup}
      />

      {/* Confirm Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              {confirmingPayment?.type === "transfer"
                ? "Confirmar Transferencia"
                : confirmingPayment?.type === "income"
                ? "Confirmar Ingreso"
                : "Confirmar Pago"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className={`p-3 rounded-xl ${
              confirmingPayment?.type === "transfer"
                ? "bg-blue-50 dark:bg-blue-900/20"
                : confirmingPayment?.type === "income"
                ? "bg-emerald-50 dark:bg-emerald-900/20"
                : "bg-amber-50 dark:bg-amber-900/20"
            }`}>
              <p className={`text-xs mb-1 ${
                confirmingPayment?.type === "transfer"
                  ? "text-blue-600 dark:text-blue-400"
                  : confirmingPayment?.type === "income"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-amber-600 dark:text-amber-400"
              }`}>
                Monto esperado
              </p>
              <p className="font-bold text-lg text-gray-900 dark:text-white">
                {formatCurrency(confirmingPayment?.amount ?? 0)}
              </p>
              {confirmingPayment?.type === "transfer" && confirmingPayment.account && confirmingPayment.destinationAccount && (
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span>{confirmingPayment.account.name}</span>
                  <ArrowLeftRight className="size-3" />
                  <span>{confirmingPayment.destinationAccount.name}</span>
                </div>
              )}
              {confirmingPayment?.type === "income" && confirmingPayment.account && (
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <Wallet className="size-3" />
                  <span>Hacia: {confirmingPayment.account.name}</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Monto actual (opcional)</Label>
              <CurrencyInput
                value={confirmActualAmount}
                onChange={setConfirmActualAmount}
                showPrefix
                placeholder="Monto real del pago"
                className="rounded-xl"
              />
              <p className="text-[10px] text-gray-400">
                Si el monto real difiere del esperado, ingrésalo aquí
              </p>
            </div>

            {/* Savings Goal Destination Selector */}
            {confirmingPayment?.category === "Ahorros" && confirmGoalLinkedAccounts.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-purple-600 dark:text-purple-400">
                  ¿A qué cuenta enlazada?
                </Label>
                <div className="space-y-1.5">
                  {confirmGoalLinkedAccounts.map((la) => {
                    const radioValue = la.subAccountId
                      ? `sub-${la.subAccountId}`
                      : la.accountId;
                    return (
                      <label
                        key={radioValue}
                        className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-all border ${
                          (la.subAccountId ? confirmDestSubAccountId === la.subAccountId : confirmDestAccountId === la.accountId && !confirmDestSubAccountId)
                            ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-300"
                            : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="destAccount"
                          value={radioValue}
                          checked={la.subAccountId ? confirmDestSubAccountId === la.subAccountId : confirmDestAccountId === la.accountId && !confirmDestSubAccountId}
                          onChange={() => {
                            if (la.subAccountId) {
                              setConfirmDestAccountId(la.accountId);
                              setConfirmDestSubAccountId(la.subAccountId);
                            } else {
                              setConfirmDestAccountId(la.accountId);
                              setConfirmDestSubAccountId("");
                            }
                          }}
                          className="accent-purple-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-900 dark:text-white truncate">
                            {la.subAccountName ? `${la.accountName} → ${la.subAccountName}` : la.accountName}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {confirmError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-xs text-red-600 dark:text-red-400">
                  {confirmError}
                </p>
              </div>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setConfirmDialogOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                style={{
                  background: confirmingPayment?.type === "transfer"
                    ? "linear-gradient(to right, #3b82f6, #06b6d4)"
                    : confirmingPayment?.type === "income"
                    ? "linear-gradient(to right, #10b981, #14b8a6)"
                    : "linear-gradient(to right, #e11d48, #f43f5e)",
                }}
                className="flex-1 rounded-xl text-white"
                onClick={handleConfirmSubmit}
                disabled={confirmLoading}
              >
                {confirmLoading ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <CheckCircle2 className="size-4 mr-2" />
                )}
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
