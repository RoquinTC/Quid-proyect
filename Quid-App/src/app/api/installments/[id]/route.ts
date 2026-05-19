import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, installmentUpdateSchema } from "@/lib/validations";

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
    let body;
    try {
      body = await validateBody(req, installmentUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    // Find the installment and verify ownership through the debt
    const existing = await db.installment.findFirst({
      where: { id },
      include: { debt: true },
    });

    if (!existing || existing.debt.userId !== session.user.id) {
      return NextResponse.json({ error: "Cuota no encontrada" }, { status: 404 });
    }

    if (existing.isPaid) {
      return NextResponse.json({ error: "No se puede editar una cuota ya pagada" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};

    // Always editable fields (don't affect financial calculations)
    if (body.description !== undefined) updateData.description = body.description;
    if (body.accountId !== undefined) updateData.accountId = body.accountId || null;
    if (body.subAccountId !== undefined) updateData.subAccountId = body.subAccountId || null;
    if (body.category !== undefined) updateData.category = body.category || null;
    if (body.subCategory !== undefined) updateData.subCategory = body.subCategory || null;
    if (body.purchaseDate !== undefined) updateData.purchaseDate = new Date(body.purchaseDate);

    // Financial fields: only editable if no payments have been made (paidAmount === 0)
    if (toNumber(existing.paidAmount) === 0) {
      if (body.totalAmount !== undefined) {
        const newTotal = typeof body.totalAmount === "string" ? parseFloat(body.totalAmount) : body.totalAmount;
        if (isNaN(newTotal) || newTotal <= 0) {
          return NextResponse.json({ error: "Monto total inválido" }, { status: 400 });
        }
        updateData.totalAmount = newTotal;

        // Recalculate installmentAmount if totalInstallments is also changing
        const newTotalInstallments = body.totalInstallments
          ? (typeof body.totalInstallments === "string" ? parseInt(body.totalInstallments) : body.totalInstallments)
          : existing.totalInstallments;
        updateData.installmentAmount = newTotal / newTotalInstallments;
      }

      if (body.totalInstallments !== undefined) {
        const newTotalInstallments = typeof body.totalInstallments === "string" ? parseInt(body.totalInstallments) : body.totalInstallments;
        if (isNaN(newTotalInstallments) || newTotalInstallments < 1) {
          return NextResponse.json({ error: "Número de cuotas inválido" }, { status: 400 });
        }
        updateData.totalInstallments = newTotalInstallments;

        // Recalculate installmentAmount
        const newTotal = body.totalAmount
          ? (typeof body.totalAmount === "string" ? parseFloat(body.totalAmount) : body.totalAmount)
          : toNumber(existing.totalAmount);
        updateData.installmentAmount = newTotal / newTotalInstallments;
      }
    } else if (body.totalAmount !== undefined || body.totalInstallments !== undefined) {
      // Attempting to change financial fields when already paid
      return NextResponse.json(
        { error: "No se puede modificar el monto ni el número de cuotas de una compra que ya tiene pagos" },
        { status: 400 }
      );
    }

    // If totalAmount changed, update the debt balance (diff)
    if (updateData.totalAmount !== undefined && toNumber(existing.paidAmount) === 0) {
      const diff = (updateData.totalAmount as number) - toNumber(existing.totalAmount);
      if (diff !== 0) {
        await db.debt.update({
          where: { id: existing.debtId },
          data: { currentBalance: { increment: diff } },
        });
      }
    }

    const updated = await db.installment.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Update installment error:", error);
    return NextResponse.json({ error: "Error al actualizar cuota" }, { status: 500 });
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

    // Find the installment and verify ownership through the debt
    const existing = await db.installment.findFirst({
      where: { id },
      include: { debt: true },
    });

    if (!existing || existing.debt.userId !== session.user.id) {
      return NextResponse.json({ error: "Cuota no encontrada" }, { status: 404 });
    }

    if (existing.isPaid) {
      return NextResponse.json({ error: "No se puede eliminar una cuota ya pagada" }, { status: 400 });
    }

    // Calculate the remaining balance to reverse from the debt
    // remainingAmount = totalAmount - paidAmount
    const remainingAmount = toNumber(existing.totalAmount) - toNumber(existing.paidAmount);

    // Delete the installment
    await db.installment.delete({ where: { id } });

    // Reverse the remaining balance from the debt
    if (remainingAmount > 0) {
      await db.debt.update({
        where: { id: existing.debtId },
        data: { currentBalance: { increment: -remainingAmount } },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete installment error:", error);
    return NextResponse.json({ error: "Error al eliminar cuota" }, { status: 500 });
  }
}
