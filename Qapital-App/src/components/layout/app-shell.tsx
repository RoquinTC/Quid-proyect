"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { LockScreen } from "@/components/security/lock-screen";
import { useUpdateChecker } from "@/hooks/use-update-checker";
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
  const [manuallyUnlocked, setManuallyUnlocked] = useState(false);

  // Check for app updates every 60 seconds
  useUpdateChecker(60000);

  // Track whether the user just logged in (vs page reload with existing session)
  // On page reload with existing session → show lock screen
  // After fresh login → skip lock screen
  const prevStatusRef = useRef<string>(status);
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  useEffect(() => {
    if (prevStatusRef.current === "unauthenticated" && status === "authenticated") {
      // User just logged in — skip lock screen
      setJustLoggedIn(true);
      setManuallyUnlocked(true);
    } else if (prevStatusRef.current === "loading" && status === "authenticated") {
      // Page loaded with existing session — check if this was a fresh login
      // (login-form sets sessionStorage flag before hard redirect)
      let wasFreshLogin = false;
      try {
        wasFreshLogin = sessionStorage.getItem("quid-just-logged-in") === "true";
        if (wasFreshLogin) sessionStorage.removeItem("quid-just-logged-in");
      } catch {}

      if (wasFreshLogin) {
        setJustLoggedIn(true);
        setManuallyUnlocked(true);
      } else {
        setJustLoggedIn(false);
      }
    }
    prevStatusRef.current = status;
  }, [status]);

  // Check if security is enabled and lock the app accordingly
  const pinEnabled = (session?.user as Record<string, unknown>)?.pinEnabled as boolean | undefined;
  const biometricEnabled = (session?.user as Record<string, unknown>)?.biometricEnabled as boolean | undefined;
  const securityEnabled = pinEnabled || biometricEnabled;

  // Compute locked state: if security is enabled and user hasn't unlocked yet, lock
  const shouldLock = securityEnabled && !manuallyUnlocked;

  // Listen for visibility change events to lock on resume
  useEffect(() => {
    if (!securityEnabled) return;

    const handleVisibilityChange = async () => {
      if (document.hidden) return; // App going to background — do nothing

      // App coming to foreground — check lockOnResume setting
      try {
        const settings = await apiFetch<{ lockOnResume?: boolean; pinEnabled?: boolean; biometricEnabled?: boolean }>("/api/settings");
        if (settings.lockOnResume && (settings.pinEnabled || settings.biometricEnabled)) {
          setManuallyUnlocked(false);
        }
      } catch {
        // If we can't check settings, lock anyway for safety
        setManuallyUnlocked(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [securityEnabled]);

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
        if (sessionStorage.getItem("quid-restore-dismissed") === "true") return;
      } catch { /* non-critical */ }

      // Check if user has a previous backup in localStorage
      let hasBackup = false;
      try {
        const backupMeta = localStorage.getItem("quid-last-backup");
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

  const handleUnlock = useCallback(() => {
    setManuallyUnlocked(true);
  }, []);

  // Reset lock state when session is lost (logout)
  useEffect(() => {
    if (status === "unauthenticated") {
      setManuallyUnlocked(false);
      setJustLoggedIn(false);
    }
  }, [status]);

  // Loading state
  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
        <div className="text-center">
          <img
            src="/icon-192.png"
            alt="Quid"
            className="size-20 mx-auto mb-4 rounded-2xl shadow-lg shadow-emerald-500/30 animate-pulse"
          />
          <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-600 to-teal-500 bg-clip-text text-transparent">
            Quid
          </h1>
          <p className="text-sm text-gray-500 mt-1">Todo converge aqui</p>
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

  // If locked, show lock screen
  if (shouldLock) {
    return <LockScreen onUnlock={handleUnlock} />;
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
