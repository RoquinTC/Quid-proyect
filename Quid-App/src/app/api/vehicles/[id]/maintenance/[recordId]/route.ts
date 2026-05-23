import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { validateBody, maintenanceUpdateSchema } from "@/lib/validations";
import { reverseFinanceEntry } from "@/lib/transport-finance";
import { MAINTENANCE_TYPES } from "@/lib/types/transport";

function maintenanceReminderTitle(type: string) {
  const config = MAINTENANCE_TYPES.find((item) => item.value === type);
  return config?.label || "Mantenimiento";
}

async function syncMaintenanceReminder({
  userId,
  vehicleId,
  vehicleName,
  type,
  description,
  dueKm,
  dueDate,
  repeatIntervalKm,
  enabled,
}: {
  userId: string;
  vehicleId: string;
  vehicleName: string;
  type: string;
  description: string;
  dueKm: number | null;
  dueDate: Date | null;
  repeatIntervalKm: number | null;
  enabled: boolean;
}) {
  const title = maintenanceReminderTitle(type);

  await db.vehicleReminder.updateMany({
    where: { userId, vehicleId, category: "maintenance", title, isActive: true },
    data: { isActive: false, completedAt: new Date() },
  });

  if (!enabled || (!dueKm && !dueDate)) return;

  await db.vehicleReminder.create({
    data: {
      userId,
      vehicleId,
      title,
      description: description || `Próximo mantenimiento de ${vehicleName}`,
      category: "maintenance",
      triggerMode: dueKm && dueDate ? "hybrid" : dueKm ? "km" : "date",
      dueKm,
      dueDate,
      warningKm: repeatIntervalKm ? Math.min(500, Math.max(100, Math.round(repeatIntervalKm * 0.2))) : 500,
      warningDays: 15,
      repeatIntervalKm,
      isActive: true,
    },
  });
}

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

    const { type, description, cost, km, date, repeatIntervalKm, nextDueKm, nextDueDate, reminderEnabled } = body;
    const finalKm = km !== undefined ? Number(km) : existing.km;
    const finalType = type ?? existing.type;
    const finalDescription = description ?? existing.description;
    const finalRepeatIntervalKm = repeatIntervalKm ?? (
      nextDueKm && nextDueKm > finalKm ? Number(nextDueKm) - finalKm : null
    );
    const computedNextDueKm = nextDueKm !== undefined
      ? (nextDueKm ? Number(nextDueKm) : null)
      : finalRepeatIntervalKm
      ? finalKm + finalRepeatIntervalKm
      : existing.nextDueKm;
    const computedNextDueDate = nextDueDate !== undefined
      ? (nextDueDate ? createColombiaDate(nextDueDate.split("T")[0]) : null)
      : existing.nextDueDate;
    const updateData: Parameters<typeof db.maintenanceRecord.update>[0]["data"] = {
      ...(type !== undefined && { type: finalType }),
      ...(description !== undefined && { description: finalDescription }),
      ...(cost !== undefined && { cost: Number(cost) }),
      ...(km !== undefined && { km: finalKm }),
      ...(date != null && { date: createColombiaDate(date.split("T")[0]) }),
      ...((nextDueKm !== undefined || repeatIntervalKm !== undefined) && { nextDueKm: computedNextDueKm }),
      ...(nextDueDate !== undefined && { nextDueDate: computedNextDueDate }),
      ...(reminderEnabled !== undefined && { reminderEnabled }),
    };

    const record = await db.maintenanceRecord.update({
      where: { id: recordId },
      data: updateData,
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

    if (
      type !== undefined ||
      description !== undefined ||
      km !== undefined ||
      nextDueKm !== undefined ||
      nextDueDate !== undefined ||
      repeatIntervalKm !== undefined ||
      reminderEnabled !== undefined
    ) {
      await syncMaintenanceReminder({
        userId: session.user.id,
        vehicleId: id,
        vehicleName: vehicle.name,
        type: finalType,
        description: finalDescription,
        dueKm: computedNextDueKm ?? null,
        dueDate: computedNextDueDate ?? null,
        repeatIntervalKm: finalRepeatIntervalKm,
        enabled: reminderEnabled ?? record.reminderEnabled,
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
