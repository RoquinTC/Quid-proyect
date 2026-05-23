import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");
const rootDir = path.resolve(appRoot, "..");

const args = new Set(process.argv.slice(2));
const shouldReset = args.has("--reset");
const shouldDryRun = args.has("--dry-run");

const sqliteClientPath = path.join(appRoot, "scripts", ".generated", "sqlite-client", "index.js");
const postgresClientPath = path.join(appRoot, "scripts", ".generated", "postgres-client", "index.js");

const modelPlan = [
  ["user", "User"],
  ["account", "Account"],
  ["subAccount", "SubAccount"],
  ["sharedAccountUser", "SharedAccountUser"],
  ["accountInvitation", "AccountInvitation"],
  ["appNotification", "AppNotification"],
  ["yieldRecord", "YieldRecord"],
  ["transaction", "Transaction"],
  ["budget", "Budget"],
  ["debt", "Debt"],
  ["installment", "Installment"],
  ["abono", "Abono"],
  ["abonoDetail", "AbonoDetail"],
  ["payrollGroup", "PayrollGroup"],
  ["savingsGoal", "SavingsGoal"],
  ["savingsGoalAccount", "SavingsGoalAccount"],
  ["savingsContribution", "SavingsContribution"],
  ["recurringPayment", "RecurringPayment"],
  ["cDT", "CDT"],
  ["vehicle", "Vehicle"],
  ["fuelLog", "FuelLog"],
  ["maintenanceRecord", "MaintenanceRecord"],
  ["maintenanceItem", "MaintenanceItem"],
  ["vehicleDocument", "VehicleDocument"],
  ["vehiclePaymentDefault", "VehiclePaymentDefault"],
  ["medication", "Medication"],
  ["medicalAppointment", "MedicalAppointment"],
  ["pantryItem", "PantryItem"],
  ["shoppingList", "ShoppingList"],
  ["shoppingListItem", "ShoppingListItem"],
  ["healthProfile", "HealthProfile"],
  ["fuelPrice", "FuelPrice"],
  ["category", "Category"],
  ["pushSubscription", "PushSubscription"],
  ["userSettings", "UserSettings"],
  ["storedBackup", "StoredBackup"],
  ["authCredential", "AuthCredential"],
  ["achievementProgress", "AchievementProgress"],
];

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const result = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    result[key] = value;
  }

  return result;
}

function requireGeneratedClient(clientPath, command) {
  if (fs.existsSync(clientPath)) return;
  console.error(`\nFalta el cliente generado: ${clientPath}`);
  console.error(`Ejecuta primero: ${command}\n`);
  process.exit(1);
}

function defaultSqliteUrl() {
  const dbPath = path.join(appRoot, "db", "custom.db").replace(/\\/g, "/");
  return `file:${dbPath}`;
}

function getConnectionUrls() {
  const rootEnv = readEnvFile(path.join(rootDir, ".env"));
  const appEnv = readEnvFile(path.join(appRoot, ".env"));

  const sqliteUrl =
    process.env.SQLITE_DATABASE_URL ||
    appEnv.SQLITE_DATABASE_URL ||
    defaultSqliteUrl();

  const postgresUrl =
    process.env.POSTGRES_DATABASE_URL ||
    rootEnv.POSTGRES_DATABASE_URL ||
    appEnv.POSTGRES_DATABASE_URL;

  if (!postgresUrl) {
    console.error("\nFalta POSTGRES_DATABASE_URL.");
    console.error("Agrega esta variable en F:\\Proyectos\\Quid-proyect\\.env o exportala antes de ejecutar.");
    console.error("Ejemplo: POSTGRES_DATABASE_URL=postgresql://quid:quid-local-dev@localhost:5432/quid?schema=public\n");
    process.exit(1);
  }

  return { sqliteUrl, postgresUrl };
}

function isMissingSqliteTable(error) {
  return error?.code === "P2021" || String(error?.message || "").includes("does not exist");
}

async function main() {
  requireGeneratedClient(sqliteClientPath, "npm run db:sqlite:generate");
  requireGeneratedClient(postgresClientPath, "npm run db:postgres:generate");

  const { sqliteUrl, postgresUrl } = getConnectionUrls();

  const [{ PrismaClient: SqliteClient }, { PrismaClient: PostgresClient }] = await Promise.all([
    import(pathToFileURL(sqliteClientPath).href),
    import(pathToFileURL(postgresClientPath).href),
  ]);

  const source = new SqliteClient({
    datasources: { db: { url: sqliteUrl } },
  });
  const target = new PostgresClient({
    datasources: { db: { url: postgresUrl } },
  });

  const summary = [];

  try {
    console.log("\nQuid SQLite -> PostgreSQL migration");
    console.log(`Source SQLite: ${sqliteUrl}`);
    console.log(`Target PostgreSQL: ${postgresUrl.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@")}`);
    console.log(`Mode: ${shouldDryRun ? "dry-run" : shouldReset ? "reset + import" : "import"}\n`);

    if (shouldReset && !shouldDryRun) {
      console.log("Limpiando PostgreSQL destino en orden seguro...");
      for (const [delegate, label] of [...modelPlan].reverse()) {
        try {
          const result = await target[delegate].deleteMany();
          if (result.count > 0) console.log(`  ${label}: ${result.count} eliminado(s)`);
        } catch (error) {
          if (!isMissingSqliteTable(error)) throw error;
          console.log(`  ${label}: tabla destino no disponible, se omite`);
        }
      }
      console.log("");
    }

    for (const [delegate, label] of modelPlan) {
      let rows = [];
      try {
        rows = await source[delegate].findMany();
      } catch (error) {
        if (isMissingSqliteTable(error)) {
          summary.push({ label, source: "missing", inserted: 0, target: "skipped" });
          console.log(`${label}: no existe en SQLite, se omite`);
          continue;
        }
        throw error;
      }

      if (shouldDryRun) {
        summary.push({ label, source: rows.length, inserted: 0, target: "dry-run" });
        console.log(`${label}: ${rows.length} fila(s) detectada(s)`);
        continue;
      }

      let inserted = 0;
      if (rows.length > 0) {
        const result = await target[delegate].createMany({
          data: rows,
          skipDuplicates: true,
        });
        inserted = result.count;
      }

      const targetCount = await target[delegate].count();
      summary.push({ label, source: rows.length, inserted, target: targetCount });
      console.log(`${label}: origen=${rows.length}, insertadas=${inserted}, destino=${targetCount}`);
    }

    console.log("\nResumen final:");
    for (const item of summary) {
      console.log(`  ${item.label}: origen=${item.source}, insertadas=${item.inserted}, destino=${item.target}`);
    }
    console.log("\nMigracion finalizada.");
  } finally {
    await source.$disconnect();
    await target.$disconnect();
  }
}

main().catch((error) => {
  console.error("\nLa migracion fallo:");
  console.error(error);
  process.exit(1);
});
