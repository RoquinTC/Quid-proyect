/**
 * Registro central de modelos de datos de Quid.
 *
 * ¿POR QUÉ EXISTE ESTE ARCHIVO?
 *
 * Antes de este registro, la cobertura de datos estaba definida en CUATRO listas
 * manuales que se fueron desincronizando entre sí:
 *
 *   - `src/app/api/backup/export/route.ts`      → 27 modelos
 *   - `src/app/api/sync/initial/route.ts`       → 26 modelos
 *   - `src/app/api/sync/pull/route.ts`          → 27 modelos (y `deletions: []`)
 *   - `src/app/api/admin/orphans/route.ts`      → 21 tablas
 *   - `scripts/migrate-sqlite-to-postgres.mjs`  → 38 modelos
 *
 * El resultado medible: el esquema Prisma tiene 49 modelos y el respaldo del
 * usuario cubría 27. Quedaban fuera, entre otros, `MedicalAuthorization`,
 * `MedicalOrder`, `MedicalOrderItem`, `Recipe` y `VehicleReminder` — es decir,
 * autorizaciones EPS, órdenes médicas con entregas parciales, recetas y
 * recordatorios de vehículo se perdían al restaurar un respaldo o migrar de
 * motor de base de datos. Ese fallo era silencioso: nada avisaba.
 *
 * Este archivo es la ÚNICA fuente de verdad. `data-registry.test.ts` lee
 * `prisma/schema.prisma` y FALLA si un modelo no está declarado aquí o si la
 * metadata no coincide con el esquema. Así, agregar un modelo sin clasificarlo
 * rompe el build en vez de perder datos en silencio.
 *
 * ALCANCE ACTUAL (fase A): este registro es declarativo y ya está verificado
 * contra el esquema, pero los endpoints de backup/sync todavía NO lo consumen.
 * Migrarlos es la fase B (ver `docs/DATA_COVERAGE.md`).
 */

/**
 * Alcance de propiedad de un modelo — determina cómo se filtra por usuario.
 *
 * - `user`:       tiene `userId` propio. Filtro directo `{ userId }`.
 * - `user-child`: no tiene `userId`; pertenece a un usuario a través de una
 *                 relación padre (p. ej. `Installment` vía `debt`). El filtro
 *                 debe atravesar la relación.
 * - `global`:     no pertenece a un usuario (p. ej. `User` misma, que es la
 *                 raíz de la jerarquía).
 */
export type DataScope = "user" | "user-child" | "global";

/**
 * Estrategia de cobertura de datos.
 *
 * - `export`:   incluido en el respaldo JSON descargable (backup/export).
 * - `sync`:     replicado al cliente en IndexedDB (sync/initial + sync/pull).
 * - `both`:     respaldo Y sincronización.
 * - `excluded`: deliberadamente fuera del respaldo. Requiere `reason`.
 */
export type DataStrategy = "export" | "sync" | "both" | "excluded";

export interface ModelRegistryEntry {
  /** Nombre del modelo en Prisma — debe coincidir EXACTAMENTE con `model X {`. */
  model: string;
  /** Nombre real de la tabla en Postgres (`@@map`, o el nombre del modelo si no hay `@@map`). */
  table: string;
  /** Cómo se determina el dueño del registro. */
  scope: DataScope;
  /** Cobertura en respaldo / sincronización. */
  strategy: DataStrategy;
  /**
   * Si el modelo participa en la auditoría y limpieza de registros huérfanos
   * del panel de administración. Solo tiene sentido cuando existe una columna
   * `userId` en la tabla que se pueda comparar contra `User.id`.
   */
  orphanAudit: boolean;
  /**
   * Si el modelo declara `updatedAt`. Es un requisito duro para la
   * sincronización incremental (`sync/pull?since=`), que filtra por esa fecha.
   * Cuando es `false`, ese modelo solo puede replicarse completo.
   */
  hasUpdatedAt: boolean;
  /** Campo de la relación padre cuando `scope` es `user-child`. */
  parentRelation?: string;
  /** Obligatorio cuando `strategy` es `excluded`: por qué queda fuera. */
  reason?: string;
}

/**
 * Los 49 modelos del esquema Prisma, clasificados.
 *
 * Orden: sigue el orden de dependencias (padres antes que hijos), igual que el
 * orden de creación del importador de respaldos. No reordenar sin revisar
 * `api/backup/import/route.ts`, que borra y crea en orden inverso.
 */
export const DATA_REGISTRY: readonly ModelRegistryEntry[] = [
  // ── Raíz ────────────────────────────────────────────────────────────────
  {
    model: "User",
    table: "User",
    scope: "global",
    strategy: "excluded",
    orphanAudit: false,
    hasUpdatedAt: true,
    reason:
      "Es la raíz de la jerarquía; no se respalda a sí misma. Una restauración crea al usuario desde la sesión autenticada, no desde el archivo.",
  },
  {
    model: "UserSettings",
    table: "user_settings",
    scope: "user",
    strategy: "both",
    orphanAudit: false,
    hasUpdatedAt: true,
    reason: undefined,
  },
  {
    model: "AuthCredential",
    table: "auth_credentials",
    scope: "user",
    strategy: "excluded",
    orphanAudit: true,
    hasUpdatedAt: false,
    reason:
      "Contiene hashes de contraseña y llaves WebAuthn. Nunca debe salir en un respaldo descargable.",
  },

  // ── Finanzas: cuentas ───────────────────────────────────────────────────
  { model: "Account", table: "accounts", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  {
    model: "SubAccount",
    table: "sub_accounts",
    scope: "user-child",
    strategy: "both",
    orphanAudit: false,
    hasUpdatedAt: true,
    parentRelation: "account",
  },
  {
    model: "SharedAccountUser",
    table: "shared_account_users",
    scope: "user",
    strategy: "both",
    orphanAudit: false,
    hasUpdatedAt: false,
  },
  {
    model: "AccountInvitation",
    table: "account_invitations",
    scope: "user-child",
    strategy: "excluded",
    orphanAudit: false,
    hasUpdatedAt: true,
    parentRelation: "account",
    reason:
      "Es una invitación con estado efímero y token de un solo uso. Restaurarla reactivaría invitaciones ya consumidas o vencidas.",
  },
  { model: "YieldRecord", table: "yield_records", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: true, parentRelation: "account" },

  // ── Finanzas: movimientos ───────────────────────────────────────────────
  { model: "Transaction", table: "transactions", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "Budget", table: "budgets", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "Category", table: "custom_categories", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "CategoryRule", table: "category_rules", scope: "user", strategy: "both", orphanAudit: false, hasUpdatedAt: true },

  // ── Finanzas: deudas ────────────────────────────────────────────────────
  { model: "Debt", table: "debts", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "Installment", table: "installments", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: true, parentRelation: "debt" },
  { model: "Abono", table: "abonos", scope: "user", strategy: "both", orphanAudit: false, hasUpdatedAt: true },
  { model: "AbonoDetail", table: "abono_details", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: false, parentRelation: "abono" },

  // ── Finanzas: recurrentes y nómina ──────────────────────────────────────
  { model: "RecurringPayment", table: "recurring_payments", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "PayrollGroup", table: "payroll_groups", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },

  // ── Finanzas: ahorro e inversión ────────────────────────────────────────
  { model: "SavingsGoal", table: "savings_goals", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "SavingsGoalAccount", table: "savings_goal_accounts", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: false, parentRelation: "goal" },
  { model: "SavingsContribution", table: "savings_contributions", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: false, parentRelation: "goal" },
  { model: "CDT", table: "cdts", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },

  // ── Transporte ──────────────────────────────────────────────────────────
  { model: "Vehicle", table: "vehicles", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "FuelLog", table: "fuel_logs", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: false, parentRelation: "vehicle" },
  { model: "MaintenanceRecord", table: "maintenance_records", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: true, parentRelation: "vehicle" },
  { model: "MaintenanceItem", table: "maintenance_items", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: false, parentRelation: "record" },
  { model: "MaintenanceServiceRule", table: "maintenance_service_rules", scope: "user", strategy: "both", orphanAudit: false, hasUpdatedAt: true },
  { model: "VehicleReminder", table: "vehicle_reminders", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "VehicleDocument", table: "vehicle_documents", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: true, parentRelation: "vehicle" },
  { model: "VehiclePaymentDefault", table: "vehicle_payment_defaults", scope: "user", strategy: "both", orphanAudit: false, hasUpdatedAt: true },
  { model: "FuelPrice", table: "fuel_prices", scope: "user", strategy: "both", orphanAudit: false, hasUpdatedAt: true },

  // ── Salud ───────────────────────────────────────────────────────────────
  { model: "Medication", table: "medications", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "MedicalAppointment", table: "medical_appointments", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "MedicalAuthorization", table: "medical_authorizations", scope: "user", strategy: "both", orphanAudit: false, hasUpdatedAt: true },
  { model: "MedicalOrder", table: "medical_orders", scope: "user", strategy: "both", orphanAudit: false, hasUpdatedAt: true },
  { model: "MedicalOrderItem", table: "medical_order_items", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: true, parentRelation: "order" },
  { model: "HealthProfile", table: "health_profiles", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "HealthAiReport", table: "health_ai_reports", scope: "user", strategy: "excluded", orphanAudit: false, hasUpdatedAt: true, reason: "Es salida regenerable de IA; se recalcula en vez de restaurarse." },

  // ── Despensa ────────────────────────────────────────────────────────────
  { model: "PantryItem", table: "pantry_items", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "PantryMovement", table: "pantry_movements", scope: "user", strategy: "both", orphanAudit: false, hasUpdatedAt: false },
  { model: "PriceHistory", table: "price_history", scope: "user", strategy: "both", orphanAudit: false, hasUpdatedAt: false },
  { model: "ShoppingList", table: "shopping_lists", scope: "user", strategy: "both", orphanAudit: true, hasUpdatedAt: true },
  { model: "ShoppingListItem", table: "shopping_list_items", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: true, parentRelation: "shoppingList" },
  { model: "Recipe", table: "recipes", scope: "user", strategy: "both", orphanAudit: false, hasUpdatedAt: true },
  { model: "RecipeIngredient", table: "recipe_ingredients", scope: "user-child", strategy: "both", orphanAudit: false, hasUpdatedAt: false, parentRelation: "recipe" },

  // ── Aura ────────────────────────────────────────────────────────────────
  {
    model: "PendingAuraAction",
    table: "pending_aura_actions",
    scope: "user",
    strategy: "excluded",
    orphanAudit: true,
    hasUpdatedAt: false,
    reason:
      "Es una propuesta de escritura con estado efímero (expira en minutos). Restaurar una propuesta vieja permitiría confirmar una acción que el usuario pidió en otro momento, o ejecutarla dos veces.",
  },

  // ── Notificaciones, logros e infraestructura ────────────────────────────
  {
    model: "PushSubscription",
    table: "push_subscriptions",
    scope: "user",
    strategy: "excluded",
    orphanAudit: true,
    hasUpdatedAt: true,
    reason:
      "Un endpoint push está ligado al dispositivo y al navegador. Restaurarlo en otro equipo genera envíos a un dispositivo que ya no existe.",
  },
  { model: "AppNotification", table: "app_notifications", scope: "user", strategy: "export", orphanAudit: true, hasUpdatedAt: false },
  { model: "AchievementProgress", table: "achievement_progress", scope: "user", strategy: "export", orphanAudit: true, hasUpdatedAt: false },
  {
    model: "StoredBackup",
    table: "stored_backups",
    scope: "user",
    strategy: "excluded",
    orphanAudit: true,
    hasUpdatedAt: false,
    reason:
      "Es el contenedor del propio respaldo. Incluirlo anidaría el archivo dentro de sí mismo sin límite.",
  },
];

/** Índice por nombre de modelo Prisma, para búsquedas O(1). */
export const REGISTRY_BY_MODEL: ReadonlyMap<string, ModelRegistryEntry> = new Map(
  DATA_REGISTRY.map((entry) => [entry.model, entry])
);

/** Índice por nombre de tabla real en Postgres. */
export const REGISTRY_BY_TABLE: ReadonlyMap<string, ModelRegistryEntry> = new Map(
  DATA_REGISTRY.map((entry) => [entry.table, entry])
);

/**
 * Modelos que deben incluirse en el respaldo descargable.
 * Excluye los que tienen `strategy: "sync"`.
 */
export function getBackupModels(): ModelRegistryEntry[] {
  return DATA_REGISTRY.filter(
    (entry) => entry.strategy === "export" || entry.strategy === "both"
  );
}

/**
 * Modelos que deben replicarse al cliente en IndexedDB.
 * Excluye los que tienen `strategy: "export"`.
 */
export function getSyncModels(): ModelRegistryEntry[] {
  return DATA_REGISTRY.filter(
    (entry) => entry.strategy === "sync" || entry.strategy === "both"
  );
}

/**
 * Modelos con sincronización incremental posible.
 *
 * `sync/pull?since=` filtra por `updatedAt`, así que un modelo sin ese campo
 * solo puede replicarse completo, nunca por delta. Si esta lista no cubre a
 * todos los `getSyncModels()`, el delta queda incompleto por diseño y hay que
 * usar `sync/initial` para esos modelos.
 */
export function getIncrementallySyncableModels(): ModelRegistryEntry[] {
  return getSyncModels().filter((entry) => entry.hasUpdatedAt);
}

/** Modelos que la auditoría de huérfanos del admin debe revisar. */
export function getOrphanAuditModels(): ModelRegistryEntry[] {
  return DATA_REGISTRY.filter((entry) => entry.orphanAudit);
}

/**
 * Modelos sin `updatedAt`, que por lo tanto NO pueden sincronizarse por delta.
 * Se exponen explícitamente porque son una trampa silenciosa: un modelo nuevo
 * sin `updatedAt` nunca aparecería en `sync/pull`.
 */
export function getModelsWithoutUpdatedAt(): ModelRegistryEntry[] {
  return DATA_REGISTRY.filter((entry) => !entry.hasUpdatedAt);
}
