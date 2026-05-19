import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hash } from 'bcryptjs';
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

    // Hash the PIN with bcryptjs
    const pinHash = await hash(pin, 10);

    // Update or create user settings
    const existing = await db.userSettings.findUnique({ where: { userId } });

    if (existing) {
      await db.userSettings.update({
        where: { userId },
        data: { pinEnabled: true, pinHash },
      });
    } else {
      await db.userSettings.create({
        data: {
          userId,
          pinEnabled: true,
          pinHash,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: 'PIN configurado exitosamente',
    });
  } catch (error) {
    console.error('[PIN] Setup error:', error);
    return NextResponse.json(
      { error: 'Error al configurar el PIN' },
      { status: 500 },
    );
  }
}
