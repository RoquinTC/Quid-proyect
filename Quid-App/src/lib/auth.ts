import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";

/**
 * Cookie configuration for DUAL-MODE access (local + tunnel):
 *
 * The app must work BOTH ways simultaneously:
 *   - LOCAL: http://localhost:5678 (direct access, no tunnel needed)
 *   - TUNNEL: https://quid.roquintc.app (Cloudflare tunnel, when available)
 *
 * Strategy: Use SameSite=Lax cookies WITHOUT the __Secure- prefix.
 * This works for both HTTP and HTTPS because:
 *   - SameSite=Lax is compatible with direct browser access (both HTTP and HTTPS)
 *   - No __Secure- prefix means cookies are sent over both HTTP and HTTPS
 *   - The tunnel proxies to the same container, so cookies are shared
 *
 * Note: SameSite=None + Secure would NOT work because Secure cookies
 * are never sent over HTTP (localhost), making the app unusable offline.
 */

function getCookieConfig() {
  return {
    sessionToken: {
      name: "next-auth.session-token",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
    },
    callbackUrl: {
      name: "next-auth.callback-url",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
    },
    csrfToken: {
      name: "next-auth.csrf-token",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
    },
    pkceCodeVerifier: {
      name: "next-auth.pkce.code_verifier",
      options: { httpOnly: true, sameSite: "lax" as const, path: "/", secure: false },
    },
  };
}

// NEXTAUTH_SECRET validation:
// - During `next build`, NODE_ENV=production but env vars from docker-compose
//   are NOT available yet (they're only injected at runtime). So we cannot
//   throw during build — only warn.
// - At runtime (inside the container), NEXTAUTH_SECRET comes from
//   docker-compose.yml → environment section.
// - If running locally without Docker, create a .env file with NEXTAUTH_SECRET.
if (!process.env.NEXTAUTH_SECRET) {
  console.warn(
    "[Auth] WARNING: NEXTAUTH_SECRET is not set. " +
    "Set it in your .env file or docker-compose.yml for security."
  );
}

export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV === "development",
  // trustHost is handled via NEXTAUTH_TRUSTHOST=true env variable in next-auth v4
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Correo y contraseña son requeridos");
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) {
          throw new Error("No se encontró una cuenta con este correo");
        }

        // WebAuthn bypass: when biometric login succeeds on the client,
        // the server already verified the credential in /api/auth/webauthn/auth-verify.
        // The client then calls signIn with a special password marker.
        if (credentials.password === "__webauthn_bypass__") {
          // Verify the user has at least one registered WebAuthn credential
          const hasCredential = await db.authCredential.findFirst({
            where: { userId: user.id },
          });
          if (!hasCredential) {
            throw new Error("Autenticación biométrica no configurada");
          }
          // Bypass successful — don't check password
        } else {
          const isValid = await compare(credentials.password, user.password);
          if (!isValid) {
            throw new Error("Contraseña incorrecta");
          }
        }

        // Load security settings for JWT
        const userSettings = await db.userSettings.findUnique({ where: { userId: user.id } });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
          currency: user.currency,
          onboardingCompleted: Boolean(user.onboardingCompleted),
          onboardingStep: user.onboardingStep,
          pinEnabled: userSettings?.pinEnabled ?? false,
          biometricEnabled: userSettings?.biometricEnabled ?? false,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.currency = (user as unknown as Record<string, unknown>).currency as string | undefined;
        token.onboardingCompleted = (user as unknown as Record<string, unknown>).onboardingCompleted as boolean | undefined;
        token.onboardingStep = (user as unknown as Record<string, unknown>).onboardingStep as number | undefined;
        token.pinEnabled = (user as unknown as Record<string, unknown>).pinEnabled as boolean | undefined;
        token.biometricEnabled = (user as unknown as Record<string, unknown>).biometricEnabled as boolean | undefined;
      }
      if (trigger === "update" && token.id) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
          include: { settings: true },
        });
        if (dbUser) {
          token.onboardingCompleted = Boolean(dbUser.onboardingCompleted);
          token.onboardingStep = dbUser.onboardingStep;
          token.currency = dbUser.currency;
          token.name = dbUser.name;
          token.pinEnabled = dbUser.settings?.pinEnabled ?? false;
          token.biometricEnabled = dbUser.settings?.biometricEnabled ?? false;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        (session.user as Record<string, unknown>).currency = token.currency;
        (session.user as Record<string, unknown>).onboardingCompleted = token.onboardingCompleted;
        (session.user as Record<string, unknown>).onboardingStep = token.onboardingStep;
        session.user.pinEnabled = token.pinEnabled as boolean | undefined;
        session.user.biometricEnabled = token.biometricEnabled as boolean | undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  // Secret comes from NEXTAUTH_SECRET env var (set in docker-compose.yml or .env).
  // IMPORTANT: No hardcoded fallback! If NEXTAUTH_SECRET is not set:
  //   - In development: generate a temporary one (with a loud warning)
  //   - In production: throw an error (app will not start without it)
  // This prevents the security risk of a publicly known secret in production.
  secret: (() => {
    if (process.env.NEXTAUTH_SECRET) return process.env.NEXTAUTH_SECRET;
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "NEXTAUTH_SECRET is required in production. " +
        "Set it in your .env file or docker-compose.yml."
      );
    }
    // Dev-only: generate a random secret so local dev works without .env
    const devSecret = "dev-only-secret-" + Math.random().toString(36).slice(2) + "-CHANGE-IN-PROD";
    console.warn(
      "[Auth] WARNING: Using auto-generated NEXTAUTH_SECRET for development. " +
      "Set NEXTAUTH_SECRET in your .env file for production."
    );
    return devSecret;
  })(),
  cookies: getCookieConfig(),
};
