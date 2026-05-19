"use client";

import { useState, useCallback, useMemo } from "react";
import { formatCurrency, calcPercentage } from "@/lib/api";
import { useLocalQuery } from "@/lib/local/hooks/queries";
import { useAppStore } from "@/lib/store";
import { DebtCard } from "./debt-card";
import { DebtForm } from "./debt-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, CreditCard } from "lucide-react";
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
          <CardContent className="p-5 relative z-10">
            <div className="flex items-center justify-between gap-4">
              {/* Left side: debt info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="size-4 text-rose-200" />
                  <span className="text-sm text-rose-100">Deuda Total</span>
                </div>
                <p className="text-3xl font-bold tracking-tight">
                  {formatCurrency(totalDebt)}
                </p>
                {totalCredit > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-200">
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
                  <div className="relative" style={{ width: 120, height: 120 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={donutData}
                          cx="50%"
                          cy="50%"
                          innerRadius={32}
                          outerRadius={50}
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
                    {/* Center label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[9px] text-rose-200 leading-none">Deuda Total</span>
                      <span className="text-xs font-bold leading-tight mt-0.5">
                        {formatCurrency(totalDebt)}
                      </span>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-col gap-0.5 mt-1.5 w-full max-w-[160px]">
                    {donutData.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-1.5">
                        <span
                          className="size-2.5 rounded-full shrink-0 border border-white/30"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-[9px] text-rose-100 leading-none truncate flex-1">{entry.name}</span>
                        <span className="text-[9px] text-rose-200/80 leading-none font-medium shrink-0">{formatCurrency(entry.value)}</span>
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
