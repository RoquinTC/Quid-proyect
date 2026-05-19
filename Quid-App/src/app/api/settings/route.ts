import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCurrentBudgetPeriod, needsBudgetReset } from "@/lib/holidays";
import { validateBody, settingsUpdateSchema } from "@/lib/validations";
import { getColombiaNow } from "@/lib/api";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Get or create settings
    let settings = await db.userSettings.findUnique({
      where: { userId: session.user.id },
    });

    if (!settings) {
      // Verify user exists first to avoid P2003
      const userExists = await db.user.findUnique({ where: { id: session.user.id } });
      if (!userExists) {
        return NextResponse.json({ error: "Usuario no encontrado en la base de datos" }, { status: 404 });
      }

      settings = await db.userSettings.create({
        data: { userId: session.user.id },
      });
    }

    // Calculate current budget period info using Colombia time
    const period = getCurrentBudgetPeriod(
      settings.budgetCutoffDay,
      settings.respectHolidays,
      getColombiaNow()
    );
    const needsReset = needsBudgetReset(settings.lastBudgetReset, period.start);

    // Fetch user info for telegramId
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { telegramId: true }
    });

    return NextResponse.json({
      ...settings,
      telegramId: user?.telegramId,
      currentPeriod: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      needsBudgetReset: needsReset,
    });
  } catch (error) {
    console.error("Get settings error:", error);
    const message = error instanceof Error ? error.message : "Error al obtener configuración";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, settingsUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const {
      theme,
      budgetCutoffDay,
      respectHolidays,
      countryCode,
      notificationsEnabled,
      lockOnResume,
      pinEnabled,
      biometricEnabled,
    } = body;

    // Validate cutoff day
    if (budgetCutoffDay !== undefined && (budgetCutoffDay < 1 || budgetCutoffDay > 31)) {
      return NextResponse.json(
        { error: "El día de corte debe estar entre 1 y 31" },
        { status: 400 }
      );
    }

    // Validate theme
    if (theme && !["light", "dark", "system"].includes(theme)) {
      return NextResponse.json(
        { error: "Tema no válido" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (theme !== undefined) data.theme = theme;
    if (budgetCutoffDay !== undefined) data.budgetCutoffDay = budgetCutoffDay;
    if (respectHolidays !== undefined) data.respectHolidays = respectHolidays;
    if (countryCode !== undefined) data.countryCode = countryCode;
    if (notificationsEnabled !== undefined) data.notificationsEnabled = notificationsEnabled;
    if (lockOnResume !== undefined) data.lockOnResume = lockOnResume;
    if (pinEnabled !== undefined) data.pinEnabled = pinEnabled;
    if (biometricEnabled !== undefined) data.biometricEnabled = biometricEnabled;

    const settings = await db.userSettings.upsert({
      where: { userId: session.user.id },
      update: data,
      create: {
        userId: session.user.id,
        ...data,
      },
    });

    // Calculate updated period info using Colombia time
    const period = getCurrentBudgetPeriod(
      settings.budgetCutoffDay,
      settings.respectHolidays,
      getColombiaNow()
    );
    const needsReset = needsBudgetReset(settings.lastBudgetReset, period.start);

    return NextResponse.json({
      ...settings,
      currentPeriod: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      needsBudgetReset: needsReset,
    });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Error al actualizar configuración" }, { status: 500 });
  }
}
