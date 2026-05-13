"use client";

import { useState, useEffect, useCallback } from "react";
import { apiFetch, formatCurrency } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { DebtCard } from "./debt-card";
import { DebtForm } from "./debt-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, CreditCard, Landmark } from "lucide-react";
import { motion } from "framer-motion";
import type { Debt, Installment } from "@/lib/types";

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
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDebtForm, setShowDebtForm] = useState(false);

  const fetchDebts = useCallback(async () => {
    try {
      const data = await apiFetch<Debt[]>("/api/debts");
      setDebts(data);
    } catch (error) {
      console.error("Error fetching debts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchDebts().then(() => { if (cancelled) return; });
    return () => { cancelled = true; };
  }, [fetchDebts]);

  const totalDebt = debts.reduce((sum, d) => sum + d.currentBalance, 0);
  const totalCredit = debts
    .filter((d) => d.type === "credit_card")
    .reduce((sum, d) => sum + d.totalAmount, 0);
  const totalUsed = debts
    .filter((d) => d.type === "credit_card")
    .reduce((sum, d) => sum + d.currentBalance, 0);

  const handleDebtClick = (debtId: string) => {
    sessionStorage.setItem("selectedDebtId", debtId);
    setFinanceSubView("debt-detail");
  };

  if (loading) {
    return (
      <div className="p-4 space-y-3 pb-24">
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
      className="p-4 space-y-4 pb-24"
    >
      {/* Total Debt Header */}
      <motion.div variants={itemVariants}>
        <Card className="border-0 shadow-lg rounded-2xl bg-gradient-to-br from-rose-500 to-pink-500 text-white overflow-hidden relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_50%,rgba(255,255,255,0.1),transparent)] pointer-events-none" />
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <CreditCard className="size-4 text-rose-200" />
                <span className="text-sm text-rose-100">Deuda Total</span>
              </div>
            </div>
            <p className="text-3xl font-bold tracking-tight">
              {formatCurrency(totalDebt)}
            </p>
            {totalCredit > 0 && (
              <div className="mt-2">
                <div className="flex items-center justify-between text-[10px] text-rose-200 mb-1">
                  <span>Crédito usado</span>
                  <span>{formatCurrency(totalUsed)} / {formatCurrency(totalCredit)}</span>
                </div>
                <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white/60 rounded-full"
                    style={{ width: `${Math.min((totalUsed / totalCredit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            )}
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
        <div className="space-y-3">
          {debts.map((debt) => (
            <motion.div key={debt.id} variants={itemVariants}>
              <DebtCard
                debt={debt}
                onClick={() => handleDebtClick(debt.id)}
              />
            </motion.div>
          ))}
        </div>
      )}

      {/* FAB - Add Debt */}
      {debts.length > 0 && (
        <motion.div
          className="fixed bottom-24 right-4 z-40"
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
