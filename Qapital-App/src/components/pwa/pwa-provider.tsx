'use client';

import { useState, useCallback } from 'react';
import { useServiceWorker } from './use-service-worker';
import { InstallPrompt } from './install-prompt';
import { UpdateNotification } from './update-notification';
import { OfflineIndicator } from './offline-indicator';
import { RecurringReminder } from './recurring-reminder';

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const { updateAvailable, isOffline, applyUpdate, isSupported } = useServiceWorker();
  const [dismissedUpdate, setDismissedUpdate] = useState(false);

  const handleDismissUpdate = useCallback(() => {
    setDismissedUpdate(true);
    // Re-show after 30 minutes
    setTimeout(() => setDismissedUpdate(false), 30 * 60 * 1000);
  }, []);

  // Don't render PWA features if not supported
  if (!isSupported) {
    return (
      <>
        {children}
        <RecurringReminder />
      </>
    );
  }

  return (
    <>
      {children}
      <OfflineIndicator isOffline={isOffline} />
      <InstallPrompt />
      <UpdateNotification
        updateAvailable={updateAvailable && !dismissedUpdate}
        onApplyUpdate={applyUpdate}
        onDismiss={handleDismissUpdate}
      />
      <RecurringReminder />
    </>
  );
}
