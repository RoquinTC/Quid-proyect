import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { reverseHealthFinanceEntry } from "@/lib/health-finance";
import { toNumber } from "@/lib/decimal-serializer";

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
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const appointment = await db.medicalAppointment.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!appointment) {
      return NextResponse.json({ error: "Cita no encontrada" }, { status: 404 });
    }

    const previousPayment = {
      accountId: appointment.accountId,
      subAccountId: appointment.subAccountId,
      debtId: appointment.debtId,
    };

    await reverseHealthFinanceEntry(id, session.user.id);

    const updated = await db.medicalAppointment.update({
      where: { id },
      data: {
        status: "scheduled",
        copayAmount: null,
        accountId: null,
        subAccountId: null,
        debtId: null,
        financeSourceId: null,
      },
    });

    const syncPayload = await getFinanceSyncPayload(previousPayment);

    return NextResponse.json({
      ...updated,
      updatedBalances: syncPayload.updatedBalances,
      updatedDebts: syncPayload.updatedDebts,
    });
  } catch (error) {
    console.error("Reverse appointment completion error:", error);
    return NextResponse.json({ error: "Error al reversar cita" }, { status: 500 });
  }
}
