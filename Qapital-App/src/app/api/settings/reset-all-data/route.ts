import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Delete all finance data for this user (order matters due to foreign keys)
    // Wrapped in transaction for atomicity — if any step fails, nothing is deleted
    await db.$transaction(async (tx) => {
      // Savings & CDTs (depends on contributions, goal accounts)
      await tx.savingsContribution.deleteMany({ where: { goal: { userId } } });
      await tx.savingsGoalAccount.deleteMany({ where: { goal: { userId } } });
      await tx.savingsGoal.deleteMany({ where: { userId } });
      await tx.cDT.deleteMany({ where: { userId } });

      // Debts — must delete abono details, abonos, installments before debts
      await tx.abonoDetail.deleteMany({ where: { abono: { debt: { userId } } } });
      await tx.abono.deleteMany({ where: { debt: { userId } } });
      await tx.installment.deleteMany({ where: { debt: { userId } } });
      await tx.recurringPayment.deleteMany({ where: { userId } });
      await tx.payrollGroup.deleteMany({ where: { userId } });
      await tx.debt.deleteMany({ where: { userId } });

      // Transactions & budgets
      await tx.transaction.deleteMany({ where: { userId } });
      await tx.budget.deleteMany({ where: { userId } });

      // Yield records
      await tx.yieldRecord.deleteMany({ where: { account: { userId } } });

      // Shared accounts & sub-accounts (before accounts)
      await tx.sharedAccountUser.deleteMany({ where: { account: { userId } } });
      await tx.subAccount.deleteMany({ where: { account: { userId } } });

      // Accounts (must be last — many things depend on it)
      await tx.account.deleteMany({ where: { userId } });
    });

    return NextResponse.json({ success: true, message: "Todos los datos financieros han sido eliminados" });
  } catch (error) {
    console.error("Reset all data error:", error);
    return NextResponse.json({ error: "Error al eliminar los datos" }, { status: 500 });
  }
}
