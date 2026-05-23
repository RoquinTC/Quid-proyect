import { NextResponse } from "next/server";
import { askAura, type CoreMessage } from "@/lib/aura";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Aseguramos que la ruta se evalúe dinámicamente y no se sirva en caché
export const dynamic = "force-dynamic";

function normalizeRole(value: unknown): CoreMessage["role"] {
  return value === "assistant" || value === "system" || value === "data" ? value : "user";
}

function normalizeMessages(messages: unknown, prompt: unknown): CoreMessage[] {
  if (Array.isArray(messages)) {
    return messages
      .filter((message) => message && typeof message === "object")
      .map((message) => {
        const item = message as { role?: unknown; content?: unknown };
        return {
          role: normalizeRole(item.role),
          content: typeof item.content === "string" ? item.content : "",
        };
      })
      .filter((message) => message.content.trim().length > 0);
  }

  if (typeof prompt === "string" && prompt.trim()) {
    return [{ role: "user" as const, content: prompt.trim() }];
  }

  return [];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { messages, prompt, telegramId } = body;
    const session = await getServerSession(authOptions);
    const headersList = await headers();
    const auraToken = headersList.get("x-aura-token");
    const isTrustedAuraClient =
      Boolean(process.env.AURA_API_KEY) && auraToken === process.env.AURA_API_KEY;

    const finalMessages = normalizeMessages(messages, prompt);

    if (finalMessages.length === 0) {
      return NextResponse.json(
        { error: "Se requiere un prompt o un arreglo de messages." },
        { status: 400 }
      );
    }

    // La app usa la sesión autenticada. Telegram solo puede entrar con token interno
    // y se resuelve por telegramId; nunca confiamos en un userId recibido del cliente.
    let internalUserId = session?.user?.id;

    if (!internalUserId && isTrustedAuraClient && telegramId) {
      const user = await db.user.findUnique({
        where: { telegramId: String(telegramId) },
        select: { id: true },
      });

      if (!user) {
        return NextResponse.json(
          {
            error:
              "No encontré ninguna cuenta vinculada a este Telegram ID. Por favor vincula tu cuenta primero en la app.",
          },
          { status: 404 }
        );
      }
      internalUserId = user.id;
    }

    if (!internalUserId) {
      return NextResponse.json(
        { error: "No autorizado. Inicia sesión o usa el canal seguro de Aura." },
        { status: 401 }
      );
    }

    const auraResponse = await askAura(internalUserId, finalMessages);

    return NextResponse.json({
      success: true,
      text: auraResponse.text || auraResponse,
      action: auraResponse.action,
      responseMessages: auraResponse.responseMessages,
    });
  } catch (error: any) {
    console.error("Error en /api/aura/chat:", error);
    return NextResponse.json(
      { error: error.message || "Error interno procesando con Aura." },
      { status: 500 }
    );
  }
}
