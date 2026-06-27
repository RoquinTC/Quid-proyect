import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth-guards";

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAuth(req);
    if (error) return error;

    const { id } = await context.params;
    const body = await req.json();
    const {
      type,
      specialty,
      status,
      // El frontend puede enviar authorizationCode o code — aceptamos ambos
      authorizationCode,
      code,
      authorizationDate,
      // El frontend puede enviar issueDate como alias de authorizationDate
      issueDate,
      daysOfValidity,
      notes,
      supportUrl,
      supportType,
      appointmentId,
      isRenewal,
      newAuthorizationDate,
      newDaysOfValidity,
      renewalReason,
      appointmentDateToCheck,
      clearAuthorization,
      unlinkAppointment,
    } = body;

    // Resolver el código de autorización (campo DB: code)
    const resolvedCode = authorizationCode ?? code ?? undefined;
    // Resolver la fecha de autorización (campo DB: authorizationDate)
    const resolvedDateInput = authorizationDate ?? issueDate ?? undefined;

    // Obtener la autorización actual
    const existingAuth = await db.medicalAuthorization.findUnique({
      where: { id, userId: session.user.id },
    });

    if (!existingAuth) {
      return NextResponse.json({ error: "Autorización no encontrada" }, { status: 404 });
    }

    let updatedData: any = {};
    let warning: string | null = null;

    if (unlinkAppointment || clearAuthorization || status === "pending_authorization") {
      await db.medicalAppointment.updateMany({
        where: { userId: session.user.id, authorizationId: id },
        data: { authorizationId: null },
      });
    }

    // LÓGICA DE RENOVACIÓN / PRÓRROGA
    if (isRenewal) {
      const currentRenewals = Array.isArray(existingAuth.renewals)
        ? (existingAuth.renewals as any[])
        : [];

      const renewalLog = {
        authorizationCode: existingAuth.code,
        issueDate: existingAuth.authorizationDate,
        expirationDate: existingAuth.expirationDate,
        daysOfValidity: existingAuth.daysOfValidity,
        motivo: renewalReason || "Renovación",
        updatedAt: new Date().toISOString(),
      };

      const finalIssueDate = newAuthorizationDate
        ? new Date(newAuthorizationDate)
        : resolvedDateInput
        ? new Date(resolvedDateInput)
        : new Date();
      const finalDays = newDaysOfValidity
        ? Number(newDaysOfValidity)
        : daysOfValidity
        ? Number(daysOfValidity)
        : 30;
      const finalExpirationDate = new Date(
        finalIssueDate.getTime() + finalDays * 24 * 60 * 60 * 1000
      );

      updatedData = {
        code: resolvedCode ?? existingAuth.code,
        authorizationDate: finalIssueDate,
        daysOfValidity: finalDays,
        expirationDate: finalExpirationDate,
        status: "authorized",
        renewals: [...currentRenewals, renewalLog],
      };
    } else {
      // Edición / actualización regular
      if (type !== undefined) updatedData.type = type;
      if (specialty !== undefined) updatedData.specialty = specialty;
      if (status !== undefined) updatedData.status = status;
      if (resolvedCode !== undefined) updatedData.code = resolvedCode || null;
      if (notes !== undefined) updatedData.notes = notes || null;
      if (supportUrl !== undefined) updatedData.supportUrl = supportUrl || null;
      if (supportType !== undefined) updatedData.supportType = supportType || null;
      if (appointmentId !== undefined) updatedData.appointmentId = appointmentId || null;
      if (clearAuthorization) {
        updatedData.status = "pending_authorization";
        updatedData.code = null;
        updatedData.authorizationDate = null;
        updatedData.daysOfValidity = 30;
        updatedData.expirationDate = null;
        updatedData.appointmentId = null;
      }

      let currentAuthDate: Date | null = existingAuth.authorizationDate;
      let currentDays: number | null = existingAuth.daysOfValidity;

      if (resolvedDateInput !== undefined) {
        currentAuthDate = resolvedDateInput ? new Date(resolvedDateInput) : null;
        updatedData.authorizationDate = currentAuthDate;
      }
      if (daysOfValidity !== undefined) {
        currentDays = daysOfValidity ? Number(daysOfValidity) : null;
        updatedData.daysOfValidity = currentDays;
      }

      // Recalcular vencimiento
      if (currentAuthDate && currentDays) {
        updatedData.expirationDate = new Date(
          new Date(currentAuthDate).getTime() + currentDays * 24 * 60 * 60 * 1000
        );
      } else if (resolvedDateInput === null || daysOfValidity === null) {
        updatedData.expirationDate = null;
      }
    }

    // VALIDACIÓN DE VIGENCIA SI SE ESPECIFICA UNA FECHA DE CITA
    const targetExpiration =
      updatedData.expirationDate !== undefined
        ? updatedData.expirationDate
        : existingAuth.expirationDate;

    if (appointmentDateToCheck && targetExpiration) {
      const appDate = new Date(appointmentDateToCheck);
      const expDate = new Date(targetExpiration);

      const appDay = new Date(appDate.getFullYear(), appDate.getMonth(), appDate.getDate());
      const expDay = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());

      if (appDay > expDay) {
        warning = `Tu cita está programada para el ${appDay.toLocaleDateString("es-CO")}, pero la autorización se vence el ${expDay.toLocaleDateString("es-CO")} (¡Vencida!).`;
      } else if (appDay.getTime() === expDay.getTime()) {
        warning = `Tu cita coincide exactamente con el último día de vigencia de la autorización (${expDay.toLocaleDateString("es-CO")}).`;
      }
    }

    const updatedAuth = await db.medicalAuthorization.update({
      where: { id },
      data: updatedData,
      include: {
        appointment: true,
        originAppointment: true,
      },
    });

    return NextResponse.json({
      authorization: updatedAuth,
      warning,
    });
  } catch (error) {
    console.error("Update authorization error:", error);
    return NextResponse.json({ error: "Error al actualizar la autorización" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { session, error } = await requireAuth(req);
    if (error) return error;

    const { id } = await context.params;

    await db.medicalAuthorization.delete({
      where: { id, userId: session.user.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete authorization error:", error);
    return NextResponse.json({ error: "Error al eliminar la autorización" }, { status: 500 });
  }
}
