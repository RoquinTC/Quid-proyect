import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { generateRegistrationOptions, storeChallenge } from '@/lib/webauthn';

async function getUserId(request: Request): Promise<string | null> {
  // First try the middleware header
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId) return headerUserId;

  // Fallback: check next-auth session (needed for routes under /api/auth which are public in middleware)
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: {
        authCredentials: { select: { credentialId: true } },
        settings: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    const existingCredentialIds = user.authCredentials.map((c) => c.credentialId);

    const options = await generateRegistrationOptions(
      request,
      user.id,
      user.email,
      user.name,
      existingCredentialIds,
    );

    // Store the challenge for verification
    storeChallenge(user.id, options.challenge);

    return NextResponse.json(options);
  } catch (error) {
    console.error('[WebAuthn] Register options error:', error);
    return NextResponse.json(
      { error: 'Error al generar opciones de registro' },
      { status: 500 },
    );
  }
}
