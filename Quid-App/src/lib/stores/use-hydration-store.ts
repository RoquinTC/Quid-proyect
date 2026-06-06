import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HydrationLog {
  id: string;
  amountMl: number;
  timestamp: number;
}

interface HydrationState {
  dailyGoalMl: number;
  logs: HydrationLog[];
  setDailyGoal: (ml: number) => void;
  addWater: (ml: number) => void;
  removeLog: (id: string) => void;
  getTodayTotal: () => number;
}

export const useHydrationStore = create<HydrationState>()(
  persist(
    (set, get) => ({
      dailyGoalMl: 2500, // Default goal: 2.5 Liters
      logs: [],

      setDailyGoal: (ml) => set({ dailyGoalMl: ml }),

      addWater: (ml) => {
        const newLog: HydrationLog = {
          id: crypto.randomUUID(),
          amountMl: ml,
          timestamp: Date.now(),
        };
        set((state) => ({ logs: [...state.logs, newLog] }));
      },

      removeLog: (id) => {
        set((state) => ({ logs: state.logs.filter((log) => log.id !== id) }));
      },

      getTodayTotal: () => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        
        return get().logs
          .filter((log) => log.timestamp >= startOfDay)
          .reduce((total, log) => total + log.amountMl, 0);
      },
    }),
    {
      name: "quid-hydration-storage",
    }
  )
);
