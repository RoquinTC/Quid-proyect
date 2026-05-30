"use client";

import { useEffect } from "react";
import {
  useAppStore,
  type FinanceSubView,
  type HealthSubView,
  type ModuleType,
  type PantrySubView,
  type SidebarAction,
  type TransportSubView,
} from "@/lib/store";

const modules = new Set<ModuleType>(["dashboard", "finance", "transport", "health", "pantry", "settings"]);
const financeViews = new Set<FinanceSubView>(["overview", "accounts", "transactions", "budgets", "debts", "savings", "cdts", "recurring", "account-detail", "debt-detail", "savings-detail", "simulator", "credit-simulator", "debt-simulator"]);
const healthViews = new Set<HealthSubView>(["summary", "medications", "appointments", "orders", "profiles", "inventory", "authorizations", "claims"]);
const transportViews = new Set<TransportSubView>(["vehicles", "fuel", "maintenance"]);
const pantryViews = new Set<PantrySubView>(["items", "shopping-lists"]);
const actions = new Set<SidebarAction>([
  "create-transaction",
  "create-account",
  "create-budget",
  "create-savings-goal",
  "create-debt",
  "create-cdt",
  "create-recurring",
  "manage-categories",
  "create-vehicle",
  "log-fuel",
  "log-maintenance",
  "register-document",
  "update-fuel-price",
  "create-medication",
  "create-appointment",
  "create-medical-order",
  "create-pantry-item",
  "create-shopping-list",
  "create-health-profile",
]);

export function AppDeepLinkHandler() {
  const {
    setActiveModule,
    setFinanceSubView,
    setHealthSubView,
    setTransportSubView,
    setPantrySubView,
    setSidebarAction,
  } = useAppStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetModule = params.get("module") as ModuleType | null;
    const view = params.get("view");
    const action = params.get("action") as SidebarAction | null;

    if (!targetModule || !modules.has(targetModule)) return;

    setActiveModule(targetModule);

    if (targetModule === "finance" && view && financeViews.has(view as FinanceSubView)) {
      setFinanceSubView(view as FinanceSubView);
    }
    if (targetModule === "health" && view && healthViews.has(view as HealthSubView)) {
      setHealthSubView(view as HealthSubView);
    }
    if (targetModule === "transport" && view && transportViews.has(view as TransportSubView)) {
      setTransportSubView(view as TransportSubView);
    }
    if (targetModule === "pantry" && view && pantryViews.has(view as PantrySubView)) {
      setPantrySubView(view as PantrySubView);
    }
    if (action && actions.has(action)) {
      setSidebarAction(action);
    }

    window.history.replaceState({}, "", window.location.pathname);
  }, [setActiveModule, setFinanceSubView, setHealthSubView, setPantrySubView, setSidebarAction, setTransportSubView]);

  return null;
}
