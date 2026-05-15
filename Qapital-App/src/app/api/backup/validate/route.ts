import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { BACKUP_MAGIC, BACKUP_SCHEMA_VERSION } from "@/lib/backup/constants";

/**
 * POST /api/backup/validate
 *
 * Validates a backup JSON file WITHOUT importing anything.
 * Returns a detailed report of what the backup contains,
 * any issues found, and compatibility information.
 *
 * This is a SAFE, read-only operation — no data is modified.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    let backup: Record<string, unknown>;
    try {
      backup = await request.json();
    } catch {
      return NextResponse.json(
        { valid: false, error: "No se pudo leer el JSON del archivo" },
        { status: 400 }
      );
    }

    const issues: string[] = [];
    const warnings: string[] = [];
    const sections: { name: string; count: number; label: string }[] = [];

    // ── Validate magic identifier ──
    if (!backup.magic) {
      issues.push("Falta el campo 'magic' — el archivo no parece ser un respaldo de Quid");
    } else if (backup.magic !== BACKUP_MAGIC) {
      issues.push(`Identificador incorrecto: esperado "${BACKUP_MAGIC}", obtenido "${backup.magic}"`);
    }

    // ── Validate version ──
    const version = backup.version as number | undefined;
    if (version === undefined) {
      issues.push("Falta el campo 'version'");
    } else if (version > BACKUP_SCHEMA_VERSION) {
      issues.push(
        `El respaldo es versión v${version} pero la app soporta hasta v${BACKUP_SCHEMA_VERSION}. Actualiza la aplicación primero.`
      );
    } else if (version < BACKUP_SCHEMA_VERSION) {
      warnings.push(
        `El respaldo es versión v${version} (actual: v${BACKUP_SCHEMA_VERSION}). Se aplicarán migraciones automáticas al importar.`
      );
    }

    // ── Validate metadata ──
    if (!backup.exportDate) {
      warnings.push("Falta la fecha de exportación");
    }
    if (!backup.userEmail) {
      warnings.push("Falta el email del usuario");
    }
    if (!backup.userName) {
      warnings.push("Falta el nombre del usuario");
    }

    // ── Count records per section ──
    const sectionDefs = [
      { key: "accounts", label: "Cuentas" },
      { key: "subAccounts", label: "Subcuentas" },
      { key: "transactions", label: "Transacciones" },
      { key: "budgets", label: "Presupuestos" },
      { key: "categories", label: "Categorías" },
      { key: "debts", label: "Deudas" },
      { key: "installments", label: "Cuotas" },
      { key: "abonos", label: "Abonos" },
      { key: "abonoDetails", label: "Detalles de Abonos" },
      { key: "recurringPayments", label: "Pagos Recurrentes" },
      { key: "payrollGroups", label: "Nóminas" },
      { key: "savingsGoals", label: "Metas de Ahorro" },
      { key: "savingsGoalAccounts", label: "Cuentas Vinculadas" },
      { key: "savingsContributions", label: "Aportes a Ahorro" },
      { key: "cdts", label: "CDTs" },
      { key: "yieldRecords", label: "Registros de Rendimiento" },
      { key: "sharedAccountUsers", label: "Usuarios Compartidos" },
      { key: "vehicles", label: "Vehículos" },
      { key: "fuelLogs", label: "Registros de Combustible" },
      { key: "maintenanceRecords", label: "Mantenimientos" },
      { key: "fuelPrices", label: "Precios de Combustible" },
      { key: "medications", label: "Medicamentos" },
      { key: "appointments", label: "Citas Médicas" },
      { key: "pantryItems", label: "Artículos de Despensa" },
      { key: "shoppingLists", label: "Listas de Compras" },
      { key: "shoppingListItems", label: "Items de Listas" },
      { key: "healthProfiles", label: "Perfiles de Salud" },
      { key: "userSettings", label: "Configuración" },
    ];

    let totalRecords = 0;

    for (const def of sectionDefs) {
      const data = backup[def.key];
      if (def.key === "userSettings") {
        const count = data && typeof data === "object" && !Array.isArray(data) ? 1 : 0;
        sections.push({ name: def.key, count, label: def.label });
        totalRecords += count;
      } else if (Array.isArray(data)) {
        sections.push({ name: def.key, count: data.length, label: def.label });
        totalRecords += data.length;
      } else {
        sections.push({ name: def.key, count: 0, label: def.label });
        if (data !== null && data !== undefined) {
          warnings.push(`Sección "${def.key}" tiene formato inesperado (se esperaba un array)`);
        }
      }
    }

    // ── Validate referential integrity (spot check) ──
    const accounts = (backup.accounts as { id: string }[]) || [];
    const accountIds = new Set(accounts.map((a) => a.id));

    const subAccounts = (backup.subAccounts as { id: string; accountId: string }[]) || [];
    const missingAccountRefs = subAccounts.filter((sa) => !accountIds.has(sa.accountId));
    if (missingAccountRefs.length > 0) {
      issues.push(
        `${missingAccountRefs.length} subcuenta(s) referencian cuentas que no existen en el respaldo`
      );
    }

    // Check transfer pairs
    const transactions = (backup.transactions as { id: string; relatedTransactionId?: string | null }[]) || [];
    const transactionIds = new Set(transactions.map((t) => t.id));
    const orphanTransfers = transactions.filter(
      (t) => t.relatedTransactionId && !transactionIds.has(t.relatedTransactionId)
    );
    if (orphanTransfers.length > 0) {
      warnings.push(
        `${orphanTransfers.length} transacción(es) de transferencia sin su par correspondiente en el respaldo`
      );
    }

    // ── Build result ──
    const isValid = issues.length === 0;

    return NextResponse.json({
      valid: isValid,
      metadata: {
        magic: backup.magic,
        version: backup.version,
        exportDate: backup.exportDate,
        userEmail: backup.userEmail,
        userName: backup.userName,
        currency: backup.currency,
      },
      totalRecords,
      sections: sections.filter((s) => s.count > 0),
      issues,
      warnings,
    });
  } catch (error) {
    console.error("Backup validate error:", error);
    return NextResponse.json(
      { valid: false, error: "Error al validar el respaldo" },
      { status: 500 }
    );
  }
}
