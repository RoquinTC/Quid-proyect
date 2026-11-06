import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBudgetPeriod, needsBudgetReset } from "@/lib/holidays";
import { validateBody, settingsUpdateSchema } from "@/lib/validations";
import { getColombiaNow } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";

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

    // Calculate current budget period info using Colombia time.
    // getBudgetPeriod respeta budgetCycleMode (monthly | semimonthly).
    const period = getBudgetPeriod(settings, getColombiaNow());
    const needsReset = needsBudgetReset(settings.lastBudgetReset, period.start);

    // Fetch user info for telegramId
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, telegramId: true }
    });

    return NextResponse.json({
      ...settings,
      telegramId: user?.telegramId,
      currentPeriod: {
        start: period.start.toISOString(),
        end: period.end.toISOString(),
      },
      needsBudgetReset: needsReset,
      isAdmin: isAdminEmail(user?.email),
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
      budgetCutoffDay2,
      budgetCycleMode,
      respectHolidays,
      smsCaptureEnabled,
      inboxEmailEnabled,
      countryCode,
      notificationsEnabled,
      lockOnResume,
      pinEnabled,
      biometricEnabled,
      lockGraceMinutes,
      therapyDayStartHour,
    } = body;

    // Validate cutoff day
    if (budgetCutoffDay !== undefined && (budgetCutoffDay < 1 || budgetCutoffDay > 31)) {
      return NextResponse.json(
        { error: "El día de corte debe estar entre 1 y 31" },
        { status: 400 }
      );
    }

    // Validate second cutoff day (only used in semimonthly mode)
    if (budgetCutoffDay2 !== undefined && (budgetCutoffDay2 < 1 || budgetCutoffDay2 > 31)) {
      return NextResponse.json(
        { error: "El segundo día de corte debe estar entre 1 y 31" },
        { status: 400 }
      );
    }

    // Validate cycle mode
    if (budgetCycleMode !== undefined && !["monthly", "semimonthly"].includes(budgetCycleMode)) {
      return NextResponse.json(
        { error: "El ciclo presupuestal debe ser 'monthly' o 'semimonthly'" },
        { status: 400 }
      );
    }

    // A semimonthly cycle needs two different anchor days, otherwise one of the
    // two halves would be empty.
    if (
      budgetCycleMode === "semimonthly" &&
      budgetCutoffDay !== undefined &&
      budgetCutoffDay2 !== undefined &&
      budgetCutoffDay === budgetCutoffDay2
    ) {
      return NextResponse.json(
        { error: "En modo quincenal los dos días de corte deben ser distintos" },
        { status: 400 }
      );
    }

    // Validate theme
    if (theme && !["light", "dark", "oled", "system"].includes(theme)) {
      return NextResponse.json(
        { error: "Tema no válido" },
        { status: 400 }
      );
    }

    const data: Record<string, unknown> = {};
    if (theme !== undefined) data.theme = theme;
    if (budgetCutoffDay !== undefined) data.budgetCutoffDay = budgetCutoffDay;
    if (budgetCutoffDay2 !== undefined) data.budgetCutoffDay2 = budgetCutoffDay2;
    if (budgetCycleMode !== undefined) data.budgetCycleMode = budgetCycleMode;
    if (respectHolidays !== undefined) data.respectHolidays = respectHolidays;
    if (smsCaptureEnabled !== undefined) data.smsCaptureEnabled = smsCaptureEnabled;
    if (inboxEmailEnabled !== undefined) data.inboxEmailEnabled = inboxEmailEnabled;
    if (countryCode !== undefined) data.countryCode = countryCode;
    if (notificationsEnabled !== undefined) data.notificationsEnabled = notificationsEnabled;
    if (lockOnResume !== undefined) data.lockOnResume = lockOnResume;
    if (pinEnabled !== undefined) data.pinEnabled = pinEnabled;
    if (biometricEnabled !== undefined) data.biometricEnabled = biometricEnabled;
    if (lockGraceMinutes !== undefined) data.lockGraceMinutes = lockGraceMinutes;
    if (therapyDayStartHour !== undefined) data.therapyDayStartHour = therapyDayStartHour;

    const settings = await db.userSettings.upsert({
      where: { userId: session.user.id },
      update: data,
      create: {
        userId: session.user.id,
        ...data,
      },
    });

    // Calculate updated period info using Colombia time
    const period = getBudgetPeriod(settings, getColombiaNow());
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
