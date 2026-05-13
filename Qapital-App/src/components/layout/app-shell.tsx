"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import { useAppStore } from "@/lib/store";
import { apiFetch } from "@/lib/api";
import { LoginForm } from "@/components/auth/login-form";
import { RegisterForm } from "@/components/auth/register-form";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { DashboardPage } from "@/components/dashboard/dashboard-page";
import { FinancePage } from "@/components/finance/finance-page";
import { TransportPage } from "@/components/transport/transport-page";
import { HealthPage } from "@/components/health/health-page";
import { PantryPage } from "@/components/pantry/pantry-page";
import { SettingsPage } from "@/components/settings/settings-page";
import { OnboardingFlow } from "@/components/onboarding/onboarding-flow";
import { BackupRestorePrompt } from "@/components/settings/backup-restore-prompt";
import { motion, AnimatePresence } from "framer-motion";

function ModuleContent() {
  const { activeModule } = useAppStore();

  const modules: Record<string, React.ReactNode> = {
    dashboard: <DashboardPage />,
    finance: <FinancePage />,
    transport: <TransportPage />,
    health: <HealthPage />,
    pantry: <PantryPage />,
    settings: <SettingsPage />,
  };

  return (
    /* Scroll container must be a STATIC div — CSS transforms on a parent
       (from Framer Motion's `y` animation) break `position: sticky`
       in children like the finance tab bar. */
    <div className="flex-1 overflow-y-auto">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeModule}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
        >
          {modules[activeModule] || <DashboardPage />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function AppShell() {
  const { data: session, status } = useSession();
  const { authView } = useAppStore();
  const { setTheme: applyTheme } = useTheme();
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);

  // Load user's saved theme from DB on login
  // StrictMode-safe: uses mountedRef to avoid state updates after unmount
  useEffect(() => {
    let cancelled = false;
    if (status === "authenticated" && session?.user?.id) {
      apiFetch<{ theme: string }>("/api/settings")
        .then((data) => {
          if (!cancelled && data.theme) {
            applyTheme(data.theme);
          }
        })
        .catch(() => {
          // Settings might not exist yet, that's fine
        });
    }
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id, applyTheme]);

  // Auto-restore detection: check if DB is empty and user has a previous backup
  useEffect(() => {
    let cancelled = false;
    if (status === "authenticated" && session?.user?.id) {
      // Check if user dismissed the prompt this session
      try {
        if (sessionStorage.getItem("qapital-restore-dismissed") === "true") return;
      } catch { /* non-critical */ }

      // Check if user has a previous backup in localStorage
      let hasBackup = false;
      try {
        const backupMeta = localStorage.getItem("qapital-last-backup");
        hasBackup = !!backupMeta;
      } catch { /* non-critical */ }

      if (!hasBackup) return; // No previous backup, skip check

      // Check if DB is empty
      apiFetch<{ hasData: boolean; totalRecords: number }>("/api/backup/status")
        .then((data) => {
          if (!cancelled && !data.hasData) {
            setShowBackupPrompt(true);
          }
        })
        .catch(() => {
          // API might fail, that's fine — user can still import manually
        });
    }
    return () => {
      cancelled = true;
    };
  }, [status, session?.user?.id]);

  // Loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        <div className="text-center">
          <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/30 mb-4 animate-pulse">
            <span className="text-2xl font-bold text-white tracking-tight">Q</span>
          </div>
          <p className="text-sm text-gray-500">Cargando...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show auth forms
  if (!session) {
    if (authView === "register") return <RegisterForm />;
    if (authView === "forgot-password") return <ForgotPasswordForm />;
    return <LoginForm />;
  }

  // Check onboarding - if not completed, show onboarding flow
  const onboardingCompleted = (session.user as Record<string, unknown>)?.onboardingCompleted;
  // Use loose comparison to handle both boolean and number (SQLite stores as 0/1)
  if (onboardingCompleted === false || onboardingCompleted === 0) {
    return <OnboardingFlow />;
  }

  // Authenticated and onboarded - show main app
  return (
    <div className="h-screen flex flex-col overflow-hidden bg-gray-50/50 dark:bg-gray-950">
      <Header />
      <ModuleContent />
      <BottomNav />
      <AppSidebar />
      {showBackupPrompt && <BackupRestorePrompt />}
    </div>
  );
}
