import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeDecimals } from "@/lib/decimal-serializer";

/**
 * GET /api/sync/pull?since=<timestamp>
 * Returns all records modified since the given timestamp (Unix ms).
 * Used for incremental sync after initial population.
 *
 * Each model must have an `updatedAt` field for this to work.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const sinceParam = req.nextUrl.searchParams.get("since");
    const since = sinceParam ? new Date(parseInt(sinceParam)) : new Date(0);

    // Fetch records updated since the given timestamp
    // Serialize dates to ISO strings and Decimals to numbers for IndexedDB storage.
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
      db.account.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.subAccount.findMany({ where: { account: { userId }, updatedAt: { gte: since } } }),
      db.transaction.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.budget.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.debt.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.installment.findMany({ where: { debt: { userId }, updatedAt: { gte: since } } }),
      db.abono.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.abonoDetail.findMany({ where: { abono: { userId } } }), // No updatedAt on AbonoDetail
      db.recurringPayment.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.payrollGroup.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.savingsGoal.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.savingsGoalAccount.findMany({ where: { goal: { userId }, createdAt: { gte: since } } }),
      db.savingsContribution.findMany({ where: { goal: { userId }, createdAt: { gte: since } } }),
      db.cDT.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.yieldRecord.findMany({ where: { OR: [{ account: { userId } }, { subAccount: { account: { userId } } }], updatedAt: { gte: since } } }),
      db.vehicle.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.fuelLog.findMany({ where: { vehicle: { userId }, createdAt: { gte: since } } }),
      db.maintenanceRecord.findMany({ where: { vehicle: { userId }, updatedAt: { gte: since } } }),
      db.fuelPrice.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.medication.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.medicalAppointment.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.pantryItem.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.shoppingList.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.shoppingListItem.findMany({ where: { shoppingList: { userId }, updatedAt: { gte: since } } }),
      db.healthProfile.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.userSettings.findMany({ where: { userId, updatedAt: { gte: since } } }),
      db.sharedAccountUser.findMany({ where: { account: { userId }, createdAt: { gte: since } } }),
    ]);

    return NextResponse.json({
      timestamp: Date.now(),
      records: {
        accounts: serialize(accounts),
        subAccounts: serialize(subAccounts),
        transactions: serialize(transactions),
        budgets: serialize(budgets),
        debts: serialize(debts),
        installments: serialize(installments),
        abonos: serialize(abonos),
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
        userSettings: serialize(userSettings),
        sharedAccountUsers: serialize(sharedAccountUsers),
      },
      deletions: [] as Array<{ tableName: string; id: string }>, // Will be populated when DeletedRecord is implemented
    });
  } catch (error) {
    console.error("Sync pull error:", error);
    return NextResponse.json(
      { error: "Error al sincronizar cambios" },
      { status: 500 }
    );
  }
}
