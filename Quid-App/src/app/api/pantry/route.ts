import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, pantryCreateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const items = await db.pantryItem.findMany({
      where: { userId: session.user.id },
      orderBy: { name: "asc" },
    });

    // Identify low stock items
    const lowStockItems = items.filter(
      (item) => item.minStock && item.quantity < item.minStock
    );

    return NextResponse.json({ items, lowStockItems });
  } catch (error) {
    console.error("Get pantry items error:", error);
    return NextResponse.json({ error: "Error al obtener items de despensa" }, { status: 500 });
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
      body = await validateBody(req, pantryCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const { name, category, quantity, unit, expirationDate, purchaseDate, purchasePrice, minStock } = body;

    if (!name) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const item = await db.pantryItem.create({
      data: {
        userId: session.user.id,
        name,
        category: category || "other",
        quantity: quantity || 0,
        unit: unit || "unit",
        expirationDate: expirationDate ? createColombiaDate(expirationDate.split("T")[0]) : null,
        purchaseDate: purchaseDate ? createColombiaDate(purchaseDate.split("T")[0]) : null,
        purchasePrice: purchasePrice || null,
        minStock: minStock || null,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error("Create pantry item error:", error);
    return NextResponse.json({ error: "Error al crear item de despensa" }, { status: 500 });
  }
}
