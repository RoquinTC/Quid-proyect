import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/auth/offline-credentials
 *
 * Returns the user's password hash so the client can cache it for offline login.
 * This is only available to authenticated users (they just logged in successfully).
 *
 * Security: This only returns the bcrypt hash (not the password), and only to
 * the already-authenticated user. The hash is stored in localStorage on the
 * user's own device and used for offline password verification via bcrypt.compare().
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, password: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    return NextResponse.json({
      email: user.email,
      passwordHash: user.password,
      userId: session.user.id,
    });
  } catch (error) {
    console.error("Get offline credentials error:", error);
    return NextResponse.json({ error: "Error al obtener credenciales" }, { status: 500 });
  }
}
