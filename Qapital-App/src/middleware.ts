import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/api/auth",
  "/api/health",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /api/* routes (except public ones)
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Allow public routes
  if (PUBLIC_ROUTES.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow CORS preflight
  if (request.method === "OPTIONS") {
    return NextResponse.next();
  }

  // Check for JWT token
  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET || (process.env.NODE_ENV === "development" ? "lifehub-secret-key-dev-2024" : undefined),
    });

    if (!token) {
      return NextResponse.json(
        { error: "No autorizado — Inicia sesión para continuar" },
        { status: 401 }
      );
    }

    // Add user ID to request headers for downstream use
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-id", token.id as string);

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
  matcher: ["/api/:path*"],
};
