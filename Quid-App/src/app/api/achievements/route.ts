import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

// ─── Achievement feature definitions ─────────────────────────────────
// Each feature belongs to a module and has a label, icon hint, and description

export const ACHIEVEMENT_FEATURES = {
  finance: [
    { feature: "create-transaction", label: "Primera transacción", description: "Registra tu primera transacción", icon: "ArrowLeftRight" },
    { feature: "create-account", label: "Primera cuenta", description: "Crea tu primera cuenta financiera", icon: "Banknote" },
    { feature: "create-budget", label: "Primer presupuesto", description: "Crea un presupuesto mensual", icon: "Receipt" },
    { feature: "create-savings-goal", label: "Primera meta de ahorro", description: "Define una meta de ahorro", icon: "PiggyBank" },
    { feature: "create-debt", label: "Primera deuda", description: "Registra una deuda", icon: "CreditCard" },
    { feature: "create-cdt", label: "Primer CDT", description: "Registra un certificado de depósito", icon: "Landmark" },
    { feature: "create-recurring", label: "Primer pago recurrente", description: "Configura un pago recurrente", icon: "Clock" },
    { feature: "manage-categories", label: "Categorías personalizadas", description: "Gestiona tus categorías", icon: "Tag" },
    { feature: "simulator-yield", label: "Simulador de rendimiento", description: "Usa el simulador de cuentas de alto rendimiento", icon: "TrendingUp" },
    { feature: "simulator-credit", label: "Simulador de crédito", description: "Simula un crédito", icon: "Calculator" },
    { feature: "simulator-debt", label: "Simulador de abonos", description: "Simula abonos a deuda", icon: "HandCoins" },
  ],
  transport: [
    { feature: "create-vehicle", label: "Primer vehículo", description: "Registra tu primer vehículo", icon: "Car" },
    { feature: "log-fuel", label: "Primera recarga", description: "Registra una recarga de combustible", icon: "Fuel" },
    { feature: "log-maintenance", label: "Primer mantenimiento", description: "Registra un mantenimiento", icon: "Wrench" },
    { feature: "register-document", label: "Primer documento", description: "Registra un documento vehicular", icon: "Shield" },
    { feature: "update-km", label: "Actualizar kilometraje", description: "Actualiza el kilometraje de un vehículo", icon: "Gauge" },
    { feature: "update-fuel-price", label: "Precio combustible", description: "Actualiza el precio del combustible", icon: "Landmark" },
  ],
  health: [
    { feature: "create-medication", label: "Primer medicamento", description: "Registra un medicamento", icon: "Pill" },
    { feature: "create-appointment", label: "Primera cita médica", description: "Agenda una cita médica", icon: "Stethoscope" },
    { feature: "create-health-profile", label: "Perfil de salud", description: "Crea un perfil de salud", icon: "ShieldCheck" },
  ],
  pantry: [
    { feature: "create-pantry-item", label: "Primer producto", description: "Agrega un producto a la despensa", icon: "Refrigerator" },
    { feature: "create-shopping-list", label: "Primera lista de mercado", description: "Crea una lista de mercado", icon: "ListPlus" },
  ],
} as const;

// ─── GET: Retrieve achievement progress for current user ─────────────
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const progress = await db.achievementProgress.findMany({
      where: { userId: session.user.id },
    });

    // Build full progress map with all features
    const result: Record<string, {
      features: Array<{
        feature: string;
        label: string;
        description: string;
        icon: string;
        discovered: boolean;
        discoveredAt: string | null;
        dismissed: boolean;
      }>;
      total: number;
      discovered: number;
      percentage: number;
    }> = {};

    for (const [module, features] of Object.entries(ACHIEVEMENT_FEATURES)) {
      const moduleProgress = progress.filter(p => p.module === module);
      const discoveredCount = moduleProgress.filter(p => p.discovered).length;

      result[module] = {
        features: features.map(f => {
          const existing = moduleProgress.find(p => p.feature === f.feature);
          return {
            feature: f.feature,
            label: f.label,
            description: f.description,
            icon: f.icon,
            discovered: existing?.discovered ?? false,
            discoveredAt: existing?.discoveredAt?.toISOString() ?? null,
            dismissed: existing?.dismissed ?? false,
          };
        }),
        total: features.length,
        discovered: discoveredCount,
        percentage: Math.round((discoveredCount / features.length) * 100),
      };
    }

    // Overall stats
    const totalFeatures = Object.values(ACHIEVEMENT_FEATURES).reduce((sum, f) => sum + f.length, 0);
    const totalDiscovered = progress.filter(p => p.discovered).length;

    return NextResponse.json({
      modules: result,
      overall: {
        total: totalFeatures,
        discovered: totalDiscovered,
        percentage: Math.round((totalDiscovered / totalFeatures) * 100),
      },
    });
  } catch (error) {
    console.error("Get achievements error:", error);
    return NextResponse.json({ error: "Error al obtener logros" }, { status: 500 });
  }
}

// ─── POST: Mark a feature as discovered ──────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { module, feature } = await req.json();

    if (!module || !feature) {
      return NextResponse.json({ error: "module y feature son obligatorios" }, { status: 400 });
    }

    // Validate module exists
    if (!ACHIEVEMENT_FEATURES[module as keyof typeof ACHIEVEMENT_FEATURES]) {
      return NextResponse.json({ error: "Módulo inválido" }, { status: 400 });
    }

    const result = await db.achievementProgress.upsert({
      where: {
        userId_module_feature: { userId: session.user.id, module, feature },
      },
      create: {
        userId: session.user.id,
        module,
        feature,
        discovered: true,
        discoveredAt: new Date(),
      },
      update: {
        discovered: true,
        discoveredAt: new Date(),
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Mark achievement error:", error);
    return NextResponse.json({ error: "Error al marcar logro" }, { status: 500 });
  }
}

// ─── PATCH: Dismiss a hint ───────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { module, feature, dismissed } = await req.json();

    if (!module || !feature) {
      return NextResponse.json({ error: "module y feature son obligatorios" }, { status: 400 });
    }

    const result = await db.achievementProgress.upsert({
      where: {
        userId_module_feature: { userId: session.user.id, module, feature },
      },
      create: {
        userId: session.user.id,
        module,
        feature,
        discovered: false,
        dismissed: dismissed ?? true,
      },
      update: {
        dismissed: dismissed ?? true,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Dismiss achievement hint error:", error);
    return NextResponse.json({ error: "Error al descartar pista" }, { status: 500 });
  }
}
