import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Los recordatorios automáticos caducan.
 *
 * Un aviso de "faltan 30 días" no sirve dos días después, y con la cadencia
 * anterior (un aviso diario por entidad) la campanita se llenaba de avisos
 * repetidos. El estado real sigue visible en cada módulo, así que aquí se
 * limpian por tipo y antigüedad en vez de acumularse.
 */
const REMINDER_RETENTION_DAYS: Record<string, number> = {
  medication_due: 1,
  transport_fuel_low: 2,
  transport_maintenance_due: 2,
  transport_document_due: 2,
  transport_custom_reminder_due: 2,
  recurring_upcoming: 7,
  recurring_due: 7,
};

function staleReminderFilter(now: number) {
  return Object.entries(REMINDER_RETENTION_DAYS).map(([type, days]) => ({
    type,
    createdAt: { lt: new Date(now - days * 24 * 60 * 60 * 1000) },
  }));
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: 401 }
      );
    }

    // Auto-cleanup: delete read notifications older than 5 minutes
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    await db.appNotification.deleteMany({
      where: {
        userId: session.user.id,
        read: true,
        createdAt: { lt: fiveMinutesAgo },
      },
    });

    // Auto-cleanup: recordatorios ya caducados (por tipo)
    await db.appNotification.deleteMany({
      where: {
        userId: session.user.id,
        OR: staleReminderFilter(Date.now()),
      },
    });

    // Get recent notifications (limit to 50 to keep panel manageable)
    const notifications = await db.appNotification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const unreadCount = await db.appNotification.count({
      where: { userId: session.user.id, read: false },
    });

    // Parse the `data` JSON field before returning
    const parsed = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      message: n.message,
      read: n.read,
      data: n.data ? JSON.parse(n.data) : null,
      createdAt: n.createdAt,
    }));

    return NextResponse.json({ notifications: parsed, unreadCount });
  } catch (error) {
    console.error("Get notifications error:", error);
    return NextResponse.json(
      { error: "Error al obtener notificaciones" },
      { status: 500 }
    );
  }
}
