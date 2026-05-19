import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAndPushNotification } from "@/lib/push";
import { getColombiaTodayString, createColombiaDate } from "@/lib/api";

/**
 * GET /api/push/recurring-reminder
 *
 * Checks for recurring payments due today for the authenticated user
 * and sends a push notification with a summary.
 * This is called from the client-side on app load or by a scheduled check.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const today = getColombiaTodayString();
    const todayDate = createColombiaDate(today);

    // Find recurring payments due today that are still pending
    const dueToday = await db.recurringPayment.findMany({
      where: {
        userId: session.user.id,
        status: "pending",
        scheduledDate: {
          gte: new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate(), 0, 0, 0),
          lt: new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() + 1, 0, 0, 0),
        },
      },
      include: {
        account: { select: { name: true } },
        debt: { select: { name: true } },
      },
      orderBy: { scheduledDate: "asc" },
    });

    if (dueToday.length === 0) {
      return NextResponse.json({ sent: false, count: 0, message: "No hay pagos pendientes para hoy" });
    }

    // Build summary for push notification
    const totalAmount = dueToday.reduce((sum, p) => sum + Number(p.amount), 0);
    const paymentList = dueToday
      .slice(0, 3)
      .map((p) => {
        const source = p.debt?.name || p.account?.name || "";
        return `${p.description}${source ? ` (${source})` : ""}`;
      })
      .join(", ");
    const moreCount = dueToday.length > 3 ? dueToday.length - 3 : 0;

    const pushBody = moreCount > 0
      ? `${paymentList} y ${moreCount} más. Total: $${totalAmount.toLocaleString("es-CO")}`
      : `${paymentList}. Total: $${totalAmount.toLocaleString("es-CO")}`;

    // Create in-app notification + push
    await createAndPushNotification({
      userId: session.user.id,
      type: "recurring_due",
      title: `Pagos pendientes hoy (${dueToday.length})`,
      message: `Tienes ${dueToday.length} pago(s) programado(s) para hoy por un total de $${totalAmount.toLocaleString("es-CO")}. ${moreCount > 0 ? `${paymentList} y ${moreCount} más.` : paymentList}`,
      pushBody,
      data: {
        paymentIds: dueToday.map((p) => p.id),
        totalAmount,
        count: dueToday.length,
      },
      url: "/?module=finance&tab=recurring",
    });

    return NextResponse.json({
      sent: true,
      count: dueToday.length,
      totalAmount,
    });
  } catch (error) {
    console.error("Recurring reminder error:", error);
    return NextResponse.json(
      { error: "Error al verificar pagos recurrentes" },
      { status: 500 }
    );
  }
}
