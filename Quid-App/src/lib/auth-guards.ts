import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Get the authenticated user's session or return a 401 response.
 * Use this in every API route that requires authentication.
 */
export async function requireAuth() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { session: null, error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }
  return { session, error: null };
}

/**
 * Verify that a record belongs to the authenticated user.
 * Returns the record if owned, or a 403/404 response.
 *
 * @param model - The Prisma model delegate (e.g., db.account)
 * @param id - The record ID to check
 * @param userId - The authenticated user's ID
 * @param options - Additional Prisma query options
 */
export async function verifyOwnership<T>(
  model: { findFirst: (args: any) => Promise<T | null> },
  id: string,
  userId: string,
  options?: { include?: Record<string, unknown> }
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  const record = await model.findFirst({
    where: { id, userId },
    ...options,
  });

  if (!record) {
    return {
      data: null,
      error: NextResponse.json(
        { error: "Recurso no encontrado o sin permisos" },
        { status: 404 }
      ),
    };
  }

  return { data: record, error: null };
}

/**
 * Verify ownership through a parent record.
 * Example: A SubAccount belongs to an Account which belongs to a User.
 *
 * @param parentModel - The parent Prisma model (e.g., db.account)
 * @param parentId - The parent record ID
 * @param userId - The authenticated user's ID
 * @param childWhere - Additional where clause for the child (e.g., { id: subAccountId })
 */
export async function verifyParentOwnership<T>(
  parentModel: { findFirst: (args: any) => Promise<T | null> },
  parentId: string,
  userId: string
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  const parent = await parentModel.findFirst({
    where: { id: parentId, userId },
  });

  if (!parent) {
    return {
      data: null,
      error: NextResponse.json(
        { error: "Recurso padre no encontrado o sin permisos" },
        { status: 404 }
      ),
    };
  }

  return { data: parent, error: null };
}

/**
 * Check if a user has access to an account (either owner or shared).
 * Returns the account with sharedUsers if accessible, or null.
 */
export async function getAccessibleAccount(accountId: string, userId: string) {
  const account = await db.account.findFirst({
    where: {
      id: accountId,
      OR: [
        { userId },
        { sharedUsers: { some: { userId } } },
      ],
    },
    include: {
      sharedUsers: true,
    },
  });

  return account;
}

/**
 * Check if a user has editor (or owner) access to an account.
 * Owner always has full access. Shared users need role "editor" or "owner".
 */
export async function canEditAccount(accountId: string, userId: string): Promise<boolean> {
  // Check if owner
  const account = await db.account.findFirst({
    where: { id: accountId, userId },
  });
  if (account) return true;

  // Check if shared with editor role
  const shared = await db.sharedAccountUser.findFirst({
    where: { accountId, userId, role: { in: ["editor", "owner"] } },
  });
  return !!shared;
}

/**
 * Get all account IDs accessible by a user (owned + shared).
 */
export async function getAccessibleAccountIds(userId: string): Promise<string[]> {
  const ownedAccounts = await db.account.findMany({
    where: { userId },
    select: { id: true },
  });

  const sharedAccounts = await db.sharedAccountUser.findMany({
    where: { userId },
    select: { accountId: true },
  });

  return [
    ...ownedAccounts.map((a) => a.id),
    ...sharedAccounts.map((s) => s.accountId),
  ];
}

// ============================================
// ENTITY OWNERSHIP HELPERS
// Use these to verify that IDs from request body
// belong to the authenticated user BEFORE using them.
// ============================================

/**
 * Verify an account belongs to the user. Returns the account or throws an error response.
 */
export async function verifyAccountOwnership(accountId: string, userId: string) {
  const account = await db.account.findFirst({ where: { id: accountId, userId } });
  if (!account) {
    return {
      data: null,
      error: NextResponse.json({ error: "Cuenta no encontrada o sin permisos" }, { status: 403 }),
    };
  }
  return { data: account, error: null };
}

/**
 * Verify a sub-account belongs to the user (through its parent account).
 */
export async function verifySubAccountOwnership(subAccountId: string, userId: string) {
  const sub = await db.subAccount.findFirst({
    where: { id: subAccountId, account: { userId } },
  });
  if (!sub) {
    return {
      data: null,
      error: NextResponse.json({ error: "Subcuenta no encontrada o sin permisos" }, { status: 403 }),
    };
  }
  return { data: sub, error: null };
}

/**
 * Verify a debt belongs to the user.
 */
export async function verifyDebtOwnership(debtId: string, userId: string) {
  const debt = await db.debt.findFirst({ where: { id: debtId, userId } });
  if (!debt) {
    return {
      data: null,
      error: NextResponse.json({ error: "Deuda no encontrada o sin permisos" }, { status: 403 }),
    };
  }
  return { data: debt, error: null };
}

/**
 * Verify multiple entity IDs at once. Returns the first error or null if all pass.
 * Useful for transaction/recurring payment creation where multiple IDs need validation.
 */
export async function verifyEntityOwnership(
  userId: string,
  entities: { type: "account" | "subAccount" | "debt"; id: string }[]
) {
  for (const entity of entities) {
    if (!entity.id) continue;
    if (entity.type === "account") {
      const { error } = await verifyAccountOwnership(entity.id, userId);
      if (error) return error;
    } else if (entity.type === "subAccount") {
      const { error } = await verifySubAccountOwnership(entity.id, userId);
      if (error) return error;
    } else if (entity.type === "debt") {
      const { error } = await verifyDebtOwnership(entity.id, userId);
      if (error) return error;
    }
  }
  return null;
}
