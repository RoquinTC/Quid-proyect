import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  PendingActionError,
  getPendingActionForUser,
  markActionCancelled,
  markActionConfirmed,
} from "@/lib/aura/pending-actions";
import { executeConfirmedTool } from "@/lib/aura/tools/execute-confirmed";

export const dynamic = "force-dynamic";

/**
 * Confirmación y cancelación de propuestas de escritura de Aura.
 *
 * AQUÍ ESTÁ EL ARREGLO DE FONDO
 *
 * Antes, confirmar significaba: (1) que el último mensaje del asistente
 * contuviera "resumen para confirmar", y (2) que el mensaje del usuario empezara
 * con "si|confirmo|dale|ok|listo". La propuesta se reconstruía parseando el texto
 * del asistente.
 *
 * O sea: si el modelo alucinaba esa frase, un "ok" del usuario ejecutaba una
 * escritura. Y no había forma de saber a qué propuesta correspondía una
 * confirmación.
 *
 * Ahora hay que enviar el `id` de una propuesta persistida. Ese id viene del
 * botón de Telegram (`callback_data`) y se valida contra la fila:
 *   - que exista,
 *   - que pertenezca al usuario que confirma,
 *   - que siga en estado `pending`,
 *   - que no haya vencido.
 *
 * Si cualquiera falla, no se escribe nada. Una frase generada por el modelo no
 * puede provocar una escritura por sí sola.
 *
 * ACCIONES
 *   POST { action: "confirm", proposalId, telegramId? }
 *   POST { action: "cancel",  proposalId, telegramId? }
 */

interface ResolvedUser {
  userId: string;
}

async function resolveUser(
  body: Record<string, unknown>,
  headersList: Headers
): Promise<{ user?: ResolvedUser; response?: NextResponse }> {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    return { user: { userId: session.user.id } };
  }

  const auraToken = headersList.get("x-aura-token");
  const isTrustedAuraClient =
    Boolean(process.env.AURA_API_KEY) && auraToken === process.env.AURA_API_KEY;

  if (!isTrustedAuraClient) {
    return {
      response: NextResponse.json(
        { error: "No autorizado. Inicia sesión o usa el canal seguro de Aura." },
        { status: 401 }
      ),
    };
  }

  const telegramId = body.telegramId;
  if (!telegramId) {
    return {
      response: NextResponse.json(
        { error: "Falta telegramId para resolver el usuario de Aura." },
        { status: 400 }
      ),
    };
  }

  const user = await db.user.findUnique({
    where: { telegramId: String(telegramId) },
    select: { id: true },
  });

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "No encontré ninguna cuenta vinculada a este Telegram ID." },
        { status: 404 }
      ),
    };
  }

  return { user: { userId: user.id } };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const headersList = await headers();

    const { user, response } = await resolveUser(body, headersList);
    if (response) return response;

    const action = body.action;
    const proposalId = typeof body.proposalId === "string" ? body.proposalId : "";

    if (action !== "confirm" && action !== "cancel") {
      return NextResponse.json(
        { error: "El campo 'action' debe ser \"confirm\" o \"cancel\"." },
        { status: 400 }
      );
    }

    if (!proposalId) {
      return NextResponse.json({ error: "Falta proposalId." }, { status: 400 });
    }

    const userId = user!.userId;

    // ── Cancelar ────────────────────────────────────────────────────────────
    if (action === "cancel") {
      try {
        // La propia validación exige que esté pendiente y vigente, así que no se
        // puede "cancelar" algo ya confirmado cambiando el estado por accidente.
        await getPendingActionForUser(proposalId, userId);
        await markActionCancelled(proposalId);
        return NextResponse.json({
          ok: true,
          action: "cancel",
          text: "Listo, no guardé nada.",
        });
      } catch (error) {
        if (error instanceof PendingActionError) {
          return NextResponse.json(
            { ok: false, error: error.message, code: error.code },
            { status: 409 }
          );
        }
        throw error;
      }
    }

    // ── Confirmar: validar, ejecutar, marcar ────────────────────────────────
    let pending;
    try {
      pending = await getPendingActionForUser(proposalId, userId);
    } catch (error) {
      if (error instanceof PendingActionError) {
        return NextResponse.json(
          { ok: false, error: error.message, code: error.code },
          { status: 409 }
        );
      }
      throw error;
    }

    let result;
    try {
      result = await executeConfirmedTool(pending.tool, pending.args, { userId });
    } catch (error) {
      // La propuesta queda PENDIENTE a propósito: si la ejecución falló (por
      // ejemplo, la cuenta ya no existe), el usuario puede corregir y reintentar
      // en vez de quedarse sin nada y con la propuesta quemada.
      console.error(`[Aura] Falló la ejecución de ${pending.tool}:`, error);
      return NextResponse.json(
        {
          ok: false,
          error: error instanceof Error ? error.message : "No pude ejecutar la acción.",
          text: `No pude guardarlo: ${error instanceof Error ? error.message : "error desconocido"}`,
          proposalStillPending: true,
        },
        { status: 422 }
      );
    }

    await markActionConfirmed(proposalId, result.data ?? {});

    return NextResponse.json({
      ok: true,
      action: "confirm",
      tool: pending.tool,
      text: result.text,
      data: result.data ?? null,
    });
  } catch (error) {
    console.error("Error en /api/aura/tools/confirm:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno al confirmar la acción." },
      { status: 500 }
    );
  }
}
