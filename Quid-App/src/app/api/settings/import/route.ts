import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateBody, importSchema } from "@/lib/validations";

interface ImportRow {
  modulo: string;
  campo1: string;
  campo2: string;
  campo3: string;
  campo4: string;
  campo5: string;
  campo6: string;
  campo7: string;
  campo8: string;
}

interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  errors: string[];
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = session.user.id;
    let body;
    try {
      body = await validateBody(request, importSchema);
    } catch (err) {
      if (err instanceof Response) return err;
      return NextResponse.json({ error: "Error interno" }, { status: 500 });
    }
    const rows: ImportRow[] = body.rows;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "No hay datos para importar" }, { status: 400 });
    }

    const result: ImportResult = { total: rows.length, created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      try {
        const modulo = (row.modulo || "").toLowerCase().trim();

        switch (modulo) {
          case "cuenta": {
            const name = row.campo1?.trim();
            const type = row.campo2?.trim() || "checking";
            const balance = parseFloat(row.campo3 || "0");
            const color = row.campo4?.trim() || "#10B981";
            if (!name) { result.skipped++; result.errors.push(`Cuenta sin nombre (fila ${result.total - rows.indexOf(row)})`); break; }
            await db.account.create({ data: { userId, name, type, balance, color } });
            result.created++;
            break;
          }

          case "presupuesto": {
            const category = row.campo1?.trim();
            const amount = parseFloat(row.campo2 || "0");
            const type = row.campo3?.trim() || "expense";
            const subCategory = row.campo4?.trim() || null;
            if (!category || isNaN(amount) || amount <= 0) { result.skipped++; break; }
            await db.budget.create({ data: { userId, category, amount, type, subCategory } });
            result.created++;
            break;
          }

          case "deuda": {
            const name = row.campo1?.trim();
            const type = row.campo2?.trim() || "other";
            const totalAmount = parseFloat(row.campo3 || "0");
            const currentBalance = parseFloat(row.campo4 || "0") || totalAmount;
            const interestRate = parseFloat(row.campo5 || "0") || null;
            const bank = row.campo6?.trim() || null;
            if (!name || isNaN(totalAmount) || totalAmount <= 0) { result.skipped++; break; }
            await db.debt.create({ data: { userId, name, type, totalAmount, currentBalance, interestRate, bank } });
            result.created++;
            break;
          }

          case "meta": {
            const name = row.campo1?.trim();
            const targetAmount = parseFloat(row.campo2 || "0");
            const type = row.campo3?.trim() || "general";
            const deadline = row.campo4?.trim() || null;
            if (!name || isNaN(targetAmount) || targetAmount <= 0) { result.skipped++; break; }
            await db.savingsGoal.create({
              data: { userId, name, targetAmount, type, deadline: deadline ? new Date(deadline) : null },
            });
            result.created++;
            break;
          }

          case "vehiculo": {
            const name = row.campo1?.trim();
            const type = row.campo2?.trim() || "motorcycle";
            const brand = row.campo3?.trim() || null;
            const model = row.campo4?.trim() || null;
            if (!name) { result.skipped++; break; }
            await db.vehicle.create({ data: { userId, name, type, brand, model } });
            result.created++;
            break;
          }

          default:
            result.skipped++;
            result.errors.push(`Módulo desconocido: "${modulo}"`);
        }
      } catch (rowError) {
        result.skipped++;
        const msg = rowError instanceof Error ? rowError.message : "Error desconocido";
        result.errors.push(`Error en fila: ${msg}`);
      }
    }

    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("Import error:", error);
    return NextResponse.json({ error: "Error al importar datos" }, { status: 500 });
  }
}
