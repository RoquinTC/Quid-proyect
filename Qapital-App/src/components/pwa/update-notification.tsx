'use client';

import { RefreshCw, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UpdateNotificationProps {
  updateAvailable: boolean;
  onApplyUpdate: () => void;
  onDismiss: () => void;
}

export function UpdateNotification({
  updateAvailable,
  onApplyUpdate,
  onDismiss,
}: UpdateNotificationProps) {
  return (
    <AnimatePresence>
      {updateAvailable && (
        <motion.div
          initial={{ opacity: 0, y: -80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -80, scale: 0.95 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed top-4 left-4 right-4 z-[100] mx-auto max-w-md"
        >
          <div className="bg-white rounded-2xl shadow-xl border border-emerald-100 p-4 overflow-hidden relative">
            {/* Green accent bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-emerald-600" />

            <div className="flex items-center gap-3">
              {/* Icon with animation */}
              <div className="flex-shrink-0 w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <RefreshCw className="w-5 h-5 text-emerald-600 animate-spin" style={{ animationDuration: '3s' }} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-gray-900">
                  ¡Actualización disponible!
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Hay una nueva versión de Quid lista para usar.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={onApplyUpdate}
                  className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 active:scale-95 transition-all"
                >
                  Actualizar
                </button>
                <button
                  onClick={onDismiss}
                  className="p-1.5 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-50"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
