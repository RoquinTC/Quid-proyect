'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';

/**
 * Client-side fallback for reminders. The production path is
 * /api/push/reminders called by a server cron so notifications can arrive
 * even when the app is closed.
 */
export function RecurringReminder() {
  const { data: session } = useSession();
  const checkedToday = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    // Only check once per day (store the date we last checked)
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
    const lastChecked = typeof window !== 'undefined'
      ? localStorage.getItem('quid-recurring-checked')
      : null;

    if (lastChecked === today) return;

    // Mark as checked for today
    if (typeof window !== 'undefined') {
      localStorage.setItem('quid-recurring-checked', today);
    }

    // Trigger the reminder check as a fallback when the app opens.
    apiFetch<{ sent?: number }>('/api/push/reminders')
      .then((data) => {
        if (data?.sent && data.sent > 0) {
          console.log(`[RecurringReminder] ${data.sent} reminder notification(s) sent`);
        }
      })
      .catch((err) => {
        // Silently fail — this is a nice-to-have feature
        console.warn('[RecurringReminder] Check failed:', err);
      });
  }, [session?.user]);

  return null; // This component renders nothing
}
