import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import { validateBody, yieldReverseSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await validateBody(req, yieldReverseSchema);
    const { yieldRecordId } = body;

    // Fetch the yield record
    const yieldRecord = await db.yieldRecord.findUnique({
      where: { id: yieldRecordId },
    });

    if (!yieldRecord) {
      return NextResponse.json(
        { error: "Registro de rendimiento no encontrado" },
        { status: 404 }
      );
    }

    if (!yieldRecord.isConfirmed) {
      return NextResponse.json(
        { error: "Este rendimiento no está confirmado, no se puede revertir" },
        { status: 400 }
      );
    }

    const actualYield = toNumber(yieldRecord.actualYield || 0);
    const isSubAccount = !!yieldRecord.subAccountId;

    // If there's a linked transaction, delete it and revert balances
    if (yieldRecord.transactionId && actualYield > 0) {
      // Delete the transaction
      const transaction = await db.transaction.findUnique({
        where: { id: yieldRecord.transactionId },
      });

      if (transaction) {
        await db.transaction.delete({
          where: { id: yieldRecord.transactionId },
        });

        // Revert balances — only on the specific account or sub-account
        if (isSubAccount && transaction.subAccountId) {
          // Only decrement sub-account balance
          await db.subAccount.update({
            where: { id: transaction.subAccountId },
            data: { balance: { decrement: actualYield } },
          });
        } else if (transaction.accountId) {
          // Account-level yield: decrement account balance
          await db.account.update({
            where: { id: transaction.accountId },
            data: { balance: { decrement: actualYield } },
          });
        }
      }
    }

    // Mark yield record as not confirmed, clear transaction link and actual yield
    await db.yieldRecord.update({
      where: { id: yieldRecordId },
      data: {
        isConfirmed: false,
        transactionId: null,
        actualYield: null,
      },
    });

    return NextResponse.json({ success: true, message: "Rendimiento revertido correctamente" });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("Reverse yield error:", error);
    return NextResponse.json({ error: "Error al revertir rendimiento" }, { status: 500 });
  }
}
