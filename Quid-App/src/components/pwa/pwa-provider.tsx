'use client';

import { useState, useCallback, useEffect } from 'react';
import { useServiceWorker } from './use-service-worker';
import { InstallPrompt } from './install-prompt';
import { IosInstallPrompt } from './ios-install-prompt';
import { UpdateNotification } from './update-notification';
import { OfflineIndicator } from './offline-indicator';
import { RecurringReminder } from './recurring-reminder';
import { CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function PWAProvider({ children }: { children: React.ReactNode }) {
  const { updateAvailable, isOffline, applyUpdate, isSupported } = useServiceWorker();
  const [dismissedUpdate, setDismissedUpdate] = useState(false);
  const [showUpdateToast, setShowUpdateToast] = useState(false);

  const handleDismissUpdate = useCallback(() => {
    setDismissedUpdate(true);
    // Re-show after 30 minutes
    setTimeout(() => setDismissedUpdate(false), 30 * 60 * 1000);
  }, []);

  // Check for post-update confirmation on mount
  useEffect(() => {
    try {
      const justUpdated = sessionStorage.getItem('pwa-just-updated');
      if (justUpdated === 'true') {
        sessionStorage.removeItem('pwa-just-updated');
        setShowUpdateToast(true);
        // Auto-hide after 3 seconds
        const timer = setTimeout(() => setShowUpdateToast(false), 3000);
        return () => clearTimeout(timer);
      }
    } catch {
      // sessionStorage may be unavailable
    }
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
      <IosInstallPrompt />
      <UpdateNotification
        updateAvailable={updateAvailable && !dismissedUpdate}
        onApplyUpdate={applyUpdate}
        onDismiss={handleDismissUpdate}
      />
      <RecurringReminder />

      {/* Post-update confirmation toast */}
      <AnimatePresence>
        {showUpdateToast && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -40, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed top-4 left-4 right-4 z-[100] mx-auto max-w-sm"
          >
            <div className="bg-white rounded-2xl shadow-xl border border-emerald-100 p-3 flex items-center gap-3 overflow-hidden relative">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-600" />
              <div className="flex-shrink-0 w-8 h-8 bg-emerald-50 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900">App actualizada</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
