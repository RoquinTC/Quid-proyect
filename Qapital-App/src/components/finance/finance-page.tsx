"use client";

import { useAppStore, type FinanceSubView } from "@/lib/store";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, Wallet, Receipt, CreditCard, PiggyBank, Landmark, Clock } from "lucide-react";
import { FinanceOverview } from "./finance-overview";
import { AccountsView } from "./accounts-view";
import { BudgetsView } from "./budgets-view";
import { DebtsView } from "./debts-view";
import { SavingsView } from "./savings-view";
import { CDTView } from "./cdt-view";
import { RecurringView } from "./recurring-view";
import { AccountDetail } from "./account-detail";
import { DebtDetail } from "./debt-detail";
import { SavingsGoalDetail } from "./savings-goal-detail";

const tabs: { id: FinanceSubView; label: string; icon: typeof Wallet }[] = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "accounts", label: "Cuentas", icon: Wallet },
  { id: "budgets", label: "Presupuesto", icon: Receipt },
  { id: "debts", label: "Deudas", icon: CreditCard },
  { id: "savings", label: "Ahorros", icon: PiggyBank },
  { id: "cdts", label: "CDT", icon: Landmark },
  { id: "recurring", label: "Pagos", icon: Clock },
];

export function FinancePage() {
  const { financeSubView, setFinanceSubView } = useAppStore();

  const renderContent = () => {
    if (financeSubView === "account-detail") return <AccountDetail />;
    if (financeSubView === "debt-detail") return <DebtDetail />;
    if (financeSubView === "savings-detail") return <SavingsGoalDetail />;
    if (financeSubView === "transactions") return <AccountsView />;
    if (financeSubView === "overview") return <FinanceOverview />;

    switch (financeSubView) {
      case "accounts":
        return <AccountsView />;
      case "budgets":
        return <BudgetsView />;
      case "debts":
        return <DebtsView />;
      case "savings":
        return <SavingsView />;
      case "cdts":
        return <CDTView />;
      case "recurring":
        return <RecurringView />;
      default:
        return <FinanceOverview />;
    }
  };

  const isDetailView = financeSubView === "account-detail" || financeSubView === "debt-detail" || financeSubView === "savings-detail";

  return (
    <div className="flex flex-col h-full">
      {/* Sub-tab navigation */}
      {!isDetailView && (
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center gap-0.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-x-auto">
            {tabs.map((tab) => {
              const isActive = financeSubView === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFinanceSubView(tab.id)}
                  className="relative flex items-center justify-center gap-1 flex-1 min-w-[56px] py-2 px-1.5 rounded-xl text-sm font-medium transition-colors duration-200"
                >
                  {isActive && (
                    <motion.div
                      layoutId="financeTab"
                      className="absolute inset-0 bg-white dark:bg-gray-700 rounded-xl shadow-sm"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 35,
                      }}
                    />
                  )}
                  <Icon
                    className={`size-3.5 relative z-10 ${
                      isActive ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"
                    }`}
                  />
                  <span
                    className={`relative z-10 text-[10px] ${
                      isActive ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={financeSubView}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
