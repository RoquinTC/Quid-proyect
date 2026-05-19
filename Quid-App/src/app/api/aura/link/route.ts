import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

// URL interna de Docker para hablar con Aura
const AURA_INTERNAL_URL = 'http://aura-super-agent:3000/verify';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { code } = await req.json();

    // Llamamos a Aura Standalone usando FETCH nativo
    const response = await fetch(AURA_INTERNAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        email: session.user.email
      })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: data.error || 'Código inválido o expirado' }, { status: 400 });
    }
  } catch (error) {
    console.error('❌ Error vinculando con Aura:', error);
    return NextResponse.json({ error: 'Error de conexión con el agente' }, { status: 500 });
  }
}
