import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/decimal-serializer";
import * as XLSX from "xlsx";
import { toColombiaDateString } from "@/lib/api";

const accountTypeLabels: Record<string, string> = {
  checking: "Corriente",
  savings: "Ahorros",
  cash: "Efectivo",
  digital_wallet: "Billetera Digital",
  other: "Otro",
};

const subAccountTypeLabels: Record<string, string> = {
  pocket: "Bolsillo",
  piggy_bank: "Alcancía",
  savings_box: "Caja de Ahorros",
  other: "Otro",
};

const debtTypeLabels: Record<string, string> = {
  credit_card: "Tarjeta Crédito",
  loan: "Préstamo",
  other: "Otro",
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;

    // Fetch ALL data in parallel
    const [accounts, transactions, debts] = await Promise.all([
      db.account.findMany({
        where: { userId },
        include: { subAccounts: { orderBy: { order: "asc" } } },
        orderBy: { order: "asc" },
      }),
      db.transaction.findMany({
        where: { userId },
        include: {
          account: { select: { id: true, name: true } },
          subAccount: { select: { id: true, name: true } },
        },
        orderBy: { date: "asc" },
      }),
      db.debt.findMany({
        where: { userId },
        include: { installments: { orderBy: { currentInstallment: "asc" } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Fetch related transactions for transfers (destination accounts)
    const transferSourceIds = transactions
      .filter((t) => t.type === "transfer" && t.relatedTransactionId)
      .map((t) => t.relatedTransactionId!);

    let relatedMap = new Map<string, { accountName: string; subAccountName: string | null }>();
    if (transferSourceIds.length > 0) {
      const relatedTxs = await db.transaction.findMany({
        where: { id: { in: transferSourceIds } },
        include: {
          account: { select: { name: true } },
          subAccount: { select: { name: true } },
        },
      });
      for (const rt of relatedTxs) {
        relatedMap.set(rt.id, {
          accountName: rt.account?.name || "",
          subAccountName: rt.subAccount?.name || null,
        });
      }
    }

    const wb = XLSX.utils.book_new();

    // ===== Sheet 1: Balances =====
    const balanceRows: (string | number)[][] = [["Cuenta", "Subcuenta", "Tipo", "Balance"]];
    let totalBalance = 0;

    for (const account of accounts) {
      const balance = toNumber(account.balance);
      totalBalance += balance;
      balanceRows.push([account.name, "", accountTypeLabels[account.type] || account.type, balance]);
      for (const sub of account.subAccounts) {
        balanceRows.push(["", sub.name, subAccountTypeLabels[sub.type] || sub.type, toNumber(sub.balance)]);
      }
    }
    balanceRows.push(["TOTAL GENERAL", "", "", totalBalance]);

    const wsBalances = XLSX.utils.aoa_to_sheet(balanceRows);
    wsBalances["!cols"] = [{ wch: 25 }, { wch: 22 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsBalances, "Balances");

    // ===== Sheet 2: Ingresos =====
    const txHeaders = ["Fecha", "Descripción", "Monto", "Categoría", "Subcategoría", "Cuenta", "Subcuenta", "Notas"];
    const incomes = transactions.filter((t) => t.type === "income" && !t.relatedTransactionId);

    const wsIngresos = XLSX.utils.aoa_to_sheet([
      txHeaders,
      ...incomes.map((t) => [
        toColombiaDateString(t.date),
        t.description,
        toNumber(t.amount),
        t.category || "",
        t.subCategory || "",
        t.account?.name || "",
        t.subAccount?.name || "",
        t.notes || "",
      ]),
    ]);
    wsIngresos["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsIngresos, "Ingresos");

    // ===== Sheet 3: Gastos =====
    const expenses = transactions.filter((t) => t.type === "expense");

    const wsGastos = XLSX.utils.aoa_to_sheet([
      txHeaders,
      ...expenses.map((t) => [
        toColombiaDateString(t.date),
        t.description,
        toNumber(t.amount),
        t.category || "",
        t.subCategory || "",
        t.account?.name || "",
        t.subAccount?.name || "",
        t.notes || "",
      ]),
    ]);
    wsGastos["!cols"] = wsIngresos["!cols"];
    XLSX.utils.book_append_sheet(wb, wsGastos, "Gastos");

    // ===== Sheet 4: Transferencias =====
    const transfers = transactions.filter((t) => t.type === "transfer");
    const transferHeaders = ["Fecha", "Descripción", "Monto", "Cuenta Origen", "Subcuenta Origen", "Cuenta Destino", "Subcuenta Destino", "Notas"];

    const wsTransferencias = XLSX.utils.aoa_to_sheet([
      transferHeaders,
      ...transfers.map((t) => {
        const dest = t.relatedTransactionId ? relatedMap.get(t.relatedTransactionId) : null;
        return [
          toColombiaDateString(t.date),
          t.description,
          toNumber(t.amount),
          t.account?.name || "",
          t.subAccount?.name || "",
          dest?.accountName || "",
          dest?.subAccountName || "",
          t.notes || "",
        ];
      }),
    ]);
    wsTransferencias["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 18 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, wsTransferencias, "Transferencias");

    // ===== Sheet 5: Deudas (Resumen) =====
    if (debts.length > 0) {
      const summaryHeaders = ["Deuda", "Tipo", "Banco", "Monto Total", "Saldo Actual", "Cuota Mensual", "Pagos Restantes", "Tasa Interés"];

      const wsDeudas = XLSX.utils.aoa_to_sheet([
        summaryHeaders,
        ...debts.map((debt) => [
          debt.name,
          debtTypeLabels[debt.type] || debt.type,
          debt.bank || "",
          toNumber(debt.totalAmount),
          toNumber(debt.currentBalance),
          debt.monthlyPayment ? toNumber(debt.monthlyPayment) : "",
          debt.remainingPayments || "",
          debt.interestRate ? `${toNumber(debt.interestRate)}%` : "",
        ]),
      ]);
      wsDeudas["!cols"] = [{ wch: 22 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, wsDeudas, "Deudas");

      // ===== Sheet 6: Detalle Cuotas =====
      const detailHeaders = ["Deuda", "Compra", "Cuota #", "Total Cuotas", "Fecha Próx. Pago", "Monto Cuota", "Pagado", "Saldo Restante", "Estado"];
      const detailRows: (string | number)[][] = [];

      for (const debt of debts) {
        for (const inst of debt.installments) {
          detailRows.push([
            debt.name,
            inst.description,
            inst.currentInstallment,
            inst.totalInstallments,
            toColombiaDateString(inst.nextPaymentDate),
            toNumber(inst.installmentAmount),
            toNumber(inst.paidAmount),
            inst.remainingBalance ? toNumber(inst.remainingBalance) : "",
            inst.isPaid ? "Pagada" : "Pendiente",
          ]);
        }
      }

      if (detailRows.length > 0) {
        const wsDetail = XLSX.utils.aoa_to_sheet([detailHeaders, ...detailRows]);
        wsDetail["!cols"] = [{ wch: 22 }, { wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }];
        XLSX.utils.book_append_sheet(wb, wsDetail, "Detalle Cuotas");
      }
    }

    // Generate buffer
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const today = new Date().toISOString().split("T")[0];
    const filename = `quid-datos-${today}.xlsx`;

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Error al exportar datos" }, { status: 500 });
  }
}
