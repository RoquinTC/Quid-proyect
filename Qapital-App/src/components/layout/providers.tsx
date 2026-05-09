"use client";

import { SessionProvider } from "next-auth/react";
import { SyncProvider } from "@/lib/local/sync/provider";
import { PWAProvider } from "@/components/pwa";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Required for cross-origin iframe: cookies with SameSite=None
      // need credentials to be explicitly included in fetch requests
      refetchInterval={15}
      refetchOnWindowFocus={true}
    >
      <SyncProvider>
        <PWAProvider>
          {children}
        </PWAProvider>
      </SyncProvider>
    </SessionProvider>
  );
}
