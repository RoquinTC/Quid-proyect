import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, recurringUpdateSchema } from "@/lib/validations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const recurringPayment = await db.recurringPayment.findFirst({
      where: { id, userId: session.user.id },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
          },
        },
        subAccount: {
          select: {
            id: true,
            name: true,
          },
        },
        debt: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            currentBalance: true,
          },
        },
        destinationAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
          },
        },
      },
    });

    if (!recurringPayment) {
      return NextResponse.json(
        { error: "Pago recurrente no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(recurringPayment);
  } catch (error) {
    console.error("Get recurring payment error:", error);
    return NextResponse.json(
      { error: "Error al obtener pago recurrente" },
      { status: 500 }
    );
  }
}

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
      body = await validateBody(req, recurringUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const scope = body.scope || "single"; // "single" or "series"

    const existing = await db.recurringPayment.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Pago recurrente no encontrado" },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.description !== undefined) updateData.description = body.description;
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.actualAmount !== undefined) updateData.actualAmount = body.actualAmount;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.accountId !== undefined) updateData.accountId = body.accountId || null;
    if (body.subAccountId !== undefined) updateData.subAccountId = body.subAccountId || null;
    if (body.debtId !== undefined) updateData.debtId = body.debtId || null;
    if (body.destinationAccountId !== undefined) updateData.destinationAccountId = body.destinationAccountId || null;
    if (body.destinationSubAccountId !== undefined) updateData.destinationSubAccountId = body.destinationSubAccountId || null;
    if (body.category !== undefined) updateData.category = body.category || null;
    if (body.subCategory !== undefined) updateData.subCategory = body.subCategory || null;
    if (body.scheduledDate !== undefined) updateData.scheduledDate = new Date(body.scheduledDate);
    if (body.confirmedDate !== undefined) updateData.confirmedDate = body.confirmedDate ? new Date(body.confirmedDate) : null;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.frequency !== undefined) updateData.frequency = body.frequency;
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.isRecurring !== undefined) updateData.isRecurring = body.isRecurring;

    // Update this payment
    const recurringPayment = await db.recurringPayment.update({
      where: { id },
      data: updateData,
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
          },
        },
        subAccount: {
          select: {
            id: true,
            name: true,
          },
        },
        debt: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            currentBalance: true,
          },
        },
        destinationAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
          },
        },
      },
    });

    // If scope is "series", apply the same changes to all future pending payments
    // in the same payroll group or with the same recurring pattern
    if (scope === "series" && existing.status === "pending") {
      const seriesUpdateData: Record<string, unknown> = {};
      // Only carry over fields that make sense for a series update
      if (body.description !== undefined) seriesUpdateData.description = body.description;
      if (body.amount !== undefined) seriesUpdateData.amount = body.amount;
      if (body.accountId !== undefined) seriesUpdateData.accountId = body.accountId || null;
      if (body.subAccountId !== undefined) seriesUpdateData.subAccountId = body.subAccountId || null;
      if (body.category !== undefined) seriesUpdateData.category = body.category || null;
      if (body.subCategory !== undefined) seriesUpdateData.subCategory = body.subCategory || null;

      if (Object.keys(seriesUpdateData).length > 0) {
        // If this payment belongs to a payroll group, update all future pending in the group
        if (existing.payrollGroupId) {
          await db.recurringPayment.updateMany({
            where: {
              payrollGroupId: existing.payrollGroupId,
              status: "pending",
              id: { not: id }, // Don't update the one we already updated
              scheduledDate: { gte: existing.scheduledDate },
            },
            data: seriesUpdateData,
          });
        } else {
          // For non-payroll recurring payments, update by matching pattern
          await db.recurringPayment.updateMany({
            where: {
              userId: session.user.id,
              description: existing.description,
              type: existing.type,
              frequency: existing.frequency,
              status: "pending",
              id: { not: id },
              scheduledDate: { gte: existing.scheduledDate },
            },
            data: seriesUpdateData,
          });
        }
      }
    }

    return NextResponse.json(recurringPayment);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update recurring payment error:", error);
    return NextResponse.json(
      { error: "Error al actualizar pago recurrente" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    // Parse scope from URL search params: ?scope=single or ?scope=series
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") || "single";

    const existing = await db.recurringPayment.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Pago recurrente no encontrado" },
        { status: 404 }
      );
    }

    // Delete this payment
    await db.recurringPayment.delete({ where: { id } });

    // If scope is "series", also delete all future pending payments in the same group
    let deletedCount = 1;
    if (scope === "series" && existing.status === "pending") {
      let whereClause: Record<string, unknown>;

      if (existing.payrollGroupId) {
        // Delete all future pending payments in the same payroll group
        whereClause = {
          payrollGroupId: existing.payrollGroupId,
          status: "pending",
          scheduledDate: { gte: existing.scheduledDate },
        };
      } else {
        // For non-payroll recurring payments, delete by matching pattern
        whereClause = {
          userId: session.user.id,
          description: existing.description,
          type: existing.type,
          frequency: existing.frequency,
          status: "pending",
          scheduledDate: { gte: existing.scheduledDate },
        };
      }

      const result = await db.recurringPayment.deleteMany({
        where: whereClause as any,
      });
      deletedCount += result.count;
    }

    return NextResponse.json({ success: true, deletedCount });
  } catch (error) {
    console.error("Delete recurring payment error:", error);
    return NextResponse.json(
      { error: "Error al eliminar pago recurrente" },
      { status: 500 }
    );
  }
}
