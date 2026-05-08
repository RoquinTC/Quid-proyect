import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";

/**
 * Cookie configuration that adapts to the environment:
 *
 * - PREVIEW (iframe, HTTPS via proxy): SameSite=None, Secure=true, __Secure- prefix
 *   Required because the app runs in a cross-origin iframe where Lax cookies are blocked.
 *
 * - LOCAL (direct browser, HTTP): SameSite=Lax, Secure=false, no prefix
 *   Works fine because there's no iframe and no cross-origin issue.
 *
 * Detection: Uses NEXTAUTH_URL presence as the signal.
 * In the preview environment, NEXTAUTH_URL is set to the public HTTPS URL.
 * In local development, NEXTAUTH_URL is not set (or set to http://localhost:3000).
 */
function getCookieConfig(isSecure: boolean) {
  const prefix = isSecure ? "__Secure-" : "";
  const sameSite = isSecure ? ("none" as const) : ("lax" as const);
  const secure = isSecure;

  return {
    sessionToken: {
      name: `${prefix}next-auth.session-token`,
      options: { httpOnly: true, sameSite, path: "/", secure },
    },
    callbackUrl: {
      name: `${prefix}next-auth.callback-url`,
      options: { httpOnly: true, sameSite, path: "/", secure },
    },
    csrfToken: {
      name: `${prefix}next-auth.csrf-token`,
      options: { httpOnly: true, sameSite, path: "/", secure },
    },
    pkceCodeVerifier: {
      name: `${prefix}next-auth.pkce.code_verifier`,
      options: { httpOnly: true, sameSite, path: "/", secure },
    },
  };
}

// Detect secure mode: if NEXTAUTH_URL starts with https://, we're behind a proxy
const isSecureEnvironment = (process.env.NEXTAUTH_URL || "").startsWith("https://");

export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV === "development",
  // trustHost is supported by next-auth v4.24+ but not in the types yet
  ...(process.env.NEXTAUTH_URL ? { trustHost: true } : {}),
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

        const isValid = await compare(credentials.password, user.password);

        if (!isValid) {
          throw new Error("Contraseña incorrecta");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.avatar,
          currency: user.currency,
          onboardingCompleted: Boolean(user.onboardingCompleted),
          onboardingStep: user.onboardingStep,
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
      }
      if (trigger === "update" && token.id) {
        const dbUser = await db.user.findUnique({ where: { id: token.id as string } });
        if (dbUser) {
          token.onboardingCompleted = Boolean(dbUser.onboardingCompleted);
          token.onboardingStep = dbUser.onboardingStep;
          token.currency = dbUser.currency;
          token.name = dbUser.name;
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
  secret: process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === "development" ? "lifehub-secret-key-dev-2024" : undefined),
  cookies: getCookieConfig(isSecureEnvironment),
};
