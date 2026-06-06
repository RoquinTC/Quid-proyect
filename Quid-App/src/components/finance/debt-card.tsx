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
    credit_card: <CreditCard className="size-3" />,
    loan: <Landmark className="size-3" />,
    other: <Wallet className="size-3" />,
  };

  return (
    <motion.button
      onClick={onClick}
      className="w-[min(285px,calc(100vw-5.5rem))] text-left cursor-pointer sm:w-[310px]"
      whileTap={{ scale: 0.98 }}
    >
      <div
        className="rounded-2xl p-4 shadow-md text-white relative overflow-hidden h-[190px] flex flex-col justify-between"
        style={{
          background: `linear-gradient(135deg, ${debt.color}, ${debt.color}CC, ${debt.color}99)`,
        }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-8 -right-8 size-28 rounded-full bg-white/10 pointer-events-none" />
        <div className="absolute -bottom-6 -left-6 size-20 rounded-full bg-white/5 pointer-events-none" />

        <div className="relative z-10 h-full flex flex-col justify-between">
          {/* Top: Chip + Name row */}
          <div className="flex items-start gap-2.5 mb-1">
            {/* Chip */}
            <div className="flex items-center justify-center w-7 h-5 rounded bg-gradient-to-br from-yellow-300 to-yellow-500 shadow-sm shrink-0 mt-0.5">
              <div className="w-5.5 h-3.5 rounded-sm border border-yellow-600/30 flex items-center justify-center">
                <div className="w-3.5 h-0.5 bg-yellow-600/40 rounded-full" />
              </div>
            </div>
            {/* Name */}
            <div className="flex-1 min-w-0">
              <h3 className="text-xs sm:text-sm font-bold truncate leading-tight">{debt.name}</h3>
              {debt.bank && (
                <p className="text-[10px] text-white/70 truncate">{debt.bank}</p>
              )}
            </div>
            {/* Type icon */}
            <div className="size-7 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              {typeIcons[debt.type] || typeIcons.other}
            </div>
          </div>

          {/* Utilization bar */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-[10px] text-white/70 mb-1">
              <span>{isCreditCard ? "Utilizado" : "Progreso"}</span>
              <span>{utilization}%</span>
            </div>
            <div className="h-1 bg-white/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white/75 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(utilization, 100)}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
              />
            </div>
          </div>

          {/* Amounts row */}
          <div className="flex items-end justify-between mb-2 min-w-0 gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-white/60 leading-none mb-0.5">
                {isCreditCard ? "Saldo en Deuda" : "Saldo Actual"}
              </p>
              <p className="text-base font-bold tracking-tight break-all leading-none">
                {formatCurrency(debt.currentBalance)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[10px] text-white/60 leading-none mb-0.5">
                {isCreditCard ? "Cupo Total" : "Monto Total"}
              </p>
              <p className="text-xs font-semibold text-white/80">
                {formatCurrency(debt.totalAmount)}
              </p>
            </div>
          </div>

          {/* Bottom details row (aligned at the bottom) */}
          <div className="mt-auto pt-2 border-t border-white/10 flex items-center justify-between min-w-0 gap-2">
            {isCreditCard ? (
              <>
                <div className="flex items-center gap-1 min-w-0 shrink-0">
                  <Wallet className="size-3 text-emerald-300 shrink-0" />
                  <span className="text-[10px] text-white/70 truncate">Cupo:</span>
                  <span className="text-[11px] font-bold text-emerald-300">
                    {formatCurrency(cupo)}
                  </span>
                </div>
                {/* Dates */}
                <div className="flex items-center gap-2 shrink-0 text-[9px] text-white/60">
                  {debt.cutoffDate && <span>Cort: {debt.cutoffDate}</span>}
                  {debt.paymentDate && <span>Pag: {debt.paymentDate}</span>}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-1 min-w-0 truncate">
                  <span className="text-[10px] text-white/80 truncate">
                    {isLoanFixed ? "Cuota fija" : "Cuota"}: <strong>{formatCurrency(debt.monthlyPayment || 0)}</strong>
                  </span>
                  {debt.remainingPayments && (
                    <span className="text-[9px] text-white/50 shrink-0">
                      ({debt.remainingPayments} rest.)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-[9px] text-white/60 shrink-0">
                  <Calendar className="size-2.5 text-white/40" />
                  <span>Día {debt.paymentDate || 1}</span>
                  {debt.interestRate && <span className="opacity-80">| {debt.interestRate}%</span>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.button>
  );
}
