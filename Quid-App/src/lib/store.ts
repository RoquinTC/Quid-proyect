import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CachedSession } from "@/lib/offline-session";

export type ModuleType = "dashboard" | "finance" | "transport" | "health" | "pantry" | "settings";

export type FinanceSubView = "overview" | "accounts" | "transactions" | "budgets" | "debts" | "savings" | "cdts" | "recurring" | "account-detail" | "debt-detail" | "savings-detail" | "simulator" | "credit-simulator" | "debt-simulator";
export type TransportSubView = "vehicles" | "fuel" | "maintenance";
export type HealthSubView = "medications" | "appointments" | "profiles";
export type PantrySubView = "items" | "shopping-lists";

// Sidebar quick-action identifiers — each module page listens for its actions
export type SidebarAction =
  // Finance
  | "create-transaction"
  | "create-account"
  | "create-budget"
  | "create-savings-goal"
  | "create-debt"
  | "create-cdt"
  | "create-recurring"
  | "manage-categories"
  // Transport
  | "create-vehicle"
  | "log-fuel"
  | "log-maintenance"
  | "update-fuel-price"
  // Health
  | "create-medication"
  | "create-appointment"
  // Pantry
  | "create-pantry-item"
  | "create-shopping-list"
  | "create-health-profile";

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "info" | "success" | "warning" | "error";
  read: boolean;
  /** Timestamp (ms) — stored as number for safe JSON serialization */
  createdAt: number;
}

interface AppState {
  // Navigation
  activeModule: ModuleType;
  setActiveModule: (module: ModuleType) => void;

  // Sub-views
  financeSubView: FinanceSubView;
  setFinanceSubView: (view: FinanceSubView) => void;
  transportSubView: TransportSubView;
  setTransportSubView: (view: TransportSubView) => void;
  healthSubView: HealthSubView;
  setHealthSubView: (view: HealthSubView) => void;
  pantrySubView: PantrySubView;
  setPantrySubView: (view: PantrySubView) => void;

  // Sidebar
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;

  // Sidebar quick-actions (pending action to be consumed by module page)
  sidebarAction: SidebarAction | null;
  setSidebarAction: (action: SidebarAction | null) => void;

  // User preferences
  currency: string;
  setCurrency: (currency: string) => void;
  theme: "light" | "dark" | "system";
  setTheme: (theme: "light" | "dark" | "system") => void;

  // Notifications
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id" | "createdAt" | "read">) => void;
  markNotificationRead: (id: string) => void;
  clearNotifications: () => void;
  unreadCount: () => number;

  // Auth UI state
  authView: "login" | "register" | "forgot-password";
  setAuthView: (view: "login" | "register" | "forgot-password") => void;

  // Onboarding
  onboardingStep: number;
  setOnboardingStep: (step: number) => void;

  // Sync & offline state (local-first)
  isOnline: boolean;
  setOnline: (online: boolean) => void;
  isSyncing: boolean;
  setSyncStatus: (syncing: boolean) => void;
  pendingCount: number;
  setPendingCount: (count: number) => void;
  lastSyncAt: number | null;
  setLastSyncAt: (date: number) => void;

  // Offline session — set when user authenticates offline
  // (PIN/password verified locally without server)
  // Cleared automatically when next-auth session is restored
  offlineSession: CachedSession | null;
  setOfflineSession: (session: CachedSession | null) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Navigation
      activeModule: "dashboard",
      setActiveModule: (module) => set({ activeModule: module }),

      // Sub-views
      financeSubView: "accounts",
      setFinanceSubView: (view) => set({ financeSubView: view }),
      transportSubView: "vehicles",
      setTransportSubView: (view) => set({ transportSubView: view }),
      healthSubView: "medications",
      setHealthSubView: (view) => set({ healthSubView: view }),
      pantrySubView: "items",
      setPantrySubView: (view) => set({ pantrySubView: view }),

      // Sidebar
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      // Sidebar quick-actions
      sidebarAction: null,
      setSidebarAction: (action) => set({ sidebarAction: action }),

      // User preferences
      currency: "COP",
      setCurrency: (currency) => set({ currency }),
      theme: "light",
      setTheme: (theme) => set({ theme }),

      // Notifications
      notifications: [],
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            {
              ...notification,
              id: `notif-${Date.now()}`,
              read: false,
              createdAt: Date.now(),
            },
            ...state.notifications,
          ],
        })),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      clearNotifications: () => set({ notifications: [] }),
      unreadCount: () => get().notifications.filter((n) => !n.read).length,

      // Auth UI state
      authView: "login",
      setAuthView: (view) => set({ authView: view }),

      // Onboarding
      onboardingStep: 0,
      setOnboardingStep: (step) => set({ onboardingStep: step }),

      // Sync & offline state
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      setOnline: (online) => set({ isOnline: online }),
      isSyncing: false,
      setSyncStatus: (syncing) => set({ isSyncing: syncing }),
      pendingCount: 0,
      setPendingCount: (count) => set({ pendingCount: count }),
      lastSyncAt: null,
      setLastSyncAt: (date) => set({ lastSyncAt: date }),

      // Offline session
      offlineSession: null,
      setOfflineSession: (session) => set({ offlineSession: session }),
    }),
    {
      name: "quid-store",
      storage: createJSONStorage(() => localStorage),
      // Only persist notifications and user preferences — not transient UI state
      partialize: (state) => ({
        notifications: state.notifications,
        theme: state.theme,
        currency: state.currency,
        offlineSession: state.offlineSession,
      }),
    }
  )
);
