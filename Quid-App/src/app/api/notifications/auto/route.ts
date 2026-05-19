import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";
import { toNumber } from "@/lib/decimal-serializer";
import { createAndPushNotification } from "@/lib/push";

/**
 * POST /api/notifications/auto
 *
 * Checks and sends push notifications for:
 * 1. Recurring payments due tomorrow (upcoming reminder)
 * 2. Yields ready to confirm (near month end)
 * 3. Savings goals near completion (>=80%)
 *
 * Called periodically by the client or service worker.
 * Deduplicates by checking for existing unread notifications in the last 24h.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const now = getColombiaNow();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const notifsSent: string[] = [];

    // ── 1. Recurring payments due tomorrow ──
    try {
      const dueTomorrow = await db.recurringPayment.findMany({
        where: {
          userId,
          status: "pending",
          scheduledDate: {
            gte: now,
            lte: tomorrow,
          },
        },
        select: { id: true, description: true, amount: true },
      });

      if (dueTomorrow.length > 0) {
        // Check if already notified in the last 24h
        const existingNotif = await db.appNotification.findFirst({
          where: {
            userId,
            type: "recurring_upcoming",
            read: false,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        });

        if (!existingNotif) {
          const total = dueTomorrow.reduce((s, r) => s + toNumber(r.amount), 0);
          await createAndPushNotification({
            userId,
            type: "recurring_upcoming",
            title: "Pagos próximos",
            message: `${dueTomorrow.length} pago${dueTomorrow.length > 1 ? "s" : ""} programado${dueTomorrow.length > 1 ? "s" : ""} para mañana · ${total.toLocaleString("es-CO", { style: "currency", currency: "COP", minimumFractionDigits: 0 })}`,
            pushBody: `${dueTomorrow.length} pago(s) mañana`,
            url: "/?tab=finance&sub=recurring",
          });
          notifsSent.push("recurring_upcoming");
        }
      }
    } catch (e) {
      console.error("[AutoNotif] Recurring upcoming error:", e);
    }

    // ── 2. Yields ready to confirm (last 2 days of month) ──
    try {
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      if (now.getDate() >= lastDay - 1) {
        // Get user's account IDs
        const userAccounts = await db.account.findMany({
          where: { userId },
          select: { id: true },
        });
        const userAccountIds = userAccounts.map((a) => a.id);

        const userSubAccounts = await db.subAccount.findMany({
          where: { account: { userId } },
          select: { id: true },
        });
        const userSubAccountIds = userSubAccounts.map((s) => s.id);

        const unconfirmedYields = await db.yieldRecord.findMany({
          where: {
            isConfirmed: false,
            OR: [
              { accountId: { in: userAccountIds } },
              { subAccountId: { in: userSubAccountIds } },
            ],
            month: {
              gte: new Date(now.getFullYear(), now.getMonth(), 1),
              lt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
            },
          },
        });

        if (unconfirmedYields.length > 0) {
          const existingNotif = await db.appNotification.findFirst({
            where: {
              userId,
              type: "yield_ready",
              read: false,
              createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
            },
          });

          if (!existingNotif) {
            await createAndPushNotification({
              userId,
              type: "yield_ready",
              title: "Rendimientos listos",
              message: `${unconfirmedYields.length} rendimiento${unconfirmedYields.length > 1 ? "s" : ""} listo${unconfirmedYields.length > 1 ? "s" : ""} para confirmar · Fin de mes`,
              pushBody: "Rendimientos listos para confirmar",
              url: "/?tab=finance",
            });
            notifsSent.push("yield_ready");
          }
        }
      }
    } catch (e) {
      console.error("[AutoNotif] Yield ready error:", e);
    }

    // ── 3. Savings goals near completion (>=80%) ──
    try {
      const nearCompletion = await db.savingsGoal.findMany({
        where: {
          userId,
          isActive: true,
          status: "activa",
        },
      });

      const goalsNear80 = nearCompletion.filter((g) => {
        const pct = toNumber(g.currentAmount) / toNumber(g.targetAmount);
        return pct >= 0.8 && pct < 1;
      });

      if (goalsNear80.length > 0) {
        const existingNotif = await db.appNotification.findFirst({
          where: {
            userId,
            type: "goal_near_completion",
            read: false,
            createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        });

        if (!existingNotif) {
          const names = goalsNear80.slice(0, 2).map((g) => g.name).join(", ");
          await createAndPushNotification({
            userId,
            type: "goal_near_completion",
            title: "Casi llegas",
            message: `Meta${goalsNear80.length > 1 ? "s" : ""} casi completada${goalsNear80.length > 1 ? "s" : ""}: ${names}${goalsNear80.length > 2 ? ` +${goalsNear80.length - 2} más` : ""}`,
            pushBody: `¡Casi completas tu meta! ${names}`,
            url: "/?tab=finance&sub=savings",
          });
          notifsSent.push("goal_near_completion");
        }
      }
    } catch (e) {
      console.error("[AutoNotif] Goal near completion error:", e);
    }

    return NextResponse.json({ sent: notifsSent });
  } catch (error) {
    console.error("Auto notifications error:", error);
    return NextResponse.json(
      { error: "Error al verificar notificaciones" },
      { status: 500 }
    );
  }
}
