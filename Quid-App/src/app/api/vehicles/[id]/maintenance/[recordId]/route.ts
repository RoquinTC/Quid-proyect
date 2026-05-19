import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, maintenanceUpdateSchema } from "@/lib/validations";
import { reverseFinanceEntry } from "@/lib/transport-finance";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, recordId } = await params;
    const body = await validateBody(req, maintenanceUpdateSchema);

    const vehicle = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    const existing = await db.maintenanceRecord.findFirst({
      where: { id: recordId, vehicleId: id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    const { type, description, cost, km, date, nextDueKm, nextDueDate, reminderEnabled } = body;

    const record = await db.maintenanceRecord.update({
      where: { id: recordId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        ...(type !== undefined && { type }),
        ...(description !== undefined && { description }),
        ...(cost !== undefined && { cost: Number(cost) }),
        ...(km !== undefined && { km: Number(km) }),
        ...(date !== undefined && { date: date ? createColombiaDate(date.split("T")[0]) : null }),
        ...(nextDueKm !== undefined && { nextDueKm: nextDueKm ? Number(nextDueKm) : null }),
        ...(nextDueDate !== undefined && { nextDueDate: nextDueDate ? createColombiaDate(nextDueDate.split("T")[0]) : null }),
        ...(reminderEnabled !== undefined && { reminderEnabled }),
      } as any,
    });

    // Update the linked finance transaction if cost changed
    if (cost !== undefined) {
      await db.transaction.updateMany({
        where: { sourceModule: "transport", sourceId: recordId },
        data: {
          amount: cost,
          ...(description !== undefined && { description: `Mantenimiento - ${vehicle.name}: ${description}` }),
        },
      });
    }

    return NextResponse.json(record);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update maintenance record error:", error);
    return NextResponse.json({ error: "Error al actualizar registro de mantenimiento" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, recordId } = await params;

    const vehicle = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    const existing = await db.maintenanceRecord.findFirst({
      where: { id: recordId, vehicleId: id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }

    // ── Capture finance data before deletion ──
    const maintFinance = await db.maintenanceRecord.findFirst({
      where: { id: recordId },
      select: { debtId: true, cost: true, accountId: true },
    });

    // ── Step 1: Reverse account-based finance entry ──
    // This restores account balance, budget spent, and deletes the transaction
    await reverseFinanceEntry(recordId, session.user.id);

    // ── Step 2: Reverse CC installment if applicable ──
    if (maintFinance?.debtId) {
      const installments = await db.installment.findMany({
        where: {
          debtId: maintFinance.debtId,
          isPaid: false,
        },
      });

      const recordCost = Number(maintFinance.cost);
      for (const inst of installments) {
        if (Number(inst.totalAmount) === recordCost) {
          await db.debt.update({
            where: { id: inst.debtId },
            data: { currentBalance: { decrement: inst.totalAmount } },
          });
          await db.installment.delete({ where: { id: inst.id } });
          break;
        }
      }
    }

    // ── Step 3: Delete the maintenance record itself (cascades items) ──
    await db.maintenanceRecord.delete({ where: { id: recordId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete maintenance record error:", error);
    return NextResponse.json({ error: "Error al eliminar registro de mantenimiento" }, { status: 500 });
  }
}
