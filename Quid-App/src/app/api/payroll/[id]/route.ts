import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { adjustToBusinessDay, clampDayToMonth } from "@/lib/holidays";

interface ScheduleItem {
  day?: number;       // Day of month (1-31) for monthly/biweekly
  dayOfWeek?: number; // Day of week (0=Sun, 1=Mon, ..., 6=Sat) for weekly
  amount: number;
}

/**
 * DELETE /api/payroll/[id]
 * Delete a payroll group and all its future pending recurring payments.
 * Confirmed payments are kept but unlinked.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const group = await db.payrollGroup.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!group) {
      return NextResponse.json({ error: "Nómina no encontrada" }, { status: 404 });
    }

    // Delete all pending recurring payments linked to this group
    await db.recurringPayment.deleteMany({
      where: { payrollGroupId: id, status: "pending" },
    });

    // Unlink confirmed payments (keep them for history)
    await db.recurringPayment.updateMany({
      where: { payrollGroupId: id, status: "confirmed" },
      data: { payrollGroupId: null },
    });

    // Delete the group
    await db.payrollGroup.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete payroll group error:", error);
    return NextResponse.json({ error: "Error al eliminar nómina" }, { status: 500 });
  }
}

/**
 * PUT /api/payroll/[id]
 * Update a payroll group settings and regenerate future pending payments.
 * 
 * Body:
 * - description?: string
 * - frequency?: "monthly" | "biweekly" | "weekly"
 * - schedules?: ScheduleItem[]
 * - accountId?: string
 * - subAccountId?: string
 * - category?: string
 * - subCategory?: string
 * - adjustToBusinessDay?: boolean
 * - businessDayDirection?: "before" | "after"
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();

    const group = await db.payrollGroup.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!group) {
      return NextResponse.json({ error: "Nómina no encontrada" }, { status: 404 });
    }

    // Update group fields
    const updateData: Record<string, unknown> = {};
    if (body.description !== undefined) updateData.description = body.description;
    if (body.accountId !== undefined) updateData.accountId = body.accountId;
    if (body.subAccountId !== undefined) updateData.subAccountId = body.subAccountId || null;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.subCategory !== undefined) updateData.subCategory = body.subCategory || null;
    if (body.adjustToBusinessDay !== undefined) updateData.adjustToBusinessDay = body.adjustToBusinessDay;
    if (body.businessDayDirection !== undefined) updateData.businessDayDirection = body.businessDayDirection;

    let newSchedules: ScheduleItem[] | null = null;
    if (body.schedules !== undefined) {
      newSchedules = body.schedules;
      updateData.schedules = JSON.stringify(body.schedules);
      updateData.totalAmount = body.schedules.reduce((sum: number, s: ScheduleItem) => sum + (s.amount || 0), 0);
    }

    // Determine if we need to regenerate (any schedule/frequency/account/settings changed)
    const needsRegeneration =
      body.schedules !== undefined ||
      body.frequency !== undefined ||
      body.accountId !== undefined ||
      body.subAccountId !== undefined ||
      body.adjustToBusinessDay !== undefined ||
      body.businessDayDirection !== undefined ||
      body.category !== undefined ||
      body.subCategory !== undefined ||
      body.description !== undefined;

    // Update the group
    await db.payrollGroup.update({
      where: { id },
      data: updateData,
    });

    // If significant changes were made, regenerate future pending payments
    if (needsRegeneration) {
      // Delete all existing pending payments for this group
      await db.recurringPayment.deleteMany({
        where: { payrollGroupId: id, status: "pending" },
      });

      // Fetch the updated group to use latest values
      const updatedGroup = await db.payrollGroup.findUnique({ where: { id } });
      if (!updatedGroup) {
        return NextResponse.json({ error: "Nómina no encontrada después de actualizar" }, { status: 404 });
      }

      // Parse schedules (use new if provided, otherwise existing)
      const schedules: ScheduleItem[] = newSchedules || JSON.parse(updatedGroup.schedules);
      const frequency = body.frequency || updatedGroup.frequency;
      const adjustFlag = updatedGroup.adjustToBusinessDay;
      const direction = updatedGroup.businessDayDirection as "before" | "after";

      // Regenerate payments for current and next 2 months
      const now = new Date();

      if (frequency === "monthly") {
        const schedule = schedules[0] as ScheduleItem;
        const day = schedule.day || 1;
        const amount = schedule.amount;

        for (let offset = 0; offset < 3; offset++) {
          const targetMonth = now.getMonth() + offset;
          const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
          const actualMonth = targetMonth % 12;
          const actualDay = clampDayToMonth(targetYear, actualMonth, day);
          let scheduledDate = new Date(targetYear, actualMonth, actualDay);

          if (adjustFlag) {
            scheduledDate = adjustToBusinessDay(scheduledDate, direction, true);
          }

          await db.recurringPayment.create({
            data: {
              userId: session.user.id,
              description: updatedGroup.description,
              amount,
              type: "income",
              accountId: updatedGroup.accountId,
              subAccountId: updatedGroup.subAccountId || null,
              category: updatedGroup.category,
              subCategory: updatedGroup.subCategory || null,
              scheduledDate,
              frequency: "monthly",
              customDays: JSON.stringify(day),
              notes: `Nómina - ${frequency}`,
              isRecurring: true,
              status: "pending",
              payrollGroupId: id,
            },
          });
        }
      } else if (frequency === "biweekly") {
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

            if (offset === 0 && scheduledDate < now) continue;

            if (adjustFlag) {
              scheduledDate = adjustToBusinessDay(scheduledDate, direction, true);
            }

            await db.recurringPayment.create({
              data: {
                userId: session.user.id,
                description: updatedGroup.description,
                amount,
                type: "income",
                accountId: updatedGroup.accountId,
                subAccountId: updatedGroup.subAccountId || null,
                category: updatedGroup.category,
                subCategory: updatedGroup.subCategory || null,
                scheduledDate,
                frequency: "biweekly",
                customDays: JSON.stringify(sortedSchedules.map((s: ScheduleItem) => s.day)),
                notes: `Nómina - Quincenal (día ${day})`,
                isRecurring: true,
                status: "pending",
                payrollGroupId: id,
              },
            });
          }
        }
      } else if (frequency === "weekly") {
        const schedule = schedules[0] as ScheduleItem;
        const dayOfWeek = schedule.dayOfWeek ?? 1;
        const amount = schedule.amount;

        for (let offset = 0; offset < 3; offset++) {
          const targetMonth = now.getMonth() + offset;
          const targetYear = now.getFullYear() + Math.floor(targetMonth / 12);
          const actualMonth = targetMonth % 12;
          const daysInMonth = new Date(targetYear, actualMonth + 1, 0).getDate();

          for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(targetYear, actualMonth, d);
            if (date.getDay() === dayOfWeek) {
              let scheduledDate = date;
              if (offset === 0 && scheduledDate < now) continue;
              if (adjustFlag) {
                scheduledDate = adjustToBusinessDay(scheduledDate, direction, true);
              }

              await db.recurringPayment.create({
                data: {
                  userId: session.user.id,
                  description: updatedGroup.description,
                  amount,
                  type: "income",
                  accountId: updatedGroup.accountId,
                  subAccountId: updatedGroup.subAccountId || null,
                  category: updatedGroup.category,
                  subCategory: updatedGroup.subCategory || null,
                  scheduledDate,
                  frequency: "weekly",
                  customDays: JSON.stringify({ dayOfWeek }),
                  notes: `Nómina - Semanal`,
                  isRecurring: true,
                  status: "pending",
                  payrollGroupId: id,
                },
              });
            }
          }
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update payroll group error:", error);
    return NextResponse.json({ error: "Error al actualizar nómina" }, { status: 500 });
  }
}
