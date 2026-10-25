# Módulo Salud de Quid-App — Referencia comparada (Medisafe vs MyTherapy) y plan de implementación

> Insumos: `MEDISAFE_INGENIERIA_INVERSA_SALUD.md` y `MYTHERAPY_INGENIERIA_INVERSA_SALUD.md`
> (misma sesión de ingeniería inversa, 2026-10-24).
> Objetivo: llevar el módulo Salud de Quid del estado actual ("medicamento + stock") a un
> **motor de adherencia** con evidencia histórica.

---

## 1. Dónde está Quid hoy (verificado en el repo)

### 1.1 Modelos Prisma existentes (`prisma/schema.postgres.prisma`)

| Modelo | Campos clave |
|---|---|
| `Medication` | `name`, `dosage`, `frequency` (string libre), `customSchedule` (JSON string), `disease`, `howToTake`, `startDate`, `endDate`, `isActive`, `reminderEnabled`, `reminderTimes` (JSON string), `stockQuantity`, `stockUnit`, `doseQuantity`, `lowStockThreshold` |
| `MedicalAppointment` | `date`, `doctorName`, `specialty`, `location`, `reminderEnabled`, `status`, `copayAmount`, + enlaces financieros |
| `MedicalAuthorization` | `type`, `status`, `code`, `daysOfValidity`, `expirationDate`, `renewals` (Json) |
| `MedicalOrder` / `MedicalOrderItem` | `status`, `prescribedQty`, `deliveredQty`, `pendingQty`, `monthlyDose` |
| `HealthProfile` | `type` (owner/guest), `diseases`, `restrictions`, `aiRestrictions` |
| `HealthCondition` | `name`, `origin` (medication/manual/ai_confirmed), `severity` |
| `HealthAiReport` | `summary`, `model`, `generatedAt` |

### 1.2 Rutas API existentes

```
/api/medications              (GET, POST)
/api/medications/[id]         (GET, PATCH, DELETE)
/api/medications/[id]/take    (POST)   ← sólo descuenta stock
/api/appointments
/api/health                   ← resumen
/api/health/authorizations
/api/health/orders/claim
/api/health-profiles
/api/medical-orders
/api/ai/health-summary
/api/ai/medication-info
```

### 1.3 Lógica de recurrencia existente (`src/lib/medication-schedule.ts`)

`isMedicationDueToday()` soporta `daily`, `every_n_days` (con `customSchedule.type="interval_days"`),
`weekly` y `as_needed`, anclando el intervalo a `startDate` o `createdAt`.

### 1.4 El agujero central (verificado en código)

`src/app/api/medications/[id]/take/route.ts` hace:

```ts
const dose = body.quantity ?? medication.doseQuantity ?? 1;
const updated = await db.medication.update({
  where: { id },
  data: current == null ? {} : { stockQuantity: Math.max(0, current - dose) },
});
```

**No se persiste ninguna toma.** Consecuencias directas:

> **Contradicción detectada con la documentación interna.** `docs/nuevas-implementaciones.md §5`
> declara "Historial de tomas confirmadas" como parte del 100 % de Salud 2.0. El código dice
> otra cosa: `today-schedule.tsx` **envía** `takenAt` y `validations.ts` lo acepta como opcional,
> pero `take/route.ts` no lo usa ni lo guarda; no existe modelo Prisma, tabla local ni store
> Dexie de tomas. El "historial" que el usuario ve es, como mucho, estado optimista en el cliente.
> Es decir: **la UI ya tiene la intención, falta la persistencia** — exactamente la brecha G1.

- No hay historial → no hay adherencia, ni rachas, ni reportes, ni "¿cuándo tomé la última?".
- El stock es la única "memoria", y se pierde si el usuario corrige o borra el medicamento.
- No se distingue *olvidó* de *decidió no tomar*.
- No se puede calcular "próxima toma" con hora real (sólo `reminderTimes` declarativo).

---

## 2. Comparación estructural de las dos apps

| Dimensión | Medisafe 9.52.1 | MyTherapy 4.12.2 | Quid hoy |
|---|---|---|---|
| Arquitectura | KMP + Android legacy + Compose | KMP + Compose Multiplatform (single-activity) | Next.js + Capacitor |
| Módulos de feature | ~14 paquetes `multiplatform.*` | 47 `feature.*` | `src/lib/*` + `api/*` |
| Entidad de toma | `ScheduleItem` (37 campos, 6 estados) | `event_log` (17 campos, 5 estados) | **no existe** |
| Valor esperado vs real | `doseValue` por item | `event_log_value.scheduled_value` vs `value` | **no existe** |
| Recurrencia | 6 ejes (`reminderType`, `everyXDays`, `fourWeeksPattern`, ciclo, `daysToTake`, `customScheduleJson`) | `mode` + `days_active/paused` + `day_in_cycle` + `scheduler_time.active_on_days` | `frequency` string + `interval_days` |
| Overrides por fecha | re-agendado del item (`RescheduleItemSource`) | tabla `scheduler_modification` (4 tipos) | **no existe** |
| Snapshot de alarma | `AlarmEntity` + `alarm_tbl` | `scheduled_notification PK(date,tag)` | `reminderTimes` JSON + `server-reminders.ts` |
| Zona horaria | pantallas dedicadas + `TimeZoneReceiver` | `event_log.timezone` | **no modelado** |
| Mediciones | `TrackerGroup/Item` + 25 tipos + 23 unidades | `trackable_object` + `unit` + `scale` (genérico) | **no existe** |
| Síntomas | vía `MOOD`/`PAIN` (mediciones) | `feature.symptoms` | **no existe** |
| Gamificación | refuerzo positivo puntual | `mission`/`streak`/`achievement` con racha configurable | `achievements` (finanzas) |
| Cuidador | MedFriend + SafetyNet + perfiles | `team_profile` + `sub_profile` | `HealthProfile` (owner/guest) |
| Farmacia | `Refill` con importe | `pharmacy` + `ordered_medication` + shop | `MedicalOrder` (autorizaciones) |
| Interacciones | DDI + lifestyle (servidor) | `drug_interaction` (local, con `wasDisplayed`) | **no existe** |
| Health Connect | no | solo lectura (12 permisos) | **no** |
| Informe | `ReportActivity` + envío | `healthreport` → PDF en cliente | `HealthAiReport` (texto IA) |
| Datos sensibles | cifrado por campo (`encryption_version`) | DB Room + consentimientos | Prisma/Postgres |

**Conclusión:** las dos apps coinciden en lo esencial —
`plan (recurrencia) → ocurrencia (toma) → estado → métrica`.
Quid tiene el plan y el stock, pero **no tiene la ocurrencia**, que es donde vive todo el valor.

---

## 3. Brechas priorizadas

| # | Brecha | Impacto | Evidencia de la referencia |
|---|---|---|---|
| **G1** | No hay registro de tomas | Crítico: sin historial no hay adherencia | `event_log`, `ScheduleItem` |
| **G2** | No hay estado de toma (6/5 estados) | Alto: "olvidó" ≠ "decidió no tomar" | `STATUS_AUTOMATICALLY_SKIPPED` vs `SKIPPED` |
| **G3** | `frequency` es string libre con valores mágicos | Alto: imposible validar/migrar | doble enum de MyTherapy (y aun así mejor que string) |
| **G4** | Sin overrides por fecha | Medio: obliga a mutar el plan | `scheduler_modification` |
| **G5** | Sin zona horaria en el registro | Medio: viajes y DST corrompen métricas | `event_log.timezone`, pantallas TZ de Medisafe |
| **G6** | Sin mediciones/síntomas | Medio: el módulo es sólo medicación | `trackable_object`+`scale`, 25 `MeasurementType` |
| **G7** | Sin idempotencia de recordatorios | Medio: duplicados al reiniciar | `scheduled_notification PK(date,tag)` |
| **G8** | Sin rachas/misiones | Bajo (pero alto en retención) | `mission` + `Mission$Streak` |
| **G9** | Sin interacciones | Medio (seguridad clínica) | `drug_interaction` |
| **G10** | Sin lectura de Health Connect | Bajo/Medio | 12 permisos `health.READ_*` |
| **G11** | Stock sin libro mayor | Medio: el stock no cuadra | `refill` con importe; `low_inventory_reminder` |
| **G12** | Sin "crítico" (recordatorio que no puede perderse) | Medio | `is_critical` + full-screen intent |

---

## 4. Esquema propuesto para Quid (Prisma)

Diseñado para cubrir G1–G5, G7, G11, G12 con **4 tablas nuevas** y **1 modificación**.

```prisma
// ── G1/G2: la ocurrencia (equivalente a ScheduleItem / event_log) ──────────────
model DoseOccurrence {
  id                String    @id @default(cuid())
  userId            String
  medicationId      String
  profileId         String?              // HealthProfile (multi-perfil)

  scheduledAt       DateTime             // hora PROGRAMADA (UTC)
  scheduledLocalAt  String               // "2026-10-24T08:00" en la zona del plan
  timezone          String               // "America/Bogota" — G5
  plannedDose       Float                // dosis prescrita para esta ocurrencia
  actualDose        Float?               // dosis realmente tomada

  status            DoseStatus @default(PENDING)
  actedAt           DateTime?            // hora REAL de la acción
  snoozeCount       Int        @default(0)
  lastRemindedAt    DateTime?
  reminderCount     Int        @default(0)

  source            DoseSource @default(SCHEDULED)  // SCHEDULED | PRN | EXTERNAL
  externalSource    String?              // health_connect | device | import
  externalId        String?              // G7: idempotencia con el origen
  note              String?
  isCritical        Boolean    @default(false)      // G12

  createdAt         DateTime   @default(now())
  updatedAt         DateTime   @updatedAt

  user              User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  medication        Medication @relation(fields: [medicationId], references: [id], onDelete: Cascade)

  @@unique([medicationId, scheduledAt])              // G7: 1 ocurrencia por plan+hora
  @@unique([userId, externalSource, externalId])     // G7: idempotencia externa
  @@index([userId, status, scheduledAt])
  @@index([userId, scheduledAt])
  @@map("dose_occurrences")
}

enum DoseStatus {
  PENDING                  // generada, aún no vencida
  TAKEN                    // confirmada por el usuario
  SKIPPED                  // el usuario decidió no tomarla        (MyTherapy SKIPPED)
  MISSED                   // venció sin acción                    (AUTOMATICALLY_SKIPPED)
  SNOOZED                  // pospuesta, sigue pendiente
  DISMISSED                // descartada sin decisión explícita    (Medisafe)
}

enum DoseSource { SCHEDULED  PRN  EXTERNAL }

// ── G4: override por fecha (equivalente a scheduler_modification) ──────────────
model DoseOverride {
  id           String   @id @default(cuid())
  userId       String
  medicationId String
  appliesTo    DateTime // fecha (día) afectada, en UTC normalizado
  type         OverrideType
  payload      Json     // { hours:["09:30"], dose:1.5, skip:true }
  createdAt    DateTime @default(now())

  @@unique([medicationId, appliesTo, type])
  @@index([userId, appliesTo])
  @@map("dose_overrides")
}

enum OverrideType { MODIFY_TIME  MODIFY_DOSE  SKIP_DAY  FILTER_DAYS }

// ── G7/G12: snapshot de recordatorio (equivalente a scheduled_notification) ────
model ReminderDispatch {
  id         String   @id @default(cuid())
  userId     String
  dedupeKey  String   @unique   // hash(profileId|date|slot|snooze)  ← PK(date,tag)
  kind       String              // dose | appointment | order | refill
  refId      String
  scheduledFor DateTime
  sentAt     DateTime?
  channel    String              // push | local | in_app
  isCritical Boolean @default(false)
  errorCode  String?             // OVER_LIMIT | NO_PERMISSION | ...
  createdAt  DateTime @default(now())

  @@index([userId, scheduledFor])
  @@map("reminder_dispatches")
}

// ── G6: mediciones genéricas (equivalente a trackable_object + unit + scale) ───
model HealthMeasurement {
  id         String   @id @default(cuid())
  userId     String
  profileId  String?
  type       String              // weight | glucose | blood_pressure | mood | pain | symptom
  value      Float
  secondValue Float?             // sistólica/diastólica, o valor 2
  unit       String
  measuredAt DateTime
  timezone   String
  source     String   @default("manual")   // manual | health_connect | device
  externalId String?
  note       String?

  @@index([userId, type, measuredAt])
  @@unique([userId, source, externalId])
  @@map("health_measurements")
}

// ── G11: libro mayor de stock ─────────────────────────────────────────────────
model MedicationStockEntry {
  id           String   @id @default(cuid())
  userId       String
  medicationId String
  delta        Float                 // negativo consume, positivo repone
  reason       String                // dose | refill | adjustment | order_delivery
  refId        String?
  balanceAfter Float?
  createdAt    DateTime @default(now())

  @@index([medicationId, createdAt])
  @@map("medication_stock_entries")
}
```

Y en `Medication`, sustituir el string libre por un enum + campos explícitos:

```prisma
enum MedicationFrequency {
  DAILY
  X_TIMES_DAILY
  EVERY_X_DAYS
  EVERY_X_WEEKS
  EVERY_X_HOURS
  SELECTED_WEEKDAYS
  MONTHLY
  PERIODIC
  AS_NEEDED
}

// en model Medication
frequency       MedicationFrequency @default(DAILY)
intervalDays    Int?      // para EVERY_X_DAYS
intervalHours   Int?      // para EVERY_X_HOURS
daysOfWeek      Int?      // bitmask (bit0=lunes … bit6=domingo)
timesOfDay      String[]  // ["08:00","20:00"] — reemplaza reminderTimes JSON
anchorDate      DateTime? // ancla del intervalo (equivale a original_start_date)
timezone        String    @default("UTC")
isCritical      Boolean   @default(false)
```

> `customSchedule` puede mantenerse como escape hatch, pero **validado con Zod** y
> sólo para patrones que el enum no cubra (equivalente a `customScheduleJson` de Medisafe,
> pero con contrato).

---

## 5. Algoritmos a implementar

### 5.1 Generación de ocurrencias (idempotente)

```
para cada medicamento activo:
  para cada día D en [desde, hasta]:
    si not isDueOn(D, medication, overrides) → continuar
    horas = overrides[D].hours ?? medication.timesOfDay
    para cada hora H en horas:
      dose = overrides[D].dose ?? medication.doseQuantity
      # hora < therapyDayStartHour ⇒ pertenece al día lógico anterior
      therapyDay = (D + H) - therapyDayStartHour
      upsert DoseOccurrence(medicationId, scheduledAt = toUtc(D,H,tz), ...)
  aplicar overrides AL FINAL, nunca durante la generación
```

Reglas verificadas en las referencias:

- **Ancla del intervalo** = `startDate` (Medisafe `schedulingStartDate`,
  MyTherapy `originalStartDate`; Quid ya usa `startDate || createdAt` en
  `medication-schedule.ts` — **mantener**).
- **Ciclo = `daysActive + daysPaused`** (MyTherapy). `EVERY_X_DAYS` = solo el día 0 del ciclo;
  `PERIODIC` = los primeros `daysActive` días. Medisafe equivalente: `everyXDays` +
  `daysToTake` + `fourWeeksPattern`.
- **Mensual con `min(díaInicio, últimoDíaDelMes)`** (MyTherapy) → el 31 cae al 28/29/30 de
  febrero en vez de saltarse el mes.
- **Bitmask de días por bloque horario**, no por plan (`scheduler_time.active_on_days`).
- **Idempotencia**: `@@unique([medicationId, scheduledAt])` + upsert
  (MyTherapy usa PK `(date, tag)`; Medisafe usa `alarmCounter`).
- **No generar en el pasado**: sólo desde "hoy − ventana_de_gracia".
- **Ventana de gracia = corte del día lógico**, no `+N horas` (ver 5.2).

### 5.2 Máquina de estados

```
PENDING ──take──► TAKEN        (actedAt = now, actualDose = planned)
   │
   ├──snooze──► SNOOZED ──take──► TAKEN
   │                └──expire──► MISSED
   ├──skip────► SKIPPED         (decisión explícita del usuario)
   ├──expire──► MISSED          (automático, sin acción)
   └──dismiss─► DISMISSED       (descartada; cuenta como MISSED en métricas duras)
```

Transiciones **permitidas hacia atrás** (corrección): `TAKEN → PENDING` sólo dentro de
24 h y sólo desde la UI de historial (MyTherapy: `is_editable`; Medisafe: `EditDoseActivity`).

**Cierre automático [verificado en MyTherapy]:** el paso `PENDING → MISSED` se ejecuta al
cambiar el *therapy day* (04:00 por defecto), recorre **sólo los días anteriores a hoy**
(y los huecos desde la última ejecución) y es **idempotente por día**. Nunca cierra el día
en curso. Quid debe guardar `therapyDayStartHour` (por usuario) y una marca
`lastCloseRunFor = LocalDate` para replicar exactamente eso.

### 5.3 Política de snooze

Evidencia verificada en Medisafe: la política **viene del servidor** en `ReminderSettingDto`
(`snoozeCount` = nº de avisos extra, `snoozeTime` = **segundos** entre ellos) y se materializa
como N items `actual + snoozeTime*i`; además existe un ajuste local de snooze en **minutos**
(`ItemAlarmUtils.getSnoozeSettingsInMinutes`). `ReminderNotificationUpdateStatus$OverLimit`
demuestra que el sistema puede negarse a programar más.

```
máx_snoozes = setting.snoozeLimit (default 3)
intervalo   = setting.snoozeMinutes (10 → 15 → 30 escalado)
si snoozeCount >= máx → ofrecer "omitir" o "tomar ahora", nunca snooze
```

El snooze **no** debe reprogramar la ocurrencia: incrementa `snoozeCount` y `lastRemindedAt`
(Medisafe guarda `snoozeNumber` fuera del item, en el contexto del generador).
**Usar una sola unidad (minutos)** — Medisafe mezcla segundos y minutos y es una fuente de bugs.

### 5.4 Métricas de adherencia

```sql
-- adherencia (excluye PRN y ocurrencias aún abiertas)
tomadas   = count(status = 'TAKEN')
evaluables= count(status IN ('TAKEN','SKIPPED','MISSED','DISMISSED'))
adherencia= tomadas::float / NULLIF(evaluables,0)

-- omisión activa (decisión) vs olvido (fallo de ejecución)
omision   = count(status='SKIPPED') / evaluables
olvido    = count(status='MISSED')  / evaluables

-- puntualidad
retraso_medio = avg(actedAt - scheduledAt) FILTER (WHERE status='TAKEN')

-- fricción
snoozes_por_toma = avg(snoozeCount)
```

### 5.5 Rachas (configurables, como MyTherapy)

```ts
type StreakRule = {
  windowDays: number;   // streak_in_last_n_days
  minGapDays: number;   // streak_min_gap
  maxGapDays: number;   // streak_max_gap
  target: number;       // target_completed_actions
};

// racha actual = días consecutivos (o con gaps permitidos) con adherencia >= target
```

Un `streak++` simple es incorrecto: MyTherapy permite **huecos** dentro de la ventana.

**Fórmula verificada (MyTherapy `GetCurrentStreakCountUseCase`)** para la racha *actual*:

```ts
if (!streakEnabled) return 0;                 // feature flag
const s = await repo.lastStreak();
if (!s || s.end !== null) return 0;           // racha cerrada ⇒ actual = 0
const today = therapyDay(now);                // corte 04:00
const end = (await hasOpenTasksToday()) ? subDays(today, 1) : today;
return differenceInDays(end, s.start) + 1;
```

Dos reglas de producto que conviene copiar:

1. Una racha **cerrada** da 0 como "actual" (y existe una operación explícita para
   "resucitarla", `ResurrectStreakUseCase`).
2. Mientras hoy tenga tareas abiertas, **la racha se mide hasta ayer**: no se rompe a media tarde.

Y se materializa en una tabla `streak(start_date, end_date, is_active)` en lugar de
recalcular el historial completo en cada lectura: proyección con escritores únicos
(`CreateStreakUseCase`, `EndLastStreakUseCase`).

---

## 6. Entrega de recordatorios (adaptado a Quid)

| Aspecto | Decisión recomendada | Base |
|---|---|---|
| Dedupe | `ReminderDispatch.dedupeKey` único | `scheduled_notification PK(date,tag)` |
| Errores | `errorCode` (`OVER_LIMIT`, `NO_PERMISSION`, `DATA_CORRUPTED`) | `ReminderNotificationUpdateStatus` |
| Crítico | canal propio + `isCritical` + full-screen/local alarm | `is_critical`, `CriticalReminderConfig` |
| Zona horaria | guardar `timezone` **por ocurrencia**, no por usuario | `event_log.timezone` |
| Recalcular al viajar | job al detectar cambio de TZ → regenerar futuras | `TimeZoneReceiver` |
| Recalcular al reiniciar | idempotente por `dedupeKey` | `StartupReceiver` + PK compuesta |
| Diagnóstico OEM | endpoint/UI que explique Doze/batería | `ReminderProblemActivity` |

Quid ya tiene `src/lib/server-reminders.ts` y `src/lib/push.ts`; el cambio es que el envío
pase a estar **respaldado por `ReminderDispatch`** para ser idempotente y auditable.

---

## 7. Plan por fases

### Fase 0 — Higiene del modelo (1–2 días)
- [ ] `frequency` → enum `MedicationFrequency` + migración de datos.
- [ ] `timesOfDay String[]` (migrar `reminderTimes` JSON; validar con Zod).
- [ ] `timezone` en `Medication`.
- [ ] Criterio: 0 medicamentos con `frequency` fuera del enum; parseo tolerante de datos viejos.

### Fase 1 — La ocurrencia (3–5 días) ← **la que desbloquea todo**
- [ ] `DoseOccurrence` + `DoseStatus` (tabla y enum).
- [ ] Registrar los modelos nuevos en **las cinco listas de cobertura** que describe
      `docs/DATA_COVERAGE.md` (backup/export, sync/initial, sync/pull, admin/orphans y
      `src/lib/data-registry.ts`): si no, la ocurrencia no se respalda ni se sincroniza.
- [ ] Generador idempotente (`lib/dose-scheduler.ts`) con upsert por `(medicationId, scheduledAt)`.
- [ ] `POST /api/medications/[id]/take` → actualiza **la ocurrencia** + `MedicationStockEntry`.
- [ ] `POST /api/doses/[id]/skip` · `snooze` · `PATCH` (corrección).
- [ ] `GET /api/doses?from&to&status`.
- [ ] Job de cierre: `PENDING → MISSED` tras la ventana de gracia.
- [ ] Criterio: tomar/omitir dos veces la misma hora produce **una** ocurrencia (test de idempotencia).

### Fase 2 — Adherencia visible (3 días)
- [ ] `GET /api/health/adherence?range=30d` → tomadas/evaluables, omisión, olvido, retraso.
- [ ] UI de historial por medicamento y "hoy".
- [ ] `HealthAiReport` se alimenta de métricas reales (hoy es sólo texto IA).
- [ ] Criterio: la adherencia de 30 días cuadra con la suma de ocurrencias (test de consistencia).

### Fase 3 — Overrides y PRN (2–3 días)
- [ ] `DoseOverride` (mover hora, cambiar dosis, saltar día).
- [ ] `PRN` (as-needed): toma sin ocurrencia, `source=PRN`, no cuenta en adherencia.
- [ ] Criterio: mover la hora de mañana no altera el histórico ni el patrón base.

### Fase 4 — Mediciones y síntomas (3–4 días)
- [ ] `HealthMeasurement` con `secondValue` (presión arterial).
- [ ] Catálogo de tipos (tomar los 25 de Medisafe como punto de partida, recortado a 8–10).
- [ ] Vista de progreso con rango y unidad.
- [ ] Criterio: una medición de presión arterial se guarda y grafica como par.

### Fase 5 — Recordatorios robustos (3 días)
- [ ] `ReminderDispatch` + dedupe.
- [ ] Recalculo por TZ y por reinicio.
- [ ] Pantalla de diagnóstico de batería/Doze.
- [ ] Criterio: reiniciar el dispositivo no duplica notificaciones.

### Fase 6 — Retención y seguridad (opcional)
- [ ] Rachas con `StreakRule` (reutilizar `achievements` de finanzas con cuidado: son de otro dominio).
- [ ] `drug_interaction` (empezar con catálogo propio; sin servicio externo).
- [ ] Health Connect **solo lectura** (evita el proceso de escritura de Google Play).
- [ ] Cifrado por campo para `note`/`secondValue` si se decide (patrón `encryption_version`).

---

## 8. Decisiones cerradas (2026-10-24) y riesgos

### 8.1 Decisiones del usuario

| # | Decisión | Consecuencia |
|---|---|---|
| D1 | **Recordatorio = notificación real de Android**, con **sonido tipo pastillero** (estilo Medisafe), no aviso interno de la app | `@capacitor/local-notifications` + sonido en `android/app/src/main/res/raw/` |
| D2 | La notificación trae **acciones**: *Tomar* / *Omitir* / *En 5 min*; tocarla abre la pantalla de confirmación | `actionTypeId` + leer `actionId` en el listener existente |
| D3 | **Las medicinas son del usuario**, no de un perfil familiar | `DoseOccurrence` cuelga de `userId` + `medicationId`; **no** se añade `profileId` |
| D4 | **El perfil de salud se construye desde los medicamentos**: al registrar uno, Aura infiere la enfermedad, el usuario confirma o la escribe, y Aura marca condiciones (ayunas, con agua, etc.) | encaja en lo existente: `HealthCondition.origin` ya tiene `medication`/`ai_confirmed` + `medicationId`; `Medication.disease` y `howToTake` ya existen |
| D5 | Los **soportes** (foto del recibo de entrega parcial) se guardan **en el celular**, en carpeta con ruta configurable, y opcionalmente a Drive | `@capacitor/filesystem` + `@capacitor/share`; NO guardar la imagen como blob en Postgres |

### 8.2 Lo que ya existe en Quid (verificado) — reduce el costo de D1/D2/D5

| Pieza | Estado |
|---|---|
| `@capacitor/local-notifications` 8.2 | instalado **y en uso** |
| Patrón de agendado | `src/lib/native/device-integrations.ts` → `syncNativeAppointment()`: id determinista (`notificationIdFor`), cancelar+reagendar, permisos en runtime, `allowWhileIdle: true`, `extra.route` |
| Deep link al tocar | `src/components/native/native-device-bridge.tsx` escucha `localNotificationActionPerformed` y enruta por `extra.route` |
| `SCHEDULE_EXACT_ALARM` | ya declarado en el manifiesto |
| Cámara y compartir | `captureNativePhoto()` y `shareNativeText()` ya implementados |
| `@capacitor/filesystem` | instalado, **sin uso todavía** |

**Falta declarar/añadir:** `POST_NOTIFICATIONS` (Android 13+), `RECEIVE_BOOT_COMPLETED`,
`VIBRATE`, `USE_EXACT_ALARM` (variante sin prompt para alarmas), la carpeta `res/raw` con el
sonido, y `LocalNotifications.registerActionTypes(...)`.

### 8.3 Riesgos

| Riesgo | Mitigación |
|---|---|
| Regenerar ocurrencias del pasado cambia la adherencia histórica | Sólo generar desde `max(hoy − ventana, último cierre)`; nunca recalcular cerradas |
| Doble zona horaria (plan vs ocurrencia) | Guardar `timezone` en la ocurrencia; el plan aporta la zona por defecto |
| Sonido propietario de Medisafe | **No se puede copiar**: usar SFX libre o sintetizar uno propio |
| Ruta personalizada de carpetas en Android 11+ | Sin SAF no hay ruta arbitraria: Documents/Quid/Salud (visible) + Compartir→Drive |
| Explosión de ocurrencias | Generación *rolling* de 7–14 días, no todo el tratamiento |
| `MISSED` silencioso infla el "olvido" | Cerrar sólo tras el corte del día lógico y con `reminderCount >= 1` |
| Migración de datos existentes | No hay histórico previo: empezar limpio es una ventaja |

---

## 9. Resumen de una frase

> Medisafe enseña **cómo modelar la toma** (`ScheduleItem`: programado vs real, 6 estados,
> snooze, crítico, zona horaria); MyTherapy enseña **cómo medirla y corregirla**
> (`event_log` con valor esperado vs real, 5 estados incluido `AUTOMATICALLY_SKIPPED`,
> overrides por fecha, rachas configurables). Quid debe adoptar ambas ideas con
> **una sola tabla de ocurrencias**; sin ella, todo lo demás (adherencia, reportes, rachas,
> IA de salud) es cosmético.

---

## 10. Qué reutilizamos exactamente (y qué no)

Aclaración importante: **no se copia código** (Kotlin/KMP → TypeScript). Lo que se reutiliza son
**decisiones de diseño verificadas, contratos de datos y catálogos**. Los catálogos/enums sí son
copiables tal cual como datos.

### 10.1 Los 10 mecanismos que sí reutilizamos

| # | Mecanismo | Fuente verificada | Cómo se implementa en Quid |
|---|---|---|---|
| R1 | **Día lógico configurable** (corte 04:00, no medianoche) | MyTherapy `TherapyDayUtils` | `therapyDayStartHour` en ajustes de salud + `src/lib/health/therapy-day.ts` (`therapyDayOf(date, hour)`, `therapyDayStart(day)`). Una sola función usada por gracia, cierre, rachas y "hoy". |
| R2 | **Ocurrencia con hora programada *y* real** | Medisafe `ScheduleItem.originalDateTimeLong/actualDateTimeLong`; MyTherapy `event_log.scheduled_date/actual_date` | `DoseOccurrence.scheduledAt` + `actedAt` (nunca sobrescribir la programada) |
| R3 | **Valor prescrito vs tomado** | MyTherapy `event_log_value.scheduled_value` + `value` | `DoseOccurrence.plannedDose` + `actualDose` → permite "tomó 1 de 2" |
| R4 | **`SKIPPED` ≠ `MISSED`** (decisión vs olvido) | MyTherapy `EventLogStatus`; Medisafe `STATUS_DISMISSED/MISSED` | enum `DoseStatus` con `SKIPPED` y `MISSED` separados ⇒ métricas de omisión vs olvido |
| R5 | **Overrides por fecha aplicados al final** | MyTherapy `scheduler_modification` + `applySchedulerModifications` | `DoseOverride` y el generador aplica overrides **después** de calcular recurrencia; el plan base queda inmutable |
| R6 | **Recurrencia por ciclo + bitmask por bloque** | MyTherapy `GetSchedulerOccurrencesUseCaseImpl`; Medisafe `StrategyParameters`. | Reescribir `src/lib/medication-schedule.ts`: `isDueOn(date)` (ciclo `active+paused`, mensual con `min(día, últimoDía)`) y `timesFor(date)` (bitmask por hora) |
| R7 | **Idempotencia del aviso** | MyTherapy `scheduled_notification PK(date,tag)`; Medisafe `alarmCounter` | `ReminderDispatch.dedupeKey` único (`perfil|fecha|slot|snooze`) antes de enviar |
| R8 | **Recordatorio recurrente + modo crítico** | MyTherapy `recurringReminderEnabled/FrequencyMillis`, `therapyRemindersAsAlarms`; Medisafe `is_critical` + `ReminderNotificationUpdateStatus.OverLimit` | `Medication.isCritical`; re-aviso cada N min mientras siga `PENDING`; canal/alarma distinto y degradación por límite del SO priorizando críticos |
| R9 | **Racha como proyección materializada con regla** | MyTherapy `streak` + `mission.streak_*` + `GetCurrentStreakCountUseCase` | tabla `MedicationStreak(start, end, isActive)`; regla `{windowDays,minGap,maxGap,target}`; "hoy con pendientes ⇒ racha hasta ayer" |
| R10 | **Catálogo genérico de mediciones** | MyTherapy `trackable_object` + `unit` + `scale(min,max,step)`; Medisafe `secondValue` + 25 `MeasurementType` | `HealthMeasurement{type,value,secondValue,unit}`; `scale` para escalas (dolor 0-10, ánimo 1-5) sin tabla por dominio; `secondValue` para presión arterial |

Dos reutilizaciones de menor prioridad pero alto retorno:

- **R11 · DSL de tiempos relativos** (Medisafe `ReminderTimeRefDto`/`TimeHelper`):
  para recordatorios de **citas** ("3 días antes", "lunes previo 09:00") y de recompra.
  Encaja directo con `MedicalAppointment.reminderEnabled`.
- **R12 · Pantalla de diagnóstico OEM** (Medisafe `ReminderProblemActivity`):
  explicar Doze/batería/permiso de alarma. Es lo que evita los "no me llegó el recordatorio".

### 10.2 Lo que NO reutilizamos (anti-patrones verificados)

| Anti-patrón | Dónde se vio | Por qué no |
|---|---|---|
| Dos esquemas de alarma en paralelo | `alarm_tbl` (ORMLite) + `AlarmEntity` (Room) | Deuda que obliga a leer dos fuentes; Quid debe tener **una** |
| Dos enums de modo (dominio y UI) | `SchedulerModeType` vs `SchedulerTimeMode` + `UNKNOWN` | Divergen; Quid: **un** enum y la etiqueta se deriva |
| `frequency` string libre | Quid hoy; MyTherapy lo evita con enum | Migración imposible; usar enum + campos explícitos |
| Tablas espejo `X_tmp` | MyTherapy (~40 pares) | Duplica esquema y migraciones |
| Una tabla por pantalla de setup | `treatment_setup_*` (~40) | Debe ser JSON validado en **una** tabla |
| Snooze en dos unidades (s/min) | Medisafe `snoozeTime`(s) + `snoozeInMinutes`(min) | Bug garantizado; Quid: **minutos** |
| Plan como JSON opaco | `customScheduleJson`, `chp_record.data` | Sin esquema no hay validación ni migración |
| Debug/ads dentro de salud | `DebugMenuActivity` en release; 6 redes de anuncios | Inaceptable en datos clínicos |

### 10.3 Lo que Quid debe construir y **no** está en ninguna

1. **Puente Salud → Finanzas**: `src/lib/health-finance.ts` ya crea el asiento "Salud / Copago";
   las dos apps no tienen esto. extenderlo a medicamentos y órdenes.
2. **Autorizaciones médicas** (`MedicalAuthorization` con `daysOfValidity`/`renewals`): no existe
   en ninguna de las dos; es contexto del sistema de salud colombiano.
3. **Multi-perfil real**: Medisafe usa `chp_profile_id` en todo el esquema; Quid tiene
   `HealthProfile` pero sus tablas cuelgan de `userId`. Añadir `profileId` a `DoseOccurrence`
   **desde el inicio** (cambiarlo después es una migración dolorosa).
4. **Offline/local-first** (plan `docs/INDEXEDDB_LOCAL_FIRST_PLAN.md`): las apps nativas lo tienen
   gratis con SQLite; Quid debe resolver conflicto al sincronizar ocurrencias.
5. **IA de salud sobre datos reales**: `HealthAiReport` hoy es texto sin métricas; con R2–R4
   pasa a poder citar adherencia y tendencia.

### 10.4 Detalle operativo que hay que respetar en Quid

- Quid mantiene **dos esquemas Prisma** (`schema.postgres.prisma` y `schema.sqlite.prisma`):
  todo modelo nuevo va en **ambos** o el modo SQLite se rompe.
- Todo modelo nuevo debe registrarse en las **cinco listas** de `docs/DATA_COVERAGE.md`
  (backup/export, sync/initial, sync/pull, admin/orphans y `src/lib/data-registry.ts`).
- El "take" actual (`api/medications/[id]/take/route.ts`) solo descuenta stock: al pasar a
  ocurrencias debe seguir descontando stock **y** escribir la ocurrencia, en una transacción.
