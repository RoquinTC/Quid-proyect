'use client';

import { useEffect } from 'react';
import {
  ACCENT_CHANGE_EVENT,
  applyAccent,
  isAccentColor,
  readStoredAccent,
  type AccentColor,
} from '@/lib/personalization';
import {
  THEME_CHANGE_EVENT,
  applyTheme,
  readStoredTheme,
  type ThemeConfig
} from '@/lib/theme-engine';

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const applyStoredAccent = () => applyAccent(readStoredAccent());
    const applyStoredThemeConfig = () => applyTheme(readStoredTheme());

    applyStoredAccent();
    applyStoredThemeConfig();

    const handleAccentChange = (event: Event) => {
      const accent = (event as CustomEvent<AccentColor>).detail;
      if (isAccentColor(accent)) applyAccent(accent);
    };

    const handleThemeChange = (event: Event) => {
      const config = (event as CustomEvent<ThemeConfig>).detail;
      applyTheme(config);
    };

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === 'class')) {
        applyStoredAccent();
        applyStoredThemeConfig();
      }
    });

    window.addEventListener(ACCENT_CHANGE_EVENT, handleAccentChange);
    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener(ACCENT_CHANGE_EVENT, handleAccentChange);
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange);
      observer.disconnect();
    };
  }, []);

  return <>{children}</>;
}
