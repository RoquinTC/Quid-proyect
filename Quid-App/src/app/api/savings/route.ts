import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { verifyEntityOwnership } from '@/lib/auth-guards'
import { getColombiaTodayString, createColombiaDate } from '@/lib/api'
import { toNumber } from '@/lib/decimal-serializer'
import { validateBody, savingsCreateSchema } from '@/lib/validations'

// GET /api/savings — list savings goals for authenticated user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const goals = await db.savingsGoal.findMany({
      where: { userId: session.user.id },
      include: {
        sourceAccount: true,
        destinationAccount: true,
        cdts: {
          include: {
            account: { select: { id: true, name: true, type: true, color: true } },
          },
        },
        linkedAccounts: {
          include: {
            account: { select: { id: true, name: true, type: true, color: true, balance: true } },
            subAccount: { select: { id: true, name: true, balance: true } },
          },
        },
        recurringPayments: {
          where: { status: 'pending' },
          take: 1,
          orderBy: { scheduledDate: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(goals)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/savings — create a savings goal
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    let body
    try {
      body = await validateBody(request, savingsCreateSchema)
    } catch (err) {
      if (err instanceof Response) return err
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }
    const {
      name,
      description,
      targetAmount,
      deadline,
      frequency,
      monthlyDay,
      biweeklyDays,
      weeklyDay,
      periodAmounts,
      sourceAccountId,
      destinationAccountId,
      linkedCDTIds = [],
      linkedAccountItems = [],
      icon,
      color,
      type,
    } = body

    if (!name || !targetAmount || !deadline || !frequency) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    const userId = session.user.id

    // Calculate first scheduled date based on frequency
    const nextDate = calculateFirstDate(frequency, monthlyDay, biweeklyDays, weeklyDay)

    // Calculate the recurring payment amount (monthly total)
    const monthsRemaining = Math.max(1, Math.ceil(
      (new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
    ))

    // CDTs linked reduce the remaining amount to save (only invested value, not expected returns)
    let linkedCDTTotal = 0
    if (linkedCDTIds.length > 0) {
      const cdts = await db.cDT.findMany({
        where: { id: { in: linkedCDTIds }, userId },
      })
      linkedCDTTotal = cdts.reduce((sum, c) => sum + toNumber(c.amount), 0)
    }

    // Calculate linked account balances
    let linkedAccountsTotal = 0
    for (const item of linkedAccountItems) {
      if (item.subAccountId) {
        const sub = await db.subAccount.findFirst({
          where: { id: item.subAccountId, account: { userId } },
        })
        if (!sub) {
          return NextResponse.json({ error: 'Subcuenta vinculada no encontrada o sin permisos' }, { status: 403 })
        }
        linkedAccountsTotal += toNumber(sub.balance)
      } else {
        const acc = await db.account.findFirst({
          where: { id: item.accountId, userId },
        })
        if (!acc) {
          return NextResponse.json({ error: 'Cuenta vinculada no encontrada o sin permisos' }, { status: 403 })
        }
        linkedAccountsTotal += toNumber(acc.balance)
      }
    }

    // Verify ownership of source/destination accounts
    const savingsEntitiesToVerify: { type: "account" | "subAccount" | "debt"; id: string }[] = [];
    if (sourceAccountId) savingsEntitiesToVerify.push({ type: "account", id: sourceAccountId });
    if (destinationAccountId) savingsEntitiesToVerify.push({ type: "account", id: destinationAccountId });

    const savingsOwnershipError = await verifyEntityOwnership(userId, savingsEntitiesToVerify);
    if (savingsOwnershipError) return savingsOwnershipError;

    const totalAlreadyCovered = linkedCDTTotal + linkedAccountsTotal
    const remainingAmount = Math.max(0, targetAmount - totalAlreadyCovered)
    const monthlyQuota = remainingAmount / monthsRemaining

    // Create the goal
    const goal = await db.savingsGoal.create({
      data: {
        userId,
        name,
        description: description || null,
        targetAmount,
        deadline: new Date(deadline),
        frequency,
        monthlyDay: frequency === 'mensual' ? monthlyDay : null,
        biweeklyDays: frequency === 'quincenal' ? biweeklyDays : null,
        weeklyDay: frequency === 'semanal' ? weeklyDay : null,
        periodAmounts: periodAmounts || null,
        sourceAccountId: sourceAccountId || null,
        destinationAccountId: destinationAccountId || null,
        status: 'activa',
        icon: icon || null,
        color: color || '#8B5CF6',
        type: type || 'general',
      },
      include: {
        sourceAccount: true,
        destinationAccount: true,
        cdts: true,
      },
    })

    // Link CDTs to this goal by updating their goalId
    if (linkedCDTIds.length > 0) {
      await db.cDT.updateMany({
        where: { id: { in: linkedCDTIds }, userId },
        data: { goalId: goal.id },
      })
    }

    // Link accounts to this goal + create contributions for their balances
    for (const item of linkedAccountItems) {
      await db.savingsGoalAccount.create({
        data: {
          goalId: goal.id,
          accountId: item.accountId,
          subAccountId: item.subAccountId || null,
        },
      })

      // Create contribution record for the linked account balance
      const bal = item.subAccountId
        ? toNumber((await db.subAccount.findUnique({ where: { id: item.subAccountId } }))?.balance || 0)
        : toNumber((await db.account.findUnique({ where: { id: item.accountId } }))?.balance || 0)

      if (bal > 0) {
        await db.savingsContribution.create({
          data: {
            goalId: goal.id,
            amount: bal,
            date: createColombiaDate(getColombiaTodayString()),
            description: `Saldo cuenta vinculada`,
          },
        })
      }
    }

    // Update currentAmount with linked accounts + CDTs total
    const totalInitialAmount = linkedAccountsTotal + linkedCDTTotal;
    if (totalInitialAmount > 0) {
      await db.savingsGoal.update({
        where: { id: goal.id },
        data: { currentAmount: totalInitialAmount },
      })
    }

    // Create recurring payment(s) linked to this goal — type transfer
    // accountId = source (where money leaves), destinationAccountId = destination (where money arrives)
    // For biweekly: create 2 recurring payments (one per day with its amount)
    // For weekly: create 4 recurring payments (one per week with its amount)
    // For monthly: create 1 recurring payment as before
    if (frequency === 'quincenal') {
      // Parse biweekly days and amounts
      const days = biweeklyDays ? JSON.parse(biweeklyDays) : [1, 15]
      const amounts = periodAmounts ? JSON.parse(periodAmounts) : [Math.round(monthlyQuota / 2), Math.round(monthlyQuota / 2)]
      const labels = ['Primera quincena', 'Segunda quincena']

      for (let i = 0; i < 2; i++) {
        const scheduledDate = calculateFirstDateForDay(days[i])
        const amount = amounts[i] || Math.round(monthlyQuota / 2)

        await db.recurringPayment.create({
          data: {
            userId,
            description: `Aporte meta: ${name} (${labels[i]})`,
            amount,
            type: 'transfer',
            category: 'Ahorros',
            subCategory: name,
            frequency: 'biweekly',
            scheduledDate,
            accountId: sourceAccountId || null,
            destinationAccountId: destinationAccountId || null,
            customDays: JSON.stringify([days[i]]),
            periodAmounts: JSON.stringify([amount]),
            savingsGoalId: goal.id,
            isRecurring: true,
          },
        })
      }
    } else if (frequency === 'semanal') {
      // Parse weekly amounts
      const amounts = periodAmounts ? JSON.parse(periodAmounts) : [Math.round(monthlyQuota / 4), Math.round(monthlyQuota / 4), Math.round(monthlyQuota / 4), Math.round(monthlyQuota / 4)]
      const labels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4']

      for (let i = 0; i < 4; i++) {
        const scheduledDate = calculateFirstDateForWeek(i + 1, weeklyDay || 1)
        const amount = amounts[i] || Math.round(monthlyQuota / 4)

        await db.recurringPayment.create({
          data: {
            userId,
            description: `Aporte meta: ${name} (${labels[i]})`,
            amount,
            type: 'transfer',
            category: 'Ahorros',
            subCategory: name,
            frequency: 'weekly',
            scheduledDate,
            accountId: sourceAccountId || null,
            destinationAccountId: destinationAccountId || null,
            customDays: null,
            periodAmounts: JSON.stringify([amount]),
            savingsGoalId: goal.id,
            isRecurring: true,
          },
        })
      }
    } else {
      // Monthly: single recurring payment as before
      await db.recurringPayment.create({
        data: {
          userId,
          description: `Aporte meta: ${name}`,
          amount: Math.round(monthlyQuota),
          type: 'transfer',
          category: 'Ahorros',
          subCategory: name,
          frequency: 'monthly',
          scheduledDate: nextDate,
          accountId: sourceAccountId || null,
          destinationAccountId: destinationAccountId || null,
          customDays: monthlyDay ? JSON.stringify([monthlyDay]) : null,
          periodAmounts: periodAmounts || null,
          savingsGoalId: goal.id,
          isRecurring: true,
        },
      })
    }

    // Sync savings budget to keep budget progress accurate
    const { syncSavingsBudget } = await import('@/lib/savings-budget-sync')
    await syncSavingsBudget(userId)

    // Re-fetch with all includes for the response
    const fullGoal = await db.savingsGoal.findUnique({
      where: { id: goal.id },
      include: {
        sourceAccount: true,
        destinationAccount: true,
        cdts: {
          include: {
            account: { select: { id: true, name: true, type: true, color: true } },
          },
        },
        linkedAccounts: {
          include: {
            account: { select: { id: true, name: true, type: true, color: true, balance: true } },
            subAccount: { select: { id: true, name: true, balance: true } },
          },
        },
        recurringPayments: {
          where: { status: 'pending' },
          take: 1,
          orderBy: { scheduledDate: 'asc' },
        },
      },
    })

    return NextResponse.json(fullGoal, { status: 201 })
  } catch (error: any) {
    if (error instanceof Response) return error
    console.error('Create savings goal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// --- Helper: Calculate first scheduled date ---
function calculateFirstDate(
  frequency: string,
  monthlyDay?: number,
  biweeklyDays?: string,
  weeklyDay?: number,
): Date {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  if (frequency === 'mensual') {
    const day = monthlyDay || 1
    const clamped = clampDay(day, currentMonth, currentYear)
    let date = new Date(currentYear, currentMonth, clamped)
    if (date <= now) {
      const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
      const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
      date = new Date(nextYear, nextMonth, clampDay(day, nextMonth, nextYear))
    }
    return date
  }

  if (frequency === 'quincenal') {
    const days = biweeklyDays ? JSON.parse(biweeklyDays) : [1, 15]
    const day1 = clampDay(days[0], currentMonth, currentYear)
    const day2 = clampDay(days[1], currentMonth, currentYear)

    const date1 = new Date(currentYear, currentMonth, day1)
    const date2 = new Date(currentYear, currentMonth, day2)

    if (date1 > now) return date1
    if (date2 > now) return date2

    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
    return new Date(nextYear, nextMonth, clampDay(days[0], nextMonth, nextYear))
  }

  if (frequency === 'semanal') {
    const targetDay = weeklyDay ?? 1
    const currentDOW = now.getDay()
    const diff = (targetDay - currentDOW + 7) % 7
    const nextOccurrence = new Date(now)
    nextOccurrence.setDate(now.getDate() + (diff === 0 ? 7 : diff))
    return nextOccurrence
  }

  return new Date(now.getFullYear(), now.getMonth() + 1, 1)
}

// --- Helper: Calculate first scheduled date for a specific day-of-month ---
// Used when creating separate recurring payments per biweekly day
function calculateFirstDateForDay(dayOfMonth: number): Date {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const clamped = clampDay(dayOfMonth, currentMonth, currentYear)
  let date = new Date(currentYear, currentMonth, clamped)
  if (date <= now) {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
    date = new Date(nextYear, nextMonth, clampDay(dayOfMonth, nextMonth, nextYear))
  }
  return date
}

// --- Helper: Calculate first scheduled date for a specific week-of-month and day-of-week ---
// weekNumber: 1-4 (first to fourth week), dayOfWeek: 0=Sunday ... 6=Saturday
function calculateFirstDateForWeek(weekNumber: number, dayOfWeek: number): Date {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  // Calculate the date for the Nth occurrence of dayOfWeek in current month
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
  const firstDayDOW = firstDayOfMonth.getDay()
  // Offset to the first occurrence of the target day-of-week
  const offset = (dayOfWeek - firstDayDOW + 7) % 7
  const targetDate = new Date(currentYear, currentMonth, 1 + offset + (weekNumber - 1) * 7)

  // If the target date is in the past or doesn't exist in this month, move to next month
  if (targetDate.getMonth() !== currentMonth || targetDate <= now) {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
    const firstDayOfNext = new Date(nextYear, nextMonth, 1)
    const firstDayNextDOW = firstDayOfNext.getDay()
    const nextOffset = (dayOfWeek - firstDayNextDOW + 7) % 7
    return new Date(nextYear, nextMonth, 1 + nextOffset + (weekNumber - 1) * 7)
  }

  return targetDate
}

function clampDay(day: number, month: number, year: number): number {
  const maxDays = new Date(year, month + 1, 0).getDate()
  return Math.min(day, maxDays)
}
