import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, recurringUpdateSchema } from "@/lib/validations";
import { verifyEntityMutationAccess } from "@/lib/auth-guards";

function normalizeSubAccountId(value: string | null | undefined) {
  return value && value !== "none" && value !== "__none__" ? value : null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const recurringPayment = await db.recurringPayment.findFirst({
      where: { id, userId: session.user.id },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
          },
        },
        subAccount: {
          select: {
            id: true,
            name: true,
          },
        },
        debt: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            currentBalance: true,
          },
        },
        destinationAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
          },
        },
      },
    });

    if (!recurringPayment) {
      return NextResponse.json(
        { error: "Pago recurrente no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(recurringPayment);
  } catch (error) {
    console.error("Get recurring payment error:", error);
    return NextResponse.json(
      { error: "Error al obtener pago recurrente" },
      { status: 500 }
    );
  }
}

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
      body = await validateBody(req, recurringUpdateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const scope = body.scope || "single"; // "single" or "series"

    const existing = await db.recurringPayment.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Pago recurrente no encontrado" },
        { status: 404 }
      );
    }

    const nextType = body.type ?? existing.type;
    const nextAccountId = body.accountId !== undefined ? body.accountId : existing.accountId;
    const nextSubAccountId = body.subAccountId !== undefined
      ? normalizeSubAccountId(body.subAccountId)
      : normalizeSubAccountId(existing.subAccountId);
    const nextDestinationAccountId = body.destinationAccountId !== undefined
      ? body.destinationAccountId
      : existing.destinationAccountId;
    const nextDestinationSubAccountId = body.destinationSubAccountId !== undefined
      ? normalizeSubAccountId(body.destinationSubAccountId)
      : normalizeSubAccountId(existing.destinationSubAccountId);

    if (nextType === "transfer") {
      if (!nextAccountId || !nextDestinationAccountId) {
        return NextResponse.json(
          { error: "Cuenta origen y cuenta destino son requeridas" },
          { status: 400 }
        );
      }

      if (nextAccountId === nextDestinationAccountId && nextSubAccountId === nextDestinationSubAccountId) {
        return NextResponse.json(
          { error: "El origen y el destino de la transferencia recurrente no pueden ser el mismo lugar" },
          { status: 400 }
        );
      }
    }

    const entitiesToVerify: { type: "account" | "subAccount" | "debt"; id: string }[] = [];
    if (body.accountId) entitiesToVerify.push({ type: "account", id: body.accountId });
    if (nextSubAccountId) entitiesToVerify.push({ type: "subAccount", id: nextSubAccountId });
    if (body.debtId) entitiesToVerify.push({ type: "debt", id: body.debtId });
    if (body.destinationAccountId) entitiesToVerify.push({ type: "account", id: body.destinationAccountId });
    if (nextDestinationSubAccountId) entitiesToVerify.push({ type: "subAccount", id: nextDestinationSubAccountId });

    const accessError = await verifyEntityMutationAccess(session.user.id, entitiesToVerify);
    if (accessError) return accessError;

    if (nextSubAccountId) {
      const sourceSubAccount = await db.subAccount.findFirst({
        where: { id: nextSubAccountId, accountId: nextAccountId || "" },
      });
      if (!sourceSubAccount) {
        return NextResponse.json(
          { error: "El bolsillo origen no pertenece a la cuenta origen" },
          { status: 400 }
        );
      }
    }

    if (nextDestinationSubAccountId) {
      const destinationSubAccount = await db.subAccount.findFirst({
        where: { id: nextDestinationSubAccountId, accountId: nextDestinationAccountId || "" },
      });
      if (!destinationSubAccount) {
        return NextResponse.json(
          { error: "El bolsillo destino no pertenece a la cuenta destino" },
          { status: 400 }
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.description !== undefined) updateData.description = body.description;
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.actualAmount !== undefined) updateData.actualAmount = body.actualAmount;
    if (body.type !== undefined) updateData.type = body.type;
    if (body.accountId !== undefined) updateData.accountId = body.accountId || null;
    if (body.subAccountId !== undefined) updateData.subAccountId = nextSubAccountId;
    if (body.debtId !== undefined) updateData.debtId = body.debtId || null;
    if (body.destinationAccountId !== undefined) updateData.destinationAccountId = body.destinationAccountId || null;
    if (body.destinationSubAccountId !== undefined) updateData.destinationSubAccountId = nextDestinationSubAccountId;
    if (body.category !== undefined) updateData.category = body.category || null;
    if (body.subCategory !== undefined) updateData.subCategory = body.subCategory || null;
    if (body.scheduledDate !== undefined) updateData.scheduledDate = new Date(body.scheduledDate);
    if (body.confirmedDate !== undefined) updateData.confirmedDate = body.confirmedDate ? new Date(body.confirmedDate) : null;
    if (body.status !== undefined) updateData.status = body.status;
    if (body.frequency !== undefined) updateData.frequency = body.frequency;
    if (body.notes !== undefined) updateData.notes = body.notes || null;
    if (body.isRecurring !== undefined) updateData.isRecurring = body.isRecurring;

    // Update this payment
    const recurringPayment = await db.recurringPayment.update({
      where: { id },
      data: updateData,
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
          },
        },
        subAccount: {
          select: {
            id: true,
            name: true,
          },
        },
        debt: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            currentBalance: true,
          },
        },
        destinationAccount: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
          },
        },
      },
    });

    // If scope is "series", apply the same changes to all future pending payments
    // in the same payroll group or with the same recurring pattern
    if (scope === "series" && existing.status === "pending") {
      const seriesUpdateData: Record<string, unknown> = {};
      // Only carry over fields that make sense for a series update
      if (body.description !== undefined) seriesUpdateData.description = body.description;
      if (body.amount !== undefined) seriesUpdateData.amount = body.amount;
      if (body.accountId !== undefined) seriesUpdateData.accountId = body.accountId || null;
      if (body.subAccountId !== undefined) seriesUpdateData.subAccountId = nextSubAccountId;
      if (body.category !== undefined) seriesUpdateData.category = body.category || null;
      if (body.subCategory !== undefined) seriesUpdateData.subCategory = body.subCategory || null;

      // F-28 · La definición también cambia: si no, la próxima ocurrencia nacería
      // con los datos viejos de la serie.
      if (existing.seriesId && Object.keys(seriesUpdateData).length > 0) {
        await db.recurringSeries.updateMany({
          where: { id: existing.seriesId },
          data: seriesUpdateData,
        });
      }

      if (Object.keys(seriesUpdateData).length > 0) {
        if (existing.seriesId) {
          // Camino principal: identidad real de la serie.
          await db.recurringPayment.updateMany({
            where: {
              seriesId: existing.seriesId,
              status: "pending",
              id: { not: id },
              scheduledDate: { gte: existing.scheduledDate },
            },
            data: seriesUpdateData,
          });
        } else if (existing.payrollGroupId) {
          // Ocurrencias antiguas de nómina (sin seriesId).
          await db.recurringPayment.updateMany({
            where: {
              payrollGroupId: existing.payrollGroupId,
              status: "pending",
              id: { not: id },
              scheduledDate: { gte: existing.scheduledDate },
            },
            data: seriesUpdateData,
          });
        } else {
          // Sin seriesId: no se propaga a otras filas. Se eliminó el emparejado
          // por descripción para no modificar pagos distintos con el mismo nombre.
        }
      }
    }

    return NextResponse.json(recurringPayment);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update recurring payment error:", error);
    return NextResponse.json(
      { error: "Error al actualizar pago recurrente" },
      { status: 500 }
    );
  }
}

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
    // Parse scope from URL search params: ?scope=single or ?scope=series
    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") || "single";

    const existing = await db.recurringPayment.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Pago recurrente no encontrado" },
        { status: 404 }
      );
    }

    // F-29 · Se CANCELA en vez de borrar.
    // Borrar físicamente hacía que la regeneración de nómina/metas resucitara
    // la ocurrencia al editar el grupo. Con `cancelled` queda memoria del
    // borrado (ver lib/recurring/regeneration.ts) y la fila desaparece de la UI.
    await db.recurringPayment.update({
      where: { id },
      data: { status: "cancelled" },
    });

    // If scope is "series", also delete all future pending payments of the SAME SERIES
    let deletedCount = 1;
    if (scope === "series" && existing.status === "pending") {
      // Camino principal: identidad real de la serie. No depende del texto, así
      // que dos pagos distintos con la misma descripción ya no se afectan.
      //
      // Sin seriesId (ocurrencias antiguas) la fila ES su propia serie: no se
      // propaga a nada. Antes se emparejaba por descripción + tipo + frecuencia,
      // lo que borraba otros pagos con el mismo nombre. Se eliminó esa heurística
      // a propósito: es preferible borrar de menos que borrar de más.
      const whereClause: Record<string, unknown> | null = existing.seriesId
        ? {
            seriesId: existing.seriesId,
            status: "pending",
            scheduledDate: { gte: existing.scheduledDate },
          }
        : existing.payrollGroupId
          ? {
              payrollGroupId: existing.payrollGroupId,
              status: "pending",
              scheduledDate: { gte: existing.scheduledDate },
            }
          : null;

      // F-28 · La serie queda inactiva: deja de generar ocurrencias y se puede
      // distinguir de una serie eliminada por error.
      if (existing.seriesId) {
        await db.recurringSeries.updateMany({
          where: { id: existing.seriesId },
          data: { active: false },
        });
      }

      if (whereClause) {
        const result = await db.recurringPayment.updateMany({
          where: whereClause as any,
          data: { status: "cancelled" },
        });
        deletedCount += result.count;
      }
    }

    return NextResponse.json({ success: true, deletedCount, cancelled: true });
  } catch (error) {
    console.error("Delete recurring payment error:", error);
    return NextResponse.json(
      { error: "Error al eliminar pago recurrente" },
      { status: 500 }
    );
  }
}
