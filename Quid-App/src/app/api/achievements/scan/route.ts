import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// ─── POST: Retroactive scan — detect existing data and mark achievements ──
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    const now = new Date();
    const discovered: string[] = [];

    // ── Finance scans ──
    const [transactions, accounts, budgets, savingsGoals, debts, cdts, recurringPayments, categories] = await Promise.all([
      db.transaction.findFirst({ where: { userId } }),
      db.account.findFirst({ where: { userId } }),
      db.budget.findFirst({ where: { userId } }),
      db.savingsGoal.findFirst({ where: { userId } }),
      db.debt.findFirst({ where: { userId } }),
      db.cDT.findFirst({ where: { userId } }),
      db.recurringPayment.findFirst({ where: { userId } }),
      db.category.findFirst({ where: { userId } }),
    ]);

    if (transactions) discovered.push("create-transaction");
    if (accounts) discovered.push("create-account");
    if (budgets) discovered.push("create-budget");
    if (savingsGoals) discovered.push("create-savings-goal");
    if (debts) discovered.push("create-debt");
    if (cdts) discovered.push("create-cdt");
    if (recurringPayments) discovered.push("create-recurring");
    if (categories) discovered.push("manage-categories");

    // ── Transport scans ──
    const [vehicles, fuelLogs, maintenanceRecords, vehicleDocuments] = await Promise.all([
      db.vehicle.findFirst({ where: { userId } }),
      db.fuelLog.findFirst({ where: { vehicle: { userId } } }),
      db.maintenanceRecord.findFirst({ where: { vehicle: { userId } } }),
      db.vehicleDocument.findFirst({ where: { vehicle: { userId } } }),
    ]);

    if (vehicles) discovered.push("create-vehicle");
    if (fuelLogs) discovered.push("log-fuel");
    if (maintenanceRecords) discovered.push("log-maintenance");
    if (vehicleDocuments) discovered.push("register-document");

    // Check if any vehicle has been updated (currentKm > 0 or has been modified)
    if (vehicles) {
      const updatedVehicle = await db.vehicle.findFirst({
        where: { userId, currentKm: { gt: 0 } },
      });
      if (updatedVehicle) discovered.push("update-km");
    }

    // Check fuel prices
    const fuelPrice = await db.fuelPrice.findFirst({ where: { userId } });
    if (fuelPrice) discovered.push("update-fuel-price");

    // ── Health scans ──
    const [medications, appointments, healthProfiles] = await Promise.all([
      db.medication.findFirst({ where: { userId } }),
      db.medicalAppointment.findFirst({ where: { userId } }),
      db.healthProfile.findFirst({ where: { userId } }),
    ]);

    if (medications) discovered.push("create-medication");
    if (appointments) discovered.push("create-appointment");
    if (healthProfiles) discovered.push("create-health-profile");

    // ── Pantry scans ──
    const [pantryItems, shoppingLists] = await Promise.all([
      db.pantryItem.findFirst({ where: { userId } }),
      db.shoppingList.findFirst({ where: { userId } }),
    ]);

    if (pantryItems) discovered.push("create-pantry-item");
    if (shoppingLists) discovered.push("create-shopping-list");

    // ── Bulk upsert discovered achievements ──
    const featureToModule: Record<string, string> = {
      "create-transaction": "finance",
      "create-account": "finance",
      "create-budget": "finance",
      "create-savings-goal": "finance",
      "create-debt": "finance",
      "create-cdt": "finance",
      "create-recurring": "finance",
      "manage-categories": "finance",
      "simulator-yield": "finance",
      "simulator-credit": "finance",
      "simulator-debt": "finance",
      "create-vehicle": "transport",
      "log-fuel": "transport",
      "log-maintenance": "transport",
      "register-document": "transport",
      "update-km": "transport",
      "update-fuel-price": "transport",
      "create-medication": "health",
      "create-appointment": "health",
      "create-health-profile": "health",
      "create-pantry-item": "pantry",
      "create-shopping-list": "pantry",
    };

    for (const feature of discovered) {
      const module = featureToModule[feature];
      if (!module) continue;

      await db.achievementProgress.upsert({
        where: {
          userId_module_feature: { userId, module, feature },
        },
        create: {
          userId,
          module,
          feature,
          discovered: true,
          discoveredAt: now,
        },
        update: {
          discovered: true,
          discoveredAt: now,
        },
      });
    }

    return NextResponse.json({
      scanned: true,
      discoveredCount: discovered.length,
      discovered,
    });
  } catch (error) {
    console.error("Achievement scan error:", error);
    return NextResponse.json({ error: "Error al escanear logros" }, { status: 500 });
  }
}
