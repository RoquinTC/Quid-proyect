import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow, getColombiaTodayString, createColombiaDate, calculateProportionalYield, getDaysInMonth } from "@/lib/api";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, yieldCreateSchema } from "@/lib/validations";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Get current month and days remaining
    const now = getColombiaNow();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysInMonth = getDaysInMonth(now.getFullYear(), now.getMonth());
    const currentDay = now.getDate();
    const daysRemaining = daysInMonth - currentDay + 1; // Include today

    // Result array
    const yields: Array<{
      id: string | null;
      accountId: string | null;
      subAccountId: string | null;
      parentAccountId: string | null;
      accountName: string;
      balance: number;
      yieldPercentage: number;
      projectedYield: number;
      actualYield: number | null;
      isConfirmed: boolean;
      transactionId: string | null;
      isPreviousMonth?: boolean;
      previousMonth?: Date;
    }> = [];

    // Track which account/subAccount IDs we've already added (to avoid duplicates)
    const addedKeys = new Set<string>();

    // ── 1. Current-month projected yields from HIGH-YIELD accounts ──
    const highYieldAccounts = await db.account.findMany({
      where: {
        userId: session.user.id,
        isHighYield: true,
      },
      include: {
        yieldHistory: {
          where: { month: monthStart },
        },
      },
    });

    for (const account of highYieldAccounts) {
      const existingRecord = account.yieldHistory[0];
      const projectedYield = calculateProportionalYield(toNumber(account.balance), toNumber(account.yieldPercentage) || 0, daysRemaining);
      const key = `acc-${account.id}`;

      yields.push({
        id: existingRecord?.id || null,
        accountId: account.id,
        subAccountId: null,
        parentAccountId: null,
        accountName: account.name,
        balance: toNumber(account.balance),
        yieldPercentage: toNumber(account.yieldPercentage) || 0,
        projectedYield,
        actualYield: existingRecord?.actualYield ? toNumber(existingRecord.actualYield) : null,
        isConfirmed: existingRecord?.isConfirmed || false,
        transactionId: existingRecord?.transactionId || null,
      });
      addedKeys.add(key);
    }

    // ── 2. Current-month projected yields from HIGH-YIELD sub-accounts ──
    const highYieldSubAccounts = await db.subAccount.findMany({
      where: {
        account: { userId: session.user.id },
        isHighYield: true,
      },
      include: {
        account: { select: { id: true, name: true } },
        yieldHistory: {
          where: { month: monthStart },
        },
      },
    });

    for (const subAccount of highYieldSubAccounts) {
      const existingRecord = subAccount.yieldHistory[0];
      const projectedYield = calculateProportionalYield(toNumber(subAccount.balance), toNumber(subAccount.yieldPercentage) || 0, daysRemaining);
      const key = `sub-${subAccount.id}`;

      yields.push({
        id: existingRecord?.id || null,
        accountId: null,
        subAccountId: subAccount.id,
        parentAccountId: subAccount.accountId,
        accountName: `${subAccount.account.name} → ${subAccount.name}`,
        balance: toNumber(subAccount.balance),
        yieldPercentage: toNumber(subAccount.yieldPercentage) || 0,
        projectedYield,
        actualYield: existingRecord?.actualYield ? toNumber(existingRecord.actualYield) : null,
        isConfirmed: existingRecord?.isConfirmed || false,
        transactionId: existingRecord?.transactionId || null,
      });
      addedKeys.add(key);
    }

    // ── 3. Current-month yield records NOT already covered above ──
    // This catches confirmed yields for accounts that are no longer isHighYield,
    // or any other yield records that exist for the current month.
    const currentMonthRecords = await db.yieldRecord.findMany({
      where: {
        month: monthStart,
        OR: [
          { account: { userId: session.user.id } },
          { subAccount: { account: { userId: session.user.id } } },
        ],
      },
      include: {
        account: { select: { id: true, name: true, balance: true, yieldPercentage: true, isHighYield: true } },
        subAccount: {
          select: { id: true, name: true, balance: true, yieldPercentage: true, isHighYield: true, accountId: true, account: { select: { id: true, name: true } } },
        },
      },
    });

    for (const record of currentMonthRecords) {
      const key = record.subAccountId ? `sub-${record.subAccountId}` : `acc-${record.accountId}`;
      if (addedKeys.has(key)) continue; // Already added from high-yield accounts above

      const accountName = record.subAccountId && record.subAccount
        ? `${record.subAccount.account.name} → ${record.subAccount.name}`
        : record.account?.name || "Unknown";
      const balance = record.subAccountId && record.subAccount
        ? toNumber(record.subAccount.balance)
        : toNumber(record.account?.balance || 0);
      const yieldPercentage = record.subAccountId && record.subAccount
        ? (toNumber(record.subAccount.yieldPercentage) || 0)
        : (toNumber(record.account?.yieldPercentage) || 0);

      yields.push({
        id: record.id,
        accountId: record.accountId,
        subAccountId: record.subAccountId,
        parentAccountId: record.subAccountId && record.subAccount ? record.subAccount.accountId : null,
        accountName,
        balance,
        yieldPercentage,
        projectedYield: toNumber(record.projectedYield),
        actualYield: toNumber(record.actualYield),
        isConfirmed: record.isConfirmed,
        transactionId: record.transactionId,
      });
      addedKeys.add(key);
    }

    // ── 4. Unconfirmed yields from PREVIOUS months (always visible as overdue) ──
    const previousUnconfirmed = await db.yieldRecord.findMany({
      where: {
        isConfirmed: false,
        month: { lt: monthStart },
        OR: [
          { account: { userId: session.user.id } },
          { subAccount: { account: { userId: session.user.id } } },
        ],
      },
      include: {
        account: { select: { id: true, name: true, balance: true, yieldPercentage: true, isHighYield: true } },
        subAccount: {
          select: { id: true, name: true, balance: true, yieldPercentage: true, isHighYield: true, accountId: true, account: { select: { id: true, name: true } } },
        },
      },
    });

    for (const record of previousUnconfirmed) {
      const key = record.subAccountId ? `prev-sub-${record.id}` : `prev-acc-${record.id}`;

      const accountName = record.subAccountId && record.subAccount
        ? `${record.subAccount.account.name} → ${record.subAccount.name}`
        : record.account?.name || "Unknown";
      const balance = record.subAccountId && record.subAccount
        ? toNumber(record.subAccount.balance)
        : toNumber(record.account?.balance || 0);
      const yieldPercentage = record.subAccountId && record.subAccount
        ? (toNumber(record.subAccount.yieldPercentage) || 0)
        : (toNumber(record.account?.yieldPercentage) || 0);

      yields.push({
        id: record.id,
        accountId: record.accountId,
        subAccountId: record.subAccountId,
        parentAccountId: record.subAccountId && record.subAccount ? record.subAccount.accountId : null,
        accountName,
        balance,
        yieldPercentage,
        projectedYield: toNumber(record.projectedYield),
        actualYield: toNumber(record.actualYield),
        isConfirmed: false,
        transactionId: record.transactionId,
        isPreviousMonth: true,
        previousMonth: record.month,
      });
    }

    // ── 5. Recently confirmed yields from last 3 months (including current month) ──
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const recentConfirmed = await db.yieldRecord.findMany({
      where: {
        isConfirmed: true,
        month: { gte: threeMonthsAgo },
        OR: [
          { account: { userId: session.user.id } },
          { subAccount: { account: { userId: session.user.id } } },
        ],
      },
      include: {
        account: { select: { id: true, name: true, balance: true, yieldPercentage: true, isHighYield: true } },
        subAccount: {
          select: { id: true, name: true, balance: true, yieldPercentage: true, isHighYield: true, accountId: true, account: { select: { id: true, name: true } } },
        },
      },
      orderBy: { month: 'desc' },
    });

    for (const record of recentConfirmed) {
      // Skip if already included from current-month high-yield accounts or current-month records
      const isCurrentMonth = record.month.getTime() === monthStart.getTime();
      const key = record.subAccountId ? `sub-${record.subAccountId}` : `acc-${record.accountId}`;
      if (isCurrentMonth && addedKeys.has(key)) continue;

      const accountName = record.subAccountId && record.subAccount
        ? `${record.subAccount.account.name} → ${record.subAccount.name}`
        : record.account?.name || "Unknown";
      const balance = record.subAccountId && record.subAccount
        ? toNumber(record.subAccount.balance)
        : toNumber(record.account?.balance || 0);
      const yieldPercentage = record.subAccountId && record.subAccount
        ? (toNumber(record.subAccount.yieldPercentage) || 0)
        : (toNumber(record.account?.yieldPercentage) || 0);

      yields.push({
        id: record.id,
        accountId: record.accountId,
        subAccountId: record.subAccountId,
        parentAccountId: record.subAccountId && record.subAccount ? record.subAccount.accountId : null,
        accountName,
        balance,
        yieldPercentage,
        projectedYield: toNumber(record.projectedYield),
        actualYield: toNumber(record.actualYield),
        isConfirmed: true,
        transactionId: record.transactionId,
        isPreviousMonth: !isCurrentMonth,
        previousMonth: record.month,
      });
    }

    return NextResponse.json(yields);
  } catch (error) {
    console.error("Get yields error:", error);
    return NextResponse.json({ error: "Error al obtener rendimientos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await validateBody(req, yieldCreateSchema);
    const { accountId, subAccountId, actualYield, yieldPercentage, projectedYield, parentAccountId } = body;

    const now = getColombiaNow();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Determine target account and sub-account for the transaction
    const isSubAccount = !!subAccountId;
    const targetAccountId = isSubAccount ? parentAccountId : accountId;

    if (!targetAccountId) {
      return NextResponse.json(
        { error: "No se pudo determinar la cuenta destino para el rendimiento" },
        { status: 400 }
      );
    }

    // Create or update yield record
    const yieldRecord = await db.yieldRecord.upsert({
      where: {
        id: body.yieldRecordId || "nonexistent",
      },
      create: {
        accountId: accountId || null,
        subAccountId: subAccountId || null,
        month: monthStart,
        projectedYield: projectedYield || 0,
        actualYield,
        yieldPercentage: yieldPercentage || 0,
        isConfirmed: true,
      },
      update: {
        actualYield,
        isConfirmed: true,
      },
    });

    // Initialize response variables
    let updatedBalance: number | undefined;
    let updatedAccountName: string | undefined;

    // Add income transaction for the yield
    if (actualYield > 0) {
      const monthLabel = monthStart.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
      const description = isSubAccount
        ? `Rendimiento bolsillo - ${monthLabel}`
        : `Rendimiento cuenta - ${monthLabel}`;

      const transaction = await db.transaction.create({
        data: {
          userId: session.user.id,
          accountId: targetAccountId,
          subAccountId: isSubAccount ? subAccountId : null,
          type: "income",
          amount: actualYield,
          description,
          category: "Inversiones",
          date: createColombiaDate(getColombiaTodayString()),
          sourceModule: "finance",
          sourceId: yieldRecord.id, // Link to yield record
        },
      });

      // Save transactionId on the yield record
      await db.yieldRecord.update({
        where: { id: yieldRecord.id },
        data: { transactionId: transaction.id },
      });

      // Update balances — only on the specific account or sub-account
      if (isSubAccount) {
        // Only increment sub-account balance
        await db.subAccount.update({
          where: { id: subAccountId },
          data: { balance: { increment: actualYield } },
        });
        // Fetch updated sub-account with parent name
        const updatedSub = await db.subAccount.findUnique({
          where: { id: subAccountId },
          select: { balance: true, name: true, account: { select: { name: true } } },
        });
        if (updatedSub) {
          updatedBalance = toNumber(updatedSub.balance);
          updatedAccountName = `${updatedSub.account.name} → ${updatedSub.name}`;
        }
      } else {
        // Account-level yield: increment account balance
        await db.account.update({
          where: { id: targetAccountId },
          data: { balance: { increment: actualYield } },
        });
        // Fetch updated account name
        const updatedAcc = await db.account.findUnique({
          where: { id: targetAccountId },
          select: { balance: true, name: true },
        });
        if (updatedAcc) {
          updatedBalance = toNumber(updatedAcc.balance);
          updatedAccountName = updatedAcc.name;
        }
      }
    }

    return NextResponse.json({
      ...yieldRecord,
      updatedBalance,
      updatedAccountName,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Confirm yield error:", error);
    return NextResponse.json({ error: "Error al confirmar rendimiento" }, { status: 500 });
  }
}
