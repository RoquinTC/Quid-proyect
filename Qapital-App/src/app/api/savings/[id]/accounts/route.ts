import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow, getColombiaTodayString, createColombiaDate } from "@/lib/api";
import { Prisma } from "@prisma/client";
import { syncSavingsBudget } from "@/lib/savings-budget-sync";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, savingsLinkAccountSchema } from "@/lib/validations";

// GET: Get linked accounts for a savings goal
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

    // Verify goal ownership
    const goal = await db.savingsGoal.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!goal) {
      return NextResponse.json({ error: "Meta de ahorro no encontrada" }, { status: 404 });
    }

    const linkedAccounts = await db.savingsGoalAccount.findMany({
      where: { goalId: id },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            type: true,
            color: true,
            balance: true,
            subAccounts: { orderBy: { order: "asc" } },
          },
        },
        subAccount: {
          select: { id: true, name: true, balance: true, color: true },
        },
      },
    });

    return NextResponse.json(linkedAccounts);
  } catch (error) {
    console.error("Get linked accounts error:", error);
    return NextResponse.json({ error: "Error al obtener cuentas vinculadas" }, { status: 500 });
  }
}

// POST: Link an account/subaccount to a savings goal
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
    const body = await validateBody(req, savingsLinkAccountSchema);
    const { accountId, subAccountId } = body;

    // Verify goal ownership
    const goal = await db.savingsGoal.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!goal) {
      return NextResponse.json({ error: "Meta de ahorro no encontrada" }, { status: 404 });
    }

    // Validate account belongs to user
    const account = await db.account.findFirst({
      where: { id: accountId, userId: session.user.id },
    });

    if (!account) {
      return NextResponse.json({ error: "Cuenta no encontrada" }, { status: 400 });
    }

    // Validate subAccount if provided
    if (subAccountId) {
      const subAccount = await db.subAccount.findFirst({
        where: { id: subAccountId, accountId },
      });
      if (!subAccount) {
        return NextResponse.json({ error: "Subcuenta no encontrada o no pertenece a la cuenta" }, { status: 400 });
      }
    }

    // Determine the balance to add
    let linkedBalance = 0;
    let linkedName = "";

    if (subAccountId) {
      const subAccount = await db.subAccount.findUnique({ where: { id: subAccountId } });
      linkedBalance = toNumber(subAccount?.balance || 0);
      linkedName = subAccount?.name || "subcuenta";
    } else {
      linkedBalance = toNumber(account.balance);
      linkedName = account.name;
    }

    // Use a transaction for atomicity
    const result = await db.$transaction(async (tx) => {
      // Create the SavingsGoalAccount link
      const link = await tx.savingsGoalAccount.create({
        data: {
          goalId: id,
          accountId,
          subAccountId: subAccountId || null,
        },
        include: {
          account: {
            select: {
              id: true,
              name: true,
              type: true,
              color: true,
              balance: true,
              subAccounts: { orderBy: { order: "asc" } },
            },
          },
          subAccount: {
            select: { id: true, name: true, balance: true, color: true },
          },
        },
      });

      // Increment goal.currentAmount by the linked balance
      if (linkedBalance > 0) {
        await tx.savingsGoal.update({
          where: { id },
          data: { currentAmount: { increment: linkedBalance } },
        });

        // Create a SavingsContribution
        await tx.savingsContribution.create({
          data: {
            goalId: id,
            amount: linkedBalance,
            date: createColombiaDate(getColombiaTodayString()),
            description: `Saldo de ${linkedName} al vincular`,
            accountId,
          },
        });
      }

      return link;
    });

    // Sync savings budget (current amount changed)
    await syncSavingsBudget(session.user.id);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    // Handle unique constraint P2002 for duplicate links
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Esta cuenta ya está vinculada a esta meta" },
        { status: 409 }
      );
    }
    console.error("Link account error:", error);
    return NextResponse.json({ error: "Error al vincular cuenta" }, { status: 500 });
  }
}

// DELETE: Unlink an account from a savings goal
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
    const { searchParams } = new URL(req.url);
    const linkId = searchParams.get("linkId");

    if (!linkId) {
      return NextResponse.json({ error: "El linkId es requerido" }, { status: 400 });
    }

    // Verify goal ownership
    const goal = await db.savingsGoal.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!goal) {
      return NextResponse.json({ error: "Meta de ahorro no encontrada" }, { status: 404 });
    }

    // Find and verify the link
    const link = await db.savingsGoalAccount.findFirst({
      where: { id: linkId, goalId: id },
      include: {
        account: true,
        subAccount: true,
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Vínculo no encontrado" }, { status: 404 });
    }

    // Determine the balance to subtract
    let linkedBalance = 0;
    let unlinkName = "";

    if (link.subAccountId && link.subAccount) {
      linkedBalance = toNumber(link.subAccount.balance);
      unlinkName = link.subAccount.name;
    } else {
      linkedBalance = toNumber(link.account.balance);
      unlinkName = link.account.name;
    }

    // Use a transaction for atomicity
    await db.$transaction(async (tx) => {
      // Delete the link
      await tx.savingsGoalAccount.delete({
        where: { id: linkId },
      });

      // Decrement goal.currentAmount by the linked balance, min 0
      if (linkedBalance > 0) {
        const currentAmount = toNumber(goal.currentAmount);
        const newAmount = Math.max(currentAmount - linkedBalance, 0);
        await tx.savingsGoal.update({
          where: { id },
          data: { currentAmount: newAmount },
        });

        // Create a negative SavingsContribution
        await tx.savingsContribution.create({
          data: {
            goalId: id,
            amount: -linkedBalance,
            date: createColombiaDate(getColombiaTodayString()),
            description: `Desvinculación de ${unlinkName} — reversa de saldo`,
            accountId: link.accountId,
          },
        });
      }
    });

    // Sync savings budget (current amount changed)
    await syncSavingsBudget(session.user.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Unlink account error:", error);
    return NextResponse.json({ error: "Error al desvincular cuenta" }, { status: 500 });
  }
}
