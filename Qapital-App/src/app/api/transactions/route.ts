import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getColombiaNow, createColombiaDate, getColombiaTodayString } from "@/lib/api";
import { verifyEntityOwnership } from "@/lib/auth-guards";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, transactionCreateSchema } from "@/lib/validations";
import { createAndPushNotification } from "@/lib/push";

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
    const { type, amount, description, accountId, subAccountId, category, subCategory, date, sourceModule, sourceId, isRecurring, notes, transferToAccountId, transferToSubAccountId, excludeFromBudget } = body;

    if (!type || !amount || !description) {
      return NextResponse.json({ error: "Tipo, monto y descripción son requeridos" }, { status: 400 });
    }

    // Verify ownership or shared access of all referenced entities
    // For shared accounts, editors can also create transactions
    const entitiesToVerify: { type: "account" | "subAccount" | "debt"; id: string }[] = [];
    if (accountId) entitiesToVerify.push({ type: "account", id: accountId });
    if (subAccountId) entitiesToVerify.push({ type: "subAccount", id: subAccountId });
    if (transferToAccountId) entitiesToVerify.push({ type: "account", id: transferToAccountId });
    if (transferToSubAccountId) entitiesToVerify.push({ type: "subAccount", id: transferToSubAccountId });

    // Check ownership first
    const ownershipError = await verifyEntityOwnership(session.user.id, entitiesToVerify);

    if (ownershipError) {
      // If ownership check failed, check if user has editor access via shared accounts
      const accountEntities = entitiesToVerify.filter(e => e.type === "account");
      let hasSharedAccess = true;
      for (const entity of accountEntities) {
        const sharedUser = await db.sharedAccountUser.findFirst({
          where: { accountId: entity.id, userId: session.user.id, role: "editor" },
        });
        if (!sharedUser) {
          hasSharedAccess = false;
          break;
        }
      }
      // Also verify sub-accounts belong to accessible accounts
      const subAccountEntities = entitiesToVerify.filter(e => e.type === "subAccount");
      for (const entity of subAccountEntities) {
        const sub = await db.subAccount.findUnique({
          where: { id: entity.id },
          select: { accountId: true },
        });
        if (sub) {
          const sharedUser = await db.sharedAccountUser.findFirst({
            where: { accountId: sub.accountId, userId: session.user.id, role: "editor" },
          });
          if (!sharedUser) {
            hasSharedAccess = false;
            break;
          }
        }
      }
      if (!hasSharedAccess) return ownershipError;
    }

    // Create transaction
    const transaction = await db.transaction.create({
      data: {
        userId: session.user.id,
        type,
        amount,
        description,
        accountId: accountId || null,
        subAccountId: subAccountId || null,
        category: category || null,
        subCategory: subCategory || null,
        date: date ? createColombiaDate(date.split("T")[0]) : createColombiaDate(getColombiaTodayString()),
        sourceModule: sourceModule || null,
        sourceId: sourceId || null,
        isRecurring: isRecurring || false,
        notes: notes || null,
        excludeFromBudget: excludeFromBudget || false,
      },
      include: {
        account: { select: { id: true, name: true, type: true, color: true } },
        subAccount: { select: { id: true, name: true, color: true } },
      },
    });

    // Update balance (transfer deducts from source account, same as expense)
    if (subAccountId) {
      // Update subaccount balance when transaction belongs to a subaccount
      const balanceChange = type === "income" ? amount : (type === "expense" || type === "transfer") ? -amount : 0;
      if (balanceChange !== 0) {
        await db.subAccount.update({
          where: { id: subAccountId },
          data: { balance: { increment: balanceChange } },
        });
      }
    } else if (accountId) {
      // Update account balance when transaction belongs directly to account
      const balanceChange = type === "income" ? amount : (type === "expense" || type === "transfer") ? -amount : 0;
      if (balanceChange !== 0) {
        await db.account.update({
          where: { id: accountId },
          data: { balance: { increment: balanceChange } },
        });
      }
    }

    // Helper: find the best matching budget (subCategory-specific first, then parent)
    const findMatchingBudget = async (cat: string, subCat: string | null, budgetType: string) => {
      // 1. Try exact match with subCategory
      if (subCat) {
        const specific = await db.budget.findFirst({
          where: { userId: session.user.id, category: cat, subCategory: subCat, type: budgetType },
        });
        if (specific) return specific;
      }
      // 2. Fall back to parent budget (no subCategory)
      return db.budget.findFirst({
        where: { userId: session.user.id, category: cat, subCategory: null, type: budgetType },
      });
    };

    // Update budget spent if expense
    if (type === "expense" && category && !excludeFromBudget) {
      const budget = await findMatchingBudget(category, subCategory || null, "expense");
      if (budget) {
        await db.budget.update({
          where: { id: budget.id },
          data: { spent: { increment: amount } },
        });
      }
    }

    // Update income budget if income
    if (type === "income" && category && !excludeFromBudget) {
      const budget = await findMatchingBudget(category, subCategory || null, "income");
      if (budget) {
        await db.budget.update({
          where: { id: budget.id },
          data: { spent: { increment: amount } },
        });
      }
    }

    // If transfer, create the counterpart income transaction and link them
    // Collect updated balances for notification
    const updatedBalances: Array<{ name: string; balance: number; isSubAccount: boolean }> = [];

    if (type === "transfer" && transferToAccountId) {
      const sourceAccount = await db.account.findUnique({
        where: { id: accountId || "" },
        select: { name: true },
      });

      const counterpart = await db.transaction.create({
        data: {
          userId: session.user.id,
          type: "income",
          amount,
          description: `Transferencia recibida: ${description}`,
          accountId: transferToAccountId,
          subAccountId: transferToSubAccountId || null,
          category: "Otros",
          date: date ? createColombiaDate(date.split("T")[0]) : createColombiaDate(getColombiaTodayString()),
          notes: `Transferencia desde ${sourceAccount?.name || "cuenta"}`,
          relatedTransactionId: transaction.id,
        },
      });

      // Link source transfer to its counterpart
      await db.transaction.update({
        where: { id: transaction.id },
        data: { relatedTransactionId: counterpart.id },
      });

      // Update destination account balance
      if (transferToSubAccountId) {
        await db.subAccount.update({
          where: { id: transferToSubAccountId },
          data: { balance: { increment: amount } },
        });
      } else {
        await db.account.update({
          where: { id: transferToAccountId },
          data: { balance: { increment: amount } },
        });
      }
    }

    // Fetch updated balances for the affected account/subaccount
    if (subAccountId) {
      const updatedSub = await db.subAccount.findUnique({
        where: { id: subAccountId },
        select: { balance: true, name: true, account: { select: { name: true } } },
      });
      if (updatedSub) {
        updatedBalances.push({
          name: `${updatedSub.account.name} → ${updatedSub.name}`,
          balance: toNumber(updatedSub.balance),
          isSubAccount: true,
        });
      }
    } else if (accountId) {
      const updatedAcc = await db.account.findUnique({
        where: { id: accountId },
        select: { balance: true, name: true },
      });
      if (updatedAcc) {
        updatedBalances.push({
          name: updatedAcc.name,
          balance: toNumber(updatedAcc.balance),
          isSubAccount: false,
        });
      }
    }

    // For transfers, also fetch destination balance
    if (type === "transfer" && transferToAccountId) {
      if (transferToSubAccountId) {
        const updatedDestSub = await db.subAccount.findUnique({
          where: { id: transferToSubAccountId },
          select: { balance: true, name: true, account: { select: { name: true } } },
        });
        if (updatedDestSub) {
          updatedBalances.push({
            name: `${updatedDestSub.account.name} → ${updatedDestSub.name}`,
            balance: toNumber(updatedDestSub.balance),
            isSubAccount: true,
          });
        }
      } else {
        const updatedDestAcc = await db.account.findUnique({
          where: { id: transferToAccountId },
          select: { balance: true, name: true },
        });
        if (updatedDestAcc) {
          updatedBalances.push({
            name: updatedDestAcc.name,
            balance: toNumber(updatedDestAcc.balance),
            isSubAccount: false,
          });
        }
      }
    }

    // Notify other shared account users about new transaction
    if (accountId) {
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
    console.error("Create transaction error:", error);
    return NextResponse.json({ error: "Error al crear transacción" }, { status: 500 });
  }
}
