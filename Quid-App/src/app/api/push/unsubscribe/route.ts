import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/push/unsubscribe
 *
 * Remove a push subscription for the authenticated user.
 *
 * Body: { endpoint }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await req.json();
    const { endpoint } = body as { endpoint: string };

    if (!endpoint) {
      return NextResponse.json(
        { error: "endpoint es requerido" },
        { status: 400 }
      );
    }

    // Only delete if it belongs to the current user
    const sub = await db.pushSubscription.findUnique({
      where: { endpoint },
    });

    if (sub && sub.userId === session.user.id) {
      await db.pushSubscription.delete({
        where: { endpoint },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Push unsubscribe error:", error);
    return NextResponse.json(
      { error: "Error al eliminar suscripción push" },
      { status: 500 }
    );
  }
}
