import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { serializeDecimals } from "@/lib/decimal-serializer";
import { BACKUP_SCHEMA_VERSION, BACKUP_MAGIC } from "@/lib/backup/constants";

/**
 * POST /api/backup/server-save
 *
 * Generates a backup of ALL user data and stores it directly in the
 * stored_backups table on the server. This is the "backup to server"
 * feature — no file download, the backup lives inside the Docker volume.
 *
 * Only the 3 most recent backups are kept per user (older ones are pruned).
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch user info
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, currency: true },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Fetch all user data (same as export endpoint)
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

    // Serialize
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

    const stripUserId = (records: any[]) =>
      records.map(({ userId: _uid, ...rest }: any) => rest);

    const backup = {
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
            return rest;
          })()
        : null,
      accounts: stripUserId(serialize(accounts)),
      subAccounts: serialize(subAccounts).map(({ userId: _uid, ...rest }: any) => rest),
      sharedAccountUsers: serialize(sharedAccountUsers).map(({ userId: _uid, ...rest }: any) => rest),
      yieldRecords: serialize(yieldRecords).map(({ userId: _uid, ...rest }: any) => rest),
      transactions: stripUserId(serialize(transactions)),
      budgets: stripUserId(serialize(budgets)),
      categories: stripUserId(serialize(categories)),
      debts: stripUserId(serialize(debts)),
      installments: serialize(installments).map(({ userId: _uid, ...rest }: any) => rest),
      abonos: stripUserId(serialize(abonos)),
      abonoDetails: serialize(abonoDetails).map(({ userId: _uid, ...rest }: any) => rest),
      recurringPayments: stripUserId(serialize(recurringPayments)),
      payrollGroups: stripUserId(serialize(payrollGroups)),
      savingsGoals: stripUserId(serialize(savingsGoals)),
      savingsGoalAccounts: serialize(savingsGoalAccounts).map(({ userId: _uid, ...rest }: any) => rest),
      savingsContributions: serialize(savingsContributions).map(({ userId: _uid, ...rest }: any) => rest),
      cdts: stripUserId(serialize(cdts)),
      vehicles: stripUserId(serialize(vehicles)),
      fuelLogs: serialize(fuelLogs).map(({ userId: _uid, ...rest }: any) => rest),
      maintenanceRecords: serialize(maintenanceRecords).map(({ userId: _uid, ...rest }: any) => rest),
      fuelPrices: stripUserId(serialize(fuelPrices)),
      medications: stripUserId(serialize(medications)),
      appointments: stripUserId(serialize(appointments)),
      pantryItems: stripUserId(serialize(pantryItems)),
      shoppingLists: stripUserId(serialize(shoppingLists)),
      shoppingListItems: serialize(shoppingListItems).map(({ userId: _uid, ...rest }: any) => rest),
      healthProfiles: stripUserId(serialize(healthProfiles)),
    };

    // Count total records
    const recordCount =
      accounts.length + subAccounts.length + transactions.length +
      budgets.length + categories.length + debts.length + installments.length +
      abonos.length + abonoDetails.length + recurringPayments.length +
      payrollGroups.length + savingsGoals.length + savingsGoalAccounts.length +
      savingsContributions.length + cdts.length + yieldRecords.length +
      sharedAccountUsers.length + vehicles.length + fuelLogs.length +
      maintenanceRecords.length + fuelPrices.length + medications.length +
      appointments.length + pantryItems.length + shoppingLists.length +
      shoppingListItems.length + healthProfiles.length +
      (userSettings ? 1 : 0);

    // Store in DB
    const stored = await db.storedBackup.create({
      data: {
        userId,
        data: JSON.stringify(backup),
        version: BACKUP_SCHEMA_VERSION,
        recordCount,
      },
    });

    // Prune: keep only the 3 most recent backups per user
    const allBackups = await db.storedBackup.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (allBackups.length > 3) {
      const idsToDelete = allBackups.slice(3).map((b) => b.id);
      await db.storedBackup.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    return NextResponse.json({
      success: true,
      backupId: stored.id,
      recordCount,
      createdAt: stored.createdAt.toISOString(),
    });
  } catch (error) {
    console.error("Server backup save error:", error);
    return NextResponse.json(
      { error: "Error al guardar el respaldo en el servidor" },
      { status: 500 }
    );
  }
}
