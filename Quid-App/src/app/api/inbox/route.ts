import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  validateBody,
  inboxCreateSchema,
  inboxUpdateSchema,
  inboxDeleteSchema,
} from "@/lib/validations";
import { parseCapture } from "@/lib/inbox/parse";
import { classifyCapture, isMovement } from "@/lib/inbox/classify";
import { findDuplicate } from "@/lib/inbox/duplicate";
import { toNumber } from "@/lib/decimal-serializer";

/**
 * F-49 · Bandeja de entrada de capturas.
 *
 * Recibe un texto crudo (SMS, correo, notificación o algo pegado a mano),
 * lo interpreta con `parseCapture` y lo deja pendiente de clasificar.
 *
 * Diseño deliberado: **aceptar NO crea el movimiento aquí**. La UI abre el
 * formulario normal de transacción prellenado, así el dinero se registra por
 * el único camino que ya sabe mover saldos y presupuestos. Esta ruta solo
 * recuerda que la captura quedó resuelta.
 */

type InboxRow = {
  id: string;
  source: string;
  rawText: string;
  parsedAmount: unknown;
  parsedType: string | null;
  parsedDate: Date | null;
  parsedMerchant: string | null;
  confidence: number | null;
  status: string;
  transactionId: string | null;
  notes: string | null;
  receivedAt: Date;
};

function serialize(item: InboxRow) {
  return {
    id: item.id,
    source: item.source,
    rawText: item.rawText,
    parsedAmount: item.parsedAmount === null ? null : toNumber(item.parsedAmount as never),
    parsedType: item.parsedType,
    parsedDate: item.parsedDate ? item.parsedDate.toISOString() : null,
    parsedMerchant: item.parsedMerchant,
    confidence: item.confidence,
    status: item.status,
    transactionId: item.transactionId,
    notes: item.notes,
    receivedAt: item.receivedAt.toISOString(),
  };
}

/** GET · capturas pendientes, las más recientes primero. */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending";
    const take = Math.min(Number(searchParams.get("take")) || 50, 200);

    const items = await db.inboxItem.findMany({
      where: { userId: session.user.id, status },
      orderBy: { receivedAt: "desc" },
      take,
    });

    const pendingCount = await db.inboxItem.count({
      where: { userId: session.user.id, status: "pending" },
    });

    // F-49b · ¿Alguna captura corresponde a un movimiento ya registrado?
    // Los SMS son de días atrás y esos movimientos suelen estar anotados a
    // mano; aceptarlos otra vez duplicaría el gasto. Se busca en una ventana
    // de fechas alrededor de las capturas, en una sola consulta.
    const matches = await findExistingMovements(session.user.id, items);

    return NextResponse.json({
      items: items.map((i) => ({
        ...serialize(i as InboxRow),
        possibleMatch: matches.get(i.id) ?? null,
      })),
      pendingCount,
    });
  } catch (error) {
    console.error("Get inbox error:", error);
    return NextResponse.json({ error: "Error al leer la bandeja" }, { status: 500 });
  }
}

/** POST · registrar una captura nueva a partir de texto crudo. */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, inboxCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const cleanText = body.rawText.trim();

    // Primero se decide SI es un movimiento. Sin esto, una clave temporal de
    // 6 dígitos entra como gasto y una estafa como deuda.
    const classification = classifyCapture(cleanText);
    if (!isMovement(classification)) {
      return NextResponse.json(
        {
          skipped: true,
          reason: classification.reason,
          noiseReason: classification.noiseReason ?? null,
        },
        { status: 200 }
      );
    }

    const parsed = parseCapture(cleanText);

    // Evita duplicados al releer los SMS: si ese texto ya se capturó (aunque
    // se haya aceptado o descartado), no se vuelve a crear.
    const already = await db.inboxItem.findFirst({
      where: { userId: session.user.id, rawText: cleanText },
      select: { id: true },
    });
    if (already) {
      return NextResponse.json({ duplicate: true, itemId: already.id }, { status: 200 });
    }

    const item = await db.inboxItem.create({
      data: {
        userId: session.user.id,
        source: body.source || "manual",
        rawText: cleanText,
        parsedAmount: parsed.amount,
        parsedType: classification.kind,
        parsedDate: parsed.date ? new Date(`${parsed.date}T12:00:00`) : null,
        parsedMerchant: parsed.merchant,
        confidence: parsed.confidence,
        // Marca el retiro en cajero: el dinero pasó a efectivo.
        notes: classification.cashWithdrawal ? "retiro_efectivo" : null,
        status: "pending",
      },
    });

    return NextResponse.json(
      { item: serialize(item as InboxRow), parsed: parsed.signals },
      { status: 201 }
    );
  } catch (error) {
    console.error("Create inbox item error:", error);
    return NextResponse.json({ error: "Error al capturar" }, { status: 500 });
  }
}

/** PATCH · marcar como aceptada o descartada. */
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, inboxUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const existing = await db.inboxItem.findFirst({
      where: { id: body.id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Captura no encontrada" }, { status: 404 });
    }

    const item = await db.inboxItem.update({
      where: { id: body.id },
      data: {
        status: body.status,
        ...(body.transactionId !== undefined ? { transactionId: body.transactionId } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
      },
    });

    return NextResponse.json({ item: serialize(item as InboxRow) });
  } catch (error) {
    console.error("Update inbox item error:", error);
    return NextResponse.json({ error: "Error al actualizar la captura" }, { status: 500 });
  }
}

/** DELETE · borrar una captura de la bandeja. */
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, inboxDeleteSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const existing = await db.inboxItem.findFirst({
      where: { id: body.id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Captura no encontrada" }, { status: 404 });
    }

    await db.inboxItem.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete inbox item error:", error);
    return NextResponse.json({ error: "Error al eliminar la captura" }, { status: 500 });
  }
}

/** Ventana en días alrededor de la captura para buscar el movimiento. */
const MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Busca, para cada captura pendiente, un movimiento ya registrado con el
 * mismo monto y fecha cercana. Una sola consulta cubre todas las capturas.
 */
async function findExistingMovements(
  userId: string,
  items: Array<{ id: string; parsedAmount: unknown; parsedType: string | null; parsedDate: Date | null; receivedAt: Date }>
): Promise<Map<string, ReturnType<typeof findDuplicate>>> {
  const result = new Map<string, ReturnType<typeof findDuplicate>>();
  if (items.length === 0) return result;

  const times = items.map((item) => (item.parsedDate ?? item.receivedAt).getTime());
  const from = new Date(Math.min(...times) - MATCH_WINDOW_MS);
  const to = new Date(Math.max(...times) + MATCH_WINDOW_MS);

  const transactions = await db.transaction.findMany({
    where: { userId, date: { gte: from, lte: to } },
    select: { id: true, amount: true, date: true, type: true, description: true },
    orderBy: { date: "desc" },
  });

  const candidates = transactions.map((t) => ({
    id: t.id,
    amount: toNumber(t.amount),
    date: t.date.toISOString(),
    type: t.type,
    description: t.description,
  }));

  for (const item of items) {
    const match = findDuplicate(
      {
        parsedAmount: item.parsedAmount === null ? null : toNumber(item.parsedAmount as never),
        parsedType: item.parsedType,
        parsedDate: (item.parsedDate ?? item.receivedAt).toISOString(),
      },
      candidates,
      item.parsedDate ?? item.receivedAt
    );
    if (match) result.set(item.id, match);
  }

  return result;
}