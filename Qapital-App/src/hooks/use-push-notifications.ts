'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PushPermissionStatus = 'default' | 'granted' | 'denied' | 'unsupported';

interface PushSubscriptionState {
  isSupported: boolean;
  permission: PushPermissionStatus;
  isSubscribed: boolean;
  isLoading: boolean;
  vapidPublicKey: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePushNotifications() {
  const { data: session } = useSession();
  const [state, setState] = useState<PushSubscriptionState>({
    isSupported: false,
    permission: 'unsupported',
    isSubscribed: false,
    isLoading: true,
    vapidPublicKey: null,
  });
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  // ---- Check support and load VAPID key ----
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isSupported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    if (!isSupported) {
      setState((prev) => ({ ...prev, isSupported: false, permission: 'unsupported', isLoading: false }));
      return;
    }

    const currentPermission = Notification.permission as PushPermissionStatus;

    // Fetch VAPID public key
    apiFetch<{ publicKey: string }>('/api/push/vapid-key')
      .then((data) => {
        setState((prev) => ({
          ...prev,
          isSupported: true,
          permission: currentPermission,
          vapidPublicKey: data.publicKey,
          isLoading: false,
        }));
      })
      .catch(() => {
        // Push not configured on server
        setState((prev) => ({
          ...prev,
          isSupported: true,
          permission: currentPermission,
          vapidPublicKey: null,
          isLoading: false,
        }));
      });
  }, []);

  // ---- Check existing subscription ----
  useEffect(() => {
    if (!state.isSupported || !session?.user || !state.vapidPublicKey) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        registrationRef.current = reg;
        const existingSub = await reg.pushManager.getSubscription();
        setState((prev) => ({ ...prev, isSubscribed: !!existingSub }));
      } catch {
        // SW not ready yet
      }
    })();
  }, [state.isSupported, session?.user, state.vapidPublicKey]);

  // ---- Subscribe ----
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported || !state.vapidPublicKey) return false;

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState((prev) => ({ ...prev, permission: permission as PushPermissionStatus }));
        return false;
      }

      setState((prev) => ({ ...prev, permission: 'granted', isLoading: true }));

      // Get service worker registration
      const reg = await navigator.serviceWorker.ready;
      registrationRef.current = reg;

      // Subscribe to push
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(state.vapidPublicKey),
      });

      // Send subscription to server
      const subJson = subscription.toJSON();
      await apiFetch('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          keys: subJson.keys,
          userAgent: navigator.userAgent,
        }),
      });

      setState((prev) => ({ ...prev, isSubscribed: true, isLoading: false }));
      return true;
    } catch (error) {
      console.error('[Push] Failed to subscribe:', error);
      setState((prev) => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [state.isSupported, state.vapidPublicKey]);

  // ---- Unsubscribe ----
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!state.isSupported) return false;

    try {
      setState((prev) => ({ ...prev, isLoading: true }));

      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription();

      if (subscription) {
        // Remove from server first
        await apiFetch('/api/push/unsubscribe', {
          method: 'POST',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });

        // Unsubscribe from push manager
        await subscription.unsubscribe();
      }

      setState((prev) => ({ ...prev, isSubscribed: false, isLoading: false }));
      return true;
    } catch (error) {
      console.error('[Push] Failed to unsubscribe:', error);
      setState((prev) => ({ ...prev, isLoading: false }));
      return false;
    }
  }, [state.isSupported]);

  return {
    ...state,
    subscribe,
    unsubscribe,
  };
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Convert a base64-encoded VAPID public key to a Uint8Array.
 * This is required by the PushManager.subscribe() method.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
