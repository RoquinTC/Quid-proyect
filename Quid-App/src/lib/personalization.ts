'use client';

export type AccentColor = 'emerald' | 'blue' | 'violet' | 'rose' | 'amber';

export interface AccentOption {
  id: AccentColor;
  label: string;
  swatch: string;
  light: {
    primary: string;
    primaryForeground: string;
    ring: string;
    selection: string;
  };
  dark: {
    primary: string;
    primaryForeground: string;
    ring: string;
    selection: string;
  };
}

export const ACCENT_STORAGE_KEY = 'quid-accent-color';
export const ACCENT_CHANGE_EVENT = 'quid-accent-change';
export const DEFAULT_ACCENT: AccentColor = 'emerald';

export const ACCENT_OPTIONS: AccentOption[] = [
  {
    id: 'emerald',
    label: 'Menta',
    swatch: '#059669',
    light: {
      primary: 'oklch(0.55 0.17 160)',
      primaryForeground: 'oklch(0.99 0 0)',
      ring: 'oklch(0.55 0.17 160)',
      selection: 'oklch(0.55 0.17 160 / 20%)',
    },
    dark: {
      primary: 'oklch(0.65 0.17 160)',
      primaryForeground: 'oklch(0.12 0.01 155)',
      ring: 'oklch(0.65 0.17 160)',
      selection: 'oklch(0.65 0.17 160 / 24%)',
    },
  },
  {
    id: 'blue',
    label: 'Azul',
    swatch: '#2563EB',
    light: {
      primary: 'oklch(0.55 0.2 255)',
      primaryForeground: 'oklch(0.99 0 0)',
      ring: 'oklch(0.55 0.2 255)',
      selection: 'oklch(0.55 0.2 255 / 18%)',
    },
    dark: {
      primary: 'oklch(0.68 0.17 255)',
      primaryForeground: 'oklch(0.12 0.02 255)',
      ring: 'oklch(0.68 0.17 255)',
      selection: 'oklch(0.68 0.17 255 / 24%)',
    },
  },
  {
    id: 'violet',
    label: 'Violeta',
    swatch: '#7C3AED',
    light: {
      primary: 'oklch(0.55 0.22 295)',
      primaryForeground: 'oklch(0.99 0 0)',
      ring: 'oklch(0.55 0.22 295)',
      selection: 'oklch(0.55 0.22 295 / 18%)',
    },
    dark: {
      primary: 'oklch(0.72 0.18 295)',
      primaryForeground: 'oklch(0.14 0.03 295)',
      ring: 'oklch(0.72 0.18 295)',
      selection: 'oklch(0.72 0.18 295 / 24%)',
    },
  },
  {
    id: 'rose',
    label: 'Rosa',
    swatch: '#E11D48',
    light: {
      primary: 'oklch(0.56 0.22 15)',
      primaryForeground: 'oklch(0.99 0 0)',
      ring: 'oklch(0.56 0.22 15)',
      selection: 'oklch(0.56 0.22 15 / 18%)',
    },
    dark: {
      primary: 'oklch(0.68 0.2 15)',
      primaryForeground: 'oklch(0.14 0.03 15)',
      ring: 'oklch(0.68 0.2 15)',
      selection: 'oklch(0.68 0.2 15 / 24%)',
    },
  },
  {
    id: 'amber',
    label: 'Ambar',
    swatch: '#D97706',
    light: {
      primary: 'oklch(0.62 0.17 70)',
      primaryForeground: 'oklch(0.16 0.04 70)',
      ring: 'oklch(0.62 0.17 70)',
      selection: 'oklch(0.62 0.17 70 / 20%)',
    },
    dark: {
      primary: 'oklch(0.78 0.16 75)',
      primaryForeground: 'oklch(0.15 0.04 75)',
      ring: 'oklch(0.78 0.16 75)',
      selection: 'oklch(0.78 0.16 75 / 24%)',
    },
  },
];

export function isAccentColor(value: string | null): value is AccentColor {
  return !!value && ACCENT_OPTIONS.some((option) => option.id === value);
}

export function getAccentOption(accent: AccentColor) {
  return ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0];
}

export function readStoredAccent(): AccentColor {
  if (typeof window === 'undefined') return DEFAULT_ACCENT;

  try {
    const value = window.localStorage.getItem(ACCENT_STORAGE_KEY);
    return isAccentColor(value) ? value : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function storeAccent(accent: AccentColor) {
  try {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    window.dispatchEvent(new CustomEvent(ACCENT_CHANGE_EVENT, { detail: accent }));
  } catch {
    // localStorage can be restricted in private/offline contexts.
  }
}

export function applyAccent(accent: AccentColor) {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const option = getAccentOption(accent);
  const palette = root.classList.contains('dark') ? option.dark : option.light;

  root.dataset.accent = accent;
  root.style.setProperty('--primary', palette.primary);
  root.style.setProperty('--primary-foreground', palette.primaryForeground);
  root.style.setProperty('--ring', palette.ring);
  root.style.setProperty('--sidebar-primary', palette.primary);
  root.style.setProperty('--sidebar-ring', palette.ring);
  root.style.setProperty('--selection-background', palette.selection);

  const metaThemeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  metaThemeColor?.setAttribute('content', option.swatch);
}
