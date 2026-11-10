import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/finance/subscriptions/dismiss
 *
 * F-23 · "No es una suscripción".
 *
 * El descarte se guarda en la base (no en el dispositivo) para que valga en
 * todos los equipos del usuario. Es idempotente: repetirlo no falla.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = (await req.json().catch(() => null)) as { merchantKey?: unknown } | null;
    const merchantKey =
      typeof body?.merchantKey === "string" ? body.merchantKey.trim() : "";

    if (!merchantKey || merchantKey.length > 120) {
      return NextResponse.json({ error: "Comercio no válido" }, { status: 400 });
    }

    await db.subscriptionSuggestionDismissal.upsert({
      where: { userId_merchantKey: { userId: session.user.id, merchantKey } },
      create: { userId: session.user.id, merchantKey },
      update: {},
    });

    return NextResponse.json({ success: true, merchantKey });
  } catch (error) {
    console.error("Subscription dismiss error:", error);
    return NextResponse.json(
      { error: "No se pudo descartar la sugerencia" },
      { status: 500 }
    );
  }
}
