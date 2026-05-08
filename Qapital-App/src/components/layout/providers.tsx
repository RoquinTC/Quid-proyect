"use client";

import { SessionProvider } from "next-auth/react";
import { SyncProvider } from "@/lib/local/sync/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Required for cross-origin iframe: cookies with SameSite=None
      // need credentials to be explicitly included in fetch requests
      refetchInterval={15}
      refetchOnWindowFocus={true}
    >
      <SyncProvider>
        {children}
      </SyncProvider>
    </SessionProvider>
  );
}
