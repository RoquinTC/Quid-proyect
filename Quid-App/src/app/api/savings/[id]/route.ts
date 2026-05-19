import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { syncSavingsBudget } from '@/lib/savings-budget-sync'
import { getColombiaTodayString, createColombiaDate } from '@/lib/api'
import { toNumber } from '@/lib/decimal-serializer'
import { validateBody, savingsUpdateSchema } from '@/lib/validations'

// GET /api/savings/[id] — get a single savings goal
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const goal = await db.savingsGoal.findUnique({
      where: { id, userId: session.user.id },
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
    if (!goal) {
      return NextResponse.json({ error: 'Meta no encontrada' }, { status: 404 })
    }
    return NextResponse.json(goal)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT /api/savings/[id] — update a savings goal
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    let body
    try {
      body = await validateBody(request, savingsUpdateSchema)
    } catch (err) {
      if (err instanceof Response) return err
      return NextResponse.json({ error: 'Error interno' }, { status: 500 })
    }
    const {
      name,
      targetAmount,
      deadline,
      frequency,
      monthlyDay,
      biweeklyDays,
      weeklyDay,
      periodAmounts,
      sourceAccountId,
      destinationAccountId,
      linkedCDTIds,
      linkedAccountItems,
    } = body

    // Update the goal
    const goal = await db.savingsGoal.update({
      where: { id, userId: session.user.id },
      data: {
        ...(name !== undefined && { name }),
        ...(targetAmount !== undefined && { targetAmount }),
        ...(deadline !== undefined && { deadline: deadline ? new Date(deadline) : null }),
        ...(frequency !== undefined && { frequency }),
        ...(monthlyDay !== undefined && { monthlyDay: frequency === 'mensual' ? monthlyDay : null }),
        ...(biweeklyDays !== undefined && { biweeklyDays: frequency === 'quincenal' ? biweeklyDays : null }),
        ...(weeklyDay !== undefined && { weeklyDay: frequency === 'semanal' ? weeklyDay : null }),
        ...(periodAmounts !== undefined && { periodAmounts }),
        ...(sourceAccountId !== undefined && { sourceAccountId: sourceAccountId || null }),
        ...(destinationAccountId !== undefined && { destinationAccountId: destinationAccountId || null }),
      },
      include: {
        sourceAccount: true,
        destinationAccount: true,
        cdts: true,
      },
    })

    // Recalculate monthly quota and recreate recurring payments
    if (targetAmount || deadline || frequency || periodAmounts || biweeklyDays || monthlyDay || weeklyDay) {
      // Get current CDT total for this goal (before any relinking)
      const currentCdts = await db.cDT.findMany({ where: { goalId: id } })
      const linkedCDTTotal = currentCdts.reduce((sum, cdt) => sum + toNumber(cdt.amount), 0)

      // Get current contributions total
      const allContributions = await db.savingsContribution.aggregate({
        where: { goalId: id },
        _sum: { amount: true },
      })
      const contributionsTotal = toNumber(allContributions._sum.amount || 0);

      const monthsRemaining = Math.max(1, Math.ceil(
        ((goal.deadline || new Date()).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
      ))

      const remainingAmount = Math.max(0, toNumber(goal.targetAmount) - contributionsTotal - linkedCDTTotal)
      const monthlyQuota = remainingAmount / monthsRemaining

      const effectiveFrequency = goal.frequency
      const effectiveName = goal.name
      const effectiveSourceAccountId = sourceAccountId !== undefined ? sourceAccountId : goal.sourceAccountId
      const effectiveDestAccountId = destinationAccountId !== undefined ? destinationAccountId : goal.destinationAccountId

      // Delete all pending recurring payments linked to this goal and recreate them
      await db.recurringPayment.deleteMany({
        where: { savingsGoalId: id, status: 'pending' },
      })

      if (effectiveFrequency === 'quincenal') {
        const effectiveBiweeklyDays = biweeklyDays || goal.biweeklyDays || '[1,15]'
        const effectivePeriodAmounts = periodAmounts || goal.periodAmounts
        const days = JSON.parse(effectiveBiweeklyDays)
        const amounts = effectivePeriodAmounts ? JSON.parse(effectivePeriodAmounts) : [Math.round(monthlyQuota / 2), Math.round(monthlyQuota / 2)]
        const labels = ['Primera quincena', 'Segunda quincena']

        for (let i = 0; i < 2; i++) {
          const scheduledDate = calculateFirstDateForDay(days[i])
          const amount = amounts[i] || Math.round(monthlyQuota / 2)

          await db.recurringPayment.create({
            data: {
              userId: session.user.id,
              description: `Aporte meta: ${effectiveName} (${labels[i]})`,
              amount,
              type: 'transfer',
              category: 'Ahorros',
              subCategory: effectiveName,
              frequency: 'biweekly',
              scheduledDate,
              accountId: effectiveSourceAccountId || null,
              destinationAccountId: effectiveDestAccountId || null,
              customDays: JSON.stringify([days[i]]),
              periodAmounts: JSON.stringify([amount]),
              savingsGoalId: id,
              isRecurring: true,
            },
          })
        }
      } else if (effectiveFrequency === 'semanal') {
        const effectiveWeeklyDay = weeklyDay !== undefined ? weeklyDay : goal.weeklyDay || 1
        const effectivePeriodAmounts = periodAmounts || goal.periodAmounts
        const amounts = effectivePeriodAmounts ? JSON.parse(effectivePeriodAmounts) : [Math.round(monthlyQuota / 4), Math.round(monthlyQuota / 4), Math.round(monthlyQuota / 4), Math.round(monthlyQuota / 4)]
        const labels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4']

        for (let i = 0; i < 4; i++) {
          const scheduledDate = calculateFirstDateForWeek(i + 1, effectiveWeeklyDay)
          const amount = amounts[i] || Math.round(monthlyQuota / 4)

          await db.recurringPayment.create({
            data: {
              userId: session.user.id,
              description: `Aporte meta: ${effectiveName} (${labels[i]})`,
              amount,
              type: 'transfer',
              category: 'Ahorros',
              subCategory: effectiveName,
              frequency: 'weekly',
              scheduledDate,
              accountId: effectiveSourceAccountId || null,
              destinationAccountId: effectiveDestAccountId || null,
              customDays: null,
              periodAmounts: JSON.stringify([amount]),
              savingsGoalId: id,
              isRecurring: true,
            },
          })
        }
      } else {
        // Monthly: single recurring payment
        const effectiveMonthlyDay = monthlyDay !== undefined ? monthlyDay : goal.monthlyDay || 1
        const scheduledDate = calculateFirstDateForDay(effectiveMonthlyDay)

        await db.recurringPayment.create({
          data: {
            userId: session.user.id,
            description: `Aporte meta: ${effectiveName}`,
            amount: Math.round(monthlyQuota),
            type: 'transfer',
            category: 'Ahorros',
            subCategory: effectiveName,
            frequency: 'monthly',
            scheduledDate,
            accountId: effectiveSourceAccountId || null,
            destinationAccountId: effectiveDestAccountId || null,
            customDays: JSON.stringify([effectiveMonthlyDay]),
            periodAmounts: periodAmounts || goal.periodAmounts || null,
            savingsGoalId: id,
            isRecurring: true,
          },
        })
      }
    }

    // Update source/destination accounts on pending recurring payments if changed (without recreating)
    if ((sourceAccountId !== undefined || destinationAccountId !== undefined) && !targetAmount && !deadline && !frequency && !periodAmounts && !biweeklyDays && !monthlyDay && !weeklyDay) {
      const updateData: any = {}
      if (sourceAccountId !== undefined) updateData.accountId = sourceAccountId || null
      if (destinationAccountId !== undefined) updateData.destinationAccountId = destinationAccountId || null
      if (name) {
        updateData.description = `Aporte meta: ${name}`
        updateData.subCategory = name
      }

      if (Object.keys(updateData).length > 0) {
        await db.recurringPayment.updateMany({
          where: { savingsGoalId: id, status: 'pending' },
          data: updateData,
        })
      }
    }

    // Update linked CDTs if provided
    if (linkedCDTIds !== undefined) {
      await db.cDT.updateMany({
        where: { goalId: id },
        data: { goalId: null },
      })
      if (linkedCDTIds.length > 0) {
        await db.cDT.updateMany({
          where: { id: { in: linkedCDTIds } },
          data: { goalId: id },
        })
      }
    }

    // Update linked accounts if provided
    if (linkedAccountItems !== undefined) {
      // Remove existing linked accounts
      await db.savingsGoalAccount.deleteMany({
        where: { goalId: id },
      })

      // Remove old contributions from linked accounts
      await db.savingsContribution.deleteMany({
        where: {
          goalId: id,
          description: 'Saldo cuenta vinculada',
        },
      })

      // Add new linked accounts
      let newLinkedTotal = 0
      for (const item of linkedAccountItems) {
        await db.savingsGoalAccount.create({
          data: {
            goalId: id,
            accountId: item.accountId,
            subAccountId: item.subAccountId || null,
          },
        })

        const bal = item.subAccountId
          ? toNumber((await db.subAccount.findUnique({ where: { id: item.subAccountId } }))?.balance || 0)
          : toNumber((await db.account.findUnique({ where: { id: item.accountId } }))?.balance || 0)

        if (bal > 0) {
          await db.savingsContribution.create({
            data: {
              goalId: id,
              amount: bal,
              date: createColombiaDate(getColombiaTodayString()),
              description: 'Saldo cuenta vinculada',
            },
          })
          newLinkedTotal += bal
        }
      }
    }

    // ============================================================
    // FINAL RECALCULATION: Always recalculate currentAmount
    // using the authoritative sync function after ALL updates.
    // This ensures CDTs + linked accounts + contributions are
    // always correctly reflected, regardless of which fields
    // were changed during the edit.
    // ============================================================
    await syncSavingsBudget(session.user.id)

    // Re-fetch with full includes for response (AFTER sync, so data is fresh)
    const fullGoal = await db.savingsGoal.findUnique({
      where: { id },
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

    return NextResponse.json(fullGoal)
  } catch (error: any) {
    if (error instanceof Response) return error
    console.error('Update savings goal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE /api/savings/[id]
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Unlink CDTs first
    await db.cDT.updateMany({
      where: { goalId: id },
      data: { goalId: null },
    })
    // Delete recurring payments linked to this goal
    await db.recurringPayment.deleteMany({ where: { savingsGoalId: id } })
    // Delete the goal (cascade will handle contributions, linked accounts)
    await db.savingsGoal.delete({ where: { id, userId: session.user.id } })

    // Sync budget after deletion so the Ahorros budget reflects the change
    await syncSavingsBudget(session.user.id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// --- Helper: Calculate first scheduled date for a specific day-of-month ---
function calculateFirstDateForDay(dayOfMonth: number): Date {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const maxDays = new Date(currentYear, currentMonth + 1, 0).getDate()
  const clamped = Math.min(dayOfMonth, maxDays)
  let date = new Date(currentYear, currentMonth, clamped)
  if (date <= now) {
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear
    const nextMaxDays = new Date(nextYear, nextMonth + 1, 0).getDate()
    date = new Date(nextYear, nextMonth, Math.min(dayOfMonth, nextMaxDays))
  }
  return date
}

// --- Helper: Calculate first scheduled date for a specific week-of-month and day-of-week ---
function calculateFirstDateForWeek(weekNumber: number, dayOfWeek: number): Date {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const firstDayOfMonth = new Date(currentYear, currentMonth, 1)
  const firstDayDOW = firstDayOfMonth.getDay()
  const offset = (dayOfWeek - firstDayDOW + 7) % 7
  const targetDate = new Date(currentYear, currentMonth, 1 + offset + (weekNumber - 1) * 7)

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
