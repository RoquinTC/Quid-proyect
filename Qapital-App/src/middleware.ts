import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import createIntlMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

// ---------------------------------------------------------------------------
// Rate Limiting — sliding window counter (in-memory, per user/IP)
// ---------------------------------------------------------------------------
interface RateBucket {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateBucket>();

// Cleanup stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let lastCleanup = Date.now();

function cleanupStaleEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, bucket] of rateLimitMap) {
    if (now - bucket.windowStart > RATE_WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  }
}

const RATE_WINDOW_MS = 60_000; // 1 minute window
const RATE_MAX_REQUESTS = 60; // 60 requests per minute per identity

function checkRateLimit(identity: string): { allowed: boolean; retryAfterMs: number } {
  cleanupStaleEntries();

  const now = Date.now();
  let bucket = rateLimitMap.get(identity);

  if (!bucket || now - bucket.windowStart > RATE_WINDOW_MS) {
    // New window
    bucket = { count: 1, windowStart: now };
    rateLimitMap.set(identity, bucket);
    return { allowed: true, retryAfterMs: 0 };
  }

  bucket.count++;

  if (bucket.count > RATE_MAX_REQUESTS) {
    const retryAfterMs = RATE_WINDOW_MS - (now - bucket.windowStart);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  return { allowed: true, retryAfterMs: 0 };
}

function getClientIp(request: NextRequest): string {
  // Try common proxy headers first
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

// ---------------------------------------------------------------------------
// Public routes (no auth required)
// ---------------------------------------------------------------------------
const PUBLIC_ROUTES = [
  "/api/auth",
  "/api/health",
];

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
// [12] Internationalization middleware
const intlMiddleware = createIntlMiddleware(routing);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // API routes: auth + rate limiting
  if (pathname.startsWith("/api/")) {
    return apiMiddleware(request);
  }

  // Page routes: intl middleware (locale detection)
  return intlMiddleware(request);
}

// ---------------------------------------------------------------------------
// API Middleware — auth + rate limiting
// ---------------------------------------------------------------------------
async function apiMiddleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes (still apply lighter rate limiting below)
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  // Allow CORS preflight
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  // ---- Rate Limiting ----
  // For public routes: rate limit by IP
  // For protected routes: rate limit by user ID (after auth check)
  if (isPublicRoute) {
    const ip = getClientIp(request);
    const { allowed, retryAfterMs } = checkRateLimit(`ip:${ip}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }
    return NextResponse.next();
  }

  // ---- Authentication ----
  try {
    const token = await getToken({
      req: request,
      secret: (() => {
        if (process.env.NEXTAUTH_SECRET) return process.env.NEXTAUTH_SECRET;
        if (process.env.NODE_ENV === "production") {
          throw new Error("NEXTAUTH_SECRET is required in production.");
        }
        return "dev-only-secret-" + "middleware" + "-CHANGE-IN-PROD";
      })(),
    });

    if (!token) {
      return NextResponse.json(
        { error: "No autorizado — Inicia sesión para continuar" },
        { status: 401 }
      );
    }

    // Rate limit by user ID (more accurate than IP)
    const userId = token.id as string;
    const { allowed, retryAfterMs } = checkRateLimit(`user:${userId}`);
    if (!allowed) {
      return NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
        }
      );
    }

    // Add user ID to request headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", userId);

    return NextResponse.next({
      request: { headers: requestHeaders },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Error de autenticación" },
      { status: 401 }
    );
  }
}

export const config = {
  // Match all routes except static files, _next, and other internal paths
  matcher: ["/((?!_next|.*\\..*).*)"],
};
