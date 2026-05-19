import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { verifyRegistrationResponse, getChallenge, deleteChallenge } from '@/lib/webauthn';

async function getUserId(request: Request): Promise<string | null> {
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId) return headerUserId;
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { credential, name } = body;

    if (!credential) {
      return NextResponse.json({ error: 'Credencial requerida' }, { status: 400 });
    }

    // Get the stored challenge
    const expectedChallenge = getChallenge(userId);
    if (!expectedChallenge) {
      return NextResponse.json(
        { error: 'Challenge expirado. Intenta de nuevo.' },
        { status: 400 },
      );
    }

    // Verify the registration response
    const verification = await verifyRegistrationResponse(
      request,
      credential,
      expectedChallenge,
    );

    // Clean up challenge
    deleteChallenge(userId);

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: 'Verificación fallida' },
        { status: 400 },
      );
    }

    const { registrationInfo } = verification;

    // In @simplewebauthn/server v13, credential data is nested in `credential`
    const cred = registrationInfo.credential;

    // Save the credential to the database
    await db.authCredential.create({
      data: {
        userId,
        credentialId: cred.id,
        publicKey: Buffer.from(cred.publicKey).toString('base64url'),
        counter: cred.counter,
        deviceType: registrationInfo.credentialDeviceType as string,
        backedUp: registrationInfo.credentialBackedUp,
        transports: cred.transports ? JSON.stringify(cred.transports) : null,
        name: name || 'Mi dispositivo',
      },
    });

    // Enable biometric in user settings
    const settings = await db.userSettings.findUnique({ where: { userId } });
    if (settings) {
      await db.userSettings.update({
        where: { userId },
        data: { biometricEnabled: true },
      });
    } else {
      await db.userSettings.create({
        data: {
          userId,
          biometricEnabled: true,
        },
      });
    }

    return NextResponse.json({
      verified: true,
      message: 'Dispositivo registrado exitosamente',
    });
  } catch (error) {
    console.error('[WebAuthn] Register verify error:', error);
    return NextResponse.json(
      { error: 'Error al verificar el registro' },
      { status: 500 },
    );
  }
}
