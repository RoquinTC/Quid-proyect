/// <reference lib="webworker" />

const CACHE_NAME = 'quid-v1';
const STATIC_CACHE = 'quid-static-v1';
const DYNAMIC_CACHE = 'quid-dynamic-v1';
const API_CACHE = 'quid-api-v1';
const AUTH_CACHE = 'quid-auth-v1';

// Assets to cache on install (app shell)
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-192.png',
  '/icon-maskable-512.png',
  '/apple-touch-icon.png',
  '/favicon-32.png',
  '/favicon-16.png',
];

// ─── Offline Session Cache ───
// Store the last known session so we can serve it when the server is unreachable.
// This is the key to offline authentication.

const OFFLINE_SESSION_KEY = 'quid-offline-session';
const OFFLINE_SESSION_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days (matches JWT maxAge)

async function getCachedSession() {
  try {
    const cache = await caches.open(AUTH_CACHE);
    const response = await cache.match(OFFLINE_SESSION_KEY);
    if (!response) return null;
    
    const data = await response.json();
    const now = Date.now();
    
    // Check if cached session has expired
    if (data.cachedAt && (now - data.cachedAt) > OFFLINE_SESSION_EXPIRY) {
      await cache.delete(OFFLINE_SESSION_KEY);
      return null;
    }
    
    return data.session;
  } catch {
    return null;
  }
}

async function cacheSession(session) {
  try {
    const cache = await caches.open(AUTH_CACHE);
    const wrapper = {
      session,
      cachedAt: Date.now(),
    };
    await cache.put(
      OFFLINE_SESSION_KEY,
      new Response(JSON.stringify(wrapper), {
        headers: { 'Content-Type': 'application/json' },
      })
    );
  } catch (err) {
    console.warn('[SW] Failed to cache session:', err);
  }
}

// Install event — cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log('[SW] Caching app shell');
      return cache.addAll(APP_SHELL);
    })
  );
});

// Activate event — clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // Delete old versions of our caches
            return (
              name.startsWith('quid-') &&
              name !== STATIC_CACHE &&
              name !== DYNAMIC_CACHE &&
              name !== API_CACHE &&
              name !== AUTH_CACHE
            );
          })
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// Helper: determine caching strategy based on request
function getStrategy(request) {
  const url = new URL(request.url);

  // Auth routes — special handling (see fetch handler)
  if (url.pathname.startsWith('/api/auth/')) {
    return 'auth';
  }

  // API routes — Network First
  if (url.pathname.startsWith('/api/')) {
    return 'network-first';
  }

  // Static assets (JS, CSS, fonts, images) — Cache First
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico|webp)$/)
  ) {
    return 'cache-first';
  }

  // HTML pages — Stale While Revalidate
  if (request.headers.get('accept')?.includes('text/html')) {
    return 'stale-while-revalidate';
  }

  // Default — Network with cache fallback
  return 'network-first';
}

// Fetch event — apply caching strategies
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests (except for auth which we handle specially)
  const url = new URL(event.request.url);
  const strategy = getStrategy(event.request);

  // Auth routes need special handling for offline support
  if (strategy === 'auth') {
    event.respondWith(handleAuthRequest(event.request));
    return;
  }

  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip chrome-extension and other non-http(s) requests
  if (!event.request.url.startsWith('http')) return;

  switch (strategy) {
    case 'cache-first':
      event.respondWith(cacheFirst(event.request));
      break;
    case 'network-first':
      event.respondWith(networkFirst(event.request));
      break;
    case 'stale-while-revalidate':
      event.respondWith(staleWhileRevalidate(event.request));
      break;
    default:
      event.respondWith(networkFirst(event.request));
  }
});

// ─── Auth Request Handler ───
// This is the critical piece for offline authentication.
// When the server is unreachable, we serve the cached session
// so the app thinks the user is still authenticated.

async function handleAuthRequest(request) {
  const url = new URL(request.url);
  
  // For POST requests (sign-in, sign-out, etc.) — always pass through
  if (request.method !== 'GET') {
    try {
      return await fetch(request);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Sin conexión al servidor' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // GET /api/auth/session — the critical one
  if (url.pathname === '/api/auth/session') {
    try {
      const networkResponse = await fetch(request);
      
      if (networkResponse.ok) {
        // Cache the successful session response for offline use
        const cloned = networkResponse.clone();
        try {
          const sessionData = await cloned.json();
          if (sessionData && sessionData.user) {
            await cacheSession(sessionData);
          }
        } catch {
          // Session might be empty/unauthenticated — don't cache
        }
      }
      
      return networkResponse;
    } catch {
      // Network failed — try to serve cached session
      const cachedSession = await getCachedSession();
      
      if (cachedSession) {
        console.log('[SW] Serving cached session (offline mode)');
        return new Response(JSON.stringify(cachedSession), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'X-Offline-Session': 'true',
          },
        });
      }
      
      // No cached session — return unauthenticated
      return new Response(
        JSON.stringify({}),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // GET /api/auth/csrf — serve a fake CSRF token when offline
  if (url.pathname === '/api/auth/csrf') {
    try {
      return await fetch(request);
    } catch {
      return new Response(
        JSON.stringify({ csrfToken: 'offline-csrf-token' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // Other auth GET routes — try network, fall back to empty response
  try {
    return await fetch(request);
  } catch {
    return new Response(
      JSON.stringify({}),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// Cache First Strategy — for static assets
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return offline fallback for images
    if (request.url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) {
      return new Response('', { status: 200, headers: { 'Content-Type': 'image/svg+xml' } });
    }
    return new Response('Offline', { status: 503 });
  }
}

// Network First Strategy — for API routes
async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  const url = new URL(request.url);

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Cache successful API responses
      const responseToCache = networkResponse.clone();
      cache.put(request, responseToCache);
    }

    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    // Return meaningful error for API requests
    if (url.pathname.startsWith('/api/')) {
      return new Response(
        JSON.stringify({ error: 'Sin conexión a internet', offline: true }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response('Sin conexión', { status: 503 });
  }
}

// Stale While Revalidate Strategy — for HTML pages
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DYNAMIC_CACHE);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => {
      // If network fails and no cache, return offline page
      return cache.match('/offline.html');
    });

  // Return cache immediately if available, otherwise wait for network
  return cachedResponse || fetchPromise;
}

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }

  if (event.data?.type === 'CLEAR_CACHE') {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }

  // Clear cached session (for logout)
  if (event.data?.type === 'CLEAR_SESSION') {
    caches.open(AUTH_CACHE).then((cache) => {
      cache.delete(OFFLINE_SESSION_KEY);
    });
  }
});

// Handle push notifications
self.addEventListener('push', (event) => {
  let data = {
    title: 'Quid',
    body: 'Tienes una nueva notificación',
    icon: '/icon-192.png',
    badge: '/icon-maskable-192.png',
    url: '/',
    type: 'general',
  };

  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch (e) {
      data.body = event.data.text();
    }
  }

  // Customize notification appearance based on type
  let image;
  let actions;

  switch (data.type) {
    case 'shared_transaction':
      actions = [
        { action: 'view', title: 'Ver movimiento' },
        { action: 'dismiss', title: 'Descartar' },
      ];
      break;
    case 'invitation_received':
      actions = [
        { action: 'accept', title: 'Aceptar' },
        { action: 'reject', title: 'Rechazar' },
      ];
      break;
    case 'recurring_due':
    case 'recurring_upcoming':
      actions = [
        { action: 'view', title: 'Ver pagos' },
        { action: 'dismiss', title: 'Recordar después' },
      ];
      break;
    case 'budget_limit':
      actions = [
        { action: 'view', title: 'Ver presupuesto' },
        { action: 'dismiss', title: 'Descartar' },
      ];
      break;
    case 'goal_completed':
      actions = [
        { action: 'view', title: 'Ver meta' },
        { action: 'dismiss', title: 'Descartar' },
      ];
      break;
    case 'goal_near_completion':
      actions = [
        { action: 'view', title: 'Aportar' },
        { action: 'dismiss', title: 'Después' },
      ];
      break;
    case 'yield_ready':
      actions = [
        { action: 'view', title: 'Confirmar' },
        { action: 'dismiss', title: 'Después' },
      ];
      break;
    default:
      actions = [
        { action: 'view', title: 'Abrir' },
        { action: 'dismiss', title: 'Descartar' },
      ];
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/icon-maskable-192.png',
      image,
      data: {
        url: data.url || '/',
        type: data.type,
        notificationData: data.data || {},
      },
      actions,
      vibrate: [100, 50, 100],
      tag: `quid-${data.type}-${Date.now()}`,
      renotify: true,
      requireInteraction: data.type === 'invitation_received',
    })
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const notifData = event.notification.data || {};
  const url = notifData.url || '/';
  const type = notifData.type || 'general';

  // If user dismissed, do nothing
  if (action === 'dismiss') return;

  // For accept/reject actions on invitations, we need to make API calls
  if (type === 'invitation_received' && notifData.notificationData) {
    const invitationId = notifData.notificationData.invitationId;
    if (action === 'accept' && invitationId) {
      // Accept the invitation via API
      fetch(`/api/invitations/${invitationId}/accept`, { method: 'POST' })
        .then(() => console.log('[SW] Invitation accepted'))
        .catch((err) => console.error('[SW] Error accepting invitation:', err));
    } else if (action === 'reject' && invitationId) {
      fetch(`/api/invitations/${invitationId}/reject`, { method: 'POST' })
        .then(() => console.log('[SW] Invitation rejected'))
        .catch((err) => console.error('[SW] Error rejecting invitation:', err));
    }
  }

  // Open/focus the app at the appropriate URL
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      const existingClient = clients.find((c) =>
        c.url.includes(self.location.origin)
      );
      if (existingClient) {
        // Navigate to the relevant page
        existingClient.navigate(url);
        return existingClient.focus();
      }
      // No existing window, open new one
      return self.clients.openWindow(url);
    })
  );
});
