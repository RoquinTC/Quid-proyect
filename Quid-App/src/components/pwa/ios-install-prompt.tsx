'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, Share, Plus, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const DISMISS_KEY = 'quid-ios-install-dismissed';
const VISIT_KEY = 'quid-ios-install-visits';
const COOLDOWN_HOURS = 168; // 7 days

function isIOSSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

export function IosInstallPrompt() {
  const [showBanner, setShowBanner] = useState(false);

  const shouldShow = useCallback(() => {
    if (!isIOSSafari() || isStandalone()) return false;

    // Already installed
    if (localStorage.getItem('quid-installed') === 'true') return false;

    // Check cooldown
    const dismissedTime = localStorage.getItem(DISMISS_KEY);
    if (dismissedTime) {
      const hoursSince = (Date.now() - parseInt(dismissedTime, 10)) / (1000 * 60 * 60);
      if (hoursSince < COOLDOWN_HOURS) return false;
    }

    // Check visit count — show after 2 visits
    const visits = parseInt(localStorage.getItem(VISIT_KEY) || '0', 10);
    return visits >= 2;
  }, []);

  useEffect(() => {
    if (!isIOSSafari() || isStandalone()) return;

    // Increment visit count
    try {
      const visits = parseInt(localStorage.getItem(VISIT_KEY) || '0', 10);
      localStorage.setItem(VISIT_KEY, (visits + 1).toString());
    } catch { /* ignore */ }

    // Check after a delay
    const timer = setTimeout(() => {
      if (shouldShow()) setShowBanner(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [shouldShow]);

  // Mark as installed when entering standalone mode
  useEffect(() => {
    if (isStandalone()) {
      localStorage.setItem('quid-installed', 'true');
      setShowBanner(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setShowBanner(false);
    localStorage.setItem(DISMISS_KEY, Date.now().toString());
  }, []);

  if (!showBanner) return null;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-end justify-center"
          onClick={handleDismiss}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="w-full max-w-md bg-white dark:bg-gray-900 rounded-t-3xl overflow-hidden safe-area-bottom"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Green accent bar */}
            <div className="h-1.5 bg-gradient-to-r from-emerald-400 to-teal-500" />

            <div className="p-6 pb-8">
              {/* Close button */}
              <button
                onClick={handleDismiss}
                className="absolute top-4 right-4 size-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="size-4" />
              </button>

              {/* Header */}
              <div className="flex items-center gap-3 mb-5">
                <div className="size-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                  <img src="/icon-192.png" alt="Quid" className="size-8 rounded-xl" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    Instalar Quid
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Accede más rápido desde tu pantalla de inicio
                  </p>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-4 mb-6">
                {/* Step 1 */}
                <div className="flex items-start gap-3">
                  <div className="size-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400">1</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Toca el botón Compartir
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Está en la barra inferior de Safari
                    </p>
                    <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <Share className="size-5 text-blue-500" />
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        Icono de cuadro con flecha hacia arriba
                      </span>
                    </div>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="flex items-start gap-3">
                  <div className="size-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">2</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Selecciona &quot;Agregar a pantalla de inicio&quot;
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Desliza hacia abajo en el menú si no lo ves
                    </p>
                    <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-xl">
                      <Plus className="size-5 text-emerald-500" />
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                        Agregar a pantalla de inicio
                      </span>
                    </div>
                  </div>
                </div>

                {/* Step 3 */}
                <div className="flex items-start gap-3">
                  <div className="size-8 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400">3</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      Toca &quot;Agregar&quot;
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Quid aparecerá en tu pantalla de inicio como una app nativa
                    </p>
                  </div>
                </div>
              </div>

              {/* Dismiss button */}
              <button
                onClick={handleDismiss}
                className="w-full py-3 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
              >
                Ahora no
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
