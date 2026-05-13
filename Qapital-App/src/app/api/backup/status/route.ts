import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * GET /api/backup/status
 * Returns whether the user has any data in their database.
 * Used by the auto-restore feature to detect empty DB after login.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Check key tables — if any has data, the DB is not empty
    const [accounts, transactions, budgets, debts, savingsGoals, vehicles, medications, pantryItems] =
      await Promise.all([
        db.account.count({ where: { userId } }),
        db.transaction.count({ where: { userId } }),
        db.budget.count({ where: { userId } }),
        db.debt.count({ where: { userId } }),
        db.savingsGoal.count({ where: { userId } }),
        db.vehicle.count({ where: { userId } }),
        db.medication.count({ where: { userId } }),
        db.pantryItem.count({ where: { userId } }),
      ]);

    const totalRecords =
      accounts + transactions + budgets + debts + savingsGoals + vehicles + medications + pantryItems;

    return NextResponse.json({
      hasData: totalRecords > 0,
      totalRecords,
      breakdown: {
        accounts,
        transactions,
        budgets,
        debts,
        savingsGoals,
        vehicles,
        medications,
        pantryItems,
      },
    });
  } catch (error) {
    console.error("Backup status error:", error);
    return NextResponse.json({ error: "Error al verificar estado" }, { status: 500 });
  }
}
