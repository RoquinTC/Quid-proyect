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

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);

    const settings = await db.userSettings.findUnique({
      where: { userId: userId! },
    });
    const credentials = await db.authCredential.findMany({
      where: { userId: userId! },
      select: {
        id: true,
        name: true,
        deviceType: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const pinEnabled = settings?.pinEnabled ?? false;
    const biometricEnabled = settings?.biometricEnabled ?? false;
    const lockOnResume = settings?.lockOnResume ?? true;
    const hasCredentials = credentials.length > 0;

    return NextResponse.json({
      pinEnabled,
      biometricEnabled,
      lockOnResume,
      hasCredentials,
      credentials: credentials.map((c) => ({
        id: c.id,
        name: c.name,
        deviceType: c.deviceType,
        createdAt: c.createdAt.toISOString(),
        lastUsedAt: c.lastUsedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    console.error('[Security] Status error:', error);
    return NextResponse.json(
      { error: 'Error al obtener el estado de seguridad' },
      { status: 500 },
    );
  }
}
