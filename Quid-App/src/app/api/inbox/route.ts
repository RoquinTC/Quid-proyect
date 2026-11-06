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

    return NextResponse.json({
      items: items.map((i) => serialize(i as InboxRow)),
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

    const parsed = parseCapture(body.rawText);

    const item = await db.inboxItem.create({
      data: {
        userId: session.user.id,
        source: body.source || "manual",
        rawText: body.rawText.trim(),
        parsedAmount: parsed.amount,
        parsedType: parsed.type,
        parsedDate: parsed.date ? new Date(`${parsed.date}T12:00:00`) : null,
        parsedMerchant: parsed.merchant,
        confidence: parsed.confidence,
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
