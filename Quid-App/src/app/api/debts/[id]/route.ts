import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, debtUpdateSchema } from "@/lib/validations";

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
    const body = await validateBody(req, debtUpdateSchema);

    const existing = await db.debt.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.type !== undefined) updateData.type = body.type;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.color !== undefined) updateData.color = body.color;
    if (body.icon !== undefined) updateData.icon = body.icon;
    if (body.bank !== undefined) updateData.bank = body.bank;
    if (body.totalAmount !== undefined) updateData.totalAmount = body.totalAmount;
    if (body.currentBalance !== undefined) updateData.currentBalance = body.currentBalance;
    if (body.interestRate !== undefined) updateData.interestRate = body.interestRate;
    if (body.cutoffDate !== undefined) updateData.cutoffDate = body.cutoffDate;
    if (body.paymentDate !== undefined) updateData.paymentDate = body.paymentDate;
    if (body.monthlyPayment !== undefined) updateData.monthlyPayment = body.monthlyPayment;
    if (body.remainingPayments !== undefined) updateData.remainingPayments = body.remainingPayments;
    if (body.startDate !== undefined) updateData.startDate = body.startDate ? createColombiaDate(body.startDate.split("T")[0]) : null;
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? createColombiaDate(body.endDate.split("T")[0]) : null;
    if (body.paymentType !== undefined) updateData.paymentType = body.paymentType || null;
    if (body.otherCharges !== undefined) updateData.otherCharges = body.otherCharges || null;
    if (body.category !== undefined) updateData.category = body.category || null;
    if (body.subCategory !== undefined) updateData.subCategory = body.subCategory || null;
    if (body.accountId !== undefined) updateData.accountId = body.accountId || null;
    if (body.subAccountId !== undefined) updateData.subAccountId = body.subAccountId || null;

    const debt = await db.debt.update({
      where: { id },
      data: updateData,
      include: { installments: true },
    });

    return NextResponse.json(debt);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update debt error:", error);
    return NextResponse.json({ error: "Error al actualizar deuda" }, { status: 500 });
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

    const existing = await db.debt.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Deuda no encontrada" }, { status: 404 });
    }

    await db.debt.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete debt error:", error);
    return NextResponse.json({ error: "Error al eliminar deuda" }, { status: 500 });
  }
}
