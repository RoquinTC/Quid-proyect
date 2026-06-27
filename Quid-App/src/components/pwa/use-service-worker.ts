'use client';

import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';

interface SWRegistration {
  registration: ServiceWorkerRegistration | null;
  updateAvailable: boolean;
  currentVersion: string | null;
  pendingVersion: string | null;
}

// Use useSyncExternalStore for online/offline status (avoids setState in effect)
function useOnlineStatus() {
  const subscribe = useCallback((callback: () => void) => {
    window.addEventListener('online', callback);
    window.addEventListener('offline', callback);
    return () => {
      window.removeEventListener('online', callback);
      window.removeEventListener('offline', callback);
    };
  }, []);

  const getSnapshot = useCallback(() => {
    return navigator.onLine;
  }, []);

  const getServerSnapshot = useCallback(() => {
    return true; // Assume online on server
  }, []);

  return !useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useServiceWorker() {
  const [state, setState] = useState<SWRegistration>({
    registration: null,
    updateAvailable: false,
    currentVersion: null,
    pendingVersion: null,
  });

  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const isOffline = useOnlineStatus();

  const getServiceWorkerVersion = useCallback((worker: ServiceWorker | null) => {
    if (!worker) return Promise.resolve<string | null>(null);

    return new Promise<string | null>((resolve) => {
      const channel = new MessageChannel();
      const timeout = window.setTimeout(() => resolve(null), 1500);

      channel.port1.onmessage = (event) => {
        window.clearTimeout(timeout);
        resolve(typeof event.data?.version === 'string' ? event.data.version : null);
      };

      try {
        worker.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
      } catch {
        window.clearTimeout(timeout);
        resolve(null);
      }
    });
  }, []);

  // Register the service worker
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.log('[PWA] Service Worker not supported');
      return;
    }

    const capacitor = (window as any).Capacitor;
    const isNativeCapacitor =
      !!capacitor &&
      (capacitor.isNativePlatform?.() === true ||
        capacitor.getPlatform?.() === 'android' ||
        capacitor.getPlatform?.() === 'ios');

    if (isNativeCapacitor) {
      // Capacitor already ships a local app bundle. Keeping the PWA service
      // worker in Android can make the WebView serve old JS chunks after an
      // APK update, so we clear only web caches and leave IndexedDB/localStorage
      // intact for Quid data and session state.
      async function clearNativeWebCaches() {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));

          if ('caches' in window) {
            const cacheNames = await caches.keys();
            await Promise.all(
              cacheNames
                .filter((name) => name.startsWith('quid-'))
                .map((name) => caches.delete(name))
            );
          }

          console.log('[PWA] Service Worker disabled for Capacitor native app');
        } catch (error) {
          console.warn('[PWA] Could not clear native web caches:', error);
        }
      }

      clearNativeWebCaches();
      setState((prev) => ({ ...prev, updateAvailable: false, pendingVersion: null }));
      return;
    }

    let registration: ServiceWorkerRegistration | null = null;
    const handleUpdateFound = () => {
      const newWorker = registration?.installing;
      if (!newWorker) return;

      const handleStateChange = async () => {
        if (newWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New version available
            console.log('[PWA] New version available');
            const pendingVersion = await getServiceWorkerVersion(newWorker);
            setWaitingWorker(newWorker);
            setState((prev) => ({ ...prev, pendingVersion, updateAvailable: true }));
          } else {
            // First install
            console.log('[PWA] Content cached for offline use');
          }
        }
      };

      newWorker.addEventListener('statechange', handleStateChange);
    };

    const handleControllerChange = () => {
      console.log('[PWA] Controller changed — new SW active');
      // Reload to get the new version
      window.location.reload();
    };

    async function registerSW() {
      try {
        registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });

        console.log('[PWA] Service Worker registered:', registration.scope);
        setState((prev) => ({ ...prev, registration }));

        const activeWorker = registration.active || navigator.serviceWorker.controller;
        const currentVersion = await getServiceWorkerVersion(activeWorker);
        setState((prev) => ({ ...prev, currentVersion }));

        // Check for updates on load
        registration.addEventListener('updatefound', handleUpdateFound);

        // Check if there's already a waiting worker
        if (registration.waiting) {
          const pendingVersion = await getServiceWorkerVersion(registration.waiting);
          setWaitingWorker(registration.waiting);
          setState((prev) => ({ ...prev, pendingVersion, updateAvailable: true }));
        }

        // Listen for controlling SW change (after activation)
        navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

      } catch (error) {
        console.error('[PWA] Service Worker registration failed:', error);
      }
    }

    registerSW();

    return () => {
      if (registration) {
        registration.removeEventListener('updatefound', handleUpdateFound);
      }
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, [getServiceWorkerVersion]);

  // Apply update — tell the waiting SW to activate
  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;

    console.log('[PWA] Applying update...');
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });

    setWaitingWorker(null);
    setState((prev) => ({ ...prev, updateAvailable: false, pendingVersion: null }));
  }, [waitingWorker]);

  // Clear all caches
  const clearCache = useCallback(async () => {
    if (state.registration?.active) {
      state.registration.active.postMessage({ type: 'CLEAR_CACHE' });
    }

    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((name) => caches.delete(name)));
    console.log('[PWA] All caches cleared');
  }, [state.registration]);

  return {
    ...state,
    isOffline,
    applyUpdate,
    clearCache,
    isSupported: typeof window !== 'undefined' && 'serviceWorker' in navigator,
  };
}
