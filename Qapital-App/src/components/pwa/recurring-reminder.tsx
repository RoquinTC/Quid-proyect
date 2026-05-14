'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';

/**
 * RecurringReminder checks for pending recurring payments due today
 * and sends a push notification on app load (once per day).
 */
export function RecurringReminder() {
  const { data: session } = useSession();
  const checkedToday = useRef<string | null>(null);

  useEffect(() => {
    if (!session?.user) return;

    // Only check once per day (store the date we last checked)
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Bogota' });
    const lastChecked = typeof window !== 'undefined'
      ? localStorage.getItem('qapital-recurring-checked')
      : null;

    if (lastChecked === today) return;

    // Mark as checked for today
    if (typeof window !== 'undefined') {
      localStorage.setItem('qapital-recurring-checked', today);
    }

    // Trigger the recurring reminder check
    apiFetch('/api/push/recurring-reminder')
      .then((data) => {
        if (data.sent) {
          console.log(`[RecurringReminder] ${data.count} payment(s) due today, notification sent`);
        }
      })
      .catch((err) => {
        // Silently fail — this is a nice-to-have feature
        console.warn('[RecurringReminder] Check failed:', err);
      });
  }, [session?.user]);

  return null; // This component renders nothing
}
