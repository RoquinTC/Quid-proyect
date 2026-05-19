import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow, getColombiaTodayString, createColombiaDate } from "@/lib/api";
import { toNumber } from "@/lib/decimal-serializer";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const list = await db.shoppingList.findFirst({
      where: { id, userId: session.user.id },
      include: { items: true },
    });

    if (!list) {
      return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
    }

    if (list.status === "completed") {
      return NextResponse.json({ error: "La lista ya está completada" }, { status: 400 });
    }

    // Calculate total amount
    const totalAmount = list.items.reduce((sum, item) => {
      const price = toNumber(item.actualPrice ?? item.estimatedPrice ?? 0);
      return sum + price * toNumber(item.quantity);
    }, 0);

    // Update pantry items - add purchased quantities
    for (const item of list.items) {
      if (item.isPurchased && item.pantryItemId) {
        const pantryItem = await db.pantryItem.findUnique({
          where: { id: item.pantryItemId },
        });
        if (pantryItem) {
          await db.pantryItem.update({
            where: { id: item.pantryItemId },
            data: { quantity: { increment: item.quantity } },
          });
        }
      }
    }

    // Create expense transaction in finance module
    await db.transaction.create({
      data: {
        userId: session.user.id,
        type: "expense",
        amount: totalAmount,
        description: `Compra de mercado - ${list.name}`,
        category: "Alimentación",
        sourceModule: "pantry",
        sourceId: list.id,
        date: createColombiaDate(getColombiaTodayString()),
        accountId: null,
        subAccountId: null,
      },
    });

    // Update list status to completed
    const updatedList = await db.shoppingList.update({
      where: { id },
      data: { status: "completed" },
      include: { items: true },
    });

    return NextResponse.json(updatedList);
  } catch (error) {
    console.error("Confirm shopping list error:", error);
    return NextResponse.json({ error: "Error al confirmar lista de compras" }, { status: 500 });
  }
}
