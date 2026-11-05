import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  validateBody,
  categoryGroupCreateSchema,
  categoryGroupUpdateSchema,
  categoryGroupDeleteSchema,
} from "@/lib/validations";

/**
 * F-43 · Grupos de categorías.
 *
 * Permiten leer el presupuesto en el idioma del usuario:
 *   "Hogar"     = Vivienda + Servicios + Mantenimiento
 *   "Transporte"= Gasolina + Peajes + Taxi
 *
 * Los miembros se guardan por NOMBRE de categoría porque las categorías por
 * defecto no existen como fila en la base (solo las propias del usuario).
 *
 * Todas las operaciones están acotadas por `userId`: un grupo nunca puede
 * tocar categorías de otro usuario.
 */

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const groups = await db.categoryGroup.findMany({
      where: { userId: session.user.id },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        members: { orderBy: { categoryName: "asc" } },
      },
    });

    return NextResponse.json(
      groups.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        color: g.color,
        icon: g.icon,
        order: g.order,
        categories: g.members.map((m) => m.categoryName),
      }))
    );
  } catch (error) {
    console.error("Get category groups error:", error);
    return NextResponse.json({ error: "Error al obtener grupos" }, { status: 500 });
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
      body = await validateBody(req, categoryGroupCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const { name, type, color, icon, categories } = body;

    const group = await db.categoryGroup.create({
      data: {
        userId: session.user.id,
        name: name.trim(),
        type: type || "expense",
        color: color || null,
        icon: icon || null,
        members: {
          create: (categories || []).map((categoryName: string) => ({
            categoryName: categoryName.trim(),
          })),
        },
      },
      include: { members: { orderBy: { categoryName: "asc" } } },
    });

    return NextResponse.json(
      {
        id: group.id,
        name: group.name,
        type: group.type,
        color: group.color,
        icon: group.icon,
        order: group.order,
        categories: group.members.map((m) => m.categoryName),
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ya existe un grupo con ese nombre" },
        { status: 409 }
      );
    }
    console.error("Create category group error:", error);
    return NextResponse.json({ error: "Error al crear grupo" }, { status: 500 });
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
      body = await validateBody(req, categoryGroupUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const { id, name, color, icon, categories } = body;

    const existing = await db.categoryGroup.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    }

    // Si vienen categorías, se reemplaza el conjunto completo: es lo que el
    // usuario ve en la UI y evita estados intermedios raros.
    if (categories !== undefined) {
      await db.categoryGroupMember.deleteMany({ where: { groupId: id } });
    }

    const group = await db.categoryGroup.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(color !== undefined ? { color: color || null } : {}),
        ...(icon !== undefined ? { icon: icon || null } : {}),
        ...(categories !== undefined
          ? {
              members: {
                create: categories.map((categoryName: string) => ({
                  categoryName: categoryName.trim(),
                })),
              },
            }
          : {}),
      },
      include: { members: { orderBy: { categoryName: "asc" } } },
    });

    return NextResponse.json({
      id: group.id,
      name: group.name,
      type: group.type,
      color: group.color,
      icon: group.icon,
      order: group.order,
      categories: group.members.map((m) => m.categoryName),
    });
  } catch (error) {
    console.error("Update category group error:", error);
    return NextResponse.json({ error: "Error al actualizar grupo" }, { status: 500 });
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
      body = await validateBody(req, categoryGroupDeleteSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const existing = await db.categoryGroup.findFirst({
      where: { id: body.id, userId: session.user.id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
    }

    await db.categoryGroup.delete({ where: { id: body.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete category group error:", error);
    return NextResponse.json({ error: "Error al eliminar grupo" }, { status: 500 });
  }
}
