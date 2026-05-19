import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { adjustToBusinessDay, clampDayToMonth } from "@/lib/holidays";
import { verifyEntityOwnership } from "@/lib/auth-guards";
import { validateBody, payrollCreateSchema } from "@/lib/validations";

interface ScheduleItem {
  day?: number;       // Day of month (1-31) for monthly/biweekly
  dayOfWeek?: number; // Day of week (0=Sun, 1=Mon, ..., 6=Sat) for weekly
  amount: number;
}

/**
 * POST /api/payroll
 * Create a payroll group and its initial recurring payments.
 *
 * Body:
 * - description: string (default "Sueldo")
 * - frequency: "monthly" | "biweekly" | "weekly"
 * - schedules: ScheduleItem[] (day/amount pairs)
 * - accountId: string (destination account)
 * - subAccountId?: string (destination sub-account)
 * - category?: string (default "Sueldo")
 * - subCategory?: string
 * - adjustToBusinessDay?: boolean (default false)
 * - businessDayDirection?: "before" | "after" (default "before")
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, payrollCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const {
      description = "Sueldo",
      frequency,
      schedules,
      accountId,
      subAccountId,
      category = "Sueldo",
      subCategory,
      adjustToBusinessDay: adjustFlag = false,
      businessDayDirection = "before",
    } = body;

    // Validate
    if (!frequency || !["monthly", "biweekly", "weekly"].includes(frequency)) {
      return NextResponse.json({ error: "Frecuencia inválida" }, { status: 400 });
    }
    if (!accountId) {
      return NextResponse.json({ error: "Cuenta requerida" }, { status: 400 });
    }
    if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
      return NextResponse.json({ error: "Horarios requeridos" }, { status: 400 });
    }

    // Verify ownership of account/subAccount
    const payrollEntities: { type: "account" | "subAccount" | "debt"; id: string }[] = [];
    payrollEntities.push({ type: "account", id: accountId });
    if (subAccountId) payrollEntities.push({ type: "subAccount", id: subAccountId });

    const payrollOwnershipError = await verifyEntityOwnership(session.user.id, payrollEntities);
    if (payrollOwnershipError) return payrollOwnershipError;

    // Validate schedules based on frequency
    if (frequency === "monthly" && schedules.length !== 1) {
      return NextResponse.json({ error: "Mensual requiere 1 día" }, { status: 400 });
    }
    if (frequency === "biweekly" && schedules.length !== 2) {
      return NextResponse.json({ error: "Quincenal requiere 2 días" }, { status: 400 });
    }
    if (frequency === "weekly" && schedules.length !== 1) {
      return NextResponse.json({ error: "Semanal requiere 1 día de la semana" }, { status: 400 });
    }

    const totalAmount = schedules.reduce((sum: number, s: ScheduleItem) => sum + (s.amount || 0), 0);

    // Create the payroll group
    const payrollGroup = await db.payrollGroup.create({
      data: {
        userId: session.user.id,
        description,
        frequency,
        totalAmount,
        accountId,
        subAccountId: subAccountId || null,
        category,
        subCategory: subCategory || null,
        adjustToBusinessDay: adjustFlag,
        businessDayDirection,
        schedules: JSON.stringify(schedules),
      },
    });

    // Generate recurring payments for the current and next month
    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createdPayments: any[] = [];

    if (frequency === "monthly") {
      // One payment per month
      const schedule = schedules[0] as ScheduleItem;
      const day = schedule.day || 1;
      const amount = schedule.amount;

      // Generate for current month and next 2 months
      for (let offset = 0; offset < 3; offset++) {
        const targetMonth = now.getMonth() + offset;
        const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
        const actualMonth = targetMonth % 12;
        const actualDay = clampDayToMonth(targetYear, actualMonth, day);

        let scheduledDate = new Date(targetYear, actualMonth, actualDay);

        // If this month's date has already passed, skip it
        if (offset === 0 && scheduledDate < now) {
          // Still create it - it might be today or overdue
        }

        // Adjust for business day if needed
        if (adjustFlag) {
          scheduledDate = adjustToBusinessDay(scheduledDate, businessDayDirection as "before" | "after", true);
        }

        const payment = await db.recurringPayment.create({
          data: {
            userId: session.user.id,
            description: description || "Sueldo",
            amount,
            type: "income",
            accountId,
            subAccountId: subAccountId || null,
            category,
            subCategory: subCategory || null,
            scheduledDate,
            frequency: "monthly",
            customDays: JSON.stringify(day),
            notes: `Nómina - ${frequency}`,
            isRecurring: true,
            status: "pending",
            payrollGroupId: payrollGroup.id,
          },
        });
        createdPayments.push(payment);
      }
    } else if (frequency === "biweekly") {
      // Two payments per month
      const sortedSchedules = [...schedules].sort((a: ScheduleItem, b: ScheduleItem) => (a.day || 0) - (b.day || 0));

      for (let offset = 0; offset < 3; offset++) {
        const targetMonth = now.getMonth() + offset;
        const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
        const actualMonth = targetMonth % 12;

        for (const schedule of sortedSchedules) {
          const day = schedule.day || 1;
          const amount = schedule.amount;
          const actualDay = clampDayToMonth(targetYear, actualMonth, day);

          let scheduledDate = new Date(targetYear, actualMonth, actualDay);

          // If in current month and date has passed, skip
          if (offset === 0 && scheduledDate < now) {
            continue;
          }

          if (adjustFlag) {
            scheduledDate = adjustToBusinessDay(scheduledDate, businessDayDirection as "before" | "after", true);
          }

          const payment = await db.recurringPayment.create({
            data: {
              userId: session.user.id,
              description: `${description || "Sueldo"}`,
              amount,
              type: "income",
              accountId,
              subAccountId: subAccountId || null,
              category,
              subCategory: subCategory || null,
              scheduledDate,
              frequency: "biweekly",
              customDays: JSON.stringify(sortedSchedules.map((s: ScheduleItem) => s.day)),
              notes: `Nómina - Quincenal (día ${day})`,
              isRecurring: true,
              status: "pending",
              payrollGroupId: payrollGroup.id,
            },
          });
          createdPayments.push(payment);
        }
      }
    } else if (frequency === "weekly") {
      // Weekly: find all occurrences of dayOfWeek in current and next 2 months
      const schedule = schedules[0] as ScheduleItem;
      const dayOfWeek = schedule.dayOfWeek ?? 1; // 0=Sun, 6=Sat
      const amount = schedule.amount;

      for (let offset = 0; offset < 3; offset++) {
        const targetMonth = now.getMonth() + offset;
        const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
        const actualMonth = targetMonth % 12;

        // Find all occurrences of this dayOfWeek in the month
        const daysInMonth = new Date(targetYear, actualMonth + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(targetYear, actualMonth, d);
          if (date.getDay() === dayOfWeek) {
            let scheduledDate = date;

            // If in current month and date has passed, skip
            if (offset === 0 && scheduledDate < now) {
              continue;
            }

            if (adjustFlag) {
              scheduledDate = adjustToBusinessDay(scheduledDate, businessDayDirection as "before" | "after", true);
            }

            const payment = await db.recurringPayment.create({
              data: {
                userId: session.user.id,
                description: description || "Sueldo",
                amount,
                type: "income",
                accountId,
                subAccountId: subAccountId || null,
                category,
                subCategory: subCategory || null,
                scheduledDate,
                frequency: "weekly",
                customDays: JSON.stringify({ dayOfWeek }),
                notes: `Nómina - Semanal`,
                isRecurring: true,
                status: "pending",
                payrollGroupId: payrollGroup.id,
              },
            });
            createdPayments.push(payment);
          }
        }
      }
    }

    return NextResponse.json({ payrollGroup, payments: createdPayments }, { status: 201 });
  } catch (error) {
    console.error("Create payroll group error:", error);
    return NextResponse.json({ error: "Error al crear asistente de nómina" }, { status: 500 });
  }
}

/**
 * GET /api/payroll
 * List all payroll groups for the user.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const groups = await db.payrollGroup.findMany({
      where: { userId: session.user.id, isActive: true },
      include: {
        account: { select: { id: true, name: true, color: true } },
        subAccount: { select: { id: true, name: true } },
        recurringPayments: {
          where: { status: "pending" },
          orderBy: { scheduledDate: "asc" },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(groups);
  } catch (error) {
    console.error("Get payroll groups error:", error);
    return NextResponse.json({ error: "Error al obtener nóminas" }, { status: 500 });
  }
}
