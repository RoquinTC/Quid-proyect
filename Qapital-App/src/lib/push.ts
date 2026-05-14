/**
 * Push Notification Utility
 *
 * Handles VAPID configuration, subscription management,
 * and sending push notifications via the Web Push API.
 */

import webpush from 'web-push';
import { db } from './db';

// ---------------------------------------------------------------------------
// VAPID Configuration
// ---------------------------------------------------------------------------

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:qapital@app.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  type?: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public Helpers
// ---------------------------------------------------------------------------

/** Get the VAPID public key (safe for client-side) */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

/** Check if push notifications are configured on the server */
export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

// ---------------------------------------------------------------------------
// Send Push Notification
// ---------------------------------------------------------------------------

/**
 * Send a push notification to ALL subscribed devices of a specific user.
 * Returns the number of successfully sent notifications and any failed endpoints.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<{ sent: number; failed: string[] }> {
  if (!isPushConfigured()) {
    console.warn('[Push] VAPID keys not configured — skipping push notification');
    return { sent: 0, failed: [] };
  }

  // Check if user has notifications enabled
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: { notificationsEnabled: true },
  });

  if (settings && !settings.notificationsEnabled) {
    console.log(`[Push] User ${userId} has notifications disabled — skipping`);
    return { sent: 0, failed: [] };
  }

  // Get all push subscriptions for this user
  const subscriptions = await db.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    console.log(`[Push] No push subscriptions for user ${userId}`);
    return { sent: 0, failed: [] };
  }

  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-maskable-192.png',
    url: payload.url || '/',
    type: payload.type || 'general',
    data: payload.data || {},
  });

  let sent = 0;
  const failed: string[] = [];

  // Send to each subscription in parallel
  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          pushPayload,
          {
            TTL: 86400, // 24 hours
            urgency: 'normal',
          }
        );
        sent++;
      } catch (error: any) {
        // If the subscription is invalid or expired, remove it
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          console.log(`[Push] Subscription expired, removing: ${sub.endpoint}`);
          failed.push(sub.endpoint);
          await db.pushSubscription.delete({
            where: { id: sub.id },
          }).catch(() => {});
        } else {
          console.error(`[Push] Failed to send to ${sub.endpoint}:`, error?.message);
          failed.push(sub.endpoint);
        }
      }
    })
  );

  return { sent, failed };
}

/**
 * Send a push notification to multiple users (e.g., all members of a shared account).
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<{ sent: number; failed: string[] }> {
  let totalSent = 0;
  const allFailed: string[] = [];

  const results = await Promise.allSettled(
    userIds.map((userId) => sendPushToUser(userId, payload))
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      totalSent += result.value.sent;
      allFailed.push(...result.value.failed);
    }
  }

  return { sent: totalSent, failed: allFailed };
}

// ---------------------------------------------------------------------------
// Notification helpers with push integration
// ---------------------------------------------------------------------------

/**
 * Create an in-app notification AND send a push notification.
 * Use this wherever you would previously just create an AppNotification.
 */
export async function createAndPushNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  pushBody?: string; // Optional: different body for push (shorter). Defaults to `message`.
  url?: string;       // URL to open when notification is clicked
}): Promise<void> {
  const { userId, type, title, message, data, pushBody, url } = params;

  // 1. Create the in-app notification (existing behavior)
  await db.appNotification.create({
    data: {
      userId,
      type,
      title,
      message,
      data: data ? JSON.stringify(data) : null,
    },
  });

  // 2. Send push notification
  try {
    await sendPushToUser(userId, {
      title,
      body: pushBody || message,
      type,
      data,
      url,
    });
  } catch (error) {
    // Don't fail the operation if push fails
    console.error('[Push] Failed to send push notification:', error);
  }
}
