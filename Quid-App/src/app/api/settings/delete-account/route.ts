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

    // Delete ALL user data in correct FK order, then the User itself
    // 1. Savings module
    await db.savingsContribution.deleteMany({ where: { goal: { userId } } });
    await db.savingsGoalAccount.deleteMany({ where: { goal: { userId } } });
    await db.cDT.deleteMany({ where: { userId } });
    await db.savingsGoal.deleteMany({ where: { userId } });

    // 2. Debt module
    await db.abonoDetail.deleteMany({ where: { abono: { userId } } });
    await db.abono.deleteMany({ where: { userId } });
    await db.installment.deleteMany({ where: { debt: { userId } } });
    await db.debt.deleteMany({ where: { userId } });

    // 3. Payroll & recurring payments
    await db.recurringPayment.deleteMany({ where: { payrollGroup: { userId } } });
    await db.payrollGroup.deleteMany({ where: { userId } });
    await db.recurringPayment.deleteMany({ where: { userId } });

    // 4. Transactions
    await db.transaction.deleteMany({ where: { userId } });

    // 5. Budgets
    await db.budget.deleteMany({ where: { userId } });

    // 6. Transport module
    await db.fuelLog.deleteMany({ where: { vehicle: { userId } } });
    await db.maintenanceRecord.deleteMany({ where: { vehicle: { userId } } });
    await db.fuelPrice.deleteMany({ where: { userId } });
    await db.vehicle.deleteMany({ where: { userId } });

    // 7. Health module
    await db.medication.deleteMany({ where: { userId } });
    await db.medicalAppointment.deleteMany({ where: { userId } });
    await db.healthProfile.deleteMany({ where: { userId } });

    // 8. Pantry module
    await db.shoppingListItem.deleteMany({ where: { shoppingList: { userId } } });
    await db.shoppingList.deleteMany({ where: { userId } });
    await db.pantryItem.deleteMany({ where: { userId } });

    // 9. Account structure
    await db.yieldRecord.deleteMany({ where: { account: { userId } } });
    await db.sharedAccountUser.deleteMany({ where: { account: { userId } } });
    await db.savingsGoalAccount.deleteMany({ where: { account: { userId } } });
    await db.subAccount.deleteMany({ where: { account: { userId } } });
    await db.account.deleteMany({ where: { userId } });

    // 10. User settings
    await db.userSettings.deleteMany({ where: { userId } });

    // 11. Delete the User record itself
    await db.user.delete({ where: { id: userId } });

    return NextResponse.json({ success: true, message: "Cuenta eliminada permanentemente" });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json({ error: "Error al eliminar la cuenta" }, { status: 500 });
  }
}
