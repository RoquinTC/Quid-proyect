import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow, createColombiaDate, getColombiaTodayString } from "@/lib/api";
import { verifyEntityMutationAccess } from "@/lib/auth-guards";
import { validateBody, transactionCreateSchema } from "@/lib/validations";
import { createAndPushNotification } from "@/lib/push";
import {
  applyBalanceDelta,
  applyBudgetDelta,
  assertSubAccountBelongsToAccount,
  getTransactionBalanceDelta,
  getUniqueBalanceSnapshots,
  type BalanceSnapshot,
} from "@/lib/finance-ledger";

function normalizeSubAccountId(value: string | null | undefined) {
  return value && value !== "none" && value !== "__none__" ? value : null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("accountId");
    const subAccountId = searchParams.get("subAccountId");
    const category = searchParams.get("category");
    const type = searchParams.get("type");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const sourceModule = searchParams.get("sourceModule");
    const cursor = searchParams.get("cursor");
    const pageSizeParam = searchParams.get("pageSize");
    const minAmount = searchParams.get("minAmount");
    const maxAmount = searchParams.get("maxAmount");

    const pageSize = pageSizeParam ? parseInt(pageSizeParam, 10) : 50;

    const where: Record<string, unknown> = { userId: session.user.id };

    // For shared accounts, also include transactions created by other users
    // that belong to accounts the current user has access to.
    // Two sources of shared account IDs:
    // 1. Accounts shared WITH me (via SharedAccountUser)
    // 2. Accounts I OWN that are shared with others (isShared: true)
    const accessibleViaSharing = await db.sharedAccountUser.findMany({
      where: { userId: session.user.id },
      select: { accountId: true },
    });
    const sharedWithMeIds = accessibleViaSharing.map((a) => a.accountId);

    const ownedSharedAccounts = await db.account.findMany({
      where: { userId: session.user.id, isShared: true },
      select: { id: true },
    });
    const ownedSharedIds = ownedSharedAccounts.map((a) => a.id);

    // Combine both sources
    const allSharedAccountIds = [...new Set([...sharedWithMeIds, ...ownedSharedIds])];

    // Build the where clause: own transactions OR transactions in shared accounts
    if (allSharedAccountIds.length > 0) {
      where.OR = [
        { userId: session.user.id },
        { accountId: { in: allSharedAccountIds } },
      ];
      delete where.userId;
    }

    if (accountId) where.accountId = accountId;
    if (subAccountId) where.subAccountId = subAccountId;
    if (category) where.category = category;
    if (type) where.type = type;
    if (sourceModule) where.sourceModule = sourceModule;

    if (startDate || endDate) {
      const dateFilter: Record<string, Date> = {};
      if (startDate) dateFilter.gte = createColombiaDate(startDate.split("T")[0]);
      if (endDate) {
        // Use `lt` with the NEXT day at midnight Colombia to include the ENTIRE end date.
        // Previously used `lte` with midnight, which excluded transactions created
        // with non-midnight timestamps (e.g., getColombiaNow() at 3pm).
        const endParts = endDate.split("T")[0].split("-").map(Number);
        dateFilter.lt = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2] + 1, 5, 0, 0, 0));
      }
      where.date = dateFilter;
    }

    if (minAmount || maxAmount) {
      const amountFilter: Record<string, number> = {};
      if (minAmount) amountFilter.gte = parseFloat(minAmount);
      if (maxAmount) amountFilter.lte = parseFloat(maxAmount);
      where.amount = amountFilter;
    }

    const query: Record<string, unknown> = {
      where,
      include: {
        account: { select: { id: true, name: true, type: true, color: true } },
        subAccount: { select: { id: true, name: true, color: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { date: "desc" },
      take: pageSize + 1, // Take one extra to determine if there's a next page
    };

    if (cursor) {
      query.skip = 1;
      query.cursor = { id: cursor };
    }

    const transactions = await db.transaction.findMany(query as Parameters<typeof db.transaction.findMany>[0]);

    // Determine next cursor
    let nextCursor: string | null = null;
    if (transactions.length > pageSize) {
      const nextItem = transactions.pop(); // Remove the extra item
      nextCursor = nextItem!.id;
    }

    // For transfer transactions, fetch the destination account info via relatedTransactionId
    // For income transactions that are transfer counterparts, fetch the source account info
    const transferTxIds = transactions
      .filter((tx) => tx.type === "transfer" && tx.relatedTransactionId)
      .map((tx) => tx.relatedTransactionId!);

    // Income transactions that are transfer counterparts (they point to the source transfer tx)
    const counterpartTxIds = transactions
      .filter((tx) => tx.type === "income" && tx.relatedTransactionId)
      .map((tx) => tx.relatedTransactionId!);

    const allRelatedIds = [...new Set([...transferTxIds, ...counterpartTxIds])];

    let relatedAccounts: Record<string, { id: string; name: string; color: string }> = {};
    if (allRelatedIds.length > 0) {
      const relatedTxs = await db.transaction.findMany({
        where: { id: { in: allRelatedIds } },
        include: { account: { select: { id: true, name: true, color: true } } },
      });
      for (const rtx of relatedTxs) {
        if (rtx.account) {
          relatedAccounts[rtx.id] = rtx.account as { id: string; name: string; color: string };
        }
      }
    }

    const enriched = transactions.map((tx) => ({
      ...tx,
      // For transfer type: show the destination account
      transferToAccount: tx.type === "transfer" && tx.relatedTransactionId
        ? relatedAccounts[tx.relatedTransactionId] || null
        : null,
      // For income that is a transfer counterpart: show the source account and flag it
      isTransferCounterpart: tx.type === "income" && !!tx.relatedTransactionId,
      transferFromAccount: tx.type === "income" && tx.relatedTransactionId
        ? relatedAccounts[tx.relatedTransactionId] || null
        : null,
    }));

    return NextResponse.json({ transactions: enriched, nextCursor });
  } catch (error) {
    console.error("Get transactions error:", error);
    return NextResponse.json({ error: "Error al obtener transacciones" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await validateBody(req, transactionCreateSchema);
    const { type, amount, description, accountId, subAccountId, category, subCategory, date, sourceModule, sourceId, isRecurring, notes, transferToAccountId, transferToSubAccountId, excludeFromBudget, receiptUrl } = body;
    const sourceSubAccountId = normalizeSubAccountId(subAccountId);
    const destinationSubAccountId = normalizeSubAccountId(transferToSubAccountId);

    if (!type || !amount || !description) {
      return NextResponse.json({ error: "Tipo, monto y descripción son requeridos" }, { status: 400 });
    }

    if (type === "transfer") {
      if (!accountId || !transferToAccountId) {
        return NextResponse.json({ error: "Cuenta origen y cuenta destino son requeridas" }, { status: 400 });
      }

      if (accountId === transferToAccountId && sourceSubAccountId === destinationSubAccountId) {
        return NextResponse.json(
          { error: "El origen y el destino de la transferencia no pueden ser el mismo lugar" },
          { status: 400 }
        );
      }
    }

    // Verify write access of all referenced entities. Accounts and sub-accounts
    // can be owned by the user or shared with editor access.
    const entitiesToVerify: { type: "account" | "subAccount" | "debt"; id: string }[] = [];
    if (accountId) entitiesToVerify.push({ type: "account", id: accountId });
    if (sourceSubAccountId) entitiesToVerify.push({ type: "subAccount", id: sourceSubAccountId });
    if (transferToAccountId) entitiesToVerify.push({ type: "account", id: transferToAccountId });
    if (destinationSubAccountId) entitiesToVerify.push({ type: "subAccount", id: destinationSubAccountId });

    const accessError = await verifyEntityMutationAccess(session.user.id, entitiesToVerify);
    if (accessError) return accessError;

    const movementDate = date
      ? createColombiaDate(date.split("T")[0])
      : createColombiaDate(getColombiaTodayString());

    const { transaction, updatedBalances } = await db.$transaction(async (tx) => {
      try {
        await assertSubAccountBelongsToAccount(
          tx,
          sourceSubAccountId,
          accountId,
          "El bolsillo origen no pertenece a la cuenta origen"
        );
        await assertSubAccountBelongsToAccount(
          tx,
          destinationSubAccountId,
          transferToAccountId,
          "El bolsillo destino no pertenece a la cuenta destino"
        );
      } catch (validationError) {
        throw new Error(validationError instanceof Error ? validationError.message : "Transferencia inválida");
      }

      const createdTransaction = await tx.transaction.create({
        data: {
          userId: session.user.id,
          type,
          amount,
          description,
          accountId: accountId || null,
          subAccountId: sourceSubAccountId,
          category: category || null,
          subCategory: subCategory || null,
          date: movementDate,
          sourceModule: sourceModule || null,
          sourceId: sourceId || null,
          isRecurring: isRecurring || false,
          notes: notes || null,
          excludeFromBudget: excludeFromBudget || false,
          receiptUrl: receiptUrl || null,
        },
        include: {
          account: { select: { id: true, name: true, type: true, color: true } },
          subAccount: { select: { id: true, name: true, color: true } },
        },
      });

      await applyBalanceDelta(tx, {
        accountId: accountId || null,
        subAccountId: sourceSubAccountId,
        amount: getTransactionBalanceDelta(type, amount),
      });

      if (type === "expense" || type === "income") {
        await applyBudgetDelta(tx, {
          userId: session.user.id,
          category: category || null,
          subCategory: subCategory || null,
          type,
          amount,
          excludeFromBudget,
        });
      }

      if (type === "transfer" && transferToAccountId) {
        const sourceAccount = await tx.account.findUnique({
          where: { id: accountId || "" },
          select: { name: true },
        });

        const counterpart = await tx.transaction.create({
          data: {
            userId: session.user.id,
            type: "income",
            amount,
            description: `Transferencia recibida: ${description}`,
            accountId: transferToAccountId,
            subAccountId: destinationSubAccountId,
            category: "Otros",
            date: movementDate,
            notes: `Transferencia desde ${sourceAccount?.name || "cuenta"}`,
            excludeFromBudget: true,
            relatedTransactionId: createdTransaction.id,
          },
        });

        await tx.transaction.update({
          where: { id: createdTransaction.id },
          data: { relatedTransactionId: counterpart.id },
        });

        await applyBalanceDelta(tx, {
          accountId: transferToAccountId,
          subAccountId: destinationSubAccountId,
          amount,
        });

        createdTransaction.relatedTransactionId = counterpart.id;
      }

      const balances: BalanceSnapshot[] = await getUniqueBalanceSnapshots(tx, [
        { accountId: accountId || null, subAccountId: sourceSubAccountId },
        { accountId: transferToAccountId || null, subAccountId: destinationSubAccountId },
      ]);

      return { transaction: createdTransaction, updatedBalances: balances };
    });

    // Notify other shared account users about new transaction
    if (accountId) {

    // ── Sync savings goals if this account is linked to a savings goal ──
    // When a transaction changes an account's balance, any savings goal linked
    // to that account needs its currentAmount recalculated.
    try {
      const affectedAccountIds = [accountId];
      if (transferToAccountId) affectedAccountIds.push(transferToAccountId);

      const linkedGoals = await db.savingsGoalAccount.findFirst({
        where: {
          OR: [
            { accountId: { in: affectedAccountIds } },
            { subAccountId: sourceSubAccountId || undefined },
            { subAccountId: destinationSubAccountId || undefined },
          ].filter(Boolean),
        },
      });

      if (linkedGoals) {
        const { syncSavingsBudget } = await import("@/lib/savings-budget-sync");
        await syncSavingsBudget(session.user.id);
      }
    } catch (syncError) {
      console.error("Failed to sync savings budget after transaction:", syncError);
    }

      try {
        const accountInfo = await db.account.findUnique({
          where: { id: accountId },
          select: { name: true, isShared: true, userId: true },
        });
        if (accountInfo?.isShared) {
          const sharedUsers = await db.sharedAccountUser.findMany({
            where: { accountId, userId: { not: session.user.id } },
            select: { userId: true },
          });
          const ownerUserId = accountInfo.userId !== session.user.id ? accountInfo.userId : null;
          const notifyUserIds = [
            ...sharedUsers.map(su => su.userId),
            ...(ownerUserId ? [ownerUserId] : []),
          ];
          for (const uid of notifyUserIds) {
            await createAndPushNotification({
              userId: uid,
              type: "shared_transaction",
              title: "Nuevo movimiento",
              message: `${session.user.name} agregó un movimiento en la cuenta compartida "${accountInfo.name}"`,
              pushBody: `${session.user.name}: movimiento en "${accountInfo.name}"`,
              data: { accountId, transactionId: transaction.id, transactionType: type },
              url: `/?account=${accountId}`,
            });
          }
        }
      } catch (notifError) {
        // Don't fail the transaction creation if notification fails
        console.error("Failed to send shared transaction notification:", notifError);
      }
    }

    return NextResponse.json({
      ...transaction,
      updatedBalances,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) return error;
    if (
      error instanceof Error &&
      (error.message === "El bolsillo origen no pertenece a la cuenta origen" ||
        error.message === "El bolsillo destino no pertenece a la cuenta destino")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Create transaction error:", error);
    return NextResponse.json({ error: "Error al crear transacción" }, { status: 500 });
  }
}
