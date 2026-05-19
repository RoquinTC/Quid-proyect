import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

/**
 * Endpoint de sincronización segura para Aura IA.
 * Permite que el agente obtenga datos financieros sin acceder directamente a la DB.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const days = parseInt(searchParams.get("days") || "30");

  // Verificación de Seguridad (API Key)
  const headersList = await headers();
  const apiKey = headersList.get("x-aura-token");

  if (!apiKey || apiKey !== process.env.AURA_API_KEY) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  if (!email) {
    return NextResponse.json({ error: "Email requerido" }, { status: 400 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        accounts: { include: { subAccounts: true } },
        savingsGoals: { where: { isActive: true } },
        budgets: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    // Obtener transacciones recientes para análisis
    const transactions = await prisma.transaction.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
      },
      orderBy: { date: "desc" },
    });

    return NextResponse.json({
      user: {
        name: user.name,
        currency: user.currency,
      },
      accounts: user.accounts,
      savingsGoals: user.savingsGoals,
      budgets: user.budgets,
      transactions,
    });
  } catch (error) {
    console.error("Error en Aura Sync API:", error);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
