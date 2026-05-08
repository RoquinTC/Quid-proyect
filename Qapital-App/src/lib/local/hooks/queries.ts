'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { localDB } from '../db';
import { useSync } from '../sync/provider';

/**
 * Hook: Get all accounts for the current user from IndexedDB.
 * Data is reactive — updates automatically when IndexedDB changes.
 */
export function useLocalAccounts(userId: string | undefined) {
  const { phase } = useSync();

  const accounts = useLiveQuery(
    () => {
      if (!userId) return [];
      return localDB.accounts
        .where('userId')
        .equals(userId)
        .sortBy('order');
    },
    [userId],
    [] // Default empty array while loading
  );

  return {
    accounts,
    isLoading: phase === 'idle' || phase === 'initializing',
  };
}

/**
 * Hook: Get all transactions for the current user from IndexedDB.
 */
export function useLocalTransactions(userId: string | undefined, filters?: {
  accountId?: string;
  type?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
}) {
  const { phase } = useSync();

  const transactions = useLiveQuery(
    () => {
      if (!userId) return [];

      let collection = localDB.transactions
        .where('userId')
        .equals(userId);

      return collection.sortBy('date').then((txs) => {
        let filtered = txs;

        if (filters?.accountId) {
          filtered = filtered.filter((tx) => tx.accountId === filters.accountId);
        }
        if (filters?.type) {
          filtered = filtered.filter((tx) => tx.type === filters.type);
        }
        if (filters?.category) {
          filtered = filtered.filter((tx) => tx.category === filters.category);
        }
        if (filters?.startDate) {
          filtered = filtered.filter((tx) => tx.date >= filters.startDate!);
        }
        if (filters?.endDate) {
          filtered = filtered.filter((tx) => tx.date <= filters.endDate!);
        }

        // Return newest first
        return filtered.reverse();
      });
    },
    [userId, JSON.stringify(filters)],
    []
  );

  return {
    transactions,
    isLoading: phase === 'idle' || phase === 'initializing',
  };
}

/**
 * Hook: Get all budgets for the current user from IndexedDB.
 */
export function useLocalBudgets(userId: string | undefined) {
  const { phase } = useSync();

  const budgets = useLiveQuery(
    () => {
      if (!userId) return [];
      return localDB.budgets
        .where('userId')
        .equals(userId)
        .toArray();
    },
    [userId],
    []
  );

  return {
    budgets,
    isLoading: phase === 'idle' || phase === 'initializing',
  };
}

/**
 * Hook: Get all debts for the current user from IndexedDB.
 */
export function useLocalDebts(userId: string | undefined) {
  const { phase } = useSync();

  const debts = useLiveQuery(
    () => {
      if (!userId) return [];
      return localDB.debts
        .where('userId')
        .equals(userId)
        .toArray();
    },
    [userId],
    []
  );

  return {
    debts,
    isLoading: phase === 'idle' || phase === 'initializing',
  };
}

/**
 * Hook: Get all recurring payments for the current user from IndexedDB.
 */
export function useLocalRecurringPayments(userId: string | undefined) {
  const { phase } = useSync();

  const payments = useLiveQuery(
    () => {
      if (!userId) return [];
      return localDB.recurringPayments
        .where('userId')
        .equals(userId)
        .sortBy('scheduledDate');
    },
    [userId],
    []
  );

  return {
    payments,
    isLoading: phase === 'idle' || phase === 'initializing',
  };
}

/**
 * Hook: Get all savings goals for the current user from IndexedDB.
 */
export function useLocalSavingsGoals(userId: string | undefined) {
  const { phase } = useSync();

  const goals = useLiveQuery(
    () => {
      if (!userId) return [];
      return localDB.savingsGoals
        .where('userId')
        .equals(userId)
        .toArray();
    },
    [userId],
    []
  );

  return {
    goals,
    isLoading: phase === 'idle' || phase === 'initializing',
  };
}

/**
 * Hook: Get all vehicles for the current user from IndexedDB.
 */
export function useLocalVehicles(userId: string | undefined) {
  const { phase } = useSync();

  const vehicles = useLiveQuery(
    () => {
      if (!userId) return [];
      return localDB.vehicles
        .where('userId')
        .equals(userId)
        .toArray();
    },
    [userId],
    []
  );

  return {
    vehicles,
    isLoading: phase === 'idle' || phase === 'initializing',
  };
}

/**
 * Hook: Get user settings from IndexedDB.
 */
export function useLocalUserSettings(userId: string | undefined) {
  const { phase } = useSync();

  const settings = useLiveQuery(
    () => {
      if (!userId) return null;
      return localDB.userSettings
        .where('userId')
        .equals(userId)
        .first();
    },
    [userId],
    null
  );

  return {
    settings,
    isLoading: phase === 'idle' || phase === 'initializing',
  };
}
