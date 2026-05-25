import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createHealthFinanceEntry, reverseHealthFinanceEntry } from "@/lib/health-finance";
import { toNumber } from "@/lib/decimal-serializer";

type CompleteAppointmentPayload = {
  copayAmount?: number | null;
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
  createOrder?: {
    title: string;
    orderNumber?: string | null;
    nextClaimDate?: string | null;
    notes?: string | null;
    items?: Array<{ name: string; prescribedQty: number; unit?: string | null }>;
  };
  createFollowUp?: {
    specialty: string;
    doctorName?: string | null;
    date: string;
    location?: string | null;
  };
  createAuthorization?: {
    type: string;
    specialty: string;
    notes?: string | null;
  };
};

async function getFinanceSyncPayload(params: {
  accountId?: string | null;
  subAccountId?: string | null;
  debtId?: string | null;
}) {
  const updatedBalances: Array<{ id: string; name: string; balance: number; isSubAccount: boolean }> = [];
  const updatedDebts: Array<{ id: string; name: string; currentBalance: number }> = [];

  if (params.subAccountId) {
    const sub = await db.subAccount.findUnique({
      where: { id: params.subAccountId },
      select: { id: true, name: true, balance: true, account: { select: { name: true } } },
    });
    if (sub) {
      updatedBalances.push({
        id: sub.id,
        name: `${sub.account.name} → ${sub.name}`,
        balance: toNumber(sub.balance),
        isSubAccount: true,
      });
    }
  } else if (params.accountId) {
    const account = await db.account.findUnique({
      where: { id: params.accountId },
      select: { id: true, name: true, balance: true },
    });
    if (account) {
      updatedBalances.push({
        id: account.id,
        name: account.name,
        balance: toNumber(account.balance),
        isSubAccount: false,
      });
    }
  }

  if (params.debtId) {
    const debt = await db.debt.findUnique({
      where: { id: params.debtId },
      select: { id: true, name: true, currentBalance: true },
    });
    if (debt) {
      updatedDebts.push({
        id: debt.id,
        name: debt.name,
        currentBalance: toNumber(debt.currentBalance),
      });
    }
  }

  return { updatedBalances, updatedDebts };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = (await req.json()) as CompleteAppointmentPayload;

    const appointment = await db.medicalAppointment.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!appointment) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }

    const copayAmount = Number(body.copayAmount || 0);
    const hasCopay = copayAmount > 0;
    if (hasCopay && !body.accountId && !body.debtId) {
      return NextResponse.json({ error: "Selecciona una cuenta o tarjeta para el copago" }, { status: 400 });
    }

    if (appointment.status === "completed") {
      await reverseHealthFinanceEntry(id, session.user.id);
    }

    const updateData: Record<string, unknown> = {
      status: "completed",
      copayAmount: hasCopay ? copayAmount : null,
      accountId: hasCopay ? body.accountId || null : null,
      subAccountId: hasCopay ? body.subAccountId || null : null,
      debtId: hasCopay ? body.debtId || null : null,
      financeSourceId: null,
    };

    let financeSourceId: string | null = null;
    if (hasCopay) {
      const desc = `Copago Cita Médica: ${appointment.specialty || "General"}${appointment.doctorName ? ` (Dr. ${appointment.doctorName})` : ""}`;
      const financeRes = await createHealthFinanceEntry({
        userId: session.user.id,
        appointmentId: id,
        amount: copayAmount,
        description: desc,
        date: appointment.date,
        accountId: body.accountId || null,
        subAccountId: body.subAccountId || null,
        debtId: body.debtId || null,
      });
      financeSourceId = financeRes?.id || null;
      updateData.financeSourceId = financeSourceId;
    }

    const completedAppointment = await db.medicalAppointment.update({
      where: { id },
      data: updateData,
    });

    const created: Record<string, unknown> = {};

    if (body.createOrder?.title) {
      const items = body.createOrder.items || [];
      const order = await db.medicalOrder.create({
        data: {
          userId: session.user.id,
          appointmentId: id,
          title: body.createOrder.title,
          orderNumber: body.createOrder.orderNumber || null,
          nextClaimDate: body.createOrder.nextClaimDate ? new Date(body.createOrder.nextClaimDate) : null,
          notes: body.createOrder.notes || null,
          status: "pending",
          items: items.length > 0
            ? {
                create: items
                  .filter((item) => item.name?.trim())
                  .map((item) => ({
                    name: item.name.trim(),
                    prescribedQty: Number(item.prescribedQty) || 1,
                    deliveredQty: 0,
                    pendingQty: Number(item.prescribedQty) || 1,
                    unit: item.unit || "unit",
                  })),
              }
            : undefined,
        },
        include: { items: true },
      });
      created.order = order;
    }

    if (body.createFollowUp?.date) {
      created.followUp = await db.medicalAppointment.create({
        data: {
          userId: session.user.id,
          specialty: body.createFollowUp.specialty || "Control Médico",
          doctorName: body.createFollowUp.doctorName || null,
          date: new Date(body.createFollowUp.date),
          location: body.createFollowUp.location || null,
          reminderEnabled: true,
          status: "scheduled",
        },
      });
    }

    if (body.createAuthorization?.specialty) {
      created.authorization = await db.medicalAuthorization.create({
        data: {
          userId: session.user.id,
          originAppointmentId: id,
          type: body.createAuthorization.type || "specialist",
          specialty: body.createAuthorization.specialty,
          status: "pending_authorization",
          notes: body.createAuthorization.notes || null,
          renewals: [],
        },
      });
    }

    const syncPayload = await getFinanceSyncPayload({
      accountId: body.accountId,
      subAccountId: body.subAccountId,
      debtId: body.debtId,
    });

    return NextResponse.json({
      ...completedAppointment,
      created,
      updatedBalances: syncPayload.updatedBalances,
      updatedDebts: syncPayload.updatedDebts,
    });
  } catch (error) {
    console.error("Complete appointment error:", error);
    return NextResponse.json({ error: "Error al completar cita" }, { status: 500 });
  }
}
