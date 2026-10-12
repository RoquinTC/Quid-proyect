# Cobertura de datos de Quid

Documento de referencia sobre qué datos del usuario se respaldan, se sincronizan
y se migran entre motores de base de datos — y qué estaba quedando fuera.

Última verificación: contra `prisma/schema.prisma` con **49 modelos**.

---

## 1. El problema que motivó este documento

El esquema tenía 49 modelos, pero la cobertura de datos estaba definida en
**cinco listas manuales independientes** que se fueron desincronizando:

| Lugar | Modelos cubiertos | Estado |
|---|---|---|
| `src/app/api/backup/export/route.ts` | 27 | ❌ incompleto |
| `src/app/api/sync/initial/route.ts` | 26 | ❌ incompleto |
| `src/app/api/sync/pull/route.ts` | 27 | ❌ incompleto (`deletions: []`) |
| `src/app/api/admin/orphans/route.ts` | 21 | ❌ incompleto |
| `scripts/migrate-sqlite-to-postgres.mjs` | 38 | ❌ incompleto |

Ninguna fallaba. Los datos simplemente no viajaban.

### Consecuencia concreta y medible

**Al restaurar un respaldo o migrar SQLite → Postgres se perdían:**

- `MedicalAuthorization` — autorizaciones EPS y su vigencia
- `MedicalOrder` + `MedicalOrderItem` — órdenes médicas y **entregas parciales de farmacia**
- `Recipe` + `RecipeIngredient` — recetas
- `VehicleReminder` — recordatorios de SOAT, tecnomecánica y mantenimiento
- `VehicleDocument` — documentos del vehículo
- `MaintenanceServiceRule` — reglas de mantenimiento periódico
- `CategoryRule` — reglas automáticas de categorización
- `PantryMovement` — movimientos de la nevera
- `PriceHistory` — historial de precios de la despensa (nunca se escribía)
- `HealthAiReport` — reportes de salud generados por IA

Es decir: exactamente las funciones de Salud que más valor tiene el usuario.

---

## 2. Qué se corrigió (fase A)

### `src/lib/data-registry.ts` — fuente única de verdad

Registro declarativo de los 49 modelos. Cada entrada define:

| Campo | Significado |
|---|---|
| `model` | Nombre exacto en Prisma |
| `table` | Nombre real de la tabla en Postgres (resuelve `@@map`) |
| `scope` | `user` (tiene `userId`) · `user-child` (pertenece vía padre) · `global` |
| `strategy` | `export` · `sync` · `both` · `excluded` |
| `orphanAudit` | Si entra en la auditoría de huérfanos del admin |
| `hasUpdatedAt` | Requisito para sincronización incremental |
| `parentRelation` | Relación padre cuando es `user-child` |
| `reason` | Obligatorio cuando `strategy` es `excluded` |

### `src/__tests__/data-registry.test.ts` — test guardián

21 tests que comparan el registro contra `prisma/schema.prisma` y contra el
script de migración. **Si alguien agrega un modelo a Prisma sin clasificarlo, el
test falla con el nombre exacto del modelo.** Verificado por mutación: agregar un
modelo inexistente y quitar `Recipe` del plan de migración hacen fallar el test
con el mensaje correspondiente.

También valida el **orden de claves foráneas** del plan de migración: el script
copia tabla por tabla con `createMany`, sin desactivar restricciones, así que un
hijo antes que su padre violaría la clave foránea.

### `scripts/migrate-sqlite-to-postgres.mjs`

`modelPlan` pasó de **38 a 49 modelos**. Se agregaron los 11 que faltaban, en
orden de dependencias.

### `prisma/schema.postgres.prisma` y `prisma/schema.sqlite.prisma`

Se agregó el modelo `MedicalAuthorization` y los campos de relación
`authorizationId`, `authorization` y `createdAuthorizations` en
`MedicalAppointment`, que faltaban en ambos.

> **Detalle importante:** estos dos esquemas deben replicar **exactamente** los
> campos del esquema principal, porque el script de migración copia filas con
> `createMany({ data: rows })` sin transformarlas. Por eso `renewals` se declara
> como `Json?` y no como `String?`, a pesar de que otros campos JSON en esos
> esquemas usan `String`. El código de `api/health/authorizations` hace
> `Array.isArray(existingAuth.renewals)`, así que es un `Json` real.

---

## 3. Límites de seguridad respetados

Estos modelos están **deliberadamente fuera del respaldo descargable**
(`strategy: "excluded"`), cada uno con su motivo escrito en el registro:

| Modelo | Por qué nunca sale en un respaldo |
|---|---|
| `AuthCredential` | Hashes de contraseña y llaves WebAuthn |
| `PushSubscription` | Endpoint ligado al dispositivo; restaurarlo en otro equipo genera envíos a un dispositivo inexistente |
| `StoredBackup` | Es el contenedor del propio respaldo; incluirlo anidaría el archivo sin límite |
| `AccountInvitation` | Token de un solo uso y estado efímero |
| `HealthAiReport` | Salida regenerable de IA |
| `User` | Raíz de la jerarquía; la restauración crea el usuario desde la sesión |

El test `excluye del respaldo las credenciales de autenticación` protege
explícitamente el caso de `AuthCredential`.

---

## 4. Deuda pendiente (fase B)

El registro es **declarativo y verificado**, pero **los endpoints todavía no lo
consumen**. Hoy el registro garantiza que una omisión se detecte; todavía no
garantiza que los datos viajen. Esto es lo que falta:

### B1. Consumir el registro en los endpoints

| Endpoint | Trabajo |
|---|---|
| `api/backup/export` | Recorrer `getBackupModels()` en vez de 27 consultas escritas a mano |
| `api/backup/import` | 786 líneas con orden de borrado/creación explícito. Es el cambio de mayor riesgo del proyecto |
| `api/backup/constants.ts` | `BackupData` tiene una clave por tabla (513 líneas de tipos). Hoy agregar un modelo al respaldo exige editar 3 archivos |
| `api/backup/validate` | Validar contra el registro |
| `api/backup/server-save` / `server-restore` | Idem |
| `api/sync/initial` | Recorrer `getSyncModels()` |
| `api/sync/pull` | Recorrer `getIncrementallySyncableModels()` |
| `api/admin/orphans` | Recorrer `getOrphanAuditModels()` en vez de 21 tablas a mano |

### B2. Extender `BackupData` de forma genérica

La vía de menor riesgo: agregar un campo `extra: Record<string, unknown[]>` que
transporte los modelos aún no soportados explícitamente, y un pase genérico de
importación que los inserte **después** de las entidades explícitas (los padres
ya existen, las claves foráneas se resuelven solas). Esto cierra la brecha de
cobertura sin tocar el orden explícito del importador.

### B3. Borrados que no se propagan

`api/sync/pull` devuelve `deletions: []`. Los borrados hechos en un dispositivo
**nunca se propagan a otro**, y no existe modelo de tombstone
(`DeletedRecord`). Es un problema de consistencia multi-dispositivo, no de
pérdida de datos.

### B4. Modelos que no pueden sincronizarse por delta

13 modelos no tienen `updatedAt`, así que `sync/pull?since=` no puede verlos:
`SharedAccountUser`, `AppNotification`, `AbonoDetail`, `SavingsGoalAccount`,
`SavingsContribution`, `FuelLog`, `MaintenanceItem`, `PantryMovement`,
`PriceHistory`, `RecipeIngredient`, `StoredBackup`, `AuthCredential`,
`AchievementProgress`.

`getModelsWithoutUpdatedAt()` los expone a propósito. Si esta lista crece, la
sincronización incremental pierde cobertura y hay que replicar esos modelos
completos con `sync/initial`.

### B5. Configuración de entorno

`Quid-App/.env` sólo define `DATABASE_URL`. El script de migración exige además
`POSTGRES_DATABASE_URL` (o `SQLITE_DATABASE_URL`) y aborta si faltan:

```
Falta POSTGRES_DATABASE_URL.
```

Ambas variables ya están documentadas en `.env.example`, pero no en el `.env`
real. En esta máquina la migración SQLite → Postgres **no puede ejecutarse**
hasta agregarlas.

---

## 5. Cómo verificar el estado actual

```bash
cd Quid-App

# Guardián de cobertura — falla si un modelo queda sin clasificar
npx vitest run src/__tests__/data-registry.test.ts

# Suite completa
npx vitest run

# Los tres esquemas deben ser válidos
npx prisma validate --schema prisma/schema.prisma
POSTGRES_DATABASE_URL="postgresql://user:pass@host:5432/db?schema=public" \
  npx prisma validate --schema prisma/schema.postgres.prisma
SQLITE_DATABASE_URL="file:./db/custom.db" \
  npx prisma validate --schema prisma/schema.sqlite.prisma
```

### Al agregar un modelo nuevo a Prisma

1. Agregarlo a `prisma/schema.prisma`.
2. Agregar la entrada correspondiente en `src/lib/data-registry.ts`.
3. Si debe migrarse, agregarlo a `modelPlan` en
   `scripts/migrate-sqlite-to-postgres.mjs`, respetando el orden de padres.
4. Si participa de la migración SQLite → Postgres, replicarlo en
   `schema.sqlite.prisma` y `schema.postgres.prisma` **con los mismos campos**.
5. `npx vitest run src/__tests__/data-registry.test.ts` debe pasar.
