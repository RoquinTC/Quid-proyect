"use client";

import { SessionProvider } from "next-auth/react";
import { SyncProvider } from "@/lib/local/sync/provider";
import { PWAProvider } from "@/components/pwa";
import { AutoBackupHandler } from "@/components/settings/auto-backup-handler";

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
          <AutoBackupHandler />
          {children}
        </PWAProvider>
      </SyncProvider>
    </SessionProvider>
  );
}
