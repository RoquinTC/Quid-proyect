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

function maintenanceReminderTitle(type: string) {
  const config = MAINTENANCE_TYPES.find((item) => item.value === type);
  return config?.label || "Mantenimiento";
}

async function syncMaintenanceReminder({
  userId,
  vehicleId,
  vehicleName,
  itemNames,
  description,
  recordKm,
  recordDate,
  enabled,
}: {
  userId: string;
  vehicleId: string;
  vehicleName: string;
  itemNames: string[];
  description: string;
  recordKm: number;
  recordDate: Date;
  enabled: boolean;
}) {
  if (!enabled || itemNames.length === 0) return;

  for (const itemName of itemNames) {
    // Find existing active reminder to carry over custom intervals
    const existingReminder = await db.vehicleReminder.findFirst({
      where: {
        userId,
        vehicleId,
        category: "maintenance",
        title: itemName,
        isActive: true,
      },
    });

    if (existingReminder) {
      await db.vehicleReminder.update({
        where: { id: existingReminder.id },
        data: {
          isActive: false,
          completedAt: new Date(),
          completedKm: recordKm,
        },
      });
    }

    // Determine intervals. Preference: existing reminder -> catalog defaults -> 0
    let intervalKm = existingReminder?.repeatIntervalKm || 0;
    let intervalDays = existingReminder?.repeatIntervalDays || 0;

    if (!intervalKm && !intervalDays) {
      const typeConfig = MAINTENANCE_TYPES.find(t => t.label.toLowerCase() === itemName.toLowerCase() || t.value === itemName);
      if (typeConfig) {
        intervalKm = typeConfig.nextKmInterval;
        intervalDays = typeConfig.nextMonthInterval * 30; // Approximation for defaults
      }
    }

    if (!intervalKm && !intervalDays) continue; // No rule to generate next reminder for this specific item

    let nextDueKm = intervalKm > 0 ? recordKm + intervalKm : null;
    let nextDueDate: Date | null = null;
    
    if (intervalDays > 0) {
      nextDueDate = new Date(recordDate);
      nextDueDate.setDate(nextDueDate.getDate() + intervalDays);
    }

    await db.vehicleReminder.create({
      data: {
        userId,
        vehicleId,
        title: itemName,
        description: description || `Próximo: ${itemName} de ${vehicleName}`,
        category: "maintenance",
        triggerMode: nextDueKm && nextDueDate ? "hybrid" : nextDueKm ? "km" : "date",
        dueKm: nextDueKm,
        dueDate: nextDueDate,
        warningKm: intervalKm ? Math.min(500, Math.max(100, Math.round(intervalKm * 0.2))) : 500,
        warningDays: 15,
        repeatIntervalKm: intervalKm > 0 ? intervalKm : null,
        repeatIntervalDays: intervalDays > 0 ? intervalDays : null,
        isActive: true,
      },
    });
  }
}

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
      type, description, cost, km, date, repeatIntervalKm, nextDueKm, nextDueDate, reminderEnabled,
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

    // Calculate next due info for the record itself (if we want to store it on the record)
    let finalNextDueKm: number | null = null;
    let finalNextDueDate: Date | null = null;

    const existingReminder = await db.vehicleReminder.findFirst({
      where: { userId: session.user.id, vehicleId: id, category: "maintenance", title: maintenanceReminderTitle(maintenanceType), isActive: true },
    });

    let intervalKm = existingReminder?.repeatIntervalKm || 0;
    let intervalDays = existingReminder?.repeatIntervalDays || 0;

    if (!intervalKm && !intervalDays) {
      const typeConfig = MAINTENANCE_TYPES.find(t => t.value === maintenanceType);
      if (typeConfig) {
        intervalKm = typeConfig.nextKmInterval;
        intervalDays = typeConfig.nextMonthInterval * 30;
      }
    }

    if (intervalKm > 0) finalNextDueKm = recordKm + intervalKm;
    if (intervalDays > 0) {
      finalNextDueDate = new Date(recordDate);
      finalNextDueDate.setDate(finalNextDueDate.getDate() + intervalDays);
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

    const itemNamesToSync = items && items.length > 0 
      ? items.map((i: any) => i.name) 
      : [maintenanceReminderTitle(maintenanceType)];

    await syncMaintenanceReminder({
      userId: session.user.id,
      vehicleId: id,
      vehicleName: vehicle.name,
      itemNames: itemNamesToSync,
      description,
      recordKm,
      recordDate,
      enabled: true, // Auto-enable reminders based on the new logic
    });

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
