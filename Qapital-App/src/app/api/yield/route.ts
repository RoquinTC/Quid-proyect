import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow } from "@/lib/api";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Get current month
    const now = getColombiaNow();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Get high-yield accounts
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

    // Get high-yield sub-accounts
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

    // Calculate projected yields
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

    for (const account of highYieldAccounts) {
      const existingRecord = account.yieldHistory[0];
      const projectedYield = account.balance * ((account.yieldPercentage || 0) / 100) / 12;

      yields.push({
        id: existingRecord?.id || null,
        accountId: account.id,
        subAccountId: null,
        parentAccountId: null, // Not needed for account-level yields
        accountName: account.name,
        balance: account.balance,
        yieldPercentage: account.yieldPercentage || 0,
        projectedYield,
        actualYield: existingRecord?.actualYield || null,
        isConfirmed: existingRecord?.isConfirmed || false,
        transactionId: existingRecord?.transactionId || null,
      });
    }

    for (const subAccount of highYieldSubAccounts) {
      const existingRecord = subAccount.yieldHistory[0];
      const projectedYield = subAccount.balance * ((subAccount.yieldPercentage || 0) / 100) / 12;

      yields.push({
        id: existingRecord?.id || null,
        accountId: null, // Keep null for backward compat (no direct account relation)
        subAccountId: subAccount.id,
        parentAccountId: subAccount.accountId, // ✅ Parent account ID for sub-accounts
        accountName: `${subAccount.account.name} → ${subAccount.name}`,
        balance: subAccount.balance,
        yieldPercentage: subAccount.yieldPercentage || 0,
        projectedYield,
        actualYield: existingRecord?.actualYield || null,
        isConfirmed: existingRecord?.isConfirmed || false,
        transactionId: existingRecord?.transactionId || null,
      });
    }

    // Also fetch unconfirmed yields from PREVIOUS months (these should always be visible)
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
      // Skip if this account/subAccount is already in the yields array for the current month
      const alreadyExists = yields.some(
        (y) =>
          (y.accountId && y.accountId === record.accountId) ||
          (y.subAccountId && y.subAccountId === record.subAccountId)
      );
      if (alreadyExists) continue;

      const accountName = record.subAccountId && record.subAccount
        ? `${record.subAccount.account.name} → ${record.subAccount.name}`
        : record.account?.name || "Unknown";
      const balance = record.subAccountId && record.subAccount
        ? record.subAccount.balance
        : record.account?.balance || 0;
      const yieldPercentage = record.subAccountId && record.subAccount
        ? (record.subAccount.yieldPercentage || 0)
        : (record.account?.yieldPercentage || 0);

      yields.push({
        id: record.id,
        accountId: record.accountId,
        subAccountId: record.subAccountId,
        parentAccountId: record.subAccountId && record.subAccount ? record.subAccount.accountId : null,
        accountName,
        balance,
        yieldPercentage,
        projectedYield: record.projectedYield,
        actualYield: record.actualYield,
        isConfirmed: false,
        transactionId: record.transactionId,
        isPreviousMonth: true,
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

    const body = await req.json();
    const { accountId, subAccountId, actualYield, yieldPercentage, projectedYield, parentAccountId } = body;

    if (actualYield === undefined) {
      return NextResponse.json({ error: "El rendimiento actual es requerido" }, { status: 400 });
    }

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
          date: getColombiaNow(),
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
          updatedBalance = updatedSub.balance;
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
          updatedBalance = updatedAcc.balance;
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
    console.error("Confirm yield error:", error);
    return NextResponse.json({ error: "Error al confirmar rendimiento" }, { status: 500 });
  }
}
