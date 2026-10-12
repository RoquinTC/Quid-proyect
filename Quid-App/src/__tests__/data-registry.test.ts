import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DATA_REGISTRY,
  REGISTRY_BY_MODEL,
  REGISTRY_BY_TABLE,
  getBackupModels,
  getIncrementallySyncableModels,
  getModelsWithoutUpdatedAt,
  getOrphanAuditModels,
  getSyncModels,
} from "@/lib/data-registry";

/**
 * Test guardián de cobertura de datos.
 *
 * CONTEXTO DEL FALLO QUE ESTE TEST PREVIENE
 *
 * El esquema Prisma llegó a tener 49 modelos mientras el respaldo del usuario
 * cubría 27. Once modelos no se migraban entre motores de base de datos,
 * incluidos `MedicalOrder`/`MedicalOrderItem` (entregas parciales de farmacia),
 * `Recipe` y `MedicalAuthorization` (autorizaciones EPS). Nada fallaba: los
 * datos simplemente no estaban. Este test convierte esa clase de omisión en un
 * error de build.
 *
 * CÓMO FUNCIONA
 *
 * Lee `prisma/schema.prisma` — la fuente de verdad real — extrae los nombres de
 * modelo, sus `@@map` y si declaran `updatedAt`; y compara todo contra
 * `DATA_REGISTRY`. Si alguien agrega un modelo a Prisma sin clasificarlo, o
 * renombra una tabla, o quita un `updatedAt`, este test falla y dice exactamente
 * qué corregir.
 */

const SCHEMA_PATH = path.resolve(__dirname, "../../prisma/schema.prisma");

interface SchemaModel {
  model: string;
  table: string;
  hasUpdatedAt: boolean;
}

/**
 * Parser mínimo del esquema Prisma.
 *
 * Se implementa a mano en lugar de usar `@prisma/internals` para mantener el
 * test sin dependencias adicionales y para que su fallo sea legible cuando algo
 * no coincide.
 */
function parseSchemaModels(source: string): SchemaModel[] {
  const models: SchemaModel[] = [];
  let current: string | null = null;
  let mappedTable: string | null = null;
  let hasUpdatedAt = false;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();

    const modelStart = /^model\s+(\w+)\s*\{/.exec(line);
    if (modelStart) {
      current = modelStart[1];
      mappedTable = null;
      hasUpdatedAt = false;
      continue;
    }

    if (current === null) continue;

    if (line === "}") {
      models.push({
        model: current,
        // Un modelo sin `@@map` conserva el nombre del modelo como tabla.
        table: mappedTable ?? current,
        hasUpdatedAt,
      });
      current = null;
      continue;
    }

    const mapMatch = /^@@map\("([^"]+)"\)/.exec(line);
    if (mapMatch) mappedTable = mapMatch[1];

    if (/^updatedAt\s/.test(line)) hasUpdatedAt = true;
  }

  return models;
}

const schemaModels = parseSchemaModels(readFileSync(SCHEMA_PATH, "utf8"));

describe("data-registry — cobertura completa del esquema", () => {
  it("parsea el esquema Prisma y encuentra modelos", () => {
    // Si esto falla, cambió la ruta del esquema o su sintaxis: el resto del test
    // ya no probaría nada.
    expect(schemaModels.length).toBeGreaterThan(0);
  });

  it("clasifica TODOS los modelos del esquema (ninguno sin registrar)", () => {
    const classified = new Set(DATA_REGISTRY.map((entry) => entry.model));
    const missing = schemaModels
      .map((entry) => entry.model)
      .filter((model) => !classified.has(model))
      .sort();

    expect(
      missing,
      missing.length === 0
        ? ""
        : `Modelos en prisma/schema.prisma sin clasificar en src/lib/data-registry.ts: ${missing.join(
            ", "
          )}. Agregá una entrada a DATA_REGISTRY indicando scope, strategy y orphanAudit. ` +
            `Si no lo hacés, estos datos no se respaldan ni se sincronizan y la pérdida es silenciosa.`
    ).toEqual([]);
  });

  it("no declara modelos que ya no existen en el esquema", () => {
    const inSchema = new Set(schemaModels.map((entry) => entry.model));
    const stale = DATA_REGISTRY.map((entry) => entry.model)
      .filter((model) => !inSchema.has(model))
      .sort();

    expect(
      stale,
      stale.length === 0
        ? ""
        : `Entradas de DATA_REGISTRY que ya no existen en prisma/schema.prisma: ${stale.join(
            ", "
          )}. Eliminá esas entradas del registro.`
    ).toEqual([]);
  });

  it("declara el nombre real de tabla de cada modelo (coincide con @@map)", () => {
    const mismatches = schemaModels
      .filter((entry) => {
        const registered = REGISTRY_BY_MODEL.get(entry.model);
        return registered !== undefined && registered.table !== entry.table;
      })
      .map((entry) => {
        const registered = REGISTRY_BY_MODEL.get(entry.model)!;
        return `${entry.model}: registro dice "${registered.table}", el esquema dice "${entry.table}"`;
      });

    expect(
      mismatches,
      mismatches.length === 0
        ? ""
        : `Nombres de tabla desincronizados:\n  ${mismatches.join("\n  ")}`
    ).toEqual([]);
  });

  it("declara correctamente qué modelos tienen updatedAt", () => {
    const mismatches = schemaModels
      .filter((entry) => {
        const registered = REGISTRY_BY_MODEL.get(entry.model);
        return registered !== undefined && registered.hasUpdatedAt !== entry.hasUpdatedAt;
      })
      .map((entry) => {
        const registered = REGISTRY_BY_MODEL.get(entry.model)!;
        return `${entry.model}: registro dice hasUpdatedAt=${registered.hasUpdatedAt}, el esquema ${
          entry.hasUpdatedAt ? "sí" : "no"
        } lo declara`;
      });

    expect(
      mismatches,
      mismatches.length === 0
        ? ""
        : `hasUpdatedAt desincronizado. Este campo decide si el modelo puede sincronizarse por delta:\n  ${mismatches.join(
            "\n  "
          )}`
    ).toEqual([]);
  });
});

describe("data-registry — integridad del registro", () => {
  it("no contiene modelos duplicados", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];

    for (const entry of DATA_REGISTRY) {
      if (seen.has(entry.model)) duplicates.push(entry.model);
      seen.add(entry.model);
    }

    expect(duplicates, `Modelos duplicados en DATA_REGISTRY: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("no contiene nombres de tabla duplicados", () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];

    for (const entry of DATA_REGISTRY) {
      const previous = seen.get(entry.table);
      if (previous) {
        collisions.push(`${entry.table} (${previous} y ${entry.model})`);
      }
      seen.set(entry.table, entry.model);
    }

    expect(
      collisions,
      collisions.length === 0 ? "" : `Dos modelos apuntan a la misma tabla: ${collisions.join(", ")}`
    ).toEqual([]);
  });

  it("exige un motivo cuando un modelo queda excluido", () => {
    const missingReason = DATA_REGISTRY.filter(
      (entry) => entry.strategy === "excluded" && !entry.reason?.trim()
    ).map((entry) => entry.model);

    expect(
      missingReason,
      missingReason.length === 0
        ? ""
        : `Estos modelos están excluidos sin justificación escrita: ${missingReason.join(
            ", "
          )}. Un modelo excluido sin motivo es indistinguible de un olvido.`
    ).toEqual([]);
  });

  it("exige relación padre cuando el alcance es user-child", () => {
    const missingParent = DATA_REGISTRY.filter(
      (entry) => entry.scope === "user-child" && !entry.parentRelation?.trim()
    ).map((entry) => entry.model);

    expect(
      missingParent,
      missingParent.length === 0
        ? ""
        : `Modelos con scope "user-child" sin parentRelation: ${missingParent.join(
            ", "
          )}. Sin la relación no se puede construir el filtro por usuario.`
    ).toEqual([]);
  });

  it("solo los modelos con userId propio participan de la auditoría de huérfanos", () => {
    // La auditoría de huérfanos ejecuta SQL crudo contra una columna `userId`.
    // Un modelo sin esa columna rompería la consulta en tiempo de ejecución.
    const schemaSource = readFileSync(SCHEMA_PATH, "utf8");
    const modelsWithUserId = new Set<string>();

    let current: string | null = null;
    for (const rawLine of schemaSource.split(/\r?\n/)) {
      const line = rawLine.trim();
      const modelStart = /^model\s+(\w+)\s*\{/.exec(line);
      if (modelStart) {
        current = modelStart[1];
        continue;
      }
      if (current === null) continue;
      if (line === "}") {
        current = null;
        continue;
      }
      if (/^userId\s/.test(line)) modelsWithUserId.add(current);
    }

    const invalid = getOrphanAuditModels()
      .filter((entry) => !modelsWithUserId.has(entry.model))
      .map((entry) => entry.model);

    expect(
      invalid,
      invalid.length === 0
        ? ""
        : `Estos modelos están marcados con orphanAudit=true pero no tienen columna userId: ${invalid.join(
            ", "
          )}. La limpieza de huérfanos fallaría contra la base de datos.`
    ).toEqual([]);
  });
});

describe("data-registry — garantías de cobertura", () => {
  it("el respaldo cubre más modelos de los que cubría antes del registro (27)", () => {
    // Valor histórico documentado: backup/export sólo cubría 27 modelos.
    // Este piso evita una regresión silenciosa en la cobertura del respaldo.
    const backupModels = getBackupModels();
    expect(backupModels.length).toBeGreaterThan(27);
  });

  it("la sincronización cubre más modelos de los que cubría antes del registro (26)", () => {
    // Los modelos excluidos del respaldo (credenciales, push, invitaciones)
    // tampoco se sincronizan, así que la cobertura de sync es menor o igual.
    const syncModels = getSyncModels();
    expect(syncModels.length).toBeGreaterThan(26);
  });

  it("todo modelo sincronizable está en el respaldo o justificado como excluido", () => {
    // Un modelo que se sincroniza al cliente pero no se respalda es una
    // asimetría sospechosa: el usuario lo ve en la app y lo pierde al restaurar.
    const backupModels = new Set(getBackupModels().map((entry) => entry.model));
    const asymmetric = getSyncModels()
      .filter((entry) => !backupModels.has(entry.model))
      .map((entry) => entry.model);

    expect(
      asymmetric,
      asymmetric.length === 0
        ? ""
        : `Estos modelos se sincronizan al cliente pero no se respaldan: ${asymmetric.join(
            ", "
          )}. O agregalos al respaldo o marcalos como excluded con un motivo.`
    ).toEqual([]);
  });

  it("excluye del respaldo las credenciales de autenticación", () => {
    // Salvaguarda explícita: un respaldo descargable nunca debe contener hashes
    // de contraseña ni llaves WebAuthn.
    const credential = REGISTRY_BY_MODEL.get("AuthCredential");
    expect(credential, "AuthCredential debe estar declarado en el registro").toBeDefined();
    expect(credential!.strategy).toBe("excluded");
    expect(getBackupModels().map((entry) => entry.model)).not.toContain("AuthCredential");
  });

  it("documenta qué modelos no pueden sincronizarse por delta", () => {
    // No es un fallo: es una limitación del esquema que debe seguir siendo
    // visible. Si esta lista crece, la sincronización incremental pierde
    // cobertura y hay que replicar esos modelos completos.
    const withoutUpdatedAt = getModelsWithoutUpdatedAt().map((entry) => entry.model);

    expect(withoutUpdatedAt).toContain("PantryMovement");
    expect(withoutUpdatedAt).toContain("PriceHistory");
    expect(withoutUpdatedAt).toContain("FuelLog");

    // Todo modelo sin updatedAt queda fuera del delta, por diseño.
    const incremental = new Set(getIncrementallySyncableModels().map((entry) => entry.model));
    for (const model of withoutUpdatedAt) {
      expect(incremental.has(model)).toBe(false);
    }
  });

  it("expone índices de búsqueda consistentes con la lista", () => {
    expect(REGISTRY_BY_MODEL.size).toBe(DATA_REGISTRY.length);
    expect(REGISTRY_BY_TABLE.size).toBe(DATA_REGISTRY.length);
    expect(REGISTRY_BY_MODEL.get("MedicalAuthorization")?.table).toBe("medical_authorizations");
    expect(REGISTRY_BY_MODEL.get("Category")?.table).toBe("custom_categories");
  });
});

/**
 * El script de migración SQLite → Postgres mantiene su propia lista de modelos
 * en `modelPlan`. Cuando se migró a Oracle esa lista omitía 11 modelos, entre
 * ellos `MedicalAuthorization`, `MedicalOrder` y `Recipe`: los datos existían en
 * SQLite y simplemente no llegaban al destino. Estos tests evitan que vuelva a
 * pasar y validan que el orden respete las claves foráneas.
 */
describe("migrate-sqlite-to-postgres — plan de migración completo", () => {
  const migrationScriptPath = path.resolve(
    __dirname,
    "../../scripts/migrate-sqlite-to-postgres.mjs"
  );

  const migrationPlan = (() => {
    const source = readFileSync(migrationScriptPath, "utf8");
    const plan: { accessor: string; model: string }[] = [];
    const entryPattern = /^\s*\["(\w+)",\s*"(\w+)"\],/gm;
    let match: RegExpExecArray | null;
    while ((match = entryPattern.exec(source)) !== null) {
      plan.push({ accessor: match[1], model: match[2] });
    }
    return plan;
  })();

  it("encuentra el plan de migración en el script", () => {
    expect(migrationPlan.length).toBeGreaterThan(0);
  });

  it("migra TODOS los modelos del esquema Prisma", () => {
    const planned = new Set(migrationPlan.map((entry) => entry.model));
    const missing = schemaModels
      .map((entry) => entry.model)
      .filter((model) => !planned.has(model))
      .sort();

    expect(
      missing,
      missing.length === 0
        ? ""
        : `Modelos ausentes en modelPlan (scripts/migrate-sqlite-to-postgres.mjs): ${missing.join(
            ", "
          )}. Estos datos NO se migrarían de SQLite a Postgres y se perderían sin error.`
    ).toEqual([]);
  });

  it("no planifica modelos que ya no existen en el esquema", () => {
    const inSchema = new Set(schemaModels.map((entry) => entry.model));
    const stale = migrationPlan
      .map((entry) => entry.model)
      .filter((model) => !inSchema.has(model));

    expect(
      stale,
      stale.length === 0
        ? ""
        : `modelPlan referencia modelos inexistentes: ${stale.join(", ")}. La migración fallaría en tiempo de ejecución.`
    ).toEqual([]);
  });

  it("no repite modelos en el plan", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of migrationPlan) {
      if (seen.has(entry.model)) duplicates.push(entry.model);
      seen.add(entry.model);
    }

    expect(duplicates, `Modelos duplicados en modelPlan: ${duplicates.join(", ")}`).toEqual([]);
  });

  it("migra cada padre antes que sus hijos (orden de claves foráneas)", () => {
    // El script copia tabla por tabla, sin desactivar restricciones. Si un hijo
    // se copia antes que su padre, la inserción viola la clave foránea.
    const position = new Map(migrationPlan.map((entry, index) => [entry.model, index]));

    const violations: string[] = [];
    for (const entry of DATA_REGISTRY) {
      if (entry.scope !== "user-child" || !entry.parentRelation) continue;

      const childPosition = position.get(entry.model);
      if (childPosition === undefined) continue;

      // La relación padre en el registro es el nombre del campo/relación, no el
      // modelo. Buscamos el modelo cuyo nombre, en minúscula inicial, coincide.
      const parentModel = schemaModels
        .map((candidate) => candidate.model)
        .find(
          (model) =>
            model.charAt(0).toLowerCase() + model.slice(1) === entry.parentRelation ||
            model.toLowerCase() === entry.parentRelation!.toLowerCase()
        );

      if (!parentModel) continue;
      const parentPosition = position.get(parentModel);
      if (parentPosition === undefined) continue;

      if (childPosition < parentPosition) {
        violations.push(
          `${entry.model} (posición ${childPosition}) se migra antes que su padre ${parentModel} (posición ${parentPosition})`
        );
      }
    }

    expect(
      violations,
      violations.length === 0
        ? ""
        : `Orden de migración inválido — violaría claves foráneas:\n  ${violations.join("\n  ")}`
    ).toEqual([]);
  });
});
