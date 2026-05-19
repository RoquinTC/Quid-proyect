"use client";

import { AppShell } from "@/components/layout/app-shell";
import { Providers } from "@/components/layout/providers";

export default function Home() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  );
}
