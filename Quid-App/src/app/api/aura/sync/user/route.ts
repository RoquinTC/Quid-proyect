import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

export async function GET(request: Request) {
  try {
    const headersList = await headers();
    const apiKey = headersList.get('x-aura-token');

    if (!apiKey || apiKey !== process.env.AURA_API_KEY) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const telegramId = searchParams.get('telegramId');

    if (!telegramId) {
      return NextResponse.json({ error: 'telegramId requerido' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { telegramId: telegramId.toString() },
      select: {
        id: true,
        email: true,
        name: true,
        currency: true
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    return NextResponse.json(user);
  } catch (error) {
    console.error('❌ Error en /api/aura/sync/user:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
