import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyEntityMutationAccess } from "@/lib/auth-guards";
import { validateBody, recurringCreateSchema } from "@/lib/validations";
import type { Prisma } from "@prisma/client";

type DestinationAccount =
  | Prisma.AccountGetPayload<{
      select: { id: true; name: true; type: true; color: true; balance: true };
    }>
  | null;

function normalizeSubAccountId(value: string | null | undefined) {
  return value && value !== "none" && value !== "__none__" ? value : null;
}

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
        savingsGoal: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
      },
      orderBy: { scheduledDate: "asc" },
    });

    // Manually resolve destination accounts for any transfer-type payments
    const enriched = await Promise.all(
      recurringPayments.map(async (payment) => {
        let destinationAccount: DestinationAccount = null;
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
      destinationSubAccountId: rawDestinationSubAccountId,
      category,
      subCategory,
      scheduledDate,
      frequency,
      notes,
      isRecurring,
    } = body;
    const sourceSubAccountId = normalizeSubAccountId(subAccountId);
    const destinationSubAccountId = normalizeSubAccountId(rawDestinationSubAccountId);

    if (!description || amount === undefined || !scheduledDate) {
      return NextResponse.json(
        { error: "Descripción, monto y fecha programada son requeridos" },
        { status: 400 }
      );
    }

    if (type === "transfer") {
      if (!accountId || !destinationAccountId) {
        return NextResponse.json(
          { error: "Cuenta origen y cuenta destino son requeridas" },
          { status: 400 }
        );
      }

      if (accountId === destinationAccountId && sourceSubAccountId === destinationSubAccountId) {
        return NextResponse.json(
          { error: "El origen y el destino de la transferencia recurrente no pueden ser el mismo lugar" },
          { status: 400 }
        );
      }
    }

    // Verify write access of all referenced entities. Accounts and sub-accounts
    // can be owned by the user or shared with editor access.
    const entitiesToVerify: { type: "account" | "subAccount" | "debt"; id: string }[] = [];
    if (accountId) entitiesToVerify.push({ type: "account", id: accountId });
    if (sourceSubAccountId) entitiesToVerify.push({ type: "subAccount", id: sourceSubAccountId });
    if (debtId) entitiesToVerify.push({ type: "debt", id: debtId });
    if (destinationAccountId) entitiesToVerify.push({ type: "account", id: destinationAccountId });
    if (destinationSubAccountId) entitiesToVerify.push({ type: "subAccount", id: destinationSubAccountId });

    const accessError = await verifyEntityMutationAccess(session.user.id, entitiesToVerify);
    if (accessError) return accessError;

    if (sourceSubAccountId) {
      const sourceSubAccount = await db.subAccount.findFirst({
        where: { id: sourceSubAccountId, accountId: accountId || "" },
      });
      if (!sourceSubAccount) {
        return NextResponse.json(
          { error: "El bolsillo origen no pertenece a la cuenta origen" },
          { status: 400 }
        );
      }
    }

    if (destinationSubAccountId) {
      const destinationSubAccount = await db.subAccount.findFirst({
        where: { id: destinationSubAccountId, accountId: destinationAccountId || "" },
      });
      if (!destinationSubAccount) {
        return NextResponse.json(
          { error: "El bolsillo destino no pertenece a la cuenta destino" },
          { status: 400 }
        );
      }
    }

    const recurringPayment = await db.recurringPayment.create({
      data: {
        userId: session.user.id,
        description,
        amount,
        type: type || "expense",
        accountId: accountId || null,
        subAccountId: sourceSubAccountId,
        debtId: debtId || null,
        destinationAccountId: destinationAccountId || null,
        destinationSubAccountId,
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
