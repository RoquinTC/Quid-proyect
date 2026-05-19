import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

async function getUserId(request: Request): Promise<string | null> {
  const headerUserId = request.headers.get('x-user-id');
  if (headerUserId) return headerUserId;
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

export async function DELETE(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await request.json();
    const { credentialId } = body;

    if (!credentialId) {
      return NextResponse.json({ error: 'ID de credencial requerido' }, { status: 400 });
    }

    // Find the credential and ensure it belongs to this user
    const credential = await db.authCredential.findFirst({
      where: { id: credentialId, userId },
    });

    if (!credential) {
      return NextResponse.json(
        { error: 'Credencial no encontrada' },
        { status: 404 },
      );
    }

    // Delete the credential
    await db.authCredential.delete({
      where: { id: credentialId },
    });

    // Check if this was the last credential
    const remainingCredentials = await db.authCredential.count({
      where: { userId },
    });

    // If no more credentials, disable biometric
    if (remainingCredentials === 0) {
      await db.userSettings.updateMany({
        where: { userId },
        data: { biometricEnabled: false },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Dispositivo eliminado',
      remainingCredentials,
    });
  } catch (error) {
    console.error('[WebAuthn] Delete credential error:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la credencial' },
      { status: 500 },
    );
  }
}
