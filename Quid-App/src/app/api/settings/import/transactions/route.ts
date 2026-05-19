import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import * as XLSX from "xlsx";

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: string[];
}

function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/\s+/g, "_")
    .replace(/[()]/g, "");
}

// Caching system for Budgets
class BudgetCache {
  private userId: string;
  private budgetsMap = new Map<string, string>(); // key: "type:category:subCategory" -> budget id

  constructor(userId: string) {
    this.userId = userId;
  }

  async initialize() {
    const budgets = await db.budget.findMany({
      where: { userId: this.userId },
      select: { id: true, type: true, category: true, subCategory: true },
    });

    for (const b of budgets) {
      const key = `${b.type}:${b.category}:${b.subCategory || ""}`;
      this.budgetsMap.set(key, b.id);
    }
  }

  async ensureBudget(type: string, category: string | null, subCategory: string | null): Promise<string | null> {
    if (!category) return null;
    const key = `${type}:${category}:${subCategory || ""}`;

    if (this.budgetsMap.has(key)) {
      return this.budgetsMap.get(key)!;
    }

    // Create a new budget with amount: 0, spent: 0, period: "monthly"
    const newBudget = await db.budget.create({
      data: {
        userId: this.userId,
        type,
        category,
        subCategory: subCategory || null,
        amount: 0,
        spent: 0,
        period: "monthly",
      },
    });

    this.budgetsMap.set(key, newBudget.id);
    return newBudget.id;
  }
}

// Caching system for Accounts and SubAccounts
class AccountCache {
  private userId: string;
  private accountsMap = new Map<string, { id: string; balance: number }>();
  private subAccountsMap = new Map<
    string,
    { id: string; accountId: string; balance: number }
  >();

  constructor(userId: string) {
    this.userId = userId;
  }

  async initialize() {
    const accounts = await db.account.findMany({
      where: { userId: this.userId },
      include: { subAccounts: true },
    });

    for (const acc of accounts) {
      this.accountsMap.set(acc.name.toLowerCase().trim(), {
        id: acc.id,
        balance: toNumber(acc.balance),
      });

      for (const sub of acc.subAccounts) {
        // Key is combination of accountId and subaccount name
        const key = `${acc.id}_${sub.name.toLowerCase().trim()}`;
        this.subAccountsMap.set(key, {
          id: sub.id,
          accountId: acc.id,
          balance: toNumber(sub.balance),
        });
      }
    }
  }

  async resolveAccount(accountName: string): Promise<string | null> {
    if (!accountName || !accountName.trim()) return null;
    const nameStr = accountName.trim();
    const key = nameStr.toLowerCase();

    if (this.accountsMap.has(key)) {
      return this.accountsMap.get(key)!.id;
    }

    // Create a new account
    const newAccount = await db.account.create({
      data: {
        userId: this.userId,
        name: nameStr,
        type: "checking",
        balance: 0,
      },
    });

    this.accountsMap.set(key, { id: newAccount.id, balance: 0 });
    return newAccount.id;
  }

  async resolveSubAccount(
    accountId: string,
    subAccountName: string
  ): Promise<string | null> {
    if (!accountId || !subAccountName || !subAccountName.trim()) return null;
    const nameStr = subAccountName.trim();
    const key = `${accountId}_${nameStr.toLowerCase()}`;

    if (this.subAccountsMap.has(key)) {
      return this.subAccountsMap.get(key)!.id;
    }

    // Create new subaccount
    const newSubAccount = await db.subAccount.create({
      data: {
        accountId,
        name: nameStr,
        type: "pocket",
        balance: 0,
      },
    });

    this.subAccountsMap.set(key, {
      id: newSubAccount.id,
      accountId,
      balance: 0,
    });
    return newSubAccount.id;
  }

  async updateBalance(
    accountId: string,
    subAccountId: string | null,
    amountChange: number
  ) {
    if (subAccountId) {
      // Update ONLY subaccount balance if specified
      await db.subAccount.update({
        where: { id: subAccountId },
        data: { balance: { increment: amountChange } },
      });
    } else {
      // Update parent account balance ONLY if no subaccount is specified
      await db.account.update({
        where: { id: accountId },
        data: { balance: { increment: amountChange } },
      });
    }
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No se proporcionó archivo" },
        { status: 400 }
      );
    }

    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse Excel
    const wb = XLSX.read(buffer, { type: "buffer" });

    const result: ImportResult = { total: 0, created: 0, skipped: 0, errors: [] };

    // Initialize caches
    const cache = new AccountCache(userId);
    await cache.initialize();
    const budgetCache = new BudgetCache(userId);
    await budgetCache.initialize();

    // Process each sheet
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
        defval: "",
      });

      if (rows.length === 0) continue;

      const normalizedSheetName = normalizeHeader(sheetName);

      // Determine transaction type based on sheet name
      let transactionType: string;
      if (
        normalizedSheetName.includes("ingreso") ||
        normalizedSheetName.includes("income")
      ) {
        transactionType = "income";
      } else if (
        normalizedSheetName.includes("gasto") ||
        normalizedSheetName.includes("expense")
      ) {
        transactionType = "expense";
      } else if (
        normalizedSheetName.includes("transferencia") ||
        normalizedSheetName.includes("transfer")
      ) {
        transactionType = "transfer";
      } else {
        result.errors.push(`Hoja "${sheetName}": nombre no reconocido. Use "Ingresos", "Gastos" o "Transferencias".`);
        continue;
      }

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        result.total++;

        try {
          // Normalize row keys
          const normalizedRow: Record<string, string | number> = {};
          for (const [key, value] of Object.entries(row)) {
            normalizedRow[normalizeHeader(key)] = value as string | number;
          }

          // Extract common fields
          const rawDate =
            (normalizedRow["fecha"] as string) ||
            (normalizedRow["date"] as string) ||
            "";
          const description =
            ((normalizedRow["descripcion"] as string) ||
              (normalizedRow["description"] as string) ||
              "")?.trim() || `Importado desde Excel - ${sheetName}`;
          const rawAmount =
            (normalizedRow["monto"] as number) ||
            (normalizedRow["amount"] as number) ||
            (normalizedRow["valor"] as number) ||
            0;
          const category =
            ((normalizedRow["categoria"] as string) ||
              (normalizedRow["category"] as string) ||
              "")?.trim() || null;
          const subCategory =
            ((normalizedRow["subcategoria"] as string) ||
              (normalizedRow["subcategory"] as string) ||
              (normalizedRow["sub_categoria"] as string) ||
              "")?.trim() || null;
          const notes =
            ((normalizedRow["notas"] as string) ||
              (normalizedRow["notes"] as string) ||
              (normalizedRow["nota"] as string) ||
              "")?.trim() || null;

          // Parse date
          let date: Date;
          if (!rawDate) {
            date = new Date();
          } else if (typeof rawDate === "number") {
            // Excel serial date
            const parsed = XLSX.SSF.parse_date_code(rawDate);
            date = new Date(parsed.y, parsed.m - 1, parsed.d);
          } else {
            const parsed = new Date(rawDate as string);
            date = isNaN(parsed.getTime()) ? new Date() : parsed;
          }

          // Validate amount
          const amount = typeof rawAmount === "number" ? Math.abs(rawAmount) : parseFloat(String(rawAmount)) || 0;
          if (amount <= 0) {
            result.skipped++;
            result.errors.push(
              `Hoja "${sheetName}", fila ${i + 2}: monto inválido (${rawAmount})`
            );
            continue;
          }

          if (transactionType === "transfer") {
            // Transfer: needs origin and destination accounts
            const originName =
              (
                (normalizedRow["cuenta_origen"] as string) ||
                (normalizedRow["origin_account"] as string) ||
                (normalizedRow["origen"] as string) ||
                ""
              )?.trim() || "";
            const subOriginName =
              (
                (normalizedRow["subcuenta_origen"] as string) ||
                (normalizedRow["origin_subaccount"] as string) ||
                ""
              )?.trim() || "";
              
            const destName =
              (
                (normalizedRow["cuenta_destino"] as string) ||
                (normalizedRow["destination_account"] as string) ||
                (normalizedRow["destino"] as string) ||
                ""
              )?.trim() || "";
            const subDestName =
              (
                (normalizedRow["subcuenta_destino"] as string) ||
                (normalizedRow["destination_subaccount"] as string) ||
                ""
              )?.trim() || "";

            if (!originName && !destName) {
              result.skipped++;
              result.errors.push(
                `Hoja "${sheetName}", fila ${i + 2}: transferencia sin cuentas`
              );
              continue;
            }

            const originId = originName ? await cache.resolveAccount(originName) : null;
            const subOriginId = originId && subOriginName ? await cache.resolveSubAccount(originId, subOriginName) : null;
            
            const destId = destName ? await cache.resolveAccount(destName) : null;
            const subDestId = destId && subDestName ? await cache.resolveSubAccount(destId, subDestName) : null;

            let sourceTxId: string | null = null;
            let destTxId: string | null = null;

            // 1. Create source transaction (Type: transfer)
            if (originId) {
              const sourceTx = await db.transaction.create({
                data: {
                  userId,
                  accountId: originId,
                  subAccountId: subOriginId,
                  type: "transfer",
                  amount,
                  description,
                  category: category || "Transferencia",
                  subCategory,
                  date,
                  sourceModule: "finance",
                  notes: notes
                    ? `${notes}${destName ? ` → ${destName}` : ""}${subDestName ? ` (${subDestName})` : ""}`
                    : `Transferencia a ${destName}${subDestName ? ` (${subDestName})` : ""}`,
                },
              });
              sourceTxId = sourceTx.id;
              await cache.updateBalance(originId, subOriginId, -amount);
            }

            // 2. Create destination transaction (Type: income - for balance and UI consistency)
            if (destId) {
              const destTx = await db.transaction.create({
                data: {
                  userId,
                  accountId: destId,
                  subAccountId: subDestId,
                  type: "income",
                  amount,
                  description: `Transferencia recibida: ${description}`,
                  category: category || "Transferencia",
                  subCategory,
                  date,
                  sourceModule: "finance",
                  excludeFromBudget: true, // Counterpart of a transfer — not real income
                  notes: notes
                    ? `${notes}${originName ? ` ← ${originName}` : ""}${subOriginName ? ` (${subOriginName})` : ""}`
                    : `Transferencia desde ${originName}${subOriginName ? ` (${subOriginName})` : ""}`,
                  relatedTransactionId: sourceTxId, // Link to source
                },
              });
              destTxId = destTx.id;
              await cache.updateBalance(destId, subDestId, amount);
            }

            // 3. Link source back to destination if both created
            if (sourceTxId && destTxId) {
              await db.transaction.update({
                where: { id: sourceTxId },
                data: { relatedTransactionId: destTxId },
              });
            }

            result.created++;
          } else {
            // Income or Expense
            const accountName =
              (
                (normalizedRow["cuenta"] as string) ||
                (normalizedRow["account"] as string) ||
                ""
              )?.trim() || "";

            const subAccountName =
              (
                (normalizedRow["subcuenta"] as string) ||
                (normalizedRow["subaccount"] as string) ||
                ""
              )?.trim() || "";

            const accountId = accountName ? await cache.resolveAccount(accountName) : null;
            const subAccountId = accountId && subAccountName ? await cache.resolveSubAccount(accountId, subAccountName) : null;

            if (!accountId) {
              result.skipped++;
              result.errors.push(
                `Hoja "${sheetName}", fila ${i + 2}: no se encontró o creó la cuenta "${accountName}"`
              );
              continue;
            }

            await db.transaction.create({
              data: {
                userId,
                accountId,
                subAccountId,
                type: transactionType,
                amount,
                description,
                category,
                subCategory,
                date,
                sourceModule: "finance",
                notes,
              },
            });

            // Update account balance
            const amountChange = transactionType === "income" ? amount : -amount;
            await cache.updateBalance(accountId, subAccountId, amountChange);

            // Auto-create budget entry for this category (not for transfers)
            await budgetCache.ensureBudget(transactionType, category, subCategory);

            result.created++;
          }
        } catch (rowError) {
          result.skipped++;
          const msg =
            rowError instanceof Error ? rowError.message : "Error desconocido";
          result.errors.push(
            `Hoja "${sheetName}", fila ${i + 2}: ${msg}`
          );
        }
      }
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Transaction import error:", error);
    return NextResponse.json(
      { error: "Error al importar movimientos" },
      { status: 500 }
    );
  }
}
