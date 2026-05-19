import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, shoppingListCreateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const lists = await db.shoppingList.findMany({
      where: { userId: session.user.id },
      include: {
        items: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(lists);
  } catch (error) {
    console.error("Get shopping lists error:", error);
    return NextResponse.json({ error: "Error al obtener listas de compras" }, { status: 500 });
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
      body = await validateBody(req, shoppingListCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { name, profileId } = body;

    const list = await db.shoppingList.create({
      data: {
        userId: session.user.id,
        name: name || "Lista de Mercado",
        status: "draft",
        profileId: profileId || null,
      },
      include: { items: true },
    });

    return NextResponse.json(list, { status: 201 });
  } catch (error) {
    console.error("Create shopping list error:", error);
    return NextResponse.json({ error: "Error al crear lista de compras" }, { status: 500 });
  }
}
