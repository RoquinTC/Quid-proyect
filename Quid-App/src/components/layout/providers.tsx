"use client";

import { SessionProvider } from "next-auth/react";
import { SyncProvider } from "@/lib/local/sync/provider";
import { PWAProvider } from "@/components/pwa";
import { AutoBackupHandler } from "@/components/settings/auto-backup-handler";
import { NativeDeviceBridge } from "@/components/native/native-device-bridge";
import { installNativeApiFetchBridge } from "@/lib/api-url";
import { usePreferencesSync } from "@/hooks/use-preferences-sync";

function resolveSessionBasePath(): string {
  if (typeof window !== "undefined") {
    const origin = window.location.origin;
    const capacitor = (window as any).Capacitor;
    const isCapacitor =
      origin.startsWith("capacitor://") ||
      origin.startsWith("file://") ||
      capacitor?.isNativePlatform?.() === true;

    if (isCapacitor) {
      installNativeApiFetchBridge();
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || "https://quid.roquintc.app";
      // Globally set __NEXTAUTH so that next-auth/react functions like signIn and signOut work
      (window as any).__NEXTAUTH = {
        basePath: `${backendUrl}/api/auth`,
        baseUrl: backendUrl,
      };
      return `${backendUrl}/api/auth`;
    }
  }
  return "/api/auth";
}

export function Providers({ children }: { children: React.ReactNode }) {
  const basePath = resolveSessionBasePath();
  // F-51 · Carga las preferencias de presentación (decimales) al arrancar.
  usePreferencesSync();

  return (
    <SessionProvider
      basePath={basePath}
      session={process.env.STATIC_EXPORT === "true" ? null : undefined}
      // Required for cross-origin iframe: cookies with SameSite=None
      // need credentials to be explicitly included in fetch requests
      refetchInterval={15}
      refetchOnWindowFocus={true}
    >
      <SyncProvider>
        <PWAProvider>
          <AutoBackupHandler />
          <NativeDeviceBridge />
          {children}
        </PWAProvider>
      </SyncProvider>
    </SessionProvider>
  );
}
