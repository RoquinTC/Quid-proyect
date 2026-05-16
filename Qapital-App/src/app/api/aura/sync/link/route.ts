import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { headers } from 'next/headers';

export async function POST(req: Request) {
  try {
    const headersList = await headers();
    const apiKey = headersList.get('x-aura-token');

    if (!apiKey || apiKey !== process.env.AURA_API_KEY) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { email, telegramId } = await req.json();

    if (!email || !telegramId) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    // Buscamos el usuario y lo actualizamos con el telegramId (como string)
    const user = await prisma.user.update({
      where: { email },
      data: { telegramId: telegramId.toString() }
    });

    return NextResponse.json({ success: true, user: { name: user.name } });
  } catch (error) {
    console.error('❌ Error en /api/aura/sync/link:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
