import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { calculateFuelLevel } from "@/lib/fuel-level";
import { toNumber } from "@/lib/decimal-serializer";
import type { RadarEvent, RadarEventSeverity } from "@/lib/types/smart-planner";

const HORIZON_DAYS = 45;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(date: Date, today = startOfToday()) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / MS_PER_DAY);
}

function severityForDate(date: Date): RadarEventSeverity {
  const days = daysUntil(date);
  if (days < 0) return "critical";
  if (days <= 3) return "warning";
  return "info";
}

function withinHorizon(date: Date, horizon: Date) {
  return date <= horizon;
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const today = startOfToday();
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + HORIZON_DAYS);

    const [recurringPayments, vehicles, appointments, pantryItems] = await Promise.all([
      db.recurringPayment.findMany({
        where: {
          userId,
          status: "pending",
          scheduledDate: { lte: horizon },
        },
        orderBy: { scheduledDate: "asc" },
        include: {
          account: { select: { name: true } },
          debt: { select: { name: true } },
        },
      }),
      db.vehicle.findMany({
        where: { userId },
        include: {
          fuelLogs: { orderBy: { date: "desc" } },
          maintenanceRecords: {
            where: { reminderEnabled: true },
            orderBy: [{ nextDueDate: "asc" }, { nextDueKm: "asc" }],
          },
          documents: {
            where: { reminderEnabled: true },
            orderBy: { expiryDate: "asc" },
          },
        },
      }),
      db.medicalAppointment.findMany({
        where: {
          userId,
          status: "scheduled",
          date: { lte: horizon },
        },
        orderBy: { date: "asc" },
      }),
      db.pantryItem.findMany({
        where: { userId },
        orderBy: { expirationDate: "asc" },
      }),
    ]);

    const events: RadarEvent[] = [];

    for (const payment of recurringPayments) {
      const isIncome = payment.type === "income";
      const date = payment.scheduledDate;
      const linkedName = payment.account?.name || payment.debt?.name;

      events.push({
        id: `finance:${payment.id}`,
        source: "finance",
        kind: isIncome ? "scheduled-income" : "recurring-payment",
        title: isIncome ? `Ingreso programado: ${payment.description}` : `Pago pendiente: ${payment.description}`,
        description: linkedName ? `Cuenta relacionada: ${linkedName}` : payment.category || undefined,
        date: date.toISOString(),
        amount: toNumber(payment.actualAmount ?? payment.amount),
        severity: isIncome ? "success" : severityForDate(date),
        status: "pending",
        action: {
          label: isIncome ? "Confirmar ingreso" : "Confirmar pago",
          endpoint: `/api/recurring/${payment.id}/confirm`,
          method: "POST",
          body: { actualAmount: toNumber(payment.actualAmount ?? payment.amount) },
        },
      });
    }

    for (const vehicle of vehicles) {
      const fuelLevel = calculateFuelLevel(
        {
          tankCapacity: vehicle.tankCapacity,
          currentKm: vehicle.currentKm,
          type: vehicle.type,
        },
        vehicle.fuelLogs.map((log) => ({
          id: log.id,
          date: log.date,
          km: log.km,
          amount: toNumber(log.amount),
          pricePerGallon: toNumber(log.pricePerGallon),
          gallons: log.gallons,
          isFullTank: log.isFullTank,
        }))
      );

      if (fuelLevel.refuelByDate) {
        const refuelDate = new Date(fuelLevel.refuelByDate);
        if (withinHorizon(refuelDate, horizon)) {
          events.push({
            id: `transport:fuel:${vehicle.id}`,
            source: "transport",
            kind: "fuel-refill",
            title: `Tanqueo proyectado: ${vehicle.name}`,
            description: fuelLevel.isLearning
              ? "Predicción inicial mientras Quid aprende tu consumo."
              : `Autonomía estimada: ${fuelLevel.estimatedRange.toLocaleString("es-CO")} km`,
            date: refuelDate.toISOString(),
            amount: fuelLevel.gallonsToRefuel > 0 && fuelLevel.lastPricePerGallon > 0
              ? Math.round(fuelLevel.gallonsToRefuel * fuelLevel.lastPricePerGallon)
              : undefined,
            severity: fuelLevel.isLowFuel ? "critical" : severityForDate(refuelDate),
            status: "pending",
          });
        }
      }

      for (const document of vehicle.documents) {
        const reminderDate = new Date(document.expiryDate);
        reminderDate.setDate(reminderDate.getDate() - document.reminderDays);
        if (!withinHorizon(reminderDate, horizon)) continue;

        events.push({
          id: `transport:document:${document.id}`,
          source: "transport",
          kind: "vehicle-document",
          title: `${document.type.toUpperCase()} por vencer: ${vehicle.name}`,
          description: `Vence el ${document.expiryDate.toLocaleDateString("es-CO")}`,
          date: reminderDate.toISOString(),
          amount: toNumber(document.cost),
          severity: severityForDate(document.expiryDate),
          status: "pending",
        });
      }

      for (const maintenance of vehicle.maintenanceRecords) {
        const dueByDate = maintenance.nextDueDate ? new Date(maintenance.nextDueDate) : null;
        const dueByKm = maintenance.nextDueKm != null && vehicle.currentKm >= maintenance.nextDueKm;

        if (dueByDate && withinHorizon(dueByDate, horizon)) {
          events.push({
            id: `transport:maintenance-date:${maintenance.id}`,
            source: "transport",
            kind: "maintenance",
            title: `Mantenimiento: ${vehicle.name}`,
            description: maintenance.description,
            date: dueByDate.toISOString(),
            amount: toNumber(maintenance.cost),
            severity: severityForDate(dueByDate),
            status: "pending",
          });
        } else if (dueByKm) {
          events.push({
            id: `transport:maintenance-km:${maintenance.id}`,
            source: "transport",
            kind: "maintenance",
            title: `Mantenimiento por kilometraje: ${vehicle.name}`,
            description: `${maintenance.description} desde ${maintenance.nextDueKm?.toLocaleString("es-CO")} km`,
            date: today.toISOString(),
            amount: toNumber(maintenance.cost),
            severity: "warning",
            status: "pending",
          });
        }
      }
    }

    for (const appointment of appointments) {
      events.push({
        id: `health:appointment:${appointment.id}`,
        source: "health",
        kind: "medical-appointment",
        title: appointment.specialty ? `Cita: ${appointment.specialty}` : "Cita médica",
        description: [appointment.doctorName, appointment.location].filter(Boolean).join(" - ") || undefined,
        date: appointment.date.toISOString(),
        severity: severityForDate(appointment.date),
        status: "pending",
        action: {
          label: "Marcar realizada",
          endpoint: `/api/appointments/${appointment.id}`,
          method: "PUT",
          body: { status: "completed" },
        },
      });
    }

    for (const item of pantryItems) {
      if (item.expirationDate && withinHorizon(item.expirationDate, horizon)) {
        events.push({
          id: `pantry:expiration:${item.id}`,
          source: "pantry",
          kind: "pantry-expiration",
          title: `Por vencer: ${item.name}`,
          description: `${item.quantity} ${item.unit}`,
          date: item.expirationDate.toISOString(),
          amount: item.purchasePrice ? toNumber(item.purchasePrice) : undefined,
          severity: severityForDate(item.expirationDate),
          status: "pending",
        });
      }

      if (item.minStock != null && item.quantity <= item.minStock) {
        events.push({
          id: `pantry:low-stock:${item.id}`,
          source: "pantry",
          kind: "pantry-low-stock",
          title: `Stock bajo: ${item.name}`,
          description: `${item.quantity} ${item.unit} disponible`,
          date: today.toISOString(),
          amount: item.purchasePrice ? toNumber(item.purchasePrice) : undefined,
          severity: "warning",
          status: "pending",
        });
      }
    }

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return NextResponse.json(events.slice(0, 30));
  } catch (error) {
    console.error("Smart planner error:", error);
    return NextResponse.json({ error: "Error al construir el radar" }, { status: 500 });
  }
}
