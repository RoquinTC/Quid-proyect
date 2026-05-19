import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyEntityOwnership } from "@/lib/auth-guards";
import { validateBody, recurringCreateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const recurringPayments = await db.recurringPayment.findMany({
      where: { userId: session.user.id },
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
      },
      orderBy: { scheduledDate: "asc" },
    });

    // Manually resolve destination accounts for any transfer-type payments
    const enriched = await Promise.all(
      recurringPayments.map(async (payment) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let destinationAccount: any = null;
        if (payment.destinationAccountId) {
          const acc = await db.account.findUnique({
            where: { id: payment.destinationAccountId },
            select: { id: true, name: true, type: true, color: true, balance: true },
          });
          destinationAccount = acc;
        }
        return { ...payment, destinationAccount };
      })
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error("Get recurring payments error:", error);
    return NextResponse.json(
      { error: "Error al obtener pagos recurrentes" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let body;
    try {
      body = await validateBody(req, recurringCreateSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const {
      description,
      amount,
      type,
      accountId,
      subAccountId,
      debtId,
      destinationAccountId,
      destinationSubAccountId,
      category,
      subCategory,
      scheduledDate,
      frequency,
      notes,
      isRecurring,
    } = body;

    if (!description || amount === undefined || !scheduledDate) {
      return NextResponse.json(
        { error: "Descripción, monto y fecha programada son requeridos" },
        { status: 400 }
      );
    }

    // Verify ownership of all referenced entities
    const entitiesToVerify: { type: "account" | "subAccount" | "debt"; id: string }[] = [];
    if (accountId) entitiesToVerify.push({ type: "account", id: accountId });
    if (subAccountId) entitiesToVerify.push({ type: "subAccount", id: subAccountId });
    if (debtId) entitiesToVerify.push({ type: "debt", id: debtId });
    if (destinationAccountId) entitiesToVerify.push({ type: "account", id: destinationAccountId });
    if (destinationSubAccountId) entitiesToVerify.push({ type: "subAccount", id: destinationSubAccountId });

    const ownershipError = await verifyEntityOwnership(session.user.id, entitiesToVerify);
    if (ownershipError) return ownershipError;

    const recurringPayment = await db.recurringPayment.create({
      data: {
        userId: session.user.id,
        description,
        amount,
        type: type || "expense",
        accountId: accountId || null,
        subAccountId: subAccountId || null,
        debtId: debtId || null,
        destinationAccountId: destinationAccountId || null,
        destinationSubAccountId: destinationSubAccountId || null,
        category: category || null,
        subCategory: subCategory || null,
        scheduledDate: new Date(scheduledDate),
        frequency: frequency || "monthly",
        notes: notes || null,
        isRecurring: isRecurring !== undefined ? isRecurring : true,
        status: "pending",
      },
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
      },
    });

    return NextResponse.json(recurringPayment, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Create recurring payment error:", error);
    return NextResponse.json(
      { error: "Error al crear pago recurrente" },
      { status: 500 }
    );
  }
}
