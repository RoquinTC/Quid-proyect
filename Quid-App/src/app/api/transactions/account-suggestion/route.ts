import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * F-48 · Sugerencia de cuenta por categoría.
 *
 * La idea: el usuario no siempre paga de la misma cuenta, pero SÍ sigue un
 * patrón por categoría (el arriendo sale de una cuenta, el mercado de otra,
 * el café del efectivo). En vez de un "cuenta predeterminada" fijo que estaría
 * mal la mitad de las veces, se aprende del historial reciente.
 *
 * GET /api/transactions/account-suggestion?category=Mercado&type=expense
 *   →  { suggestion: { accountId, subAccountId, count, matchedSubCategory } | null }
 *
 * Reglas:
 *  - Solo considera los últimos 90 días (el patrón cambia con el tiempo).
 *  - Solo movimientos de tipo income/expense (las transferencias no aplican).
 *  - Si se envía subCategory, intenta primero ese nivel y, si no hay datos,
 *    cae a la categoría completa.
 *  - Nunca lanza: ante un error devuelve `suggestion: null` para que el
 *    formulario siga funcionando sin sugerencia.
 */

const WINDOW_DAYS = 90;

type Suggestion = {
  accountId: string;
  subAccountId: string | null;
  count: number;
  matchedSubCategory: boolean;
};

async function pickTop(
  userId: string,
  type: "income" | "expense",
  category: string,
  subCategory: string | null
): Promise<Suggestion | null> {
  const since = new Date();
  since.setDate(since.getDate() - WINDOW_DAYS);

  const groups = await db.transaction.groupBy({
    by: ["accountId", "subAccountId"],
    where: {
      userId,
      type,
      category,
      ...(subCategory ? { subCategory } : {}),
      date: { gte: since },
      accountId: { not: null },
    },
    _count: { _all: true },
  });

  if (groups.length === 0) return null;

  let best: { accountId: string | null; subAccountId: string | null; count: number } | null = null;
  for (const g of groups) {
    const count = g._count?._all ?? 0;
    if (!g.accountId || count <= 0) continue;
    if (!best || count > best.count) {
      best = { accountId: g.accountId, subAccountId: g.subAccountId ?? null, count };
    }
  }

  if (!best || !best.accountId) return null;

  return {
    accountId: best.accountId,
    subAccountId: best.subAccountId,
    count: best.count,
    matchedSubCategory: Boolean(subCategory),
  };
}

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const category = (searchParams.get("category") || "").trim();
    const subCategoryRaw = (searchParams.get("subCategory") || "").trim();
    const type = searchParams.get("type") === "income" ? "income" : "expense";

    if (!category) {
      return NextResponse.json({ suggestion: null });
    }

    // 1) Intento con la subcategoría (más preciso).
    if (subCategoryRaw) {
      const precise = await pickTop(session.user.id, type, category, subCategoryRaw);
      if (precise) {
        return NextResponse.json({ suggestion: precise });
      }
    }

    // 2) Fallback a la categoría completa.
    const broad = await pickTop(session.user.id, type, category, null);
    return NextResponse.json({ suggestion: broad });
  } catch (error) {
    console.error("Account suggestion error:", error);
    // Nunca romper el formulario por una sugerencia.
    return NextResponse.json({ suggestion: null });
  }
}
