import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/auth/webauthn/lookup?email=xxx
 *
 * Looks up a user by email and returns their userId if they have
 * WebAuthn credentials registered. This is needed for biometric login
 * where the user isn't authenticated yet.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const email = url.searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { email },
      include: {
        authCredentials: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user || user.authCredentials.length === 0) {
      return NextResponse.json(
        { error: 'No se encontró huella registrada para este correo' },
        { status: 404 },
      );
    }

    return NextResponse.json({ userId: user.id });
  } catch (error) {
    console.error('[WebAuthn] Lookup error:', error);
    return NextResponse.json(
      { error: 'Error al buscar usuario' },
      { status: 500 },
    );
  }
}
