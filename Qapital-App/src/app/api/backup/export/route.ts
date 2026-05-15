import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeDecimals } from "@/lib/decimal-serializer";
import { BACKUP_SCHEMA_VERSION, BACKUP_MAGIC } from "@/lib/backup/constants";
import type { BackupData } from "@/lib/backup/constants";

/**
 * GET /api/backup/export
 *
 * Exports ALL data for the authenticated user as a JSON backup file.
 * This backup can later be imported to restore the complete user state,
 * even on a fresh database (e.g., new Oracle Cloud deployment).
 *
 * The backup includes:
 * - Metadata: version, date, user email/name (NOT password)
 * - All finance data: accounts, transactions, budgets, debts, savings, CDTs, etc.
 * - All other modules: transport, health, pantry
 * - User settings
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch user info for backup metadata
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, currency: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Fetch all user data in parallel
    const [
      userSettings,
      accounts,
      subAccounts,
      sharedAccountUsers,
      yieldRecords,
      transactions,
      budgets,
      categories,
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
    ] = await Promise.all([
      db.userSettings.findUnique({ where: { userId } }),
      db.account.findMany({ where: { userId } }),
      db.subAccount.findMany({ where: { account: { userId } } }),
      db.sharedAccountUser.findMany({ where: { account: { userId } } }),
      db.yieldRecord.findMany({
        where: {
          OR: [
            { account: { userId } },
            { subAccount: { account: { userId } } },
          ],
        },
      }),
      db.transaction.findMany({ where: { userId } }),
      db.budget.findMany({ where: { userId } }),
      db.category.findMany({ where: { userId } }),
      db.debt.findMany({ where: { userId } }),
      db.installment.findMany({ where: { debt: { userId } } }),
      db.abono.findMany({ where: { userId } }),
      db.abonoDetail.findMany({ where: { abono: { userId } } }),
      db.recurringPayment.findMany({ where: { userId } }),
      db.payrollGroup.findMany({ where: { userId } }),
      db.savingsGoal.findMany({ where: { userId } }),
      db.savingsGoalAccount.findMany({ where: { goal: { userId } } }),
      db.savingsContribution.findMany({ where: { goal: { userId } } }),
      db.cDT.findMany({ where: { userId } }),
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
    ]);

    // Serialize: convert Decimals → numbers, Dates → ISO strings
    const serialize = (records: any[]) =>
      records.map((r: any) => {
        const decimalSafe = serializeDecimals(r) as Record<string, unknown>;
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

    // Strip userId from all records — it will be set by the importing user
    const stripUserId = (records: any[]) =>
      records.map(({ userId: _uid, ...rest }: any) => rest);

    // Build backup object
    const backup: BackupData = {
      magic: BACKUP_MAGIC,
      version: BACKUP_SCHEMA_VERSION,
      exportDate: new Date().toISOString(),
      userEmail: user.email,
      userName: user.name,
      currency: user.currency,

      userSettings: userSettings
        ? (() => {
            const s = serialize([userSettings])[0];
            const { id, userId: _uid, ...rest } = s;
            return rest as any;
          })()
        : null,

      accounts: stripUserId(serialize(accounts)),
      subAccounts: serialize(subAccounts).map(
        ({ userId: _uid, ...rest }: any) => rest
      ),
      sharedAccountUsers: serialize(sharedAccountUsers).map(
        ({ userId: _uid, ...rest }: any) => rest
      ),
      yieldRecords: serialize(yieldRecords).map(
        ({ userId: _uid, ...rest }: any) => rest
      ),
      transactions: stripUserId(serialize(transactions)),
      budgets: stripUserId(serialize(budgets)),
      categories: stripUserId(serialize(categories)),
      debts: stripUserId(serialize(debts)),
      installments: serialize(installments).map(
        ({ userId: _uid, ...rest }: any) => rest
      ),
      abonos: stripUserId(serialize(abonos)),
      abonoDetails: serialize(abonoDetails).map(
        ({ userId: _uid, ...rest }: any) => rest
      ),
      recurringPayments: stripUserId(serialize(recurringPayments)),
      payrollGroups: stripUserId(serialize(payrollGroups)),
      savingsGoals: stripUserId(serialize(savingsGoals)),
      savingsGoalAccounts: serialize(savingsGoalAccounts).map(
        ({ userId: _uid, ...rest }: any) => rest
      ),
      savingsContributions: serialize(savingsContributions).map(
        ({ userId: _uid, ...rest }: any) => rest
      ),
      cdts: stripUserId(serialize(cdts)),
      vehicles: stripUserId(serialize(vehicles)),
      fuelLogs: serialize(fuelLogs).map(
        ({ userId: _uid, ...rest }: any) => rest
      ),
      maintenanceRecords: serialize(maintenanceRecords).map(
        ({ userId: _uid, ...rest }: any) => rest
      ),
      fuelPrices: stripUserId(serialize(fuelPrices)),
      medications: stripUserId(serialize(medications)),
      appointments: stripUserId(serialize(appointments)),
      pantryItems: stripUserId(serialize(pantryItems)),
      shoppingLists: stripUserId(serialize(shoppingLists)),
      shoppingListItems: serialize(shoppingListItems).map(
        ({ userId: _uid, ...rest }: any) => rest
      ),
      healthProfiles: stripUserId(serialize(healthProfiles)),
    };

    // Return as downloadable JSON
    const filename = `quid-backup-${new Date().toISOString().split("T")[0]}.json`;
    const body = JSON.stringify(backup, null, 2);

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Backup export error:", error);
    return NextResponse.json(
      { error: "Error al exportar el respaldo" },
      { status: 500 }
    );
  }
}
