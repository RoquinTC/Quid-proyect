import { encode } from "next-auth/jwt";
import type { User, UserSettings } from "@prisma/client";

export const MOBILE_SESSION_MAX_AGE = 30 * 24 * 60 * 60;

type MobileSessionUser = User & {
  settings?: UserSettings | null;
};

export async function createMobileSession(user: MobileSessionUser) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("Servidor sin configuracion de sesion");
  }

  const tokenPayload = {
    id: user.id,
    sub: user.id,
    email: user.email,
    name: user.name,
    picture: user.avatar,
    currency: user.currency,
    onboardingCompleted: Boolean(user.onboardingCompleted),
    onboardingStep: user.onboardingStep,
    pinEnabled: user.settings?.pinEnabled ?? false,
    biometricEnabled: user.settings?.biometricEnabled ?? false,
  };

  const token = await encode({
    secret,
    token: tokenPayload,
    maxAge: MOBILE_SESSION_MAX_AGE,
  });

  return {
    token,
    session: {
      user: {
        ...tokenPayload,
        image: user.avatar,
      },
      expires: new Date(Date.now() + MOBILE_SESSION_MAX_AGE * 1000).toISOString(),
    },
  };
}
