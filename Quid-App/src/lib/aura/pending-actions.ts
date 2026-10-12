/**
 * Propuestas de escritura de Aura, persistidas.
 *
 * ESTE ARCHIVO ES EL CORAZÓN DEL ARREGLO
 *
 * Antes, una propuesta de escritura vivía únicamente en el texto que el modelo
 * escribía en el chat. Al confirmar, se reconstruía parseando ese mensaje:
 *
 *     if (line.includes("- Cuenta:")) accountName = line.replace("- Cuenta:", "").trim();
 *
 * Eso traía tres problemas reales:
 *
 *  1. Fragilidad: si el modelo cambiaba una palabra del formato, la ejecución
 *     fallaba o registraba datos incorrectos.
 *  2. Alcance indefinido: `hasRecentAuraProposal` miraba el último mensaje del
 *     asistente, pero la confirmación podía llegar nueve mensajes después.
 *  3. Sin trazabilidad: no quedaba registro de qué se propuso, quién lo confirmó
 *     ni cuándo.
 *
 * Ahora la propuesta es una fila con `id`, `tool`, `args` validados y `expiresAt`.
 * Ese `id` es lo que viaja en el botón de Telegram, así que se ejecuta
 * EXACTAMENTE el payload guardado, o nada.
 *
 * El `id` es un CUID, que es impredecible pero no secreto: por eso toda lectura
 * valida además que la propuesta pertenezca al usuario que la invoca. Un id
 * filtrado no alcanza para confirmar la acción de otra persona.
 */

import { db } from "@/lib/db";
import {
  DEFAULT_PROPOSAL_TTL_MINUTES,
  getTool,
  isWriteTool,
} from "./tools/registry";

export type PendingActionStatus = "pending" | "confirmed" | "cancelled" | "expired";

export interface PendingActionRecord {
  id: string;
  userId: string;
  tool: string;
  args: Record<string, unknown>;
  description: string;
  status: PendingActionStatus;
  source: string;
  telegramId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  expiresAt: Date;
  result: Record<string, unknown> | null;
}

export interface CreatePendingActionInput {
  userId: string;
  tool: string;
  args: unknown;
  description: string;
  source?: string;
  telegramId?: string | null;
  ttlMinutes?: number;
}

export class PendingActionError extends Error {
  constructor(message: string, readonly code: "not_found" | "expired" | "already_resolved" | "invalid_tool" | "forbidden") {
    super(message);
    this.name = "PendingActionError";
  }
}

/** Serializa de forma segura: un JSON inválido no debe tumbar la lectura. */
function safeParse(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function toRecord(row: {
  id: string;
  userId: string;
  tool: string;
  args: string;
  description: string;
  status: string;
  source: string;
  telegramId: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
  expiresAt: Date;
  result: string | null;
}): PendingActionRecord {
  return {
    id: row.id,
    userId: row.userId,
    tool: row.tool,
    args: safeParse(row.args) ?? {},
    description: row.description,
    status: row.status as PendingActionStatus,
    source: row.source,
    telegramId: row.telegramId,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
    expiresAt: row.expiresAt,
    result: safeParse(row.result),
  };
}

/**
 * Guarda una propuesta de escritura.
 *
 * Solo acepta herramientas declaradas como `write` en el registro. Es una
 * defensa deliberada: si un bug intentara persistir una herramienta de lectura
 * como si requiriera confirmación, o una herramienta inexistente, falla acá.
 */
export async function createPendingAction(
  input: CreatePendingActionInput
): Promise<PendingActionRecord> {
  if (!isWriteTool(input.tool)) {
    throw new PendingActionError(
      `La herramienta "${input.tool}" no está declarada como de escritura y no puede generar una propuesta.`,
      "invalid_tool"
    );
  }

  const definition = getTool(input.tool);
  const ttl = input.ttlMinutes ?? definition?.proposalTtlMinutes ?? DEFAULT_PROPOSAL_TTL_MINUTES;
  const expiresAt = new Date(Date.now() + ttl * 60_000);

  const row = await db.pendingAuraAction.create({
    data: {
      userId: input.userId,
      tool: input.tool,
      args: JSON.stringify(input.args ?? {}),
      description: input.description,
      status: "pending",
      source: input.source ?? "telegram",
      telegramId: input.telegramId ? String(input.telegramId) : null,
      expiresAt,
    },
  });

  return toRecord(row);
}

/**
 * Recupera una propuesta validando pertenencia y vigencia.
 *
 * Se llama antes de ejecutar. Devuelve errores tipados para que quien llama pueda
 * responder con un mensaje útil en vez de un 500.
 */
export async function getPendingActionForUser(
  id: string,
  userId: string
): Promise<PendingActionRecord> {
  const row = await db.pendingAuraAction.findUnique({ where: { id } });

  if (!row) {
    throw new PendingActionError("No encontré esa propuesta. Puede que ya no exista.", "not_found");
  }

  // Comprobación de pertenencia: un id filtrado no debe permitir confirmar la
  // acción de otra cuenta.
  if (row.userId !== userId) {
    throw new PendingActionError("Esa propuesta no pertenece a tu cuenta.", "forbidden");
  }

  if (row.status !== "pending") {
    const mensajes: Record<string, string> = {
      confirmed: "Esa propuesta ya se había confirmado.",
      cancelled: "Esa propuesta fue cancelada.",
      expired: "Esa propuesta venció. Vuelve a pedírmelo y la preparo de nuevo.",
    };
    throw new PendingActionError(
      mensajes[row.status] ?? "Esa propuesta ya no está activa.",
      "already_resolved"
    );
  }

  if (row.expiresAt.getTime() < Date.now()) {
    // Se marca para no reevaluar la vigencia en cada intento.
    await db.pendingAuraAction.update({
      where: { id },
      data: { status: "expired", resolvedAt: new Date() },
    });
    throw new PendingActionError(
      "Esa propuesta venció. Vuelve a pedírmelo y la preparo de nuevo.",
      "expired"
    );
  }

  return toRecord(row);
}

/**
 * Marca una propuesta como confirmada.
 *
 * Se llama DESPUÉS de ejecutar con éxito. Si la ejecución falla, la propuesta
 * queda pendiente para poder reintentar.
 */
export async function markActionConfirmed(
  id: string,
  result: unknown
): Promise<PendingActionRecord> {
  const row = await db.pendingAuraAction.update({
    where: { id },
    data: {
      status: "confirmed",
      resolvedAt: new Date(),
      result: JSON.stringify(result ?? {}),
    },
  });
  return toRecord(row);
}

export async function markActionCancelled(id: string): Promise<PendingActionRecord> {
  const row = await db.pendingAuraAction.update({
    where: { id },
    data: { status: "cancelled", resolvedAt: new Date() },
  });
  return toRecord(row);
}

/**
 * Propuesta pendiente más reciente del usuario, si sigue vigente.
 *
 * Sirve para el flujo conversacional: cuando el usuario escribe "confirmar" en
 * texto en vez de tocar el botón, hay que resolver a qué propuesta se refiere.
 * Se toma la más reciente y solo si no venció, en lugar de mirar el historial de
 * mensajes.
 */
export async function getLatestPendingAction(
  userId: string
): Promise<PendingActionRecord | null> {
  const row = await db.pendingAuraAction.findFirst({
    where: { userId, status: "pending", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  return row ? toRecord(row) : null;
}

/**
 * Marca como expiradas las propuestas vencidas que siguen en `pending`.
 * Devuelve cuántas actualizó. Pensado para el cron de recordatorios.
 */
export async function expireStalePendingActions(): Promise<number> {
  const result = await db.pendingAuraAction.updateMany({
    where: { status: "pending", expiresAt: { lt: new Date() } },
    data: { status: "expired", resolvedAt: new Date() },
  });
  return result.count;
}
