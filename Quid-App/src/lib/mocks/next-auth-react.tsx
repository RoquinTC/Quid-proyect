import React, { createContext, useState, useEffect } from "react";
import {
  apiRequest,
  clearMobileSessionToken,
  setMobileSessionToken,
} from "@/lib/api-url";
import { signInWithNativeGoogle, signOutFromNativeGoogle } from "@/lib/native/google-auth";

const SessionContext = createContext<any>({ data: null, status: "loading" });

export function SessionProvider({ children }: any) {
  const sessionData = useSession();
  return (
    <SessionContext.Provider value={sessionData}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const [session, setSession] = useState<any>(null);
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");

  useEffect(() => {
    let isMounted = true;
    const refreshSession = async () => {
      try {
        const res = await apiRequest("/api/auth/mobile/session");
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!isMounted) return;
        if (data && Object.keys(data).length > 0 && data.user) {
          setSession(data);
          setStatus("authenticated");
          return;
        }
      } catch {
        if (!isMounted) return;
      }

      if (isMounted) {
          setSession(null);
          setStatus("unauthenticated");
      }
    };

    refreshSession();
    window.addEventListener("quid-session-refresh", refreshSession);

    return () => {
      isMounted = false;
      window.removeEventListener("quid-session-refresh", refreshSession);
    };
  }, []);

  return {
    data: session,
    status,
    update: async () => {
      window.dispatchEvent(new Event("quid-session-refresh"));
    },
  };
}

export async function signIn(provider: string, options: any) {
  console.log("Mock signIn called for provider:", provider);

  if (provider === "credentials") {
    try {
      const res = await apiRequest("/api/auth/mobile/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.token) {
        setMobileSessionToken(data.token);
        const sessionRes = await apiRequest("/api/auth/mobile/session");
        const session = sessionRes.ok ? await sessionRes.json().catch(() => null) : null;
        if (!session?.user) {
          clearMobileSessionToken();
          return {
            error: "La sesión móvil no pudo validarse. Intenta nuevamente.",
          };
        }
        window.dispatchEvent(new Event("quid-session-refresh"));
        return { error: null, ok: true, status: res.status, url: data.url };
      } else {
        return { error: data.error || "Fallo de autenticación" };
      }
    } catch (err) {
      return { error: String(err) };
    }
  } else if (provider === "google") {
    try {
      const googleAccount = await signInWithNativeGoogle();
      const res = await apiRequest("/api/auth/mobile/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: googleAccount.idToken }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.token) {
        return { error: data.error || "No se pudo iniciar sesion con Google" };
      }

      setMobileSessionToken(data.token);
      window.dispatchEvent(new Event("quid-session-refresh"));
      return { error: null, ok: true, status: res.status, url: data.url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { error: message || "GoogleNativeUnavailable" };
    }
  }
}

export async function signOut(options?: any) {
  console.log("Mock signOut called");
  clearMobileSessionToken();
  await signOutFromNativeGoogle().catch(() => undefined);

  if (options?.redirect !== false) {
    if (typeof window !== "undefined") {
      window.location.href = "/";
    }
  } else {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }
}
