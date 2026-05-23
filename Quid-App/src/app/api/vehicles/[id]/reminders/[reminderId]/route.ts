import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, vehicleReminderUpdateSchema } from "@/lib/validations";

function serializeReminder(reminder: {
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: unknown;
}) {
  return {
    ...reminder,
    dueDate: reminder.dueDate?.toISOString() ?? null,
    completedAt: reminder.completedAt?.toISOString() ?? null,
    createdAt: reminder.createdAt.toISOString(),
    updatedAt: reminder.updatedAt.toISOString(),
  };
}

async function requireOwnedReminder(vehicleId: string, reminderId: string, userId: string) {
  return db.vehicleReminder.findFirst({
    where: {
      id: reminderId,
      vehicleId,
      userId,
      vehicle: { userId },
    },
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; reminderId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, reminderId } = await params;
    const existing = await requireOwnedReminder(id, reminderId, session.user.id);
    if (!existing) {
      return NextResponse.json({ error: "Recordatorio no encontrado" }, { status: 404 });
    }

    const body = await validateBody(req, vehicleReminderUpdateSchema);
    if (body.isActive === false && existing.repeatIntervalKm && existing.dueKm) {
      const completedKm = body.completedKm ?? existing.dueKm;
      const nextDueKm = completedKm + existing.repeatIntervalKm;
      const [completed, nextReminder] = await db.$transaction([
        db.vehicleReminder.update({
          where: { id: reminderId },
          data: {
            isActive: false,
            completedAt: body.completedAt ? new Date(body.completedAt) : new Date(),
            completedKm,
          },
        }),
        db.vehicleReminder.create({
          data: {
            userId: existing.userId,
            vehicleId: existing.vehicleId,
            title: existing.title,
            description: existing.description,
            category: existing.category,
            triggerMode: existing.triggerMode,
            dueDate: existing.dueDate,
            dueKm: nextDueKm,
            warningDays: existing.warningDays,
            warningKm: existing.warningKm,
            repeatIntervalDays: existing.repeatIntervalDays,
            repeatIntervalKm: existing.repeatIntervalKm,
            isActive: true,
          },
        }),
      ]);

      return NextResponse.json({
        completed: serializeReminder(completed),
        next: serializeReminder(nextReminder),
      });
    }

    const reminder = await db.vehicleReminder.update({
      where: { id: reminderId },
      data: {
        ...(body.title !== undefined && { title: body.title.trim() }),
        ...(body.description !== undefined && { description: body.description?.trim() || null }),
        ...(body.category !== undefined && { category: body.category }),
        ...(body.triggerMode !== undefined && { triggerMode: body.triggerMode }),
        ...(body.dueDate !== undefined && { dueDate: body.dueDate ? new Date(body.dueDate) : null }),
        ...(body.dueKm !== undefined && { dueKm: body.dueKm }),
        ...(body.warningDays !== undefined && { warningDays: body.warningDays }),
        ...(body.warningKm !== undefined && { warningKm: body.warningKm }),
        ...(body.repeatIntervalDays !== undefined && { repeatIntervalDays: body.repeatIntervalDays }),
        ...(body.repeatIntervalKm !== undefined && { repeatIntervalKm: body.repeatIntervalKm }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.completedAt !== undefined && { completedAt: body.completedAt ? new Date(body.completedAt) : null }),
        ...(body.completedKm !== undefined && { completedKm: body.completedKm }),
      },
    });

    return NextResponse.json(serializeReminder(reminder));
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update vehicle reminder error:", error);
    return NextResponse.json({ error: "Error al actualizar recordatorio" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; reminderId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id, reminderId } = await params;
    const existing = await requireOwnedReminder(id, reminderId, session.user.id);
    if (!existing) {
      return NextResponse.json({ error: "Recordatorio no encontrado" }, { status: 404 });
    }

    await db.vehicleReminder.delete({ where: { id: reminderId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete vehicle reminder error:", error);
    return NextResponse.json({ error: "Error al eliminar recordatorio" }, { status: 500 });
  }
}
