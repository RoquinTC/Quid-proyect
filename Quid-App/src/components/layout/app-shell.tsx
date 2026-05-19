"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";
import { useAppStore } from "@/lib/store";
import { useAppSession } from "@/lib/use-app-session";
import { apiFetch } from "@/lib/api";
import { getCachedSession, clearOfflineSession, clearOfflineCredentials, cacheOfflineSession } from "@/lib/offline-session";
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
import { OfflineLockScreen } from "@/components/security/offline-lock-screen";
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
  const { session, status, isOffline } = useAppSession();
  const { authView, setOfflineSession } = useAppStore();
  const { setTheme: applyTheme } = useTheme();
  const [showBackupPrompt, setShowBackupPrompt] = useState(false);
  const [manuallyUnlocked, setManuallyUnlocked] = useState(false);

  // Check for app updates every 60 seconds
  useUpdateChecker(60000);

  // Track whether the user just logged in (vs page reload with existing session)
  // On page reload with existing session → show lock screen
  // After fresh login → skip lock screen
  const [justLoggedIn, setJustLoggedIn] = useState(false);

  useEffect(() => {
    // Check if this was a fresh login (set by login-form before redirect)
    try {
      const wasFreshLogin = sessionStorage.getItem("quid-just-logged-in") === "true";
      if (wasFreshLogin) {
        sessionStorage.removeItem("quid-just-logged-in");
        sessionStorage.removeItem("quid-just-logged-out"); // Clear logout flag on fresh login
        setJustLoggedIn(true);
        setManuallyUnlocked(true);
      }
    } catch {}
  }, []);

  // Auto-unlock for offline sessions (they already verified PIN/password)
  useEffect(() => {
    if (isOffline && session && !manuallyUnlocked) {
      setManuallyUnlocked(true);
      setJustLoggedIn(true);
    }
  }, [isOffline, session, manuallyUnlocked]);

  // Check if security is enabled and lock the app accordingly
  const pinEnabled = session?.user?.pinEnabled;
  const biometricEnabled = session?.user?.biometricEnabled;
  const securityEnabled = pinEnabled || biometricEnabled;

  // Compute locked state: if security is enabled and user hasn't unlocked yet, lock
  const shouldLock = securityEnabled && !manuallyUnlocked;

  // Listen for visibility change events to lock on resume
  // Grace period: when the app goes to background, start a 60-second timer.
  // If the user returns within 60 seconds → cancel lock, reset counter.
  // If 60 seconds pass while in background → lock on next foreground.
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lockTriggeredRef = useRef(false);

  useEffect(() => {
    if (!securityEnabled) return;

    const LOCK_DELAY_MS = 60_000; // 60 seconds grace period before locking

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // App going to background — start grace timer
        lockTriggeredRef.current = false;
        lockTimerRef.current = setTimeout(() => {
          // Grace period expired — mark that we should lock on next foreground
          lockTriggeredRef.current = true;
        }, LOCK_DELAY_MS);
      } else {
        // App coming back to foreground
        // Cancel any pending lock timer
        if (lockTimerRef.current) {
          clearTimeout(lockTimerRef.current);
          lockTimerRef.current = null;
        }

        // Only lock if the grace period fully expired while in background
        if (!lockTriggeredRef.current) return;

        lockTriggeredRef.current = false;

        // Check lockOnResume setting (only when online)
        if (!isOffline) {
          try {
            const settings = await apiFetch<{ lockOnResume?: boolean; pinEnabled?: boolean; biometricEnabled?: boolean }>("/api/settings");
            if (settings.lockOnResume && (settings.pinEnabled || settings.biometricEnabled)) {
              setManuallyUnlocked(false);
            }
          } catch {
            // If we can't check settings, lock anyway for safety
            setManuallyUnlocked(false);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (lockTimerRef.current) {
        clearTimeout(lockTimerRef.current);
        lockTimerRef.current = null;
      }
    };
  }, [securityEnabled, isOffline]);

  // Load user's saved theme from DB on login (only when online)
  useEffect(() => {
    let cancelled = false;
    if (session?.user?.id && !isOffline) {
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
  }, [session?.user?.id, isOffline, applyTheme]);

  // Auto-restore detection: check if DB is empty and user has a previous backup
  useEffect(() => {
    let cancelled = false;
    if (session?.user?.id && !isOffline) {
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
  }, [session?.user?.id, isOffline]);

  const handleUnlock = useCallback(() => {
    setManuallyUnlocked(true);
  }, []);

  // Handle offline unlock — set the offline session in Zustand
  const handleOfflineUnlock = useCallback((cachedSession: any) => {
    setOfflineSession(cachedSession);
    setManuallyUnlocked(true);
    setJustLoggedIn(true);
    try { sessionStorage.setItem("quid-just-logged-in", "true"); } catch {}
  }, [setOfflineSession]);

  // Cache session for offline access whenever it's available
  useEffect(() => {
    if (session?.user?.id && !isOffline) {
      cacheOfflineSession(session as any);
    }
  }, [session, isOffline]);

  // Reset lock state when session is lost (logout)
  useEffect(() => {
    if (status === "unauthenticated" && !session) {
      setManuallyUnlocked(false);
      setJustLoggedIn(false);
      clearOfflineSession();
      clearOfflineCredentials();
      setOfflineSession(null);
      // Notify Service Worker to clear cached session
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_SESSION' });
      }
    }
  }, [status, session, setOfflineSession]);

  // Loading state — only show when we're actually loading AND have no offline fallback
  if (status === "loading" && !session) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50">
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

  // Not authenticated — check for cached session for offline access
  if (!session) {
    const cachedSession = getCachedSession();

    // If we have a cached session (offline or server unreachable), show offline lock screen
    if (cachedSession?.user?.id) {
      return (
        <OfflineLockScreen
          cachedSession={cachedSession}
          onUnlock={() => handleOfflineUnlock(cachedSession)}
        />
      );
    }

    // No session at all — show login form
    if (authView === "register") return <RegisterForm />;
    if (authView === "forgot-password") return <ForgotPasswordForm />;
    return <LoginForm />;
  }

  // Check onboarding - if not completed, show onboarding flow
  const onboardingCompleted = session.user.onboardingCompleted;
  // Skip onboarding check when offline (we can't create onboarding data without server)
  // Use !onboardingCompleted to catch false, undefined, null, and 0 (SQLite stores booleans as 0/1)
  if (!isOffline && !onboardingCompleted) {
    return <OnboardingFlow />;
  }

  // If locked, show lock screen
  if (shouldLock) {
    return <LockScreen onUnlock={handleUnlock} />;
  }

  // Authenticated and onboarded - show main app
  return (
    <div className="h-dvh flex flex-col overflow-hidden bg-gray-50/50 dark:bg-gray-950">
      <Header />
      <ModuleContent />
      <BottomNav />
      <AppSidebar />
      {showBackupPrompt && <BackupRestorePrompt />}
    </div>
  );
}
