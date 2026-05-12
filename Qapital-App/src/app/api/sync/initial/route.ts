import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeDecimals } from "@/lib/decimal-serializer";

/**
 * GET /api/sync/initial
 * Returns ALL data for the authenticated user — used for initial IndexedDB population.
 * This is called once when the app detects IndexedDB is empty.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch all user data in parallel
    const [
      accounts,
      subAccounts,
      transactions,
      budgets,
      debts,
      installments,
      abonos,
      abonoDetails,
      recurringPayments,
      payrollGroups,
      savingsGoals,
      savingsGoalAccounts,
      savingsContributions,
      cdts,
      yieldRecords,
      vehicles,
      fuelLogs,
      maintenanceRecords,
      fuelPrices,
      medications,
      appointments,
      pantryItems,
      shoppingLists,
      shoppingListItems,
      healthProfiles,
      userSettings,
      sharedAccountUsers,
    ] = await Promise.all([
      db.account.findMany({ where: { userId } }),
      db.subAccount.findMany({ where: { account: { userId } } }),
      db.transaction.findMany({ where: { userId } }),
      db.budget.findMany({ where: { userId } }),
      db.debt.findMany({ where: { userId }, include: { installments: true, abonos: { include: { details: true } } } }),
      db.installment.findMany({ where: { debt: { userId } } }),
      db.abono.findMany({ where: { userId }, include: { details: true } }),
      db.abonoDetail.findMany({ where: { abono: { userId } } }),
      db.recurringPayment.findMany({ where: { userId } }),
      db.payrollGroup.findMany({ where: { userId } }),
      db.savingsGoal.findMany({ where: { userId } }),
      db.savingsGoalAccount.findMany({ where: { goal: { userId } } }),
      db.savingsContribution.findMany({ where: { goal: { userId } } }),
      db.cDT.findMany({ where: { userId } }),
      db.yieldRecord.findMany({ where: { OR: [{ account: { userId } }, { subAccount: { account: { userId } } }] } }),
      db.vehicle.findMany({ where: { userId } }),
      db.fuelLog.findMany({ where: { vehicle: { userId } } }),
      db.maintenanceRecord.findMany({ where: { vehicle: { userId } } }),
      db.fuelPrice.findMany({ where: { userId } }),
      db.medication.findMany({ where: { userId } }),
      db.medicalAppointment.findMany({ where: { userId } }),
      db.pantryItem.findMany({ where: { userId } }),
      db.shoppingList.findMany({ where: { userId } }),
      db.shoppingListItem.findMany({ where: { shoppingList: { userId } } }),
      db.healthProfile.findMany({ where: { userId } }),
      db.userSettings.findUnique({ where: { userId } }),
      db.sharedAccountUser.findMany({ where: { account: { userId } } }),
    ]);

    // Serialize dates to ISO strings and Decimals to numbers for IndexedDB storage.
    // This is critical: without Decimal conversion, Prisma Decimal objects would be
    // stored as objects in IndexedDB and cause client-side errors when the app tries
    // to read them. The NextResponse.json patch handles HTTP serialization, but
    // the serialize() function runs BEFORE that, so we must convert here too.
    const serialize = (records: any[]) =>
      records.map((r: any) => {
        // First, convert all Decimal objects to numbers (preserves Date objects)
        const decimalSafe = serializeDecimals(r) as Record<string, unknown>;
        // Then, convert Date objects to ISO strings for IndexedDB compatibility
        const obj: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(decimalSafe)) {
          if (value instanceof Date) {
            obj[key] = value.toISOString();
          } else {
            obj[key] = value;
          }
        }
        return obj;
      });

    return NextResponse.json({
      timestamp: Date.now(),
      accounts: serialize(accounts),
      subAccounts: serialize(subAccounts),
      transactions: serialize(transactions),
      budgets: serialize(budgets),
      debts: serialize(debts.map((d: any) => { const { installments, abonos, ...rest } = d; return rest; })),
      installments: serialize(installments),
      abonos: serialize(abonos.map((a: any) => { const { details, ...rest } = a; return rest; })),
      abonoDetails: serialize(abonoDetails),
      recurringPayments: serialize(recurringPayments),
      payrollGroups: serialize(payrollGroups),
      savingsGoals: serialize(savingsGoals),
      savingsGoalAccounts: serialize(savingsGoalAccounts),
      savingsContributions: serialize(savingsContributions),
      cdts: serialize(cdts),
      yieldRecords: serialize(yieldRecords),
      vehicles: serialize(vehicles),
      fuelLogs: serialize(fuelLogs),
      maintenanceRecords: serialize(maintenanceRecords),
      fuelPrices: serialize(fuelPrices),
      medications: serialize(medications),
      appointments: serialize(appointments),
      pantryItems: serialize(pantryItems),
      shoppingLists: serialize(shoppingLists),
      shoppingListItems: serialize(shoppingListItems),
      healthProfiles: serialize(healthProfiles),
      userSettings: userSettings ? serialize([userSettings]) : [],
      sharedAccountUsers: serialize(sharedAccountUsers),
    });
  } catch (error) {
    console.error("Sync initial error:", error);
    return NextResponse.json(
      { error: "Error al sincronizar datos" },
      { status: 500 }
    );
  }
}
