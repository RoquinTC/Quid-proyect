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
import {
  normalizeMaintenanceTypeKey,
  resolveMaintenanceDisplayName,
  resolveMaintenanceRule,
} from "@/lib/transport-maintenance-rules";

/**
 * Store a rule row for every custom service name used in this record.
 *
 * The edit path titles reminders from the rules table, because it never sees the
 * item list. Without this row a custom service would be titled "Mantenimiento" on
 * edit while the record carried its real name — and since reminders are
 * deactivated by title, that mismatch orphans the reminder instead of replacing
 * it. Persisting here is what keeps both paths in agreement, and it also makes
 * the custom service reusable from the intervals dialog.
 */
async function persistCustomServiceRules(
  userId: string,
  items: Array<{
    name: string;
    scheduleReminder?: boolean;
    reminderIntervalKm?: number | null;
    reminderIntervalDays?: number | null;
    reminderWarningKm?: number | null;
  }>
) {
  const builtIn = new Set([
    ...MAINTENANCE_TYPES.map((type) => type.value),
    ...MAINTENANCE_TYPES.map((type) => normalizeMaintenanceTypeKey(type.label)),
  ]);

  for (const item of items) {
    const typeKey = normalizeMaintenanceTypeKey(item.name);
    if (!typeKey || builtIn.has(typeKey)) continue;

    await db.maintenanceServiceRule.upsert({
      where: { userId_typeKey: { userId, typeKey } },
      create: {
        userId,
        typeKey,
        name: item.name.trim(),
        intervalKm: item.reminderIntervalKm ?? null,
        // Rules are stored in months; the form collects days.
        intervalMonths: item.reminderIntervalDays ? Math.round(item.reminderIntervalDays / 30) : null,
        warningKm: item.reminderWarningKm ?? 500,
        isActive: item.scheduleReminder === true,
      },
      // Never overwrite what the user configured in the intervals dialog.
      update: {},
    });
  }
}

async function syncMaintenanceReminder({
  userId,
  vehicleId,
  vehicleName,
  items,
  description,
  recordKm,
  recordDate,
  enabled,
}: {
  userId: string;
  vehicleId: string;
  vehicleName: string;
  items: Array<{
    name: string;
    typeKey?: string | null;
    scheduleReminder?: boolean;
    reminderIntervalKm?: number | null;
    reminderIntervalDays?: number | null;
    reminderWarningKm?: number | null;
  }>;
  description: string;
  recordKm: number;
  recordDate: Date;
  enabled: boolean;
}) {
  if (!enabled || items.length === 0) return;

  const userRules = await db.maintenanceServiceRule.findMany({
    where: { userId },
  });

  for (const item of items) {
    if (item.scheduleReminder === false) continue;

    const itemName = item.name;
    const typeKey = item.typeKey || item.name;
    const resolvedRule = resolveMaintenanceRule({ name: itemName, typeKey }, userRules);
    if (!resolvedRule.isActive) continue;

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

    // User service rules are the source of truth. Existing reminders can still
    // carry a custom interval when the user edited only that reminder.
    const intervalKm =
      item.reminderIntervalKm ??
      existingReminder?.repeatIntervalKm ??
      resolvedRule.intervalKm ??
      0;
    const intervalDays =
      item.reminderIntervalDays ??
      existingReminder?.repeatIntervalDays ??
      resolvedRule.intervalDays ??
      0;

    if (!intervalKm && !intervalDays) continue; // No rule to generate next reminder for this specific item

    const nextDueKm = intervalKm > 0 ? recordKm + intervalKm : null;
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
        warningKm: intervalKm ? item.reminderWarningKm ?? resolvedRule.warningKm : 500,
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

    // Store custom service names BEFORE resolving the title: the resolution
    // below reads the rules table, so the row has to exist first.
    if (items && items.length > 0) {
      await persistCustomServiceRules(session.user.id, items);
    }

    // Calculate next due info for the record itself (if we want to store it on the record)
    let finalNextDueKm: number | null = null;
    let finalNextDueDate: Date | null = null;

    const userRules = await db.maintenanceServiceRule.findMany({
      where: { userId: session.user.id },
    });
    // Same resolver the edit path uses, so both title the reminder identically.
    const displayName = resolveMaintenanceDisplayName(
      maintenanceType,
      userRules,
      (items ?? []).map((item) => item.name)
    );
    const existingReminder = await db.vehicleReminder.findFirst({
      where: { userId: session.user.id, vehicleId: id, category: "maintenance", title: displayName, isActive: true },
    });

    const resolvedPrimaryRule = resolveMaintenanceRule(
      { name: displayName, typeKey: maintenanceType },
      userRules
    );
    const intervalKm = existingReminder?.repeatIntervalKm || resolvedPrimaryRule.intervalKm || 0;
    const intervalDays = existingReminder?.repeatIntervalDays || resolvedPrimaryRule.intervalDays || 0;

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

    const itemsToSync = items && items.length > 0
      ? items.map((item: any) => ({
          name: item.name,
          typeKey: item.typeKey || item.name,
          scheduleReminder: item.scheduleReminder,
          reminderIntervalKm: item.reminderIntervalKm,
          reminderIntervalDays: item.reminderIntervalDays,
          reminderWarningKm: item.reminderWarningKm,
        }))
      : [{
          name: displayName,
          typeKey: maintenanceType,
          scheduleReminder: reminderEnabled ?? true,
          reminderIntervalKm: repeatIntervalKm ?? null,
          reminderIntervalDays: nextDueDate ? null : undefined,
        }];

    await syncMaintenanceReminder({
      userId: session.user.id,
      vehicleId: id,
      vehicleName: vehicle.name,
      items: itemsToSync,
      description,
      recordKm,
      recordDate,
      enabled: reminderEnabled ?? true,
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
