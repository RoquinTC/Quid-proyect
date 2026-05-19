import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { createColombiaDate } from "@/lib/api";
import { verifyEntityOwnership } from "@/lib/auth-guards";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, transactionUpdateSchema } from "@/lib/validations";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await validateBody(req, transactionUpdateSchema);

    const existing = await db.transaction.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Transacción no encontrada" }, { status: 404 });
    }

    // Verify ownership of new account/subAccount if changed
    const newAccountId = body.accountId !== undefined ? body.accountId : existing.accountId;
    const newSubAccountId = body.subAccountId !== undefined ? body.subAccountId : existing.subAccountId;
    const entitiesToVerify: { type: "account" | "subAccount" | "debt"; id: string }[] = [];
    if (newAccountId) entitiesToVerify.push({ type: "account", id: newAccountId });
    if (newSubAccountId) entitiesToVerify.push({ type: "subAccount", id: newSubAccountId });

    const ownershipError = await verifyEntityOwnership(session.user.id, entitiesToVerify);
    if (ownershipError) return ownershipError;

    // If amount or type changed, reverse old balance change and apply new one
    const oldAmount = existing.amount;
    const oldType = existing.type;
    const newAmount = body.amount !== undefined ? body.amount : oldAmount;
    const newType = body.type !== undefined ? body.type : oldType;

    // If amount, type, or account/subaccount assignment changed, adjust balances
    const oldSubAccountId = existing.subAccountId;
    const amountChanged = body.amount !== undefined || body.type !== undefined;
    const assignmentChanged = body.accountId !== undefined || body.subAccountId !== undefined;

    if (amountChanged || assignmentChanged) {
      // Reverse old balance change on the correct entity
      const oldBalanceChange = oldType === "income" ? -toNumber(oldAmount) : (oldType === "expense" || oldType === "transfer") ? toNumber(oldAmount) : 0;
      if (oldBalanceChange !== 0) {
        if (oldSubAccountId) {
          await db.subAccount.update({
            where: { id: oldSubAccountId },
            data: { balance: { increment: oldBalanceChange } },
          });
        } else if (existing.accountId) {
          await db.account.update({
            where: { id: existing.accountId },
            data: { balance: { increment: oldBalanceChange } },
          });
        }
      }

      // Apply new balance change to the correct entity
      const newSubAccountId = body.subAccountId !== undefined ? body.subAccountId : oldSubAccountId;
      const newAccountId = body.accountId !== undefined ? body.accountId : existing.accountId;
      const newBalanceChange = newType === "income" ? toNumber(newAmount) : (newType === "expense" || newType === "transfer") ? -toNumber(newAmount) : 0;
      if (newBalanceChange !== 0) {
        if (newSubAccountId) {
          await db.subAccount.update({
            where: { id: newSubAccountId },
            data: { balance: { increment: newBalanceChange } },
          });
        } else if (newAccountId) {
          await db.account.update({
            where: { id: newAccountId },
            data: { balance: { increment: newBalanceChange } },
          });
        }
      }
    }

    // Handle budget spent recalculation when category/subCategory/type/amount changes
    const oldCategory = existing.category;
    const oldSubCategory = existing.subCategory;
    const newCategory = body.category !== undefined ? (body.category || null) : oldCategory;
    const newSubCategory = body.subCategory !== undefined ? (body.subCategory || null) : oldSubCategory;
    const categoryChanged = oldCategory !== newCategory || oldSubCategory !== newSubCategory || oldType !== newType;
    const amountChangedForBudget = body.amount !== undefined;

    // Determine new excludeFromBudget value
    const newExcludeFromBudget = body.excludeFromBudget !== undefined ? body.excludeFromBudget : existing.excludeFromBudget;

    if ((categoryChanged || amountChangedForBudget) && (oldType === "income" || oldType === "expense" || (body.type && body.type !== "transfer"))) {
      const effectiveNewType = newType === "transfer" ? null : newType;
      const effectiveOldType = oldType === "transfer" ? null : oldType;

      // Helper: find matching budget (subCategory-specific first, then parent)
      const findBudget = async (cat: string | null, subCat: string | null, bType: string) => {
        if (!cat) return null;
        if (subCat) {
          const specific = await db.budget.findFirst({
            where: { userId: session.user.id, category: cat, subCategory: subCat, type: bType },
          });
          if (specific) return specific;
        }
        return db.budget.findFirst({
          where: { userId: session.user.id, category: cat, subCategory: null, type: bType },
        });
      };

      // Reverse old budget spent (only if old transaction was NOT excluded from budget)
      if (effectiveOldType && oldCategory && !existing.excludeFromBudget) {
        const oldBudget = await findBudget(oldCategory, oldSubCategory, effectiveOldType);
        if (oldBudget) {
          await db.budget.update({
            where: { id: oldBudget.id },
            data: { spent: { increment: -oldAmount } },
          });
        }
      }

      // Apply new budget spent (only if new transaction is NOT excluded from budget)
      if (effectiveNewType && newCategory && !newExcludeFromBudget) {
        const newBudget = await findBudget(newCategory, newSubCategory, effectiveNewType);
        if (newBudget) {
          await db.budget.update({
            where: { id: newBudget.id },
            data: { spent: { increment: newAmount } },
          });
        }
      }
    }

    const updateData: Record<string, unknown> = {};
    if (body.type !== undefined) updateData.type = body.type;
    if (body.amount !== undefined) updateData.amount = body.amount;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.accountId !== undefined) updateData.accountId = body.accountId;
    if (body.subAccountId !== undefined) updateData.subAccountId = body.subAccountId;
    if (body.category !== undefined) updateData.category = body.category;
    if (body.subCategory !== undefined) updateData.subCategory = body.subCategory;
    if (body.date !== undefined) updateData.date = createColombiaDate(body.date.split("T")[0]);
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.isRecurring !== undefined) updateData.isRecurring = body.isRecurring;
    if (body.excludeFromBudget !== undefined) updateData.excludeFromBudget = body.excludeFromBudget;
    if (body.receiptUrl !== undefined) updateData.receiptUrl = body.receiptUrl;

    const transaction = await db.transaction.update({
      where: { id },
      data: updateData,
      include: {
        account: { select: { id: true, name: true, type: true, color: true } },
        subAccount: { select: { id: true, name: true } },
      },
    });

    // --- Sync transfer counterpart ---
    // If the edited transaction is part of a transfer pair, sync the counterpart
    if (existing.relatedTransactionId) {
      const counterpart = await db.transaction.findFirst({
        where: { id: existing.relatedTransactionId, userId: session.user.id },
      });

      if (counterpart) {
        const counterpartUpdateData: Record<string, unknown> = {};

        // If amount changed, sync counterpart amount and adjust its balance
        if (body.amount !== undefined) {
          // Determine balance direction based on counterpart type:
          // - Counterpart type "income" (destination side): adds money → reverse by subtracting, apply by adding
          // - Counterpart type "transfer" (source side): deducts money → reverse by adding, apply by subtracting
          const isCounterpartIncome = counterpart.type === "income";
          const reverseSign = isCounterpartIncome ? -1 : 1; // reverse old effect
          const applySign = isCounterpartIncome ? 1 : -1;   // apply new effect

          if (counterpart.subAccountId) {
            await db.subAccount.update({
              where: { id: counterpart.subAccountId },
              data: { balance: { increment: reverseSign * toNumber(counterpart.amount) } },
            });
            await db.subAccount.update({
              where: { id: counterpart.subAccountId },
              data: { balance: { increment: applySign * toNumber(body.amount) } },
            });
          } else if (counterpart.accountId) {
            await db.account.update({
              where: { id: counterpart.accountId },
              data: { balance: { increment: reverseSign * toNumber(counterpart.amount) } },
            });
            await db.account.update({
              where: { id: counterpart.accountId },
              data: { balance: { increment: applySign * toNumber(body.amount) } },
            });
          }

          counterpartUpdateData.amount = body.amount;
        }

        // If description changed, sync counterpart description
        if (body.description !== undefined) {
          if (existing.type === "transfer") {
            // Editing source transfer → update destination's description
            counterpartUpdateData.description = `Transferencia recibida: ${body.description}`;
          } else {
            // Editing destination income → update source's description (strip prefix)
            counterpartUpdateData.description = body.description.replace(/^Transferencia recibida:\s*/, "");
          }
        }

        // If date changed, sync counterpart date
        if (body.date !== undefined) {
          counterpartUpdateData.date = createColombiaDate(body.date.split("T")[0]);
        }

        // Apply counterpart updates if any
        if (Object.keys(counterpartUpdateData).length > 0) {
          await db.transaction.update({
            where: { id: counterpart.id },
            data: counterpartUpdateData,
          });
        }
      }
    }

    return NextResponse.json(transaction);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Update transaction error:", error);
    return NextResponse.json({ error: "Error al actualizar transacción" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const existing = await db.transaction.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existing) {
      return NextResponse.json({ error: "Transacción no encontrada" }, { status: 404 });
    }

    // Helper: reverse a balance on account or subAccount
    const reverseBalance = async (accId: string | null, subAccId: string | null, amount: number) => {
      if (subAccId) {
        await db.subAccount.update({
          where: { id: subAccId },
          data: { balance: { increment: toNumber(amount) } },
        });
      } else if (accId) {
        await db.account.update({
          where: { id: accId },
          data: { balance: { increment: toNumber(amount) } },
        });
      }
    };

    // --- Handle transfer counterpart deletion ---
    if (existing.type === "transfer" && existing.relatedTransactionId) {
      // This is a source transfer transaction — also delete the counterpart income tx
      const counterpart = await db.transaction.findFirst({
        where: { id: existing.relatedTransactionId, userId: session.user.id },
      });

      // Reverse source account balance (transfer deducts from source, so add back)
      await reverseBalance(existing.accountId, existing.subAccountId, toNumber(existing.amount));

      // Reverse destination account balance and delete counterpart
      if (counterpart) {
        await reverseBalance(counterpart.accountId, counterpart.subAccountId, -toNumber(counterpart.amount));
        await db.transaction.delete({ where: { id: counterpart.id } });
      }

      // Reverse budget for counterpart if applicable
      if (counterpart?.category) {
        // Find matching budget (subCategory-specific first, then parent)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let counterpartBudget: any = null;
        if (counterpart.subCategory) {
          counterpartBudget = await db.budget.findFirst({
            where: { userId: session.user.id, category: counterpart.category, subCategory: counterpart.subCategory, type: "income" },
          });
        }
        if (!counterpartBudget) {
          counterpartBudget = await db.budget.findFirst({
            where: { userId: session.user.id, category: counterpart.category, subCategory: null, type: "income" },
          });
        }
        if (counterpartBudget) {
          await db.budget.update({
            where: { id: counterpartBudget.id },
            data: { spent: { increment: -counterpart.amount } },
          });
        }
      }

      await db.transaction.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    // --- Handle transfer counterpart (income side) deletion ---
    if (existing.type === "income" && existing.relatedTransactionId) {
      // This is the destination side of a transfer — also delete the source transfer tx
      const sourceTransfer = await db.transaction.findFirst({
        where: { id: existing.relatedTransactionId, userId: session.user.id },
      });

      // Reverse destination account balance (income added to destination, so subtract)
      await reverseBalance(existing.accountId, existing.subAccountId, -toNumber(existing.amount));

      // Reverse source account balance and delete source transfer
      if (sourceTransfer) {
        await reverseBalance(sourceTransfer.accountId, sourceTransfer.subAccountId, toNumber(sourceTransfer.amount));
        await db.transaction.delete({ where: { id: sourceTransfer.id } });
      }

      // Reverse budget for source if applicable
      // (transfers don't typically have budgets, but handle just in case)

      await db.transaction.delete({ where: { id } });
      return NextResponse.json({ success: true });
    }

    // --- Regular income / expense deletion (unchanged logic) ---

    // Reverse balance change on the correct entity
    const reverseAmount = existing.type === "income" ? -toNumber(existing.amount) : existing.type === "expense" ? toNumber(existing.amount) : 0;
    if (reverseAmount !== 0) {
      await reverseBalance(existing.accountId, existing.subAccountId, reverseAmount);
    }

    // Reverse budget spent (with subCategory matching)
    if (existing.category) {
      const budgetType = existing.type === "income" ? "income" : "expense";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let budget: any = null;
      // Try subCategory-specific budget first
      if (existing.subCategory) {
        budget = await db.budget.findFirst({
          where: { userId: session.user.id, category: existing.category, subCategory: existing.subCategory, type: budgetType },
        });
      }
      // Fall back to parent budget
      if (!budget) {
        budget = await db.budget.findFirst({
          where: { userId: session.user.id, category: existing.category, subCategory: null, type: budgetType },
        });
      }
      if (budget) {
        await db.budget.update({
          where: { id: budget.id },
          data: { spent: { increment: -existing.amount } },
        });
      }
    }

    await db.transaction.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete transaction error:", error);
    return NextResponse.json({ error: "Error al eliminar transacción" }, { status: 500 });
  }
}
