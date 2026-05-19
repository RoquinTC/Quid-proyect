"use client";

import { formatCurrency, calcPercentage } from "@/lib/api";
import { motion } from "framer-motion";
import { CreditCard, Landmark, Calendar, Wallet } from "lucide-react";

interface DebtCardProps {
  debt: {
    id: string;
    type: string;
    name: string;
    color: string;
    icon?: string | null;
    bank?: string | null;
    totalAmount: number;
    currentBalance: number;
    interestRate?: number | null;
    cutoffDate?: number | null;
    paymentDate?: number | null;
    monthlyPayment?: number | null;
    remainingPayments?: number | null;
    paymentType?: string | null;
    otherCharges?: number | null;
    installments?: Array<{
      id: string;
      description: string;
      totalAmount: number;
      totalInstallments: number;
      currentInstallment: number;
      installmentAmount: number;
      isPaid: boolean;
      nextPaymentDate: string;
    }>;
  };
  onClick?: () => void;
}

export function DebtCard({ debt, onClick }: DebtCardProps) {
  const isCreditCard = debt.type === "credit_card";
  const isLoan = debt.type === "loan";
  const isLoanFixed = isLoan && debt.paymentType === "fixed";
  const utilization = calcPercentage(debt.currentBalance, debt.totalAmount);
  const cupo = debt.totalAmount - debt.currentBalance;

  const typeIcons: Record<string, React.ReactNode> = {
    credit_card: <CreditCard className="size-3.5" />,
    loan: <Landmark className="size-3.5" />,
    other: <Wallet className="size-3.5" />,
  };

  return (
    <motion.button
      onClick={onClick}
      className="w-full text-left"
      whileTap={{ scale: 0.98 }}
    >
      <div
        className="rounded-2xl p-5 shadow-lg text-white relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${debt.color}, ${debt.color}CC, ${debt.color}99)`,
        }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 size-32 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 size-24 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative z-10">
          {/* Top: Chip + Name row */}
          <div className="flex items-center gap-3 mb-4">
            {/* Chip */}
            <div className="flex items-center justify-center w-10 h-7 rounded-md bg-gradient-to-br from-yellow-300 to-yellow-500 shadow-sm">
              <div className="w-6 h-5 rounded-sm border border-yellow-600/30 flex items-center justify-center">
                <div className="w-4 h-0.5 bg-yellow-600/40 rounded-full" />
              </div>
            </div>
            {/* Name */}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold truncate">{debt.name}</h3>
              {debt.bank && (
                <p className="text-[10px] text-white/70 truncate">{debt.bank}</p>
              )}
            </div>
            {/* Type icon */}
            <div className="size-8 rounded-lg bg-white/15 flex items-center justify-center">
              {typeIcons[debt.type] || typeIcons.other}
            </div>
          </div>

          {/* Utilization bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between text-[10px] text-white/70 mb-1">
              <span>{isCreditCard ? "Utilizado" : "Progreso"}</span>
              <span>{utilization}%</span>
            </div>
            <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white/70 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(utilization, 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Amounts row */}
          <div className="flex items-end justify-between mb-3 min-w-0 gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-white/60">
                {isCreditCard ? "Saldo en Deuda" : "Saldo Actual"}
              </p>
              <p className="text-xl font-bold tracking-tight break-all">
                {formatCurrency(debt.currentBalance)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-white/60">
                {isCreditCard ? "Cupo Total" : "Monto Total"}
              </p>
              <p className="text-sm font-medium text-white/80">
                {formatCurrency(debt.totalAmount)}
              </p>
            </div>
          </div>

          {/* Cupo (available credit) - only for credit cards */}
          {isCreditCard && (
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2">
              <Wallet className="size-3.5 text-emerald-300" />
              <span className="text-[10px] text-white/70">Cupo:</span>
              <span className="text-sm font-bold text-emerald-300">
                {formatCurrency(cupo)}
              </span>
            </div>
          )}

          {/* Dates row for credit cards */}
          {isCreditCard && (debt.cutoffDate || debt.paymentDate) && (
            <div className="flex items-center gap-4 mt-3">
              {debt.cutoffDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="size-3 text-white/50" />
                  <span className="text-[10px] text-white/60">
                    Corte: {debt.cutoffDate}
                  </span>
                </div>
              )}
              {debt.paymentDate && (
                <div className="flex items-center gap-1">
                  <Calendar className="size-3 text-white/50" />
                  <span className="text-[10px] text-white/60">
                    Pago: {debt.paymentDate}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Loan info */}
          {isLoan && debt.monthlyPayment && (
            <div className="flex items-center gap-2 mt-2 min-w-0">
              <span className="text-[10px] text-white/60 truncate">
                {isLoanFixed ? "Cuota fija" : "Cuota mensual"}: {formatCurrency(debt.monthlyPayment)}
              </span>
              {debt.remainingPayments && (
                <span className="text-[10px] text-white/50">
                  ({debt.remainingPayments} restantes)
                </span>
              )}
            </div>
          )}

          {/* Loan interest rate */}
          {isLoan && debt.interestRate && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[10px] text-white/50">
                Tasa: {debt.interestRate}% NMV
              </span>
            </div>
          )}

          {/* Loan payment day */}
          {isLoan && debt.paymentDate && (
            <div className="flex items-center gap-1 mt-1">
              <Calendar className="size-2.5 text-white/40" />
              <span className="text-[10px] text-white/50">
                Pago: día {debt.paymentDate}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}
