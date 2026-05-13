import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  // Available locales — extend as needed (e.g. add "en" for English)
  locales: ["es", "en"],
  // Default locale (matches the current hardcoded Spanish UI)
  defaultLocale: "es",
  // No locale prefix in URLs — keeps existing routes unchanged
  // e.g. /dashboard stays /dashboard, not /es/dashboard
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
