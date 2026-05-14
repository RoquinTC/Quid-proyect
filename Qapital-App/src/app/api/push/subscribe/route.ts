import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/push/subscribe
 *
 * Register a push subscription for the authenticated user.
 * If the endpoint already exists, it updates the keys.
 *
 * Body: { endpoint, keys: { p256dh, auth }, userAgent? }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { endpoint, keys, userAgent } = body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return NextResponse.json(
        { error: "endpoint, keys.p256dh y keys.auth son requeridos" },
        { status: 400 }
      );
    }

    // Upsert: if endpoint already exists for this user, update keys; otherwise create
    const existing = await db.pushSubscription.findUnique({
      where: { endpoint },
    });

    if (existing) {
      // Update if it belongs to the same user, or take over if user re-logged
      await db.pushSubscription.update({
        where: { endpoint },
        data: {
          userId: session.user.id,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: userAgent || null,
        },
      });
    } else {
      await db.pushSubscription.create({
        data: {
          userId: session.user.id,
          endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
          userAgent: userAgent || null,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push subscribe error:", error);
    return NextResponse.json(
      { error: "Error al registrar suscripción push" },
      { status: 500 }
    );
  }
}
