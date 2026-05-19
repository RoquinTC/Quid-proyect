import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, subAccountUpdateSchema } from "@/lib/validations";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, subId } = await params;
    const body = await validateBody(req, subAccountUpdateSchema);

    // Verify account belongs to user
    const account = await db.account.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    // Verify sub-account belongs to this account
    const existing = await db.subAccount.findFirst({
      where: { id: subId, accountId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sub-cuenta no encontrada" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.isHighYield !== undefined) updateData.isHighYield = body.isHighYield;
    if (body.yieldPercentage !== undefined) updateData.yieldPercentage = body.yieldPercentage;
    if (body.excludeFromAvailable !== undefined) updateData.excludeFromAvailable = body.excludeFromAvailable;
    if (body.order !== undefined) updateData.order = body.order;

    // Balance adjustment - allows correcting the balance
    if (body.balance !== undefined) {
      const newBalance = typeof body.balance === "string" ? parseFloat(body.balance) : body.balance;
      if (!isNaN(newBalance)) {
        updateData.balance = newBalance;
      }
    }

    const subAccount = await db.subAccount.update({
      where: { id: subId },
      data: updateData,
    });

    return NextResponse.json(subAccount);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update sub-account error:", error);
    return NextResponse.json({ error: "Error al actualizar sub-cuenta" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; subId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, subId } = await params;

    // Verify account belongs to user
    const account = await db.account.findFirst({
      where: { id, userId: session.user.id },
    });
    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 404 });
    }

    // Verify sub-account belongs to this account
    const existing = await db.subAccount.findFirst({
      where: { id: subId, accountId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Sub-cuenta no encontrada" }, { status: 404 });
    }

    // Delete all transactions linked to this sub-account first
    await db.transaction.deleteMany({
      where: { subAccountId: subId },
    });

    await db.subAccount.delete({
      where: { id: subId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete sub-account error:", error);
    return NextResponse.json({ error: "Error al eliminar sub-cuenta" }, { status: 500 });
  }
}
