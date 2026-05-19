import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { validateBody, accountCreateSchema } from '@/lib/validations'

// GET /api/accounts — list accounts for authenticated user (owned + shared with me)
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // 1. Get accounts owned by the user
    const ownedAccounts = await db.account.findMany({
      where: { userId: session.user.id },
      orderBy: { order: 'asc' },
      include: {
        subAccounts: { orderBy: { order: 'asc' } },
        sharedUsers: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    })

    // 2. Get accounts shared with the user (via SharedAccountUser)
    const sharedLinks = await db.sharedAccountUser.findMany({
      where: { userId: session.user.id },
      select: { accountId: true, role: true },
    })

    const sharedAccountIds = sharedLinks.map((s) => s.accountId)
    const sharedRoleMap = new Map(sharedLinks.map((s) => [s.accountId, s.role]))

    let sharedAccounts: any[] = []
    if (sharedAccountIds.length > 0) {
      sharedAccounts = await db.account.findMany({
        where: { id: { in: sharedAccountIds } },
        orderBy: { order: 'asc' },
        include: {
          subAccounts: { orderBy: { order: 'asc' } },
          sharedUsers: {
            include: { user: { select: { id: true, name: true, email: true } } },
          },
          user: { select: { id: true, name: true, email: true } },
        },
      })
    }

    // 3. Mark shared-with-me accounts and add role info
    const enrichedShared = sharedAccounts.map((acc) => ({
      ...acc,
      isSharedWithMe: true,
      myRole: sharedRoleMap.get(acc.id) || 'viewer',
      ownerName: acc.user?.name || 'Usuario',
    }))

    // 4. Mark owned shared accounts
    const enrichedOwned = ownedAccounts.map((acc) => ({
      ...acc,
      isSharedWithMe: false,
      myRole: 'admin' as const,
      ownerName: null as string | null,
    }))

    // 5. Combine and return (owned first, then shared)
    return NextResponse.json([...enrichedOwned, ...enrichedShared])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST /api/accounts — create an account
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await validateBody(request, accountCreateSchema)
    const { name, type, balance, color, isHighYield, yieldPercentage, isShared, excludeFromAvailable, icon } = body

    if (!name || !type) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }

    // Verify user exists first to avoid P2003
    const userExists = await db.user.findUnique({ where: { id: session.user.id } });
    if (!userExists) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const account = await db.account.create({
      data: {
        userId: session.user.id,
        name,
        type,
        balance: balance || 0,
        color: color || "#10B981",
        isHighYield: isHighYield || false,
        yieldPercentage: isHighYield ? (yieldPercentage || null) : null,
        isShared: isShared || false,
        excludeFromAvailable: excludeFromAvailable || false,
        icon: icon || null,
      },
    })

    return NextResponse.json(account, { status: 201 })
  } catch (error: any) {
    if (error instanceof Response) return error
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
