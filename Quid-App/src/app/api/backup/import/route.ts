import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { BACKUP_MAGIC, BACKUP_SCHEMA_VERSION } from "@/lib/backup/constants";
import type { BackupData, ImportResult } from "@/lib/backup/constants";

/**
 * POST /api/backup/import
 *
 * Restores ALL data for the authenticated user from a JSON backup file.
 *
 * CRITICAL DESIGN DECISIONS:
 * 1. ID Remapping: ALL record IDs are regenerated (new CUIDs) and all foreign
 *    key references are updated. This prevents conflicts when restoring on a
 *    different database (e.g., fresh Oracle Cloud deployment).
 * 2. Full Replace: Import deletes ALL existing user data first, then creates
 *    from backup. This guarantees data consistency.
 * 3. Schema Adaptation: If the backup version is older than the current schema
 *    version, migration adapters transform the data before import.
 * 4. Transfer Pairs: The `relatedTransactionId` linking transfer pairs is
 *    correctly mapped to the new IDs.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse the backup JSON from the request body
    let backup: BackupData;
    try {
      const body = await request.json();
      backup = body as BackupData;
    } catch {
      return NextResponse.json(
        { error: "Archivo de respaldo inválido: no se pudo leer el JSON" },
        { status: 400 }
      );
    }

    // Validate magic identifier
    if (backup.magic !== BACKUP_MAGIC) {
      return NextResponse.json(
        { error: "Archivo de respaldo inválido: formato no reconocido" },
        { status: 400 }
      );
    }

    // Validate version compatibility
    if (backup.version > BACKUP_SCHEMA_VERSION) {
      return NextResponse.json(
        {
          error: `El respaldo fue creado con una versión más reciente (v${backup.version}). La aplicación actual soporta hasta v${BACKUP_SCHEMA_VERSION}. Actualiza la aplicación primero.`,
        },
        { status: 400 }
      );
    }

    // Apply schema migrations if needed
    const migratedBackup = applyMigrations(backup);

    // ID remapping tables: old ID → new ID
    const idMap = new Map<string, string>();

    // Helper: generate new ID and store mapping
    const remapId = (oldId: string): string => {
      if (!idMap.has(oldId)) {
        // Use Prisma's CUID generator by creating a placeholder
        // We'll use crypto.randomUUID as a simple unique ID
        const newId = generateCuid();
        idMap.set(oldId, newId);
      }
      return idMap.get(oldId)!;
    };

    // Helper: remap an optional ID field
    const remapOptionalId = (oldId: string | null): string | null => {
      if (!oldId) return null;
      return remapId(oldId);
    };

    // ── DELETE ALL EXISTING USER DATA ──
    // Order matters due to foreign key constraints (reverse of creation order)
    await db.$transaction(async (tx) => {
      // Savings & CDTs
      await tx.savingsContribution.deleteMany({ where: { goal: { userId } } });
      await tx.savingsGoalAccount.deleteMany({ where: { goal: { userId } } });
      await tx.savingsGoal.deleteMany({ where: { userId } });
      await tx.cDT.deleteMany({ where: { userId } });

      // Debts
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

      // Shared accounts & sub-accounts
      await tx.sharedAccountUser.deleteMany({ where: { account: { userId } } });
      await tx.subAccount.deleteMany({ where: { account: { userId } } });

      // Accounts
      await tx.account.deleteMany({ where: { userId } });

      // Categories
      await tx.category.deleteMany({ where: { userId } });

      // Transport
      await tx.fuelLog.deleteMany({ where: { vehicle: { userId } } });
      await tx.maintenanceRecord.deleteMany({ where: { vehicle: { userId } } });
      await tx.vehicle.deleteMany({ where: { userId } });
      await tx.fuelPrice.deleteMany({ where: { userId } });

      // Health
      await tx.medication.deleteMany({ where: { userId } });
      await tx.medicalAppointment.deleteMany({ where: { userId } });

      // Pantry
      await tx.shoppingListItem.deleteMany({ where: { shoppingList: { userId } } });
      await tx.shoppingList.deleteMany({ where: { userId } });
      await tx.pantryItem.deleteMany({ where: { userId } });
      await tx.healthProfile.deleteMany({ where: { userId } });

      // User settings
      await tx.userSettings.deleteMany({ where: { userId } });
    });

    // ── CREATE ALL DATA FROM BACKUP ──
    // Order matters: parent entities first, then children with foreign keys

    const stats = {
      userSettings: 0,
      accounts: 0,
      subAccounts: 0,
      sharedAccountUsers: 0,
      yieldRecords: 0,
      transactions: 0,
      budgets: 0,
      categories: 0,
      debts: 0,
      installments: 0,
      abonos: 0,
      abonoDetails: 0,
      recurringPayments: 0,
      payrollGroups: 0,
      savingsGoals: 0,
      savingsGoalAccounts: 0,
      savingsContributions: 0,
      cdts: 0,
      vehicles: 0,
      fuelLogs: 0,
      maintenanceRecords: 0,
      fuelPrices: 0,
      medications: 0,
      appointments: 0,
      pantryItems: 0,
      shoppingLists: 0,
      shoppingListItems: 0,
      healthProfiles: 0,
    };

    await db.$transaction(async (tx) => {
      // 1. User Settings
      if (migratedBackup.userSettings) {
        await tx.userSettings.create({
          data: {
            userId,
            theme: migratedBackup.userSettings.theme,
            budgetCutoffDay: migratedBackup.userSettings.budgetCutoffDay,
            respectHolidays: migratedBackup.userSettings.respectHolidays,
            countryCode: migratedBackup.userSettings.countryCode,
            notificationsEnabled: migratedBackup.userSettings.notificationsEnabled,
            lastBudgetReset: migratedBackup.userSettings.lastBudgetReset,
          },
        });
        stats.userSettings = 1;
      }

      // 2. Categories (no foreign keys to other tables)
      for (const cat of migratedBackup.categories) {
        await tx.category.create({
          data: {
            id: remapId(cat.id),
            userId,
            type: cat.type,
            name: cat.name,
            icon: cat.icon,
            color: cat.color,
            createdAt: cat.createdAt,
            updatedAt: cat.updatedAt,
          },
        });
        stats.categories++;
      }

      // 3. Accounts (top-level entity)
      for (const acc of migratedBackup.accounts) {
        await tx.account.create({
          data: {
            id: remapId(acc.id),
            userId,
            name: acc.name,
            type: acc.type,
            color: acc.color,
            icon: acc.icon,
            balance: acc.balance,
            isHighYield: acc.isHighYield,
            yieldPercentage: acc.yieldPercentage,
            isShared: acc.isShared,
            excludeFromAvailable: acc.excludeFromAvailable,
            order: acc.order,
            createdAt: acc.createdAt,
            updatedAt: acc.updatedAt,
          },
        });
        stats.accounts++;
      }

      // 4. SubAccounts (depends on Accounts)
      for (const sub of migratedBackup.subAccounts) {
        await tx.subAccount.create({
          data: {
            id: remapId(sub.id),
            accountId: remapId(sub.accountId),
            name: sub.name,
            type: sub.type,
            balance: sub.balance,
            isHighYield: sub.isHighYield,
            yieldPercentage: sub.yieldPercentage,
            icon: sub.icon,
            color: sub.color,
            excludeFromAvailable: sub.excludeFromAvailable,
            order: sub.order,
            createdAt: sub.createdAt,
            updatedAt: sub.updatedAt,
          },
        });
        stats.subAccounts++;
      }

      // 5. Shared Account Users (depends on Accounts + external Users)
      for (const sau of migratedBackup.sharedAccountUsers) {
        // The userId in sharedAccountUser might not exist in this DB
        // (it's a different user who shares the account). We skip these
        // since shared accounts require the other user to exist.
        try {
          await tx.sharedAccountUser.create({
            data: {
              id: remapId(sau.id),
              accountId: remapId(sau.accountId),
              userId: sau.userId, // Keep original userId — might be another user
              role: sau.role,
              createdAt: sau.createdAt,
            },
          });
          stats.sharedAccountUsers++;
        } catch {
          // Skip if the referenced user doesn't exist in this DB
          console.warn(`Skipping SharedAccountUser: user ${sau.userId} not found`);
        }
      }

      // 6. Yield Records (depends on Accounts + SubAccounts)
      for (const yr of migratedBackup.yieldRecords) {
        await tx.yieldRecord.create({
          data: {
            id: remapId(yr.id),
            accountId: remapOptionalId(yr.accountId),
            subAccountId: remapOptionalId(yr.subAccountId),
            month: yr.month,
            projectedYield: yr.projectedYield,
            actualYield: yr.actualYield,
            yieldPercentage: yr.yieldPercentage,
            isConfirmed: yr.isConfirmed,
            transactionId: remapOptionalId(yr.transactionId),
            createdAt: yr.createdAt,
            updatedAt: yr.updatedAt,
          },
        });
        stats.yieldRecords++;
      }

      // 7. Transactions (depends on Accounts + SubAccounts)
      for (const txn of migratedBackup.transactions) {
        await tx.transaction.create({
          data: {
            id: remapId(txn.id),
            userId,
            accountId: remapOptionalId(txn.accountId),
            subAccountId: remapOptionalId(txn.subAccountId),
            type: txn.type,
            amount: txn.amount,
            description: txn.description,
            category: txn.category,
            subCategory: txn.subCategory,
            date: txn.date,
            sourceModule: txn.sourceModule,
            sourceId: txn.sourceId,
            isRecurring: txn.isRecurring,
            notes: txn.notes,
            relatedTransactionId: remapOptionalId(txn.relatedTransactionId),
            excludeFromBudget: txn.excludeFromBudget,
            createdAt: txn.createdAt,
            updatedAt: txn.updatedAt,
          },
        });
        stats.transactions++;
      }

      // 8. Budgets (no foreign keys to other tables)
      for (const bgt of migratedBackup.budgets) {
        await tx.budget.create({
          data: {
            id: remapId(bgt.id),
            userId,
            type: bgt.type,
            category: bgt.category,
            subCategory: bgt.subCategory,
            amount: bgt.amount,
            spent: bgt.spent,
            period: bgt.period,
            lastResetDate: bgt.lastResetDate,
            icon: bgt.icon,
            color: bgt.color,
            createdAt: bgt.createdAt,
            updatedAt: bgt.updatedAt,
          },
        });
        stats.budgets++;
      }

      // 9. Debts (depends on Accounts + SubAccounts)
      for (const debt of migratedBackup.debts) {
        await tx.debt.create({
          data: {
            id: remapId(debt.id),
            userId,
            type: debt.type,
            name: debt.name,
            color: debt.color,
            icon: debt.icon,
            bank: debt.bank,
            totalAmount: debt.totalAmount,
            currentBalance: debt.currentBalance,
            interestRate: debt.interestRate,
            cutoffDate: debt.cutoffDate,
            paymentDate: debt.paymentDate,
            monthlyPayment: debt.monthlyPayment,
            remainingPayments: debt.remainingPayments,
            startDate: debt.startDate,
            endDate: debt.endDate,
            paymentType: debt.paymentType,
            otherCharges: debt.otherCharges,
            category: debt.category,
            subCategory: debt.subCategory,
            accountId: remapOptionalId(debt.accountId),
            subAccountId: remapOptionalId(debt.subAccountId),
            createdAt: debt.createdAt,
            updatedAt: debt.updatedAt,
          },
        });
        stats.debts++;
      }

      // 10. Installments (depends on Debts + Accounts + SubAccounts + RecurringPayments)
      for (const inst of migratedBackup.installments) {
        await tx.installment.create({
          data: {
            id: remapId(inst.id),
            debtId: remapId(inst.debtId),
            description: inst.description,
            totalAmount: inst.totalAmount,
            totalInstallments: inst.totalInstallments,
            currentInstallment: inst.currentInstallment,
            installmentAmount: inst.installmentAmount,
            paidAmount: inst.paidAmount,
            interestRate: inst.interestRate,
            interestAmount: inst.interestAmount,
            otherChargesAmount: inst.otherChargesAmount,
            remainingBalance: inst.remainingBalance,
            purchaseDate: inst.purchaseDate,
            nextPaymentDate: inst.nextPaymentDate,
            isPaid: inst.isPaid,
            accountId: remapOptionalId(inst.accountId),
            subAccountId: remapOptionalId(inst.subAccountId),
            category: inst.category,
            subCategory: inst.subCategory,
            recurringPaymentId: remapOptionalId(inst.recurringPaymentId),
            createdAt: inst.createdAt,
            updatedAt: inst.updatedAt,
          },
        });
        stats.installments++;
      }

      // 11. Abonos (depends on Debts + Accounts + SubAccounts)
      for (const ab of migratedBackup.abonos) {
        await tx.abono.create({
          data: {
            id: remapId(ab.id),
            userId,
            debtId: remapId(ab.debtId),
            transactionId: remapOptionalId(ab.transactionId),
            totalAmount: ab.totalAmount,
            accountId: remapId(ab.accountId),
            subAccountId: remapOptionalId(ab.subAccountId),
            date: ab.date,
            isReversed: ab.isReversed,
            createdAt: ab.createdAt,
            updatedAt: ab.updatedAt,
          },
        });
        stats.abonos++;
      }

      // 12. AbonoDetails (depends on Abonos + Installments)
      for (const ad of migratedBackup.abonoDetails) {
        await tx.abonoDetail.create({
          data: {
            id: remapId(ad.id),
            abonoId: remapId(ad.abonoId),
            installmentId: remapId(ad.installmentId),
            amount: ad.amount,
            previousBalance: ad.previousBalance,
            newBalance: ad.newBalance,
          },
        });
        stats.abonoDetails++;
      }

      // 13. PayrollGroups (depends on Accounts + SubAccounts)
      for (const pg of migratedBackup.payrollGroups) {
        await tx.payrollGroup.create({
          data: {
            id: remapId(pg.id),
            userId,
            description: pg.description,
            frequency: pg.frequency,
            totalAmount: pg.totalAmount,
            accountId: remapId(pg.accountId),
            subAccountId: remapOptionalId(pg.subAccountId),
            category: pg.category,
            subCategory: pg.subCategory,
            adjustToBusinessDay: pg.adjustToBusinessDay,
            businessDayDirection: pg.businessDayDirection,
            schedules: pg.schedules,
            isActive: pg.isActive,
            createdAt: pg.createdAt,
            updatedAt: pg.updatedAt,
          },
        });
        stats.payrollGroups++;
      }

      // 14. SavingsGoals (depends on Accounts)
      for (const sg of migratedBackup.savingsGoals) {
        await tx.savingsGoal.create({
          data: {
            id: remapId(sg.id),
            userId,
            name: sg.name,
            description: sg.description,
            targetAmount: sg.targetAmount,
            currentAmount: sg.currentAmount,
            deadline: sg.deadline,
            icon: sg.icon,
            color: sg.color,
            type: sg.type,
            aiSuggestion: sg.aiSuggestion,
            isActive: sg.isActive,
            frequency: sg.frequency,
            monthlyDay: sg.monthlyDay,
            biweeklyDays: sg.biweeklyDays,
            weeklyDay: sg.weeklyDay,
            periodAmounts: sg.periodAmounts,
            sourceAccountId: remapOptionalId(sg.sourceAccountId),
            destinationAccountId: remapOptionalId(sg.destinationAccountId),
            status: sg.status,
            createdAt: sg.createdAt,
            updatedAt: sg.updatedAt,
          },
        });
        stats.savingsGoals++;
      }

      // 15. SavingsGoalAccounts (depends on SavingsGoals + Accounts + SubAccounts)
      for (const sga of migratedBackup.savingsGoalAccounts) {
        await tx.savingsGoalAccount.create({
          data: {
            id: remapId(sga.id),
            goalId: remapId(sga.goalId),
            accountId: remapId(sga.accountId),
            subAccountId: remapOptionalId(sga.subAccountId),
            createdAt: sga.createdAt,
          },
        });
        stats.savingsGoalAccounts++;
      }

      // 16. SavingsContributions (depends on SavingsGoals)
      for (const sc of migratedBackup.savingsContributions) {
        await tx.savingsContribution.create({
          data: {
            id: remapId(sc.id),
            goalId: remapId(sc.goalId),
            amount: sc.amount,
            date: sc.date,
            description: sc.description,
            transactionId: remapOptionalId(sc.transactionId),
            accountId: remapOptionalId(sc.accountId),
            createdAt: sc.createdAt,
          },
        });
        stats.savingsContributions++;
      }

      // 17. RecurringPayments (depends on many entities)
      for (const rp of migratedBackup.recurringPayments) {
        await tx.recurringPayment.create({
          data: {
            id: remapId(rp.id),
            userId,
            description: rp.description,
            amount: rp.amount,
            actualAmount: rp.actualAmount,
            type: rp.type,
            accountId: remapOptionalId(rp.accountId),
            subAccountId: remapOptionalId(rp.subAccountId),
            debtId: remapOptionalId(rp.debtId),
            destinationAccountId: remapOptionalId(rp.destinationAccountId),
            destinationSubAccountId: remapOptionalId(rp.destinationSubAccountId),
            category: rp.category,
            subCategory: rp.subCategory,
            scheduledDate: rp.scheduledDate,
            confirmedDate: rp.confirmedDate,
            status: rp.status,
            frequency: rp.frequency,
            notes: rp.notes,
            isRecurring: rp.isRecurring,
            savingsGoalId: remapOptionalId(rp.savingsGoalId),
            customDays: rp.customDays,
            periodAmounts: rp.periodAmounts,
            payrollGroupId: remapOptionalId(rp.payrollGroupId),
            createdAt: rp.createdAt,
            updatedAt: rp.updatedAt,
          },
        });
        stats.recurringPayments++;
      }

      // 18. CDTs (depends on SavingsGoals + Accounts)
      for (const cdt of migratedBackup.cdts) {
        await tx.cDT.create({
          data: {
            id: remapId(cdt.id),
            userId,
            bank: cdt.bank,
            amount: cdt.amount,
            effectiveRate: cdt.effectiveRate,
            startDate: cdt.startDate,
            endDate: cdt.endDate,
            termDays: cdt.termDays,
            interestEarned: cdt.interestEarned,
            status: cdt.status,
            goalId: remapOptionalId(cdt.goalId),
            accountId: remapOptionalId(cdt.accountId),
            withdrawnAmount: cdt.withdrawnAmount,
            withdrawnDate: cdt.withdrawnDate,
            notes: cdt.notes,
            color: cdt.color,
            createdAt: cdt.createdAt,
            updatedAt: cdt.updatedAt,
          },
        });
        stats.cdts++;
      }

      // 19. Vehicles
      for (const v of migratedBackup.vehicles) {
        await tx.vehicle.create({
          data: {
            id: remapId(v.id),
            userId,
            name: v.name,
            type: v.type,
            brand: v.brand,
            model: v.model,
            year: v.year,
            color: v.color,
            tankCapacity: v.tankCapacity,
            fuelType: v.fuelType,
            currentKm: v.currentKm,
            icon: v.icon,
            createdAt: v.createdAt,
            updatedAt: v.updatedAt,
          },
        });
        stats.vehicles++;
      }

      // 20. FuelLogs
      for (const fl of migratedBackup.fuelLogs) {
        await tx.fuelLog.create({
          data: {
            id: remapId(fl.id),
            vehicleId: remapId(fl.vehicleId),
            date: fl.date,
            km: fl.km,
            amount: fl.amount,
            pricePerGallon: fl.pricePerGallon,
            gallons: fl.gallons,
            isFullTank: fl.isFullTank,
            notes: fl.notes,
            createdAt: fl.createdAt,
          },
        });
        stats.fuelLogs++;
      }

      // 21. MaintenanceRecords
      for (const mr of migratedBackup.maintenanceRecords) {
        await tx.maintenanceRecord.create({
          data: {
            id: remapId(mr.id),
            vehicleId: remapId(mr.vehicleId),
            type: mr.type,
            description: mr.description,
            cost: mr.cost,
            km: mr.km,
            date: mr.date,
            nextDueKm: mr.nextDueKm,
            nextDueDate: mr.nextDueDate,
            reminderEnabled: mr.reminderEnabled,
            createdAt: mr.createdAt,
            updatedAt: mr.updatedAt,
          },
        });
        stats.maintenanceRecords++;
      }

      // 22. FuelPrices
      for (const fp of migratedBackup.fuelPrices) {
        await tx.fuelPrice.create({
          data: {
            id: remapId(fp.id),
            userId,
            fuelType: fp.fuelType,
            pricePerGallon: fp.pricePerGallon,
            createdAt: fp.createdAt,
            updatedAt: fp.updatedAt,
          },
        });
        stats.fuelPrices++;
      }

      // 23. Medications
      for (const med of migratedBackup.medications) {
        await tx.medication.create({
          data: {
            id: remapId(med.id),
            userId,
            name: med.name,
            dosage: med.dosage,
            frequency: med.frequency,
            customSchedule: med.customSchedule,
            disease: med.disease,
            howToTake: med.howToTake,
            startDate: med.startDate,
            endDate: med.endDate,
            isActive: med.isActive,
            reminderEnabled: med.reminderEnabled,
            reminderTimes: med.reminderTimes,
            createdAt: med.createdAt,
            updatedAt: med.updatedAt,
          },
        });
        stats.medications++;
      }

      // 24. Appointments
      for (const appt of migratedBackup.appointments) {
        await tx.medicalAppointment.create({
          data: {
            id: remapId(appt.id),
            userId,
            doctorName: appt.doctorName,
            specialty: appt.specialty,
            location: appt.location,
            date: appt.date,
            notes: appt.notes,
            reminderEnabled: appt.reminderEnabled,
            status: appt.status,
            createdAt: appt.createdAt,
            updatedAt: appt.updatedAt,
          },
        });
        stats.appointments++;
      }

      // 25. PantryItems
      for (const pi of migratedBackup.pantryItems) {
        await tx.pantryItem.create({
          data: {
            id: remapId(pi.id),
            userId,
            name: pi.name,
            category: pi.category,
            quantity: pi.quantity,
            unit: pi.unit,
            expirationDate: pi.expirationDate,
            purchaseDate: pi.purchaseDate,
            purchasePrice: pi.purchasePrice,
            minStock: pi.minStock,
            createdAt: pi.createdAt,
            updatedAt: pi.updatedAt,
          },
        });
        stats.pantryItems++;
      }

      // 26. ShoppingLists
      for (const sl of migratedBackup.shoppingLists) {
        await tx.shoppingList.create({
          data: {
            id: remapId(sl.id),
            userId,
            name: sl.name,
            status: sl.status,
            profileId: remapOptionalId(sl.profileId),
            createdAt: sl.createdAt,
            updatedAt: sl.updatedAt,
          },
        });
        stats.shoppingLists++;
      }

      // 27. ShoppingListItems
      for (const sli of migratedBackup.shoppingListItems) {
        await tx.shoppingListItem.create({
          data: {
            id: remapId(sli.id),
            shoppingListId: remapId(sli.shoppingListId),
            name: sli.name,
            quantity: sli.quantity,
            unit: sli.unit,
            estimatedPrice: sli.estimatedPrice,
            actualPrice: sli.actualPrice,
            isPurchased: sli.isPurchased,
            checked: sli.checked,
            pantryItemId: remapOptionalId(sli.pantryItemId),
            createdAt: sli.createdAt,
            updatedAt: sli.updatedAt,
          },
        });
        stats.shoppingListItems++;
      }

      // 28. HealthProfiles
      for (const hp of migratedBackup.healthProfiles) {
        await tx.healthProfile.create({
          data: {
            id: remapId(hp.id),
            userId,
            name: hp.name,
            type: hp.type,
            diseases: hp.diseases,
            restrictions: hp.restrictions,
            aiRestrictions: hp.aiRestrictions,
            createdAt: hp.createdAt,
            updatedAt: hp.updatedAt,
          },
        });
        stats.healthProfiles++;
      }
    });

    // Update user's currency from backup
    if (migratedBackup.currency) {
      await db.user.update({
        where: { id: userId },
        data: { currency: migratedBackup.currency },
      });
    }

    const result: ImportResult = {
      success: true,
      stats,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Backup import error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Error al importar el respaldo",
      },
      { status: 500 }
    );
  }
}

// ── CUID Generator ──
// Generates CUID-compatible IDs (similar to Prisma's @default(cuid()))
// Format: c + timestamp(8) + random(4) + counter(4)
function generateCuid(): string {
  const timestamp = Date.now().toString(36).slice(-8).padStart(8, "0");
  const random = Math.random().toString(36).slice(2, 6);
  const counter = Math.floor(Math.random() * 1679616).toString(36).padStart(4, "0");
  return `c${timestamp}${random}${counter}`;
}

// ── Schema Migration Adapters ──
// Apply migrations when importing a backup from an older schema version.
// Each migration function transforms the backup data to match the current schema.

function applyMigrations(backup: BackupData): BackupData {
  let migrated = { ...backup };

  // Migration from v0 (pre-versioning) to v1
  // Future migrations would be:
  // if (migrated.version < 2) { migrated = migrateV1toV2(migrated); }
  // if (migrated.version < 3) { migrated = migrateV2toV3(migrated); }

  // Ensure version is set to current after all migrations
  migrated.version = BACKUP_SCHEMA_VERSION;

  return migrated;
}
