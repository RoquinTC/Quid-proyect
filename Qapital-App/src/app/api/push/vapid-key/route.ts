import { NextResponse } from "next/server";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";

/**
 * GET /api/push/vapid-key
 *
 * Returns the VAPID public key so the client can subscribe to push notifications.
 */
export async function GET() {
  const publicKey = getVapidPublicKey();
  const configured = isPushConfigured();

  if (!configured) {
    return NextResponse.json(
      { error: "Push notifications not configured on server" },
      { status: 503 }
    );
  }

  return NextResponse.json({ publicKey });
}
