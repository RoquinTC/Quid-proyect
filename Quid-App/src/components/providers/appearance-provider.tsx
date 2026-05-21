'use client';

import { useEffect } from 'react';
import {
  ACCENT_CHANGE_EVENT,
  applyAccent,
  isAccentColor,
  readStoredAccent,
  type AccentColor,
} from '@/lib/personalization';

export function AppearanceProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const applyStoredAccent = () => applyAccent(readStoredAccent());

    applyStoredAccent();

    const handleAccentChange = (event: Event) => {
      const accent = (event as CustomEvent<AccentColor>).detail;
      if (isAccentColor(accent)) applyAccent(accent);
    };

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.attributeName === 'class')) {
        applyStoredAccent();
      }
    });

    window.addEventListener(ACCENT_CHANGE_EVENT, handleAccentChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      window.removeEventListener(ACCENT_CHANGE_EVENT, handleAccentChange);
      observer.disconnect();
    };
  }, []);

  return <>{children}</>;
}
