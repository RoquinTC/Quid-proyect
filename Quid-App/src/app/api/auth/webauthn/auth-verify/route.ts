import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAuthenticationResponse, getChallenge, deleteChallenge } from '@/lib/webauthn';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { credential, userId: providedUserId } = body;

    if (!credential?.id) {
      return NextResponse.json({ error: 'Credencial requerida' }, { status: 400 });
    }

    // Find the credential in the database
    const authCred = await db.authCredential.findUnique({
      where: { credentialId: credential.id },
      include: { user: true },
    });

    if (!authCred) {
      return NextResponse.json(
        { error: 'Credencial no encontrada' },
        { status: 404 },
      );
    }

    // Get the stored challenge — for usernameless flow, it's stored under 'anonymous'
    const challengeKey = providedUserId || 'anonymous';
    const expectedChallenge = getChallenge(challengeKey);
    if (!expectedChallenge) {
      return NextResponse.json(
        { error: 'Challenge expirado. Intenta de nuevo.' },
        { status: 400 },
      );
    }

    // Verify the authentication response
    const verification = await verifyAuthenticationResponse(
      request,
      credential,
      expectedChallenge,
      authCred.credentialId,
      authCred.publicKey,
      authCred.counter,
    );

    // Clean up challenge
    deleteChallenge(challengeKey);

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Verificación fallida' },
        { status: 400 },
      );
    }

    // Update the counter and lastUsedAt
    await db.authCredential.update({
      where: { id: authCred.id },
      data: {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: new Date(),
      },
    });

    // Return user info so the client can sign in via next-auth
    return NextResponse.json({
      verified: true,
      userId: authCred.userId,
      email: authCred.user.email,
    });
  } catch (error) {
    console.error('[WebAuthn] Auth verify error:', error);
    return NextResponse.json(
      { error: 'Error al verificar la autenticación' },
      { status: 500 },
    );
  }
}
