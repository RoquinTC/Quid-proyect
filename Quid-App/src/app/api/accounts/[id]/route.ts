import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, accountUpdateSchema } from "@/lib/validations";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, accountUpdateSchema);

    const existing = await db.account.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.isHighYield !== undefined) updateData.isHighYield = body.isHighYield;
    if (body.yieldPercentage !== undefined) updateData.yieldPercentage = body.yieldPercentage;
    if (body.isShared !== undefined) updateData.isShared = body.isShared;
    if (body.excludeFromAvailable !== undefined) updateData.excludeFromAvailable = body.excludeFromAvailable;
    if (body.order !== undefined) updateData.order = body.order;

    // Balance adjustment - allows correcting the balance directly
    if (body.balance !== undefined) {
      const newBalance = typeof body.balance === "string" ? parseFloat(body.balance) : body.balance;
      if (!isNaN(newBalance)) {
        updateData.balance = newBalance;
      }
    }

    const account = await db.account.update({
      where: { id },
      data: updateData,
      include: {
        subAccounts: true,
        sharedUsers: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    });

    return NextResponse.json(account);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update account error:", error);
    return NextResponse.json({ error: "Error al actualizar cuenta" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.account.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    await db.account.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json({ error: "Error al eliminar cuenta" }, { status: 500 });
  }
}
