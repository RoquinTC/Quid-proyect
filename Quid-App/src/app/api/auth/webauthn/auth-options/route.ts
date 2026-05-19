import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateAuthenticationOptions, storeChallenge } from '@/lib/webauthn';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');

    let existingCredentialIds: string[] = [];

    if (userId) {
      // Get credentials for a specific user
      const credentials = await db.authCredential.findMany({
        where: { userId },
        select: { credentialId: true },
      });
      existingCredentialIds = credentials.map((c) => c.credentialId);
    }

    const options = await generateAuthenticationOptions(
      request,
      existingCredentialIds,
      !userId, // allow usernameless if no userId provided
    );

    // Store challenge - use userId if provided, otherwise use a temp key
    const challengeKey = userId || 'anonymous';
    storeChallenge(challengeKey, options.challenge);

    return NextResponse.json(options);
  } catch (error) {
    console.error('[WebAuthn] Auth options error:', error);
    return NextResponse.json(
      { error: 'Error al generar opciones de autenticación' },
      { status: 500 },
    );
  }
}
