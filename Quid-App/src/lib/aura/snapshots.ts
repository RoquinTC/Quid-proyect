/**
 * F-55 · Capa de contexto de Aura: lecturas de base de datos.
 *
 * Cada función arma la foto que Aura necesita para responder (saldos,
 * movimientos, deudas, metas, radar, vehículos, salud, despensa) y respeta las
 * reglas de dinero de `docs/reglas-dinero.md` (disponible vs. apartado).
 */

import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { calculateFuelLevel } from "@/lib/fuel-level";
import {
  addDays,
  dateOnly,
  daysInMonth,
  daysUntil,
  formatDate,
  formatDateRange,
  monthsUntil,
  normalize,
  parseDateRange,
  startOfToday,
  type DateRange,
} from "@/lib/aura/utils";

const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export type AccountChoice = {
  id: string;
  name: string;
  balance: number;
  /** F-53 · false cuando la cuenta está marcada como "no disponible". */
  available?: boolean;
  kind: "account" | "subAccount";
  parentAccountId?: string;
  parentAccountName?: string;
};

export type PendingRecurring = {
  id: string;
  description: string;
  amount: number;
  type: string;
  scheduledDate: Date;
  accountId: string | null;
  subAccountId: string | null;
  category: string | null;
  subCategory: string | null;
};

export type DebtChoice = {
  id: string;
  name: string;
  currentBalance: number;
  kind: "debt";
};

export async function getAccountChoices(userId: string): Promise<AccountChoice[]> {
  const accounts = await db.account.findMany({
    where: { userId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { subAccounts: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
  });

  return accounts.flatMap((account) => [
    {
      id: account.id,
      name: account.name,
      balance: toNumber(account.balance),
      available: !account.excludeFromAvailable,
      kind: "account" as const,
    },
    ...account.subAccounts.map((subAccount) => ({
      id: subAccount.id,
      name: `${account.name} / ${subAccount.name}`,
      balance: toNumber(subAccount.balance),
      available: !subAccount.excludeFromAvailable,
      kind: "subAccount" as const,
      parentAccountId: account.id,
      parentAccountName: account.name,
    })),
  ]);
}

export function findMentionedAccount(text: string, accounts: AccountChoice[]) {
  const normalized = normalize(text);
  return accounts.find((account) => {
    const accountName = normalize(account.name);
    const parts = accountName.split(" / ");
    return normalized.includes(accountName) || parts.some((part) => part.length >= 4 && normalized.includes(part));
  });
}

export async function getDebtChoices(userId: string): Promise<DebtChoice[]> {
  const debts = await db.debt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, bank: true, currentBalance: true },
  });

  return debts.map((debt) => ({
    id: debt.id,
    name: debt.bank ? `${debt.name} ${debt.bank}` : debt.name,
    currentBalance: toNumber(debt.currentBalance),
    kind: "debt" as const,
  }));
}

export async function getBalanceSnapshot(userId: string) {
  const accounts = await getAccountChoices(userId);
  // F-53 · lo apartado no es disponible, aunque siga siendo dinero tuyo.
  const availableBalance = accounts
    .filter((account) => account.available !== false)
    .reduce((sum, account) => sum + account.balance, 0);
  const totalBalance = accounts.reduce((sum, account) => sum + account.balance, 0);
  const apartado = totalBalance - availableBalance;
  return { totalBalance, availableBalance, apartado, currency: "COP", accounts };
}

export async function getExpenseSnapshot(userId: string) {
  return getMovementSnapshot(userId, "expense", parseDateRange("este mes"));
}

export async function getMovementSnapshot(userId: string, type: "expense" | "income" | "transfer", range: DateRange) {
  const whereType = type === "transfer" ? "transfer" : type;

  const transactions = await db.transaction.findMany({
    where: { userId, type: whereType, date: { gte: range.start, lt: range.end } },
    orderBy: { date: "desc" },
    select: { type: true, amount: true, category: true, description: true, date: true },
  });

  const total = transactions.reduce((sum, tx) => sum + toNumber(tx.amount), 0);
  const byCategory = transactions.reduce<Record<string, number>>((acc, tx) => {
    const key = tx.category || "Sin categoría";
    acc[key] = (acc[key] || 0) + toNumber(tx.amount);
    return acc;
  }, {});

  return { total, count: transactions.length, byCategory, transactions, range };
}

export async function getPendingRecurring(userId: string): Promise<PendingRecurring[]> {
  return db.recurringPayment
    .findMany({
      where: { userId, status: "pending" },
      orderBy: { scheduledDate: "asc" },
      take: 10,
      select: {
        id: true,
        description: true,
        amount: true,
        actualAmount: true,
        type: true,
        scheduledDate: true,
        accountId: true,
        subAccountId: true,
        category: true,
        subCategory: true,
      },
    })
    .then((items) =>
      items.map((item) => ({
        ...item,
        amount: toNumber(item.actualAmount ?? item.amount),
      }))
    );
}

export async function getPlannerSnapshot(userId: string) {
  const recurring = await getPendingRecurring(userId);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + 7);

  const appointments = await db.medicalAppointment.findMany({
    where: { userId, status: "scheduled", date: { lte: horizon } },
    orderBy: { date: "asc" },
    take: 8,
    select: { specialty: true, doctorName: true, date: true, location: true },
  });

  return {
    recurring: recurring.slice(0, 8),
    appointments,
  };
}

export async function getSavingsSnapshot(userId: string) {
  const goals = await db.savingsGoal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      sourceAccount: { select: { name: true } },
      destinationAccount: { select: { name: true } },
      cdts: { select: { amount: true, bank: true, status: true } },
    },
  });

  return goals.map((goal) => ({
    name: goal.name,
    status: goal.status,
    targetAmount: toNumber(goal.targetAmount),
    currentAmount: toNumber(goal.currentAmount),
    progress: toNumber(goal.targetAmount) > 0 ? Math.round((toNumber(goal.currentAmount) / toNumber(goal.targetAmount)) * 100) : 0,
    deadline: goal.deadline,
    sourceAccount: goal.sourceAccount?.name,
    destinationAccount: goal.destinationAccount?.name,
    cdtsTotal: goal.cdts.reduce((sum, cdt) => sum + toNumber(cdt.amount), 0),
  }));
}

export async function getCdtSnapshot(userId: string) {
  const cdts = await db.cDT.findMany({
    where: { userId },
    orderBy: { endDate: "asc" },
    include: {
      goal: { select: { name: true } },
      account: { select: { name: true } },
    },
  });

  return cdts.map((cdt) => ({
    bank: cdt.bank,
    amount: toNumber(cdt.amount),
    effectiveRate: toNumber(cdt.effectiveRate),
    interestEarned: toNumber(cdt.interestEarned),
    status: cdt.status,
    endDate: cdt.endDate,
    goal: cdt.goal?.name,
    account: cdt.account?.name,
  }));
}

export async function getDebtSnapshot(userId: string) {
  const debts = await db.debt.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      installments: {
        where: { isPaid: false },
        orderBy: { nextPaymentDate: "asc" },
        take: 3,
      },
    },
  });

  return debts.map((debt) => ({
    name: debt.bank ? `${debt.name} ${debt.bank}` : debt.name,
    type: debt.type,
    currentBalance: toNumber(debt.currentBalance),
    totalAmount: toNumber(debt.totalAmount),
    paymentDate: debt.paymentDate,
    installmentsPending: debt.installments.length,
  }));
}

export async function getBudgetSnapshot(userId: string) {
  const budgets = await db.budget.findMany({
    where: { userId },
    orderBy: [{ type: "asc" }, { category: "asc" }],
  });

  return budgets.map((budget) => {
    const amount = toNumber(budget.amount);
    const spent = toNumber(budget.spent);
    return {
      category: budget.subCategory ? `${budget.category} / ${budget.subCategory}` : budget.category,
      type: budget.type,
      amount,
      spent,
      remaining: amount - spent,
      usage: amount > 0 ? Math.round((spent / amount) * 100) : 0,
    };
  });
}

export async function getFinancialRadar(userId: string) {
  const today = dateOnly(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const elapsedDays = Math.max(1, today.getDate());
  const monthDays = daysInMonth(today);

  const [balance, expenses, income, budgets, goals, debts, planner] = await Promise.all([
    getBalanceSnapshot(userId),
    getMovementSnapshot(userId, "expense", { start: monthStart, end: addDays(today, 1), label: "este mes" }),
    getMovementSnapshot(userId, "income", { start: monthStart, end: addDays(today, 1), label: "este mes" }),
    getBudgetSnapshot(userId),
    getSavingsSnapshot(userId),
    getDebtSnapshot(userId),
    getPlannerSnapshot(userId),
  ]);

  const projectedExpenses = Math.round((expenses.total / elapsedDays) * monthDays);
  const netNow = income.total - expenses.total;
  const projectedNet = income.total - projectedExpenses;
  const riskyBudgets = budgets
    .filter((budget) => budget.type === "expense" && budget.amount > 0 && budget.usage >= 80)
    .sort((a, b) => b.usage - a.usage)
    .slice(0, 3);
  const savingsPressure = goals
    .filter((goal) => goal.status !== "completada" && goal.targetAmount > goal.currentAmount)
    .map((goal) => {
      const missing = Math.max(0, goal.targetAmount - goal.currentAmount);
      const months = goal.deadline ? monthsUntil(goal.deadline) : null;
      const monthlyNeed = months ? Math.ceil(missing / months) : null;
      return { ...goal, missing, months, monthlyNeed };
    })
    .sort((a, b) => (b.monthlyNeed || 0) - (a.monthlyNeed || 0))
    .slice(0, 3);
  const debtTotal = debts.reduce((sum, debt) => sum + debt.currentBalance, 0);
  const heaviestDebt = [...debts].sort((a, b) => b.currentBalance - a.currentBalance)[0];
  const upcomingPayments = planner.recurring
    .filter((item) => daysUntil(item.scheduledDate) <= 10)
    .slice(0, 4);

  const alerts: string[] = [];
  if (projectedNet < 0) {
    alerts.push(`Ojo: al ritmo actual el mes cerraría ${COP.format(Math.abs(projectedNet))} por debajo.`);
  } else if (projectedExpenses > income.total * 0.85 && income.total > 0) {
    alerts.push(`Vas apretado: el gasto proyectado se come más del 85% del ingreso registrado este mes.`);
  } else {
    alerts.push(`El flujo no está en rojo: hoy vas ${COP.format(netNow)} ${netNow >= 0 ? "arriba" : "abajo"}.`);
  }

  for (const budget of riskyBudgets) {
    alerts.push(`${budget.category} va al ${budget.usage}% (${COP.format(budget.remaining)} libres).`);
  }

  if (savingsPressure[0]?.monthlyNeed) {
    alerts.push(`Para ${savingsPressure[0].name} necesitas cerca de ${COP.format(savingsPressure[0].monthlyNeed)} al mes.`);
  }

  if (heaviestDebt && debtTotal > 0) {
    alerts.push(`Tu deuda más pesada es ${heaviestDebt.name}: ${COP.format(heaviestDebt.currentBalance)}.`);
  }

  if (upcomingPayments.length > 0) {
    const totalUpcoming = upcomingPayments.reduce((sum, item) => sum + item.amount, 0);
    alerts.push(`En 10 días veo ${upcomingPayments.length} pago(s) por ${COP.format(totalUpcoming)}.`);
  }

  const move =
    riskyBudgets.length > 0
      ? `Corta o pausa ${riskyBudgets[0].category} hasta el próximo corte.`
      : savingsPressure[0]?.monthlyNeed
        ? `Programa un aporte recurrente a ${savingsPressure[0].name}.`
        : heaviestDebt
          ? `Si te sobra caja, ataca primero ${heaviestDebt.name}.`
          : "Sigue registrando movimientos para que el radar se vuelva más filoso.";

  return {
    balance,
    income,
    expenses,
    projectedExpenses,
    projectedNet,
    debtTotal,
    alerts: alerts.slice(0, 6),
    move,
  };
}

export async function getVehicleSnapshot(userId: string) {
  const vehicles = await db.vehicle.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      fuelLogs: { orderBy: { date: "desc" } },
      maintenanceRecords: {
        where: { reminderEnabled: true },
        orderBy: [{ nextDueDate: "asc" }, { nextDueKm: "asc" }],
        take: 5,
      },
      documents: {
        where: { reminderEnabled: true },
        orderBy: { expiryDate: "asc" },
        take: 5,
      },
      reminders: {
        where: { isActive: true },
        orderBy: [{ dueDate: "asc" }, { dueKm: "asc" }],
        take: 5,
      },
    },
  });

  return vehicles.map((vehicle) => {
    const fuelLevel = calculateFuelLevel(
      {
        tankCapacity: vehicle.tankCapacity,
        currentKm: vehicle.currentKm,
        type: vehicle.type,
      },
      vehicle.fuelLogs.map((log) => ({
        id: log.id,
        date: log.date,
        km: log.km,
        amount: toNumber(log.amount),
        pricePerGallon: toNumber(log.pricePerGallon),
        gallons: log.gallons,
        isFullTank: log.isFullTank,
      })),
    );

    return {
      name: vehicle.name,
      type: vehicle.type,
      plate: vehicle.plate,
      currentKm: vehicle.currentKm,
      tankCapacity: vehicle.tankCapacity,
      lastFuelAmount: vehicle.fuelLogs[0] ? toNumber(vehicle.fuelLogs[0].amount) : null,
      fuelLevel: Math.round(fuelLevel.fuelLevel),
      estimatedRange: Math.round(fuelLevel.estimatedRange),
      daysUntilRefuel: fuelLevel.daysUntilRefuel,
      refuelByDate: fuelLevel.refuelByDate ? new Date(fuelLevel.refuelByDate) : null,
      gallonsToRefuel: fuelLevel.gallonsToRefuel,
      isLowFuel: fuelLevel.isLowFuel,
      isLearningFuel: fuelLevel.isLearning,
      anomalyDetected: fuelLevel.anomalyDetected,
      documents: vehicle.documents.map((doc) => ({
        type: doc.type,
        expiryDate: doc.expiryDate,
        daysUntil: daysUntil(doc.expiryDate),
        cost: toNumber(doc.cost),
      })),
      maintenance: vehicle.maintenanceRecords.map((record) => ({
        type: record.type,
        description: record.description,
        nextDueKm: record.nextDueKm,
        nextDueDate: record.nextDueDate,
        kmRemaining: record.nextDueKm ? Math.round(record.nextDueKm - vehicle.currentKm) : null,
        cost: toNumber(record.cost),
      })),
      reminders: vehicle.reminders.map((reminder) => ({
        title: reminder.title,
        dueDate: reminder.dueDate,
        dueKm: reminder.dueKm,
        daysUntil: reminder.dueDate ? daysUntil(reminder.dueDate) : null,
        kmRemaining: reminder.dueKm ? Math.round(reminder.dueKm - vehicle.currentKm) : null,
      })),
    };
  });
}

export async function getTransportRadar(userId: string) {
  const vehicles = await getVehicleSnapshot(userId);
  const alerts: string[] = [];

  for (const vehicle of vehicles) {
    const label = vehicle.plate ? `${vehicle.name} (${vehicle.plate})` : vehicle.name;

    if (vehicle.isLowFuel) {
      alerts.push(`${label}: combustible bajo, quedan aprox. ${vehicle.estimatedRange} km.`);
    } else if (vehicle.daysUntilRefuel !== null && vehicle.daysUntilRefuel <= 5) {
      alerts.push(`${label}: al ritmo actual toca tanquear en ${vehicle.daysUntilRefuel} día${vehicle.daysUntilRefuel === 1 ? "" : "s"}.`);
    }

    if (vehicle.anomalyDetected) {
      alerts.push(`${label}: vi consumo raro de combustible; revisa presión de llantas o fuga.`);
    }

    for (const doc of vehicle.documents) {
      if (doc.daysUntil <= 0) {
        alerts.push(`${label}: ${doc.type.toUpperCase()} vencido o vence hoy.`);
      } else if (doc.daysUntil <= 30) {
        alerts.push(`${label}: ${doc.type.toUpperCase()} vence en ${doc.daysUntil} días.`);
      }
    }

    for (const item of vehicle.maintenance) {
      if (item.kmRemaining !== null && item.kmRemaining <= 0) {
        alerts.push(`${label}: ${item.description} ya está pasado por km.`);
      } else if (item.kmRemaining !== null && item.kmRemaining <= 300) {
        alerts.push(`${label}: ${item.description} viene en ${item.kmRemaining} km.`);
      } else if (item.nextDueDate && daysUntil(item.nextDueDate) <= 14) {
        alerts.push(`${label}: ${item.description} cae en ${daysUntil(item.nextDueDate)} días.`);
      }
    }

    for (const reminder of vehicle.reminders) {
      if (reminder.daysUntil !== null && reminder.daysUntil <= 7) {
        alerts.push(`${label}: recordatorio "${reminder.title}" en ${reminder.daysUntil <= 0 ? "hoy/vencido" : `${reminder.daysUntil} días`}.`);
      } else if (reminder.kmRemaining !== null && reminder.kmRemaining <= 300) {
        alerts.push(`${label}: recordatorio "${reminder.title}" en ${reminder.kmRemaining} km.`);
      }
    }
  }

  const move = alerts.length > 0
    ? alerts[0]
    : vehicles.length > 0
      ? "Transporte se ve tranquilo. Mantén tanqueos con kilometraje para que Aura aprenda mejor tu consumo."
      : "Aún no tienes vehículos registrados; sin vehículo no puedo presionarte con SOAT, combustible ni mantenimiento.";

  return { vehicles, alerts: alerts.slice(0, 8), move };
}

export async function getHealthSnapshot(userId: string) {
  const horizon = addDays(startOfToday(), 30);
  const [appointments, medications] = await Promise.all([
    db.medicalAppointment.findMany({
      where: { userId, status: "scheduled", date: { lte: horizon } },
      orderBy: { date: "asc" },
      take: 8,
    }),
    db.medication.findMany({
      where: { userId, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  return { appointments, medications };
}

export async function getPantrySnapshot(userId: string) {
  const today = startOfToday();
  const soon = addDays(today, 14);
  const items = await db.pantryItem.findMany({
    where: { userId },
    orderBy: [{ expirationDate: "asc" }, { name: "asc" }],
    take: 30,
  });

  const expiring = items.filter((item) => item.expirationDate && item.expirationDate <= soon);
  const lowStock = items.filter((item) => item.minStock != null && item.quantity <= item.minStock);
  return { totalItems: items.length, expiring, lowStock };
}
