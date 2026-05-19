'use client';

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { Download, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Use useSyncExternalStore to detect standalone mode reactively
function useIsStandalone() {
  const subscribe = useCallback((callback: () => void) => {
    const mql = window.matchMedia('(display-mode: standalone)');
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  }, []);

  const getSnapshot = useCallback(() => {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  }, []);

  const getServerSnapshot = useCallback(() => false, []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);
  const isStandalone = useIsStandalone();

  // Check if user already installed (localStorage flag)
  const getWasInstalled = useCallback(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('quid-installed') === 'true';
  }, []);

  useEffect(() => {
    let bannerTimeoutId: number | null = null;

    // If already in standalone mode or was already installed, don't show
    if (isStandalone || getWasInstalled()) {
      return;
    }

    // Check if user previously dismissed
    const dismissedTime = localStorage.getItem('quid-install-dismissed');
    if (dismissedTime) {
      const dismissed = parseInt(dismissedTime, 10);
      const hoursSinceDismissed = (Date.now() - dismissed) / (1000 * 60 * 60);
      // Show again after 48 hours
      if (hoursSinceDismissed < 48) {
        return;
      }
    }

    // Listen for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);

      // Show banner after a short delay (don't be too aggressive)
      // Store timeout ID so we can clean it up on unmount (StrictMode safe)
      bannerTimeoutId = window.setTimeout(() => {
        setShowBanner(true);
      }, 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    const installedHandler = () => {
      localStorage.setItem('quid-installed', 'true');
      setShowBanner(false);
      setDeferredPrompt(null);
      console.log('[PWA] App installed successfully');
    };

    window.addEventListener('appinstalled', installedHandler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
      if (bannerTimeoutId !== null) {
        clearTimeout(bannerTimeoutId);
      }
    };
  }, [isStandalone, getWasInstalled]);

  // If standalone mode changed to true (app opened as installed), mark as installed
  useEffect(() => {
    if (isStandalone) {
      localStorage.setItem('quid-installed', 'true');
      setShowBanner(false);
      setDeferredPrompt(null);
    }
  }, [isStandalone]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        console.log('[PWA] User accepted install prompt');
        localStorage.setItem('quid-installed', 'true');
      } else {
        console.log('[PWA] User dismissed install prompt');
      }
    } catch (error) {
      console.error('[PWA] Install prompt error:', error);
    } finally {
      setDeferredPrompt(null);
      setShowBanner(false);
    }
  }, [deferredPrompt]);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem('quid-install-dismissed', Date.now().toString());
  }, []);

  // Don't show if already in standalone, already installed, or no prompt available
  if (isStandalone || getWasInstalled() || !deferredPrompt) return null;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-md"
        >
          <div className="bg-white rounded-2xl shadow-xl border border-emerald-100 p-4 overflow-hidden relative">
            {/* Green accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-600" />

            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex-shrink-0 w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Download className="w-5 h-5 text-emerald-600" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">
                  Instalar Quid
                </h3>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                  Accede más rápido y úsala sin conexión. Se instala en segundos.
                </p>

                {/* Buttons */}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleInstall}
                    className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 active:scale-95 transition-all"
                  >
                    Instalar App
                  </button>
                  <button
                    onClick={handleDismiss}
                    className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Ahora no
                  </button>
                </div>
              </div>

              {/* Close button */}
              <button
                onClick={handleDismiss}
                className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
