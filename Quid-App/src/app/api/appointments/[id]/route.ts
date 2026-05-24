import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, appointmentUpdateSchema } from "@/lib/validations";
import { createHealthFinanceEntry, reverseHealthFinanceEntry } from "@/lib/health-finance";

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
    let body;
    try {
      body = await validateBody(req, appointmentUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }

    const existing = await db.medicalAppointment.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }

    const updateData: Record<string, any> = {};
    if (body.doctorName !== undefined) updateData.doctorName = body.doctorName;
    if (body.specialty !== undefined) updateData.specialty = body.specialty;
    if (body.location !== undefined) updateData.location = body.location;
    if (body.date !== undefined) updateData.date = new Date(body.date);
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.reminderEnabled !== undefined) updateData.reminderEnabled = body.reminderEnabled;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.copayAmount !== undefined) updateData.copayAmount = body.copayAmount;
    if (body.accountId !== undefined) updateData.accountId = body.accountId;
    if (body.subAccountId !== undefined) updateData.subAccountId = body.subAccountId;
    if (body.debtId !== undefined) updateData.debtId = body.debtId;

    // Lógica de Integración Financiera para Copagos
    const status = body.status !== undefined ? body.status : existing.status;
    const copayAmount = body.copayAmount !== undefined ? body.copayAmount : (existing.copayAmount ? Number(existing.copayAmount) : null);
    const accountId = body.accountId !== undefined ? body.accountId : existing.accountId;
    const subAccountId = body.subAccountId !== undefined ? body.subAccountId : existing.subAccountId;
    const debtId = body.debtId !== undefined ? body.debtId : existing.debtId;

    const isCompleted = status === "completed";
    const wasCompleted = existing.status === "completed";

    const financialFieldChanged =
      body.copayAmount !== undefined ||
      body.accountId !== undefined ||
      body.subAccountId !== undefined ||
      body.debtId !== undefined ||
      body.date !== undefined ||
      body.specialty !== undefined ||
      body.doctorName !== undefined;

    if (wasCompleted && (!isCompleted || financialFieldChanged)) {
      // Revertir la transacción anterior antes de recrearla o si ya no está completada
      await reverseHealthFinanceEntry(id, session.user.id);
      updateData.financeSourceId = null;
    }

    if (isCompleted && (wasCompleted ? financialFieldChanged : true)) {
      // Crear nueva entrada financiera si es válida
      if (copayAmount && copayAmount > 0 && (accountId || debtId)) {
        const specialty = body.specialty !== undefined ? body.specialty : existing.specialty;
        const doctorName = body.doctorName !== undefined ? body.doctorName : existing.doctorName;
        const appointmentDate = body.date !== undefined ? new Date(body.date) : existing.date;
        const desc = `Copago Cita Médica: ${specialty || "General"}${doctorName ? ` (Dr. ${doctorName})` : ""}`;

        const financeRes = await createHealthFinanceEntry({
          userId: session.user.id,
          appointmentId: id,
          amount: copayAmount,
          description: desc,
          date: appointmentDate,
          accountId,
          subAccountId,
          debtId,
        });

        if (financeRes) {
          updateData.financeSourceId = financeRes.id;
        }
      }
    }

    const appointment = await db.medicalAppointment.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json(appointment);
  } catch (error) {
    console.error("Update appointment error:", error);
    return NextResponse.json({ error: "Error al actualizar cita" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.medicalAppointment.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }

    // Revertir y borrar cualquier copago o registro financiero antes de eliminar
    await reverseHealthFinanceEntry(id, session.user.id);

    await db.medicalAppointment.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete appointment error:", error);
    return NextResponse.json({ error: "Error al eliminar cita" }, { status: 500 });
  }
}
