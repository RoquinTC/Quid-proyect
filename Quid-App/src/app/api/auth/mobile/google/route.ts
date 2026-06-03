import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createMobileSession } from "@/lib/mobile-session";

interface GoogleTokenInfo {
  aud?: string;
  email?: string;
  email_verified?: string;
  name?: string;
  picture?: string;
  sub?: string;
}

function allowedAudiences(): string[] {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_WEB_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter((value): value is string => Boolean(value));
}

async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenInfo> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
    { cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error("Google no pudo validar la identidad");
  }

  const tokenInfo = await response.json() as GoogleTokenInfo;
  const audiences = allowedAudiences();
  if (audiences.length === 0) {
    throw new Error("Google Login aun no esta configurado en Quid");
  }
  if (!tokenInfo.aud || !audiences.includes(tokenInfo.aud)) {
    throw new Error("La identidad de Google no pertenece a Quid");
  }
  if (!tokenInfo.email || tokenInfo.email_verified !== "true") {
    throw new Error("Google no devolvio un correo verificado");
  }

  return tokenInfo;
}

export async function POST(req: NextRequest) {
  try {
    const { idToken } = await req.json().catch(() => ({}));
    if (!idToken) {
      return NextResponse.json({ error: "Token de Google requerido" }, { status: 400 });
    }

    const googleUser = await verifyGoogleIdToken(idToken);
    const email = googleUser.email!.toLowerCase();

    let user = await db.user.findUnique({
      where: { email },
      include: { settings: true },
    });

    if (!user) {
      const randomPassword = await hash(`google:${googleUser.sub}:${randomUUID()}`, 10);
      user = await db.user.create({
        data: {
          email,
          name: googleUser.name || "Usuario de Google",
          avatar: googleUser.picture || null,
          password: randomPassword,
          onboardingCompleted: false,
          onboardingStep: 1,
          currency: "COP",
          settings: {
            create: {
              biometricEnabled: false,
              pinEnabled: false,
            },
          },
        },
        include: { settings: true },
      });
    } else if (!user.avatar && googleUser.picture) {
      user = await db.user.update({
        where: { id: user.id },
        data: { avatar: googleUser.picture },
        include: { settings: true },
      });
    }

    return NextResponse.json(await createMobileSession(user));
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo iniciar sesion con Google";
    return NextResponse.json({ error: message }, { status: 401 });
  }
}
