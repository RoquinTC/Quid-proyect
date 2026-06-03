import { NextRequest, NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { db } from "@/lib/db";
import { createMobileSession } from "@/lib/mobile-session";

export async function POST(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Servidor sin configuración de sesión" }, { status: 500 });
  }

  const { email, password } = await req.json().catch(() => ({}));
  if (!email || !password) {
    return NextResponse.json({ error: "Correo y contraseña son requeridos" }, { status: 400 });
  }

  const user = await db.user.findUnique({
    where: { email },
    include: { settings: true },
  });

  if (!user || !await compare(password, user.password)) {
    return NextResponse.json({ error: "Correo o contraseña incorrectos" }, { status: 401 });
  }

  return NextResponse.json(await createMobileSession(user));
}
