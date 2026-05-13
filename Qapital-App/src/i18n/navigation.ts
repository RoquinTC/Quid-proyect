import { useTranslations as useNextIntlTranslations } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

// Lightweight navigation helpers (locale-aware, no prefix for default locale)
export const { Link, redirect, usePathname, useRouter } =
  createNavigation(routing);

// Re-export for convenience
export { useNextIntlTranslations as useTranslations };
