/**
 * useAppSession — Offline-aware session hook
 *
 * Wraps next-auth's useSession() with a fallback to the offline session
 * stored in Zustand (which is persisted to localStorage).
 *
 * Flow:
 *   1. If next-auth session is available → use it (clear offline session)
 *   2. If next-auth returns unauthenticated AND we have an offline session → use offline
 *   3. If neither → return null (show login form)
 *
 * This ensures the app ALWAYS has a session when the user has previously
 * logged in, even if the server/tunnel is down.
 */

"use client";

import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { getCachedSession } from "@/lib/offline-session";
import { useEffect, useMemo } from "react";

export interface AppSession {
  user: {
    id: string;
    email?: string | null;
    name?: string | null;
    image?: string | null;
    pinEnabled?: boolean;
    biometricEnabled?: boolean;
    currency?: string;
    onboardingCompleted?: boolean;
    onboardingStep?: number;
  };
  expires?: string;
  /** Whether this session was validated offline (no server check) */
  isOffline?: boolean;
}

export function useAppSession(): {
  session: AppSession | null;
  status: "authenticated" | "unauthenticated" | "loading";
  isOffline: boolean;
} {
  const { data: nextAuthSession, status } = useSession();
  const { offlineSession, setOfflineSession } = useAppStore();

  // Clear offline session when next-auth session is restored
  useEffect(() => {
    if (status === "authenticated" && nextAuthSession?.user && offlineSession) {
      // Server session is back — no need for offline session anymore
      setOfflineSession(null);
    }
  }, [status, nextAuthSession, offlineSession, setOfflineSession]);

  // Also cache the session for offline use whenever next-auth has one
  useEffect(() => {
    if (status === "authenticated" && nextAuthSession?.user) {
      // Cache in localStorage via offline-session module
      import("@/lib/offline-session").then(({ cacheOfflineSession }) => {
        cacheOfflineSession(nextAuthSession as any);
      }).catch(() => {});
    }
  }, [status, nextAuthSession]);

  const result = useMemo(() => {
    // 0. Check if user just logged out — prevent offline session auto-restore
    // This is a defense-in-depth: even if some cache survived the logout cleanup,
    // this flag prevents the session from being restored on the next page load.
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem("quid-just-logged-out") === "true") {
        return {
          session: null,
          status: "unauthenticated" as const,
          isOffline: false,
        };
      }
    } catch {}

    // 1. Next-auth session available — use it
    if (status === "authenticated" && nextAuthSession?.user) {
      return {
        session: {
          user: {
            id: (nextAuthSession.user as any).id || "",
            email: nextAuthSession.user.email,
            name: nextAuthSession.user.name,
            image: nextAuthSession.user.image,
            pinEnabled: (nextAuthSession.user as any).pinEnabled,
            biometricEnabled: (nextAuthSession.user as any).biometricEnabled,
            currency: (nextAuthSession.user as any).currency,
            onboardingCompleted: (nextAuthSession.user as any).onboardingCompleted,
            onboardingStep: (nextAuthSession.user as any).onboardingStep,
          },
          expires: (nextAuthSession as any).expires,
          isOffline: false,
        },
        status: "authenticated" as const,
        isOffline: false,
      };
    }

    // 2. Loading — wait
    if (status === "loading") {
      return {
        session: null,
        status: "loading" as const,
        isOffline: false,
      };
    }

    // 3. Next-auth unauthenticated — check offline session
    if (offlineSession?.user?.id) {
      return {
        session: offlineSession,
        status: "authenticated" as const,
        isOffline: true,
      };
    }

    // 4. No offline session in Zustand — check localStorage cache
    const cachedSession = getCachedSession();
    if (cachedSession?.user?.id) {
      // Auto-restore from localStorage cache (don't wait for Zustand hydration)
      return {
        session: cachedSession,
        status: "authenticated" as const,
        isOffline: true,
      };
    }

    // 5. No session at all
    return {
      session: null,
      status: "unauthenticated" as const,
      isOffline: false,
    };
  }, [nextAuthSession, status, offlineSession]);

  return result;
}

/**
 * Get the current user ID from either the next-auth session or the offline session.
 * Useful for hooks that just need the userId (useLocalQuery, useLocalMutation, etc.)
 */
export function useAppUserId(): string {
  const { session } = useAppSession();
  return session?.user?.id ?? "";
}
