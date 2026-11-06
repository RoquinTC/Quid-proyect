import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  validateBody,
  inboxRuleCreateSchema,
  inboxRuleUpdateSchema,
  inboxRuleDeleteSchema,
} from "@/lib/validations";

/**
 * F-36 · Reglas de clasificación de capturas.
 *
 * Cada regla dice qué proponer cuando un mensaje contiene cierto texto.
 * Solo proponen: el usuario sigue confirmando en el formulario. Aquí no se
 * crea ni se mueve dinero.
 */

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const rules = await db.inboxRule.findMany({
      where: { userId: session.user.id },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Get inbox rules error:", error);
    return NextResponse.json({ error: "Error al leer las reglas" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, inboxRuleCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const rule = await db.inboxRule.create({
      data: {
        userId: session.user.id,
        name: body.name.trim(),
        contains: body.contains.trim(),
        category: body.category || null,
        subCategory: body.subCategory || null,
        accountId: body.accountId || null,
        type: body.type || null,
        priority: body.priority ?? 0,
        active: body.active ?? true,
      },
    });

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error("Create inbox rule error:", error);
    return NextResponse.json({ error: "Error al crear la regla" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, inboxRuleUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const existing = await db.inboxRule.findFirst({
      where: { id: body.id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });
    }

    const { id, ...changes } = body;
    const rule = await db.inboxRule.update({
      where: { id },
      data: {
        ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
        ...(changes.contains !== undefined ? { contains: changes.contains.trim() } : {}),
        ...(changes.category !== undefined ? { category: changes.category || null } : {}),
        ...(changes.subCategory !== undefined ? { subCategory: changes.subCategory || null } : {}),
        ...(changes.accountId !== undefined ? { accountId: changes.accountId || null } : {}),
        ...(changes.type !== undefined ? { type: changes.type || null } : {}),
        ...(changes.priority !== undefined ? { priority: changes.priority } : {}),
        ...(changes.active !== undefined ? { active: changes.active } : {}),
      },
    });

    return NextResponse.json({ rule });
  } catch (error) {
    console.error("Update inbox rule error:", error);
    return NextResponse.json({ error: "Error al actualizar la regla" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, inboxRuleDeleteSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const existing = await db.inboxRule.findFirst({
      where: { id: body.id, userId: session.user.id },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Regla no encontrada" }, { status: 404 });
    }

    await db.inboxRule.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete inbox rule error:", error);
    return NextResponse.json({ error: "Error al eliminar la regla" }, { status: 500 });
  }
}
