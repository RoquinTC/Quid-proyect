import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { headers } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  TOOL_REGISTRY,
  getTool,
  isImplemented,
  isWriteTool,
} from "@/lib/aura/tools/registry";
import { validateToolParameters } from "@/lib/aura/tools/validate";
import { getReadExecutor } from "@/lib/aura/tools/executors";
import { createPendingAction } from "@/lib/aura/pending-actions";

export const dynamic = "force-dynamic";

/**
 * Gateway de herramientas de Aura.
 *
 * POR QUÉ EXISTE
 *
 * Antes la única puerta de entrada era `/api/aura/chat`, que hacía todo: recibía
 * texto libre, decidía la intención con expresiones regulares y ejecutaba. Eso
 * mezclaba tres responsabilidades y hacía imposible saber qué podía hacer Aura
 * sin leer 1800 líneas.
 *
 * Este endpoint separa "qué se puede hacer" de "cómo se conversa":
 *
 *   GET  /api/aura/tools                 → descubre las herramientas y su estado
 *   POST /api/aura/tools { tool, args }  → ejecuta
 *
 * REGLA DE SEGURIDAD
 *
 * Las herramientas de lectura se ejecutan y devuelven datos.
 * Las de escritura NUNCA se ejecutan acá: crean una propuesta persistida y
 * devuelven su `id`. La ejecución real ocurre en
 * `POST /api/aura/tools/confirm`, y solo con ese id. Así, ninguna frase que el
 * modelo genere puede provocar una escritura por sí sola.
 *
 * AUTENTICACIÓN
 *
 * Igual que el resto del puente: sesión web, o el token interno de Aura
 * (`x-aura-token`) más el `telegramId`, que se resuelve contra la base. Nunca se
 * confía en un userId recibido desde el cliente.
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
        {
          error:
            "No encontré ninguna cuenta vinculada a este Telegram ID. Vincula tu cuenta primero en la app.",
        },
        { status: 404 }
      ),
    };
  }

  return { user: { userId: user.id } };
}

/** Catálogo de herramientas. Sirve para que Aura sepa qué puede ofrecer. */
export async function GET(req: Request) {
  // Aura necesita descubrir las herramientas para saber qué ofrecer, así que este
  // endpoint acepta su token además de la sesión web. El catálogo no expone datos
  // del usuario: son solo nombres, tipos y descripciones de lo que existe.
  const headersList = await headers();
  const auraToken = headersList.get("x-aura-token");
  const isTrustedAuraClient =
    Boolean(process.env.AURA_API_KEY) && auraToken === process.env.AURA_API_KEY;

  if (!isTrustedAuraClient) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autorizado. Inicia sesión o usa el canal seguro de Aura." },
        { status: 401 }
      );
    }
  }

  return NextResponse.json({
    tools: TOOL_REGISTRY.map((tool) => ({
      name: tool.name,
      kind: tool.kind,
      implemented: tool.implemented,
      description: tool.description,
      parameters: tool.parameters,
      proposalTtlMinutes: tool.proposalTtlMinutes,
    })),
    counts: {
      total: TOOL_REGISTRY.length,
      read: TOOL_REGISTRY.filter((tool) => tool.kind === "read").length,
      write: TOOL_REGISTRY.filter((tool) => tool.kind === "write").length,
      implemented: TOOL_REGISTRY.filter((tool) => tool.implemented).length,
    },
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const headersList = await headers();

    const { user, response } = await resolveUser(body, headersList);
    if (response) return response;

    const toolName = typeof body.tool === "string" ? body.tool : "";
    if (!toolName) {
      return NextResponse.json(
        { error: "Falta el campo 'tool'. Consulta GET /api/aura/tools para ver las disponibles." },
        { status: 400 }
      );
    }

    const definition = getTool(toolName);
    if (!definition) {
      return NextResponse.json(
        { error: `No existe la herramienta "${toolName}". Consulta GET /api/aura/tools.` },
        { status: 404 }
      );
    }

    if (!isImplemented(toolName)) {
      return NextResponse.json(
        {
          error: `Todavía no puedo hacer eso: "${toolName}" está declarada pero no implementada.`,
          tool: toolName,
          implemented: false,
        },
        { status: 501 }
      );
    }

    const validation = validateToolParameters(definition, body.args ?? {});
    if (!validation.ok) {
      return NextResponse.json(
        {
          error: "Los datos están incompletos o son inválidos.",
          details: validation.errors,
          missingRequired: validation.missingRequired,
        },
        { status: 422 }
      );
    }

    const args = validation.value;
    const userId = user!.userId;

    // ── Lectura: se ejecuta y devuelve datos ────────────────────────────────
    if (definition.kind === "read") {
      const executor = getReadExecutor(toolName);
      if (!executor) {
        return NextResponse.json(
          { error: `La herramienta de lectura "${toolName}" no tiene ejecutor registrado.` },
          { status: 501 }
        );
      }

      const result = await executor(args, { userId });
      return NextResponse.json({
        ok: true,
        tool: toolName,
        kind: "read",
        text: result.text,
        data: result.data ?? null,
      });
    }

    // ── Escritura: NO se ejecuta; se persiste una propuesta ─────────────────
    if (!isWriteTool(toolName)) {
      return NextResponse.json({ error: "Tipo de herramienta no soportado." }, { status: 400 });
    }

    // El resumen se arma con los argumentos ya validados, no con texto del
    // modelo: es lo que el usuario verá al confirmar, así que debe reflejar
    // exactamente lo que se va a escribir.
    const description = buildProposalDescription(toolName, args);

    const pending = await createPendingAction({
      userId,
      tool: toolName,
      args,
      description,
      source: typeof body.source === "string" ? body.source : "telegram",
      telegramId: body.telegramId ? String(body.telegramId) : null,
      ttlMinutes: typeof body.ttlMinutes === "number" ? body.ttlMinutes : undefined,
    });

    return NextResponse.json({
      ok: true,
      tool: toolName,
      kind: "write",
      requiresConfirmation: true,
      text: `${description}\n\n¿Lo guardo?`,
      proposal: {
        id: pending.id,
        args: pending.args,
        expiresAt: pending.expiresAt.toISOString(),
        description: pending.description,
      },
    });
  } catch (error) {
    console.error("Error en /api/aura/tools:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error interno del gateway de herramientas." },
      { status: 500 }
    );
  }
}

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

/**
 * Resumen legible de una propuesta de escritura.
 *
 * Se arma desde los argumentos estructurados. Antes este texto lo producía el
 * modelo y luego se volvía a parsear para ejecutar, con lo que el resumen y lo
 * ejecutado podían divergir.
 */
export function buildProposalDescription(
  tool: string,
  args: Record<string, unknown>
): string {
  if (tool === "registrar_transaccion") {
    const isIncome = args.type === "income";
    const amount = typeof args.amount === "number" ? COP.format(args.amount) : "sin valor";
    const destination = args.debtName
      ? `Tarjeta/deuda: ${args.debtName}`
      : `Cuenta: ${args.accountName ?? "sin especificar"}`;
    const category =
      args.category && args.subCategory
        ? `${args.category} / ${args.subCategory}`
        : (args.category as string) ?? "Otros";

    return [
      `Voy a registrar este ${isIncome ? "ingreso" : "gasto"}:`,
      `• ${destination}`,
      `• Valor: ${amount}`,
      `• Categoría: ${category}`,
      `• Fecha: ${(args.dateText as string) ?? "hoy"}`,
    ].join("\n");
  }

  if (tool === "registrar_tanqueo") {
    const parts: string[] = [`Voy a registrar un tanqueo:`];
    if (args.vehicleName) parts.push(`• Vehículo: ${args.vehicleName}`);
    if (typeof args.amount === "number") parts.push(`• Valor: ${COP.format(args.amount)}`);
    if (typeof args.gallons === "number") parts.push(`• Galones: ${args.gallons}`);
    if (typeof args.km === "number") parts.push(`• Odómetro: ${args.km} km`);
    if (args.isFullTank === true) parts.push(`• Tanque lleno: sí`);
    return parts.join("\n");
  }

  return `Voy a ejecutar la acción "${tool}" con estos datos:\n${JSON.stringify(args, null, 2)}`;
}
