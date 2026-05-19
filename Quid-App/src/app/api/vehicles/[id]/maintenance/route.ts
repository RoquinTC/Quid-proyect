import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate, getColombiaNow } from "@/lib/api";
import { validateBody, maintenanceCreateSchema } from "@/lib/validations";
import {
  createFinanceEntry,
  getTransportDescription,
  getTransportSubCategory,
} from "@/lib/transport-finance";
import { MAINTENANCE_TYPES } from "@/lib/types/transport";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const vehicle = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    const maintenanceRecords = await db.maintenanceRecord.findMany({
      where: { vehicleId: id },
      orderBy: { date: "desc" },
      include: { items: true },
    });

    return NextResponse.json(maintenanceRecords);
  } catch (error) {
    console.error("Get maintenance records error:", error);
    return NextResponse.json({ error: "Error al obtener registros de mantenimiento" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, maintenanceCreateSchema);
    const {
      type, description, cost, km, date, nextDueKm, nextDueDate, reminderEnabled,
      items, paymentType, accountId, subAccountId, debtId, installmentCount,
    } = body;

    const vehicle = await db.vehicle.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!vehicle) {
      return NextResponse.json({ error: "Vehículo no encontrado" }, { status: 404 });
    }

    const recordDate = date ? createColombiaDate(date.split("T")[0]) : getColombiaNow();
    const recordKm = km ?? vehicle.currentKm;
    const maintenanceType = type || "general";

    // Auto-suggest nextDueKm if not provided and type has a known interval
    let finalNextDueKm = nextDueKm ?? null;
    let finalNextDueDate = nextDueDate ? createColombiaDate(nextDueDate.split("T")[0]) : null;

    if (!finalNextDueKm && !finalNextDueDate && reminderEnabled) {
      const typeConfig = MAINTENANCE_TYPES.find(t => t.value === maintenanceType);
      if (typeConfig && typeConfig.nextKmInterval > 0) {
        finalNextDueKm = recordKm + typeConfig.nextKmInterval;
      }
      if (typeConfig && typeConfig.nextMonthInterval > 0) {
        const dueDate = new Date(recordDate);
        dueDate.setMonth(dueDate.getMonth() + typeConfig.nextMonthInterval);
        finalNextDueDate = dueDate;
      }
    }

    // Create maintenance record with finance integration fields
    const maintenanceRecord = await db.maintenanceRecord.create({
      data: {
        vehicleId: id,
        type: maintenanceType,
        description,
        cost,
        km: recordKm,
        date: recordDate,
        nextDueKm: finalNextDueKm,
        nextDueDate: finalNextDueDate,
        reminderEnabled: reminderEnabled ?? true,
        accountId: accountId || null,
        subAccountId: subAccountId || null,
        debtId: debtId || null,
        installmentCount: installmentCount || null,
      },
    });

    // Create itemized maintenance items if provided
    if (items && items.length > 0) {
      await db.maintenanceItem.createMany({
        data: items.map(item => ({
          maintenanceRecordId: maintenanceRecord.id,
          name: item.name,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice || (item.quantity * item.unitPrice),
          notes: item.notes || null,
        })),
      });
    }

    // Update vehicle currentKm if provided km is greater
    if (km && km > vehicle.currentKm) {
      await db.vehicle.update({
        where: { id },
        data: { currentKm: km },
      });
    }

    // Update any existing reminder for this vehicle+type
    // If there's a previous maintenance record with the same type and reminder enabled,
    // the new record's nextDueKm/nextDueDate is already set correctly.
    // No additional action needed — the new record IS the updated reminder.

    // Create finance entry with full integration
    const subCategory = getTransportSubCategory("maintenance", maintenanceType);
    const financeResult = await createFinanceEntry({
      userId: session.user.id,
      amount: cost,
      description: getTransportDescription("maintenance", vehicle.name, vehicle.type),
      category: "Transporte",
      subCategory,
      date: recordDate,
      sourceModule: "transport",
      sourceId: maintenanceRecord.id,
      paymentType: paymentType || "account",
      accountId,
      subAccountId,
      debtId,
      installmentCount,
      notes: items && items.length > 0
        ? `Items: ${items.map(i => i.name).join(", ")}`
        : description,
      vehicleName: vehicle.name,
    });

    // Return with items included
    const result = await db.maintenanceRecord.findUnique({
      where: { id: maintenanceRecord.id },
      include: { items: true },
    });

    return NextResponse.json({
      ...result,
      _finance: financeResult,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create maintenance record error:", error);
    return NextResponse.json({ error: "Error al crear registro de mantenimiento" }, { status: 500 });
  }
}
