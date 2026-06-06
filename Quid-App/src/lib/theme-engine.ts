'use client';

export const THEME_FINISHES = ['flat', 'glass', 'neon', 'soft3d', 'liquid'] as const;
export const THEME_PALETTES = [
  'default',
  'dracula',
  'cyberpunk',
  'romantic',
  'ocean',
  'forest',
  'sunset',
  'aurora',
  'zen',
] as const;

export type ThemeFinish = (typeof THEME_FINISHES)[number];
export type ThemePalette = (typeof THEME_PALETTES)[number];

export const THEME_FINISH_KEY = 'quid-theme-finish';
export const THEME_PALETTE_KEY = 'quid-theme-palette';
export const THEME_CHANGE_EVENT = 'quid-theme-change';
export const DARK_VISUAL_THEMES: ThemePalette[] = ['dracula', 'cyberpunk'];
export type ThemeMode = 'light' | 'dark' | 'oled' | 'system';

export interface ThemeConfig {
  finish: ThemeFinish;
  palette: ThemePalette;
}

const DEFAULT_THEME: ThemeConfig = { finish: 'flat', palette: 'default' };

function isThemeFinish(value: string | null): value is ThemeFinish {
  return Boolean(value && THEME_FINISHES.includes(value as ThemeFinish));
}

function isThemePalette(value: string | null): value is ThemePalette {
  return Boolean(value && THEME_PALETTES.includes(value as ThemePalette));
}

export function readStoredTheme(): ThemeConfig {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    const storedFinish = window.localStorage.getItem(THEME_FINISH_KEY);
    const storedPalette = window.localStorage.getItem(THEME_PALETTE_KEY);
    const finish = isThemeFinish(storedFinish) ? storedFinish : DEFAULT_THEME.finish;
    const palette = isThemePalette(storedPalette) ? storedPalette : DEFAULT_THEME.palette;
    return { finish, palette };
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(config: ThemeConfig) {
  try {
    window.localStorage.setItem(THEME_FINISH_KEY, config.finish);
    window.localStorage.setItem(THEME_PALETTE_KEY, config.palette);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: config }));
  } catch {}
}

export function getRecommendedThemeModeForPalette(palette: ThemePalette): ThemeMode {
  return DARK_VISUAL_THEMES.includes(palette) ? 'oled' : 'light';
}

export function applyTheme(config: ThemeConfig) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  
  const expectedPalette = config.palette !== 'default' ? `theme-${config.palette}` : null;
  const expectedFinish = `finish-${config.finish}`;
  const shouldForceDark = DARK_VISUAL_THEMES.includes(config.palette);
  
  const currentClasses = Array.from(root.classList);
  const palettes = THEME_PALETTES.filter((palette) => palette !== 'default').map((palette) => `theme-${palette}`);
  const finishes = THEME_FINISHES.map((finish) => `finish-${finish}`);
  
  const currentPalette = currentClasses.find(c => palettes.includes(c)) || null;
  const currentFinish = currentClasses.find(c => finishes.includes(c)) || null;
  
  if (currentPalette !== expectedPalette || currentFinish !== expectedFinish) {
    palettes.forEach(c => {
      if (c !== expectedPalette && root.classList.contains(c)) root.classList.remove(c);
    });
    finishes.forEach(c => {
      if (c !== expectedFinish && root.classList.contains(c)) root.classList.remove(c);
    });
    
    if (expectedPalette && !root.classList.contains(expectedPalette)) {
      root.classList.add(expectedPalette);
    }
    if (expectedFinish && !root.classList.contains(expectedFinish)) {
      root.classList.add(expectedFinish);
    }
  }

  root.classList.toggle('theme-force-dark', shouldForceDark);

  root.dataset.themePalette = config.palette;
  root.dataset.themeFinish = config.finish;
}
