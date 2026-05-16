"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Wallet,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  ChevronRight,
  Calendar,
  PiggyBank,
  Receipt,
  LayoutDashboard,
} from "lucide-react";
import { useAppStore } from "@/lib/store";
import { formatCurrency, apiFetch, getColombiaNow } from "@/lib/api";
import { motion } from "framer-motion";
import type { Account, SubAccount, Budget, Debt } from "@/lib/types";

// ============================================================
// ANIMATION VARIANTS
// ============================================================

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

// ============================================================
// MAIN DASHBOARD COMPONENT
// ============================================================

export function DashboardPage() {
  const { setActiveModule, setFinanceSubView } = useAppStore();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    try {
      const [accs, bdgs, dbts] = await Promise.allSettled([
        apiFetch<Account[]>("/api/accounts"),
        apiFetch<Budget[]>("/api/budgets"),
        apiFetch<Debt[]>("/api/debts"),
      ]);

      if (!mountedRef.current) return;
      if (accs.status === "fulfilled") setAccounts(accs.value);
      if (bdgs.status === "fulfilled") setBudgets(bdgs.value);
      if (dbts.status === "fulfilled") setDebts(dbts.value);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchData();
    return () => {
      mountedRef.current = false;
    };
  }, [fetchData]);

  // ============================================================
  // COMPUTED VALUES
  // ============================================================

  const totalAccountBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalSubAccountBalance = accounts.reduce(
    (sum, a) => sum + (a.subAccounts || []).reduce((s, sa) => s + sa.balance, 0),
    0
  );
  const totalBalance = totalAccountBalance + totalSubAccountBalance;

  const incomeBudgets = budgets.filter((b) => b.type === "income");
  const expenseBudgets = budgets.filter((b) => b.type === "expense");
  const monthlyIncome = incomeBudgets.reduce((sum, b) => sum + b.spent, 0);
  const monthlyExpenses = expenseBudgets.reduce((sum, b) => sum + b.spent, 0);
  const totalExpenseBudget = expenseBudgets.reduce((sum, b) => sum + b.amount, 0);
  const totalIncomeBudget = incomeBudgets.reduce((sum, b) => sum + b.amount, 0);
  const budgetPercentage = totalExpenseBudget > 0
    ? Math.round((monthlyExpenses / totalExpenseBudget) * 100)
    : 0;

  const activeDebts = debts.filter((d) => d.currentBalance > 0);
  const totalMonthlyDebtPayments = activeDebts.reduce(
    (sum, d) => sum + (d.monthlyPayment || 0),
    0
  );
  const debtPercentage = totalIncomeBudget > 0
    ? Math.round((totalMonthlyDebtPayments / totalIncomeBudget) * 100)
    : 0;

  const savingsBudgetEntries = expenseBudgets.filter((b) => b.category === "Ahorros");
  const savingsBudgetAmount = savingsBudgetEntries.reduce((sum, b) => sum + b.amount, 0);
  const savingsPercentage = totalIncomeBudget > 0
    ? Math.round((savingsBudgetAmount / totalIncomeBudget) * 100)
    : 0;

  // Upcoming bills from debts
  const upcomingBills = activeDebts
    .slice(0, 3)
    .map((d) => ({
      id: d.id,
      name: d.name,
      amount: d.monthlyPayment || d.currentBalance,
      dueDate: d.paymentDate ? `Día ${d.paymentDate}` : "Próximo",
    }));

  // ============================================================
  // NAVIGATION HELPER
  // ============================================================

  const goToFinanceOverview = () => {
    setActiveModule("finance");
    setFinanceSubView("overview");
  };

  // ============================================================
  // LOADING STATE
  // ============================================================

  if (loading) {
    return (
      <div className="p-4 space-y-4 pb-24">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-32 bg-gray-200 dark:bg-gray-700 rounded-lg" />
          <div className="h-40 bg-gradient-to-br from-emerald-600/20 to-teal-500/20 rounded-2xl" />
          <div className="grid grid-cols-3 gap-3">
            <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
            <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
            <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          </div>
          <div className="h-24 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
          <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded-2xl" />
        </div>
      </div>
    );
  }

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-4 space-y-4 pb-24"
    >
      {/* ============================================================ */}
      {/* HEADER */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants}>
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          ¡Hola! 👋
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Aquí está tu resumen financiero
        </p>
      </motion.div>

      {/* ============================================================ */}
      {/* BALANCE CARD */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="size-4 text-emerald-200" />
              <span className="text-sm text-emerald-100">Balance Total</span>
            </div>
            <p className="text-3xl font-bold tracking-tight">
              {formatCurrency(totalBalance)}
            </p>
            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <div className="size-6 rounded-full bg-white/20 flex items-center justify-center">
                  <ArrowUpRight className="size-3.5 text-emerald-200" />
                </div>
                <div>
                  <p className="text-[10px] text-emerald-200">Ingresos</p>
                  <p className="text-sm font-semibold">
                    {formatCurrency(monthlyIncome)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="size-6 rounded-full bg-white/20 flex items-center justify-center">
                  <ArrowDownRight className="size-3.5 text-rose-200" />
                </div>
                <div>
                  <p className="text-[10px] text-emerald-200">Gastos</p>
                  <p className="text-sm font-semibold">
                    {formatCurrency(monthlyExpenses)}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ============================================================ */}
      {/* QUICK STATS */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants} className="grid grid-cols-3 gap-3">
        <Card
          className="border-0 shadow-sm rounded-2xl cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setActiveModule("finance");
            setFinanceSubView("budgets");
          }}
        >
          <CardContent className="p-3 text-center">
            <Receipt className="size-5 text-amber-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {budgetPercentage}%
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Presupuesto</p>
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm rounded-2xl cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setActiveModule("finance");
            setFinanceSubView("debts");
          }}
        >
          <CardContent className="p-3 text-center">
            <CreditCard className="size-5 text-rose-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {debtPercentage}%
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Deudas</p>
          </CardContent>
        </Card>
        <Card
          className="border-0 shadow-sm rounded-2xl cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => {
            setActiveModule("finance");
            setFinanceSubView("savings");
          }}
        >
          <CardContent className="p-3 text-center">
            <PiggyBank className="size-5 text-emerald-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {savingsPercentage}%
            </p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Ahorros</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* ============================================================ */}
      {/* RESUMEN FINANCIERO CTA CARD */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants}>
        <Card
          className="border-0 shadow-md rounded-2xl cursor-pointer hover:shadow-lg transition-all overflow-hidden"
          onClick={goToFinanceOverview}
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="size-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center flex-shrink-0">
                <LayoutDashboard className="size-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Resumen Financiero
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Ve tu resumen financiero completo con gráficos y proyecciones
                </p>
              </div>
              <ChevronRight className="size-5 text-gray-400 flex-shrink-0" />
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ============================================================ */}
      {/* UPCOMING BILLS */}
      {/* ============================================================ */}
      {upcomingBills.length > 0 && (
        <motion.div variants={itemVariants}>
          <Card className="border-0 shadow-md rounded-2xl">
            <div className="pb-2 pt-4 px-5">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="size-4 text-rose-500" />
                Próximos Pagos
              </h3>
            </div>
            <CardContent className="px-5 pb-4">
              <div className="space-y-3">
                {upcomingBills.map((bill) => (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between p-3 bg-rose-50/60 dark:bg-rose-900/10 rounded-xl cursor-pointer"
                    onClick={() => {
                      setActiveModule("finance");
                      setFinanceSubView("debts");
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="size-9 rounded-xl bg-gradient-to-br from-rose-400 to-pink-400 flex items-center justify-center">
                        <CreditCard className="size-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {bill.name}
                        </p>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">
                          Vence: {bill.dueDate}
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                      {formatCurrency(bill.amount)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ============================================================ */}
      {/* QUICK ACTIONS */}
      {/* ============================================================ */}
      <motion.div variants={itemVariants}>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-dashed border-emerald-300 dark:border-emerald-700 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:border-emerald-400"
            onClick={() => {
              setActiveModule("finance");
              setFinanceSubView("accounts");
            }}
          >
            <ArrowUpRight className="size-4 mr-1" />
            Ingreso
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-dashed border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:border-rose-400"
            onClick={() => {
              setActiveModule("finance");
              setFinanceSubView("accounts");
            }}
          >
            <ArrowDownRight className="size-4 mr-1" />
            Gasto
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-xl border-dashed border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-400"
            onClick={() => {
              setActiveModule("finance");
              setFinanceSubView("budgets");
            }}
          >
            <Receipt className="size-4 mr-1" />
            Presupuesto
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}
