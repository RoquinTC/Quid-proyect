"use client";

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────

export interface AchievementFeature {
  feature: string;
  label: string;
  description: string;
  icon: string;
  discovered: boolean;
  discoveredAt: string | null;
  dismissed: boolean;
}

export interface ModuleProgress {
  features: AchievementFeature[];
  total: number;
  discovered: number;
  percentage: number;
}

export interface AchievementsData {
  modules: Record<string, ModuleProgress>;
  overall: {
    total: number;
    discovered: number;
    percentage: number;
  };
  scanned: boolean;
}

interface AchievementsContextValue extends AchievementsData {
  loading: boolean;
  refresh: () => Promise<void>;
  markDiscovered: (module: string, feature: string) => Promise<void>;
  dismissHint: (module: string, feature: string) => Promise<void>;
  runScan: () => Promise<void>;
  isUndiscovered: (module: string, feature: string) => boolean;
}

// ─── Context ─────────────────────────────────────────────────────────

const AchievementsContext = createContext<AchievementsContextValue | null>(null);

export function useAchievements() {
  const ctx = useContext(AchievementsContext);
  if (!ctx) throw new Error("useAchievements must be used within AchievementsProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────

export function AchievementsProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AchievementsData>({
    modules: {},
    overall: { total: 0, discovered: 0, percentage: 0 },
    scanned: false,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await apiFetch<AchievementsData>("/api/achievements");
      setData({ ...result, scanned: true });
    } catch (error) {
      console.error("Error loading achievements:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const runScan = useCallback(async () => {
    try {
      await apiFetch("/api/achievements/scan", { method: "POST" });
      await refresh();
    } catch (error) {
      console.error("Error running achievement scan:", error);
    }
  }, [refresh]);

  const markDiscovered = useCallback(async (module: string, feature: string) => {
    try {
      await apiFetch("/api/achievements", {
        method: "POST",
        body: JSON.stringify({ module, feature }),
      });
      // Optimistic update
      setData(prev => {
        const moduleData = prev.modules[module];
        if (!moduleData) return prev;
        const featureData = moduleData.features.find(f => f.feature === feature);
        if (!featureData || featureData.discovered) return prev;

        const newModules = {
          ...prev.modules,
          [module]: {
            ...moduleData,
            features: moduleData.features.map(f =>
              f.feature === feature ? { ...f, discovered: true, discoveredAt: new Date().toISOString() } : f
            ),
            discovered: moduleData.discovered + 1,
            percentage: Math.round(((moduleData.discovered + 1) / moduleData.total) * 100),
          },
        };

        const newOverallDiscovered = prev.overall.discovered + 1;
        return {
          ...prev,
          modules: newModules,
          overall: {
            ...prev.overall,
            discovered: newOverallDiscovered,
            percentage: Math.round((newOverallDiscovered / prev.overall.total) * 100),
          },
        };
      });
    } catch (error) {
      console.error("Error marking achievement:", error);
    }
  }, []);

  const dismissHint = useCallback(async (module: string, feature: string) => {
    try {
      await apiFetch("/api/achievements", {
        method: "PATCH",
        body: JSON.stringify({ module, feature, dismissed: true }),
      });
      // Optimistic update
      setData(prev => {
        const moduleData = prev.modules[module];
        if (!moduleData) return prev;
        return {
          ...prev,
          modules: {
            ...prev.modules,
            [module]: {
              ...moduleData,
              features: moduleData.features.map(f =>
                f.feature === feature ? { ...f, dismissed: true } : f
              ),
            },
          },
        };
      });
    } catch (error) {
      console.error("Error dismissing hint:", error);
    }
  }, []);

  const isUndiscovered = useCallback((module: string, feature: string): boolean => {
    const moduleData = data.modules[module];
    if (!moduleData) return true;
    const featureData = moduleData.features.find(f => f.feature === feature);
    return !featureData?.discovered && !featureData?.dismissed;
  }, [data]);

  // Load achievements on mount + run initial scan
  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await runScan(); // This will scan existing data and then refresh
    };
    init();
  }, [runScan]);

  return (
    <AchievementsContext.Provider value={{
      ...data,
      loading,
      refresh,
      markDiscovered,
      dismissHint,
      runScan,
      isUndiscovered,
    }}>
      {children}
    </AchievementsContext.Provider>
  );
}
