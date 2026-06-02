import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { isSecureCookieEnabled, SESSION_COOKIE_NAME } from "@/lib/auth-cookie";

// ---------------------------------------------------------------------------
// Rate Limiting - sliding window counter (in-memory, per user/IP)
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
const PUBLIC_RATE_MAX_REQUESTS = 60;
const AUTH_RATE_MAX_REQUESTS = 240; // Initial sync + dashboard widgets can legitimately burst.

function checkRateLimit(identity: string, maxRequests: number): { allowed: boolean; retryAfterMs: number } {
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

  if (bucket.count > maxRequests) {
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
function addCorsHeaders(response: NextResponse, request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  if (!origin) return response;

  const isAllowedOrigin =
    origin.startsWith("capacitor://") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("https://localhost") ||
    origin === "file://" ||
    origin.endsWith(".roquintc.app");

  if (isAllowedOrigin) {
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Credentials", "true");
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-aura-token, x-user-id");
  }
  return response;
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow CORS preflight immediately before any other middleware logic
  if (request.method === "OPTIONS") {
    return addCorsHeaders(new NextResponse(null, { status: 204 }), request);
  }

  // Only process API routes (auth + rate limiting)
  // Page routes pass through - intl middleware will be activated when
  // the app is restructured with [locale] route segment in the future.
  if (!pathname.startsWith("/api/")) {
    return addCorsHeaders(NextResponse.next(), request);
  }

  // ---- Aura AI Bypass ----
  // Permite que el agente autonomo acceda a sus endpoints de sincronizacion
  // usando su API Key en lugar de una sesion de usuario.
  if (pathname.startsWith("/api/aura/sync") || pathname === "/api/aura/chat") {
    const auraToken = request.headers.get("x-aura-token");
    if (auraToken === process.env.AURA_API_KEY) {
      return addCorsHeaders(NextResponse.next(), request);
    }
  }

  // ---- Server Reminder Cron Bypass ----
  // The route performs the same validation again before generating reminders.
  // This allows the internal Docker cron to run while keeping the endpoint
  // protected from unauthenticated public requests.
  if (pathname === "/api/push/reminders") {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const token = request.nextUrl.searchParams.get("token");
    if (cronSecret && (authHeader === `Bearer ${cronSecret}` || token === cronSecret)) {
      return addCorsHeaders(NextResponse.next(), request);
    }
  }

  // Allow public routes (still apply lighter rate limiting below)
  const isPublicRoute = PUBLIC_ROUTES.some((route) => pathname.startsWith(route));

  // ---- Rate Limiting ----
  // For public routes: rate limit by IP
  // For protected routes: rate limit by user ID (after auth check)
  if (isPublicRoute) {
    const ip = getClientIp(request);
    const { allowed, retryAfterMs } = checkRateLimit(`ip:${ip}`, PUBLIC_RATE_MAX_REQUESTS);
    if (!allowed) {
      return addCorsHeaders(NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
        }
      ), request);
    }
    return addCorsHeaders(NextResponse.next(), request);
  }

  // ---- Authentication ----
  try {
    const token = await getToken({
      req: request,
      cookieName: SESSION_COOKIE_NAME,
      secureCookie: isSecureCookieEnabled(),
      secret: (() => {
        if (process.env.NEXTAUTH_SECRET) return process.env.NEXTAUTH_SECRET;
        if (process.env.NODE_ENV === "production") {
          throw new Error("NEXTAUTH_SECRET is required in production.");
        }
        return "dev-only-secret-" + "proxy" + "-CHANGE-IN-PROD";
      })(),
    });

    if (!token) {
      return addCorsHeaders(NextResponse.json(
        { error: "No autorizado - Inicia sesion para continuar" },
        { status: 401 }
      ), request);
    }

    // Rate limit by user ID (more accurate than IP)
    const userId = token.id as string;
    const { allowed, retryAfterMs } = checkRateLimit(`user:${userId}`, AUTH_RATE_MAX_REQUESTS);
    if (!allowed) {
      return addCorsHeaders(NextResponse.json(
        { error: "Demasiadas solicitudes. Intenta de nuevo en unos segundos." },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil(retryAfterMs / 1000)) },
        }
      ), request);
    }

    // Add user ID to request headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", userId);

    // Capacitor persists the native session as a Bearer token because Android
    // WebView does not reliably retain the cross-site NextAuth cookie. Expose
    // that validated token as the regular session cookie for existing API
    // handlers that still use getServerSession().
    const authorization = request.headers.get("authorization");
    const bearerToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : null;
    if (bearerToken && !request.cookies.has(SESSION_COOKIE_NAME)) {
      const existingCookies = requestHeaders.get("cookie");
      const sessionCookie = `${SESSION_COOKIE_NAME}=${bearerToken}`;
      requestHeaders.set("cookie", existingCookies ? `${existingCookies}; ${sessionCookie}` : sessionCookie);
    }

    return addCorsHeaders(NextResponse.next({
      request: { headers: requestHeaders },
    }), request);
  } catch {
    return addCorsHeaders(NextResponse.json(
      { error: "Error de autenticacion" },
      { status: 401 }
    ), request);
  }
}

export const config = {
  matcher: ["/api/:path*"],
};
