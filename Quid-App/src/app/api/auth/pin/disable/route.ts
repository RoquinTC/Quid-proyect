import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { compare } from 'bcryptjs';
import { db } from '@/lib/db';

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
    const { pin } = body;

    if (!pin || !/^\d{4}$/.test(pin)) {
      return NextResponse.json(
        { error: 'El PIN debe ser de 4 dígitos' },
        { status: 400 },
      );
    }

    const settings = await db.userSettings.findUnique({ where: { userId } });

    if (!settings || !settings.pinHash) {
      return NextResponse.json(
        { error: 'PIN no configurado' },
        { status: 400 },
      );
    }

    // Verify current PIN before disabling
    const isValid = await compare(pin, settings.pinHash);

    if (!isValid) {
      return NextResponse.json(
        { error: 'PIN incorrecto', success: false },
        { status: 200 },
      );
    }

    // Disable PIN
    await db.userSettings.update({
      where: { userId },
      data: { pinEnabled: false, pinHash: null },
    });

    return NextResponse.json({
      success: true,
      message: 'PIN desactivado',
    });
  } catch (error) {
    console.error('[PIN] Disable error:', error);
    return NextResponse.json(
      { error: 'Error al desactivar el PIN' },
      { status: 500 },
    );
  }
}
