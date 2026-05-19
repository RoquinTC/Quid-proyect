import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { validateBody, cdtCreateSchema } from '@/lib/validations'

// GET /api/cdts — list CDTs for authenticated user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const cdts = await db.cDT.findMany({
      where: { userId: session.user.id },
      include: {
        goal: { select: { id: true, name: true, targetAmount: true, currentAmount: true } },
        account: { select: { id: true, name: true, type: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    return NextResponse.json(cdts)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/cdts — create a CDT
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await validateBody(request, cdtCreateSchema)
    const { bank, amount, effectiveRate, startDate, endDate, termDays, goalId, accountId, notes, color } = body

    const cdt = await db.cDT.create({
      data: {
        userId: session.user.id,
        bank,
        amount: parseFloat(String(amount)),
        effectiveRate: parseFloat(String(effectiveRate)),
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        termDays: termDays || Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)),
        goalId: goalId || null,
        accountId: accountId || null,
        notes: notes || null,
        color: color || '#14B8A6',
      },
      include: {
        goal: { select: { id: true, name: true, targetAmount: true, currentAmount: true } },
        account: { select: { id: true, name: true, type: true, color: true } },
      },
    })

    return NextResponse.json(cdt, { status: 201 })
  } catch (error: any) {
    if (error instanceof Response) return error
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
