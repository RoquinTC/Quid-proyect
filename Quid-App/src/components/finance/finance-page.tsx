"use client";

import { useState, useEffect, Component } from "react";
import { useAppStore, type FinanceSubView, type SidebarAction } from "@/lib/store";
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
import { YieldSimulator } from "./yield-simulator";
import { CreditSimulator } from "./credit-simulator";
import { DebtSimulator } from "./debt-simulator";
import { AccountForm } from "./account-form";
import { BudgetForm } from "./budget-form";
import { SavingsGoalForm } from "./savings-goal-form";
import { DebtForm } from "./debt-form";
import { CDTForm } from "./cdt-form";
import { RecurringForm } from "./recurring-form";
import { TransactionForm } from "./transaction-form";

// Error boundary component to prevent a single tab crash from breaking the entire app
class TabErrorBoundary extends Component<{
  children: React.ReactNode;
  fallback?: React.ReactNode;
}, { hasError: boolean; error: Error | null }> {
  state: { hasError: boolean; error: Error | null } = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("[TabErrorBoundary] Error in tab:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-center">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-red-100 dark:bg-red-900/30 mb-4">
            <span className="text-2xl">⚠️</span>
          </div>
          <h3 className="font-bold text-gray-900 dark:text-white mb-2">
            Error al cargar esta sección
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {this.state.error?.message || "Ocurrió un error inesperado"}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            Reintentar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const { financeSubView, setFinanceSubView, sidebarAction, setSidebarAction } = useAppStore();

  // Sidebar quick-action forms (managed at page level so they work from sidebar)
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [showSavingsForm, setShowSavingsForm] = useState(false);
  const [showDebtForm, setShowDebtForm] = useState(false);
  const [showCDTForm, setShowCDTForm] = useState(false);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [showCategoriesManager, setShowCategoriesManager] = useState(false);

  // Swipe gesture state
  const [touchStart, setTouchStart] = useState<{ x: number; y: number; time: number } | null>(null);

  // ─── Listen for sidebar quick-actions ───────────────────────────
  useEffect(() => {
    if (!sidebarAction) return;

    const actionMap: Partial<Record<SidebarAction, () => void>> = {
      "create-transaction": () => {
        setShowTransactionForm(true);
      },
      "create-account": () => {
        setFinanceSubView("accounts");
        setShowAccountForm(true);
      },
      "create-budget": () => {
        setFinanceSubView("budgets");
        setShowBudgetForm(true);
      },
      "create-savings-goal": () => {
        setFinanceSubView("savings");
        setShowSavingsForm(true);
      },
      "create-debt": () => {
        setFinanceSubView("debts");
        setShowDebtForm(true);
      },
      "create-cdt": () => {
        setFinanceSubView("cdts");
        setShowCDTForm(true);
      },
      "create-recurring": () => {
        setFinanceSubView("recurring");
        setShowRecurringForm(true);
      },
      "manage-categories": () => {
        setFinanceSubView("overview");
        setShowCategoriesManager(true);
      },
    };

    const handler = actionMap[sidebarAction];
    if (handler) handler();

    // Consume the action so it doesn't re-fire
    setSidebarAction(null);
  }, [sidebarAction, setSidebarAction, setFinanceSubView]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart({ x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now() });
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart) return;
    const touchEnd = { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY, time: Date.now() };
    const dx = touchEnd.x - touchStart.x;
    const dy = Math.abs(touchEnd.y - touchStart.y);
    const dt = touchEnd.time - touchStart.time;

    // Only trigger if horizontal swipe > 50px, vertical < 50px, and within 500ms
    if (Math.abs(dx) > 50 && dy < 50 && dt < 500) {
      // Check if we're in a carousel zone
      const target = e.target as HTMLElement;
      const carouselParent = target.closest('[data-carousel], .overflow-x-auto, .snap-x');
      if (carouselParent) return; // Don't change tab in carousel

      const currentIdx = tabs.findIndex((t) => t.id === financeSubView);
      if (dx < 0 && currentIdx < tabs.length - 1) {
        // Swipe left → next tab
        setFinanceSubView(tabs[currentIdx + 1].id);
      } else if (dx > 0 && currentIdx > 0) {
        // Swipe right → previous tab
        setFinanceSubView(tabs[currentIdx - 1].id);
      }
    }
    setTouchStart(null);
  };

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
        return <TabErrorBoundary><CDTView /></TabErrorBoundary>;
      case "simulator":
        return <YieldSimulator />;
      case "credit-simulator":
        return <CreditSimulator />;
      case "debt-simulator":
        return <DebtSimulator />;
      case "recurring":
        return <RecurringView />;
      default:
        return <FinanceOverview />;
    }
  };

  const isDetailView = financeSubView === "account-detail" || financeSubView === "debt-detail" || financeSubView === "savings-detail";

  return (
    <div className="flex flex-col h-full">
      {/* Sticky Sub-tab navigation */}
      {!isDetailView && (
        <div className="sticky top-0 z-30 px-4 pt-3 pb-1 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-0.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-2xl overflow-x-auto no-scrollbar">
            {tabs.map((tab) => {
              const isActive = financeSubView === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFinanceSubView(tab.id)}
                  className="relative flex items-center justify-center gap-1 shrink-0 min-w-0 py-2 px-2 rounded-xl text-sm font-medium transition-colors duration-200 whitespace-nowrap"
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
                    className={`relative z-10 text-xs ${
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

      {/* Content with swipe detection */}
      <div
        className="flex-1 overflow-y-auto"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
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

      {/* ─── Sidebar Quick-Action Forms ───────────────────────────── */}

      <TransactionForm
        open={showTransactionForm}
        onOpenChange={setShowTransactionForm}
      />

      <AccountForm
        open={showAccountForm}
        onOpenChange={setShowAccountForm}
      />

      <BudgetForm
        open={showBudgetForm}
        onOpenChange={setShowBudgetForm}
      />

      <SavingsGoalForm
        open={showSavingsForm}
        onOpenChange={setShowSavingsForm}
      />

      <DebtForm
        open={showDebtForm}
        onOpenChange={setShowDebtForm}
      />

      <CDTForm
        open={showCDTForm}
        onOpenChange={setShowCDTForm}
      />

      <RecurringForm
        open={showRecurringForm}
        onOpenChange={setShowRecurringForm}
      />

      {/* Categories Manager Dialog */}
      {showCategoriesManager && (
        <CategoriesManagerDialog
          open={showCategoriesManager}
          onOpenChange={setShowCategoriesManager}
        />
      )}
    </div>
  );
}

// ─── Categories Manager in a Dialog ──────────────────────────────
import { CategoriesManager } from "./categories-manager";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function CategoriesManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Gestionar Categorías</DialogTitle>
        </DialogHeader>
        <CategoriesManager />
      </DialogContent>
    </Dialog>
  );
}
