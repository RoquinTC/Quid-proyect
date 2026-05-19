import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentBudgetPeriod, needsBudgetReset } from "@/lib/holidays";
import { getColombiaNow } from "@/lib/api";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const settings = await db.userSettings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings) {
      return NextResponse.json({ error: "Configuración no encontrada" }, { status: 404 });
    }

    const period = getCurrentBudgetPeriod(
      settings.budgetCutoffDay,
      settings.respectHolidays,
      getColombiaNow()
    );

    // Check if reset is actually needed
    if (!needsBudgetReset(settings.lastBudgetReset, period.start)) {
      return NextResponse.json({
        message: "Los presupuestos ya están en el período actual",
        reset: false,
      });
    }

    // First-time setup: if lastBudgetReset was never set, just initialize the date
    // without resetting spent values. Only reset when a NEW period has actually started.
    const isFirstSetup = !settings.lastBudgetReset;

    if (isFirstSetup) {
      // Just mark the current period as "initialized" without zeroing budgets
      await db.userSettings.update({
        where: { userId: session.user.id },
        data: { lastBudgetReset: new Date() },
      });

      // Also set lastResetDate on any budgets that don't have one yet
      await db.budget.updateMany({
        where: { 
          userId: session.user.id,
          lastResetDate: null,
        },
        data: { lastResetDate: new Date() },
      });

      return NextResponse.json({
        message: "Período inicializado sin reiniciar valores",
        reset: false,
        initialized: true,
      });
    }

    // Real period change: reset all budgets for this user
    const result = await db.budget.updateMany({
      where: { userId: session.user.id },
      data: {
        spent: 0,
        lastResetDate: new Date(),
      },
    });

    // Update the lastBudgetReset in settings
    await db.userSettings.update({
      where: { userId: session.user.id },
      data: { lastBudgetReset: new Date() },
    });

    return NextResponse.json({
      message: `Se reiniciaron ${result.count} presupuesto(s)`,
      reset: true,
      count: result.count,
      periodStart: period.start.toISOString(),
      periodEnd: period.end.toISOString(),
    });
  } catch (error) {
    console.error("Reset budgets error:", error);
    return NextResponse.json({ error: "Error al reiniciar presupuestos" }, { status: 500 });
  }
}
