# MyTherapy 4.12.2 — Ingeniería inversa completa del módulo de Salud

> Documento de referencia para el módulo **Salud** de Quid-App.
> Artefacto analizado: `MyTherapy_eu.smartpatient.mytherapy_4012002_q1lav.apk`
> Fecha de análisis: 2026-10-24

---

## 0. Resumen ejecutivo

MyTherapy no es "una app de recordatorios con extras": es un **motor de tratamientos**
con cuatro capas que Medisafe no tiene igual de desarrolladas:

1. **Planificación por modos + modificaciones por fecha.**
   `scheduler` (recurrencia) + `scheduler_time` (bloques horarios) +
   `scheduler_modification` (**overrides por fecha**: cambiar dosis, cambiar hora,
   borrar ítem, filtrar días) sin tocar la recurrencia original.

2. **Registro de eventos con ciclo de vida completo.**
   `event_log` con `STATUS_OPEN / CONFIRMED / SKIPPED / AUTOMATICALLY_SKIPPED / INTERRUPTED`
   y **doble valor** por evento (`event_log_value.value` real y `scheduled_value` esperado).
   Esto permite adherencia *y* tendencia (¿tomó menos de lo prescrito?).

3. **Gamificación basada en misiones con rachas.**
   `mission` con `target_completed_actions`, `count_repetitions`,
   `streak_in_last_n_days`, `streak_max_gap`, `streak_min_gap` → la racha es una **regla
   configurable por el servidor**, no un contador hardcodeado.

4. **Integraciones reales de dispositivo y salud.**
   Health Connect (12 permisos de lectura), SmartPilot (NFC + Bluetooth con
   `nexus-device-center.cloud`), importación de medicación, farmacia
   (`shop-apotheke.com`), comunidad (`octopuscommunity.com`) y un asistente con IA
   (`assistant_thread/message/tool_call`).

---

## 1. Metodología y límites

Misma metodología que el documento de Medisafe (ver `MEDISAFE_INGENIERIA_INVERSA_SALUD.md §1`),
con una diferencia importante: **el APK de MyTherapy tiene 16 dex y ~190 MB de bytecode**,
y su código KMP está compilado con R8.

Se hizo en dos fases: extracción estructural (DEX/ARSC, sin JVM) y luego **descompilación con
JADX** una vez liberada la memoria del equipo (`tools/DumpClasses.java`, heap acotado).

- **Nombres de clases y paquetes: legibles** (`eu.smartpatient.mytherapy.multiplatform.feature.*`).
- **Nombres de campos en DTOs de red y modelos de dominio: ofuscados** (`a`, `b`, `c`…),
  pero **conservan los tipos** (`LocalDateTime`, `EventLogStatus`, `List<EventLogValue>`).
- **El esquema SQLite es literal y completo** (352 tablas detectadas).
- Los **enums** son evidencia dura (los valores están en el binario).

Marcas usadas en este documento:
**[verificado]** = leído en código descompilado; **[inferencia]** = lectura de diseño.
Los algoritmos marcados como verificados están citados con su clase de origen.

Descompilado y leído para este documento: `GetSchedulerOccurrencesUseCaseImpl`,
`GenerateAutoSkippedEventLogsUseCaseImpl`, `GetCurrentStreakCountUseCase`,
`TherapyDayUtils`, `DailyToDoListSettings`, `ToDoItemsGenerator`,
`CreateSchedulerToDoItemUseCase`, `StreakEntity`.

Totales: **160 289 clases** (32 226 propias de MyTherapy), **869 180 métodos**, 16 dex,
49 activities, 20 services, 19 receivers.

No se ejecutó la app; no hay evidencia de runtime.

### 1.1 Validación cruzada con REA

| Dato | REA (Evidence) | Extracción propia | Coincide |
|---|---|---|---|
| SHA-256 | `e4e54274…7aea702` | idéntico | ✅ |
| package / versión | `eu.smartpatient.mytherapy` 4.12.2 (4012002) | idéntico | ✅ |
| minSdk / targetSdk | 32 / 36 | 32 / 36 | ✅ |
| clases de nivel superior | 74 587 | 74 587 (`classes_total`) | ✅ |
| definiciones de clase en DEX | — | 160 289 (incluye anidadas/sintéticas) | — |
| recursos | 3 262 | 3 262 | ✅ |
| permisos | 49 | 49 | ✅ |

Evidencia: `inspect_android_package` →
`ev_b796f87cd5343580d6d6e3b159d95c07714a29155cb5be956afdf177d1169720`
(vista `ev_08bce69c8ab1ad3a8d58c5181744f657853323e3545175b651985a7cd77560eb`).

Los dos conteos de clases no se contradicen: 160 289 son *class_def* de los 16 dex;
74 587 son clases de nivel superior (lo que reportan JADX/REA).

---

## 2. Identidad y empaquetado

| Campo | Valor |
|---|---|
| Paquete | `eu.smartpatient.mytherapy` |
| Versión | 4.12.2 (versionCode 4012002) |
| minSdk / targetSdk | 32 / 36 |
| Tamaño | 175,8 MB (APK) |
| UI | **Compose Multiplatform** (`assets/composeResources` 18,3 MB, `org.jetbrains.androidx.compose`) |
| Arquitectura | Kotlin Multiplatform, *feature modules* con capas `api / domain / infrastructure / presentation` |
| Red | Ktor (`ktor.io` en el binario) |
| DB | Room (dos generaciones: `androidx.room` y `androidx.room3`) |

El manifiesto declara **49 activities**, la mayoría de terceros (redes de anuncios:
ByteDance/Pangle, MBridge, Unity Ads, Vungle, Audience Network, Google Ads).
Las 9 activities propias son:

```
root.RootActivity
multiplatform.feature.presentation.navigation.GlobalNavigationActivity
multiplatform.feature.dailytodolist.presentation.largealert.LargeAlertActivity
multiplatform.feature.notificationmanagement.NotificationTrampolineActivity
multiplatform.feature.notificationmanagement.NotificationSettingsFromSystemSettingsLinkActivity
multiplatform.feature.deeplinking.shortcut.ShortcutProxyActivity
multiplatform.feature.progress.presentation.healthconnect.HealthConnectConnectionActivity
multiplatform.feature.progress.presentation.healthconnect.HealthConnectPrivacyPolicyActivity
multiplatform.feature.smartpilot.presentation.nfc.SmartPilotNfcActivity
```

**Lección de arquitectura:** la app es *single-activity* (navegación Compose) y las activities
restantes existen solo para casos que el SO exige (large alert sobre pantalla bloqueada,
NFC, Health Connect, trampolín de notificación). Quid (Capacitor/Next) está en el extremo opuesto.

---

## 3. Arquitectura: 47 módulos de feature

Del árbol de paquetes (clases / métodos por módulo):

| Módulo | clases | métodos | Responsabilidad |
|---|---:|---:|---|
| `feature.partnerscheduler` | 2 957 | 17 856 | Tratamientos definidos por *partners* (farmacéuticas), fases, pantallas dinámicas |
| `feature.scheduler` | 2 992 | 15 311 | Alta/edición de planes, recordatorios, plantillas, dosis |
| `feature.team` | 1 956 | 10 712 | "Equipo médico": médicos, especialistas, citas |
| `lib.resource` | 225 | 10 472 | Recursos/strings multi-idioma generados |
| `lib.networking` | 1 199 | 10 172 | Cliente Ktor + DTOs por feature |
| `feature.gamification` | 1 370 | 7 683 | Misiones, logros, badges, puntos |
| `feature.account` | 1 369 | 6 882 | Cuenta, perfiles, sub-perfiles |
| `feature.dailytodolist` | 1 354 | 6 816 | **Lista del día** (el "hoy" del paciente) |
| `feature.integrationmanagement` | 1 072 | 5 961 | Integraciones (Health Connect, dispositivos, partners) |
| `feature.eventselection` | 1 175 | 5 902 | Catálogo de *trackable objects* y eventos |
| `feature.progress` | 1 156 | 5 817 | Historial, gráficas, resúmenes |
| `feature.partner` | 1 065 | 5 021 | Programas de partners |
| `feature.analytics` | 638 | 4 985 | Taxonomía de eventos analíticos |
| `lib.designsystem` | 485 | 4 582 | Componentes Compose |
| `feature.treatmentmanagement` | 689 | 4 491 | Edición de tratamiento, modificaciones |
| `feature.smartpilot` | 817 | 4 104 | Dispositivo conectado (NFC/BLE) |
| `feature.redpoints` | 747 | 3 710 | Economía de puntos |
| `feature.notificationmanagement` | 740 | 3 624 | Notificaciones, canales, trampolines |
| `feature.coreprogramconfiguration` | 771 | 3 508 | Configuración remota del programa |
| `feature.content` | 612 | 3 395 | Artículos/contenido educativo |
| `feature.appmonetization` | 684 | 3 194 | Paywall, suscripción, anuncios |
| `feature.resolve` | 573 | 2 989 | Resolución de módulos/feature flags |
| `lib.partnerconfigurationcontract` | 180 | 2 692 | Contrato con partners |
| `feature.legalconsentsanddocuments` | 461 | 2 402 | Consentimientos y documentos legales |
| `feature.pushcampaign` | 544 | 2 262 | Campañas push (marketing) |
| `feature.druginteraction` | 313 | 1 664 | Interacciones medicamentosas |
| `feature.assistant` | 331 | 1 583 | **Asistente IA** con hilos y tool calls |
| `feature.inventory` | 345 | 1 560 | Inventario de medicación |
| `feature.systemversionmanagement` | 473 | 1 543 | Migraciones/versiones |
| `feature.medicationimport` | 281 | 1 534 | Importar plan (escaneo/PDF) |
| `feature.orderingfromshop` | 322 | 1 493 | Pedidos a farmacia |
| `feature.treatmentoverview` | 284 | 1 491 | Resumen del tratamiento |
| `feature.symptoms` | 267 | 1 412 | **Síntomas** y efectos secundarios |
| `feature.synchronizationmanagement` | 345 | 1 374 | Sync con backend |
| `feature.localizationservice` | 271 | 1 096 | i18n dinámica desde servidor |
| `feature.onboarding` | 183 | 1 007 | Onboarding |
| `feature.userfeedback` | 194 | 831 | Feedback |
| `feature.healthreport` | 142 | 746 | **Informe de salud (PDF)** |
| `lib.core`, `lib.navigation`, `lib.model` | 146 | 734 | base |
| `feature.community` | 158 | 656 | Comunidad (Octopus) |
| `feature.injectionsitetracking` | 108 | 593 | **Sitios de inyección** (rotación) |
| `feature.permission` | 128 | 584 | Permisos |
| `feature.home` | 114 | 573 | Home |

Nota: `feature.partnerscheduler` (17 856 métodos) es **el módulo más grande de la app**.
El negocio real es B2B2C: la farmacéutica define el tratamiento y la app lo ejecuta.

---

## 4. Modelo de datos (esquema SQLite literal)

### 4.1 Núcleo de planificación

```sql
CREATE TABLE scheduler (
  id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL, sync_status INTEGER NOT NULL,
  parent_server_id TEXT, root_server_id TEXT,              -- jerarquía de planes
  start_date TEXT, original_start_date TEXT, end_date TEXT,
  is_relative INTEGER NOT NULL,                            -- fechas relativas al inicio
  mode INTEGER NOT NULL,                                   -- SchedulerModeType
  days_active INTEGER NOT NULL, days_paused INTEGER NOT NULL, day_in_cycle INTEGER NOT NULL,
  status TEXT NOT NULL,                                    -- SchedulerStatus
  is_active INTEGER NOT NULL, is_editable INTEGER NOT NULL,
  intake_advice_type INTEGER NOT NULL, intake_message TEXT, -- IntakeAdviceType
  interaction_date TEXT, from_barcode INTEGER NOT NULL,
  is_critical INTEGER NOT NULL,                             -- recordatorio "crítico" (importante)
  trackable_object_id INTEGER NOT NULL,                     -- QUÉ se toma (FK)
  product INTEGER NOT NULL, device_creation_date TEXT, sub_profile_id TEXT);

CREATE TABLE scheduler_time (            -- bloques horarios del plan
  id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL, scheduler_id INTEGER NOT NULL,
  block_order INTEGER NOT NULL, planned_time INTEGER NOT NULL,   -- minutos desde 00:00
  dose REAL, active_on_days INTEGER NOT NULL);                   -- bitmask de días

CREATE TABLE scheduler_modification (    -- OVERRIDES por fecha
  id TEXT PRIMARY KEY, root_scheduler_server_id TEXT NOT NULL, scheduled_date TEXT,
  type TEXT NOT NULL,                    -- MODIFY_DOSE | MODIFY_TIME | DELETE_ITEM | FILTER_DAYS
  data_json TEXT NOT NULL, product INTEGER NOT NULL,
  creation_date TEXT NOT NULL, sync_status INTEGER NOT NULL);

CREATE TABLE scheduler_additional_data (
  scheduler_server_id TEXT PRIMARY KEY, prescriber_team_profile_server_id TEXT,
  sync_status INTEGER NOT NULL, icon_key TEXT, icon_primary_color TEXT, icon_secondary_color TEXT);

CREATE TABLE scheduler_template (        -- plantillas de frecuencia (servidor)
  product INTEGER NOT NULL, id INTEGER NOT NULL, mode INTEGER NOT NULL,
  days_active INTEGER NOT NULL, days_paused INTEGER NOT NULL,
  min_intakes INTEGER NOT NULL DEFAULT 1, max_intakes INTEGER NOT NULL DEFAULT 1,
  default_intakes INTEGER NOT NULL DEFAULT 1, count INTEGER, PRIMARY KEY(product, id));

CREATE TABLE scheduler_setup_dosage (    -- dosis por producto
  id INTEGER NOT NULL, product INTEGER NOT NULL, intake_amount REAL NOT NULL,
  trackable_object_server_id TEXT NOT NULL, name TEXT NOT NULL,
  default_inventory_value REAL, default_inventory_threshold REAL, order INTEGER NOT NULL,
  PRIMARY KEY(id, product));
```

**Los cuatro modos verificados** (`SchedulerModeType`):
`EVERY_X_DAYS`, `EVERY_X_HOURS`, `MONTHLY`, `SELECTED_WEEKDAYS`, `PERIODIC`, `AS_NEEDED`.

**Los diez modos de UI** (`SchedulerTimeMode`):
`DAILY`, `X_TIMES_DAILY`, `EVERY_X_DAYS`, `EVERY_X_WEEKS`, `EVERY_X_HOURS`, `MONTHLY`,
`SPECIFIC_DAYS`, `PERIODIC`, `AS_NEEDED`, `UNKNOWN`.

> Existen **dos enums de modo** (dominio y UI) y un `IntervalType`/`EndDateType` adicionales.
> Es deuda técnica: el dominio y la presentación divergen. Quid debe tener **un** enum
> canónico y derivar la etiqueta de UI.

### 4.1.1 El algoritmo de ocurrencias — **[verificado en `GetSchedulerOccurrencesUseCaseImpl`]**

```
isOccurrenceDay(scheduler, date):
    require scheduler.active && scheduler.isPlanned
         && scheduler.status == DEFAULT
         && startDate != null && originalStartDate != null
    require date dentro de [startDate, endDate]

    dayIndex = DaysOfWeek.dayIndex(date.dayOfWeek)

    for time in scheduler.schedulerTimeList:
        if !DaysOfWeek.isDaySet(time.activeOnDays, dayIndex): continue

        switch mode:
          EVERY_X_DAYS :
              daysSince(originalStartDate, date) % (daysActive + daysPaused) == 0
          PERIODIC :
              daysSince(originalStartDate, date) % (daysActive + daysPaused) < daysActive
          SELECTED_WEEKDAYS, EVERY_X_HOURS :
              true
          MONTHLY :
              day == min(originalStartDate.day, lastDayOfMonth(date))
              && monthsUntil(originalStartDate, date) % (daysPaused + 1) == 0
          AS_NEEDED :
              false            // no genera ocurrencias; se registra a demanda

        → materializar ocurrencia

    // el desplazamiento de día se aplica DESPUÉS de elegir horas
    for time in selectedTimes:
        msOfDay = getTimeOfDayInDeadlineRange(time.plannedTime)   // < 04:00 → día siguiente
        dayShift = wholeDays(msOfDay)
        occurrence = atTime( date + dayShift,
                             msOfDay - dayShift * 24h )

    occurrences = applySchedulerModifications(occurrences)   // overrides por fecha
```

Cuatro decisiones que vale la pena copiar tal cual:

1. **`daysActive + daysPaused` es la longitud del ciclo**, y los dos modos son "solo el primer
   día del ciclo" (`EVERY_X_DAYS`) o "los primeros `daysActive` días" (`PERIODIC`). Con eso se
   modelan pautas 5-días-on/2-off, 21/7, etc. sin campos nuevos.
2. **`MONTHLY` usa `min(startDay, lastDayOfMonth)`** → el día 31 cae al último día de febrero
   en vez de desaparecer. Es el bug clásico de los recordatorios mensuales.
3. **`activeOnDays` es un bitmask por bloque horario** (`scheduler_time`), no por plan:
   un mismo tratamiento puede tener "08:00 los lun/mié/vie" y "20:00 todos los días".
4. **Los overrides se aplican al final**, nunca durante la generación. Así el patrón base
   queda inmutable y auditable.

### 4.2 Registro de tomas (`event_log`)

```sql
CREATE TABLE event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL, sync_status INTEGER NOT NULL,
  scheduler_id INTEGER,                        -- plan que la generó (NULL si espontánea)
  trackable_object_id INTEGER NOT NULL,        -- qué se tomó
  actual_date TEXT NOT NULL,                   -- cuándo ocurrió REALMENTE
  scheduled_date TEXT,                         -- cuándo estaba PLANIFICADO
  interaction_date TEXT, device_creation_date TEXT,
  is_active INTEGER NOT NULL, status INTEGER NOT NULL,   -- EventLogStatus
  timezone REAL NOT NULL,                      -- offset de zona horaria del registro
  external_source INTEGER,                     -- Health Connect, dispositivo, importación
  is_editable INTEGER NOT NULL, product INTEGER NOT NULL,
  sub_profile_id TEXT, external_id TEXT);      -- idempotencia con el origen externo

CREATE TABLE event_log_value (                 -- valores del evento (1..N)
  id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL, event_log_id INTEGER NOT NULL,
  value REAL,            -- valor real
  scheduled_value REAL,  -- valor prescrito  ← permite "tomó 1 de 2"
  trackable_object_id INTEGER NOT NULL, is_active INTEGER NOT NULL);

CREATE TABLE event_log_note (event_log_id INTEGER PRIMARY KEY, note TEXT NOT NULL);

CREATE TABLE snooze_info (toDoItemId INTEGER PRIMARY KEY, snoozedAt TEXT NOT NULL);

CREATE TABLE to_do_item (                      -- tareas no-fármaco del día
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, url TEXT NOT NULL,
  type TEXT NOT NULL, icon TEXT NOT NULL DEFAULT 'QUESTIONNAIRE',
  creation_date TEXT NOT NULL, resolved_date TEXT);
```

**Estados verificados** (`EventLogStatus`):
`STATUS_OPEN`, `STATUS_CONFIRMED`, `STATUS_SKIPPED`, `STATUS_AUTOMATICALLY_SKIPPED`,
`STATUS_INTERRUPTED`.

La distinción `SKIPPED` (el usuario dijo "no") vs `AUTOMATICALLY_SKIPPED` (nadie hizo nada
y venció la ventana) es **la clave de una adherencia honesta**. Casi todas las apps las confunden.
Añadir `INTERRUPTED` (se interrumpió el recordatorio) permite separar "fallo del sistema" de
"fallo del paciente".

### 4.2.1 El "therapy day" de 04:00 — **[verificado en `TherapyDayUtils`]**

```java
public static final long DEADLINE_MILLIS_OF_DAY  = 4 horas;      // 04:00
public static final long DEFAULT_INTAKE_TIME_OF_DAY = 8 horas;  // 08:00
public static final LocalTime DEFAULT_INTAKE_TIME = 08:00;

public LocalDate toTherapyDay(LocalDateTime dt) {
    return (dt - 4h).getDate();          // 01:30 del día 12 → día 11
}
public LocalDateTime therapyDayStart(LocalDate d) {
    return d.atTime(04:00);
}
```

**El día terapéutico va de 04:00 a 03:59.** Una toma a la 01:00 pertenece al día anterior.
Esto resuelve el caso real de quien toma la medicación de noche/madrugada y no debe ver
"doble dosis" ni perder la racha. Es una de las mejores decisiones del producto.

### 4.2.2 Cierre automático por vencimiento — **[verificado en `GenerateAutoSkippedEventLogsUseCaseImpl`]**

```java
lock(mutex);
today     = dateTimeProvider.getCurrentTherapyDay();
yesterday = today.minus(1 día);
lastGen   = settings.getToDoItemsGenerationDate().get();   // LocalDateTime?

if (lastGen?.date == yesterday) return;                    // ya generado: idempotente

from = (lastGen?.date != null && lastGen.date <= yesterday)
         ? lastGen.date.plus(1 día)
         : yesterday;

for (date = from; date < today; date = date.plus(1 día)) {
    for (item in schedulerToDoItemRepository.loadAll(date)) {
        therapyDay ??= TherapyDayUtils.toTherapyDay(item.scheduledDate);
        eventLogTracker.moveToEventLogAsPlannedOrThrow(
            item, EventLogStatus.STATUS_AUTOMATICALLY_SKIPPED);
    }
}
if (therapyDay != null) onNotClearedTodayOnDeadline.invoke(therapyDay);
```

Lectura precisa:

- Se cierra **solo lo anterior a hoy** (`date < today`), nunca el día en curso.
- Se cubren también los **huecos** (si la app estuvo días cerrada, se rellena desde
  `lastGenerationDate + 1`).
- Es **idempotente por día** (si ya se generó para ayer, no hace nada).
- El umbral no es "24 h después" sino **el inicio del siguiente therapy day (04:00)**.
- Al final dispara `OnNotClearedTodayOnDeadline` (notificación de "no completaste ayer").

> Para Quid: la ventana de gracia no debe ser un `+N horas` arbitrario, sino
> **el corte del día lógico** (que además es configurable por usuario). Un solo concepto
> (`therapyDayStartHour`) resuelve gracia, cierre, rachas y "hoy".

### 4.3 Catálogo de "qué se puede medir"

```sql
CREATE TABLE trackable_object (
  id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL, sync_status INTEGER NOT NULL,
  event_id INTEGER NOT NULL, unit_id INTEGER, scale_id INTEGER,
  is_active INTEGER NOT NULL, trackable INTEGER NOT NULL,
  user_defined INTEGER NOT NULL, product INTEGER NOT NULL);

CREATE TABLE trackable_object_configuration (
  product INTEGER NOT NULL, trackable_object_server_id TEXT NOT NULL,
  is_active INTEGER NOT NULL, content_ids TEXT, PRIMARY KEY(product, trackable_object_server_id));

CREATE TABLE trackable_object_to_group (
  trackable_group_id INTEGER NOT NULL, trackable_object_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL, PRIMARY KEY(trackable_group_id, trackable_object_id));

CREATE TABLE unit (id INTEGER PRIMARY KEY, name TEXT, is_active INTEGER NOT NULL,
  allowed_type INTEGER NOT NULL, scale_id INTEGER NOT NULL, icon TEXT,
  site_tracking_enabled INTEGER NOT NULL);         -- ← inyecciones

CREATE TABLE scale (id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT NOT NULL,
  max_value REAL, min_value REAL, default_value REAL, step REAL);

CREATE TABLE user_goal (id TEXT PRIMARY KEY, sync_status INTEGER NOT NULL,
  trackable_object_server_id TEXT NOT NULL, value REAL NOT NULL,
  is_active INTEGER NOT NULL, device_last_modified_date TEXT NOT NULL, sub_profile_id TEXT);

CREATE TABLE low_inventory_reminder (
  trackable_object_id INTEGER PRIMARY KEY, start_date TEXT NOT NULL, end_date TEXT NOT NULL);
```

`scale` (min/max/step) es lo que permite que "dolor 0-10", "ánimo 1-5" y "peso 40-200 kg"
convivan en **una sola tabla**. Es más simple que tener un enum por dominio.

`unit.site_tracking_enabled` + `InjectionData` + `feature.injectionsitetracking` →
rotación de sitios de inyección (subcutánea), un caso de salud real que Quid no cubre hoy.

### 4.4 Tratamientos por fases (partner/pharma)

```sql
CREATE TABLE phase (product INTEGER NOT NULL, phase TEXT NOT NULL, next_phase TEXT,
  PRIMARY KEY(product, phase));

CREATE TABLE phase_scheduler (product INTEGER NOT NULL, phase TEXT NOT NULL,
  dosage_id INTEGER NOT NULL, scheduler_template_id INTEGER NOT NULL,
  is_dosage_main INTEGER NOT NULL, is_frequency_main INTEGER NOT NULL,
  order INTEGER NOT NULL, PRIMARY KEY(product, phase, order));
```

Un tratamiento puede cambiar de dosis/frecuencia **por fase** con `next_phase` formando una
cadena. Esto es lo que Medisafe llama titulación (`changingDose*`), pero modelado como
una máquina de estados explícita y editable.

### 4.5 Gamificación (misiones y rachas)

```sql
CREATE TABLE IF NOT EXISTS `mission` (`id` TEXT NOT NULL,
  `target_completed_actions` INTEGER NOT NULL,   -- cuántas acciones para cumplir
  `count_repetitions` INTEGER NOT NULL,          -- cuántas veces se repite
  `streak_in_last_n_days` INTEGER,               -- ventana de la racha
  `streak_max_gap` INTEGER, `streak_min_gap` INTEGER,   -- tolerancia entre acciones
  PRIMARY KEY(`id`));

CREATE TABLE IF NOT EXISTS `mission_actions` (`mission_id` TEXT NOT NULL,
  `action_id` TEXT NOT NULL, PRIMARY KEY(`mission_id`, `action_id`));

CREATE TABLE IF NOT EXISTS `streak` (`id` TEXT NOT NULL, `start_date` TEXT NOT NULL,
  `end_date` TEXT, `is_active` INTEGER NOT NULL, `sync_status` INTEGER NOT NULL,
  PRIMARY KEY(`id`));

CREATE TABLE IF NOT EXISTS `achievements` (`id` TEXT NOT NULL, `type` TEXT NOT NULL,
  `points` INTEGER NOT NULL, `frequency_type` TEXT, `frequency_limit` INTEGER,
  `total_limit` INTEGER, `active_period_start` TEXT NOT NULL, `active_period_end` TEXT NOT NULL,
  `sorting_index` INTEGER NOT NULL, PRIMARY KEY(`id`));

CREATE TABLE IF NOT EXISTS `user_goal` (`id` TEXT NOT NULL, `sync_status` INTEGER NOT NULL,
  `trackable_object_server_id` TEXT NOT NULL, `value` REAL NOT NULL,
  `is_active` INTEGER NOT NULL, `device_last_modified_date` TEXT NOT NULL,
  `sub_profile_id` TEXT, PRIMARY KEY(`id`));
```

`Mission.Streak` en código = `(int, int, int)` → **tres enteros**, coherentes con
`streak_in_last_n_days`, `streak_max_gap`, `streak_min_gap`.

**La racha es configurable:** ventana (`last_n_days`) y tolerancia (`min_gap`/`max_gap`).
No es un simple `streak++`.

### 4.5.1 Cálculo de la racha actual — **[verificado en `GetCurrentStreakCountUseCase`]**

```java
if (!isStreakEnabled.invoke())      return 0;   // feature flag por producto/región
streak = streakRepository.getLastStreak();
if (streak == null)                 return 0;
if (streak.getEnd() != null)        return 0;   // la última racha ya se cerró

today          = TherapyDayUtils.toTherapyDay(dateTimeProvider.getCurrentDateTime());
todayOpenTasks = isAnyTodayOpenTask.invoke();   // ¿queda algo por confirmar hoy?

return daysUntil(streak.getStart(), ongoingStreakEnd(today, todayOpenTasks)) + 1;

// ongoingStreakEnd: una racha viva no se rompe a media tarde
LocalDate ongoingStreakEnd(LocalDate today, boolean todayOpenTasks) {
    return todayOpenTasks ? today.minus(1 día) : today;
}
```

Dos matices que se suelen implementar mal:

1. **`streak.end != null` ⇒ racha actual = 0.** Una racha cerrada no cuenta como actual
   aunque su última fecha sea ayer; hay una operación explícita para "resucitarla"
   (`ResurrectStreakUseCase`).
2. **Mientras hoy tenga tareas abiertas, la racha se mide hasta ayer.** El usuario no ve
   "racha rota" a las 10:00 por no haber tomado aún la dosis de la noche.

La racha se apoya en `streak(start_date, end_date)` y no en recalcular todo el historial:
es una **proyección materializada**, con `CreateStreakUseCase` / `EndLastStreakUseCase`
como únicos escritores. Ese es el patrón eficiente para Quid.

### 4.6 Equipo médico y citas

```sql
CREATE TABLE team_profile (id TEXT PRIMARY KEY, name TEXT NOT NULL, speciality TEXT,
  street TEXT, zip_code TEXT, city TEXT, phone TEXT, email TEXT, is_active INTEGER NOT NULL,
  product INTEGER NOT NULL, icon TEXT NOT NULL, note TEXT, icon_url TEXT, wallpaper_url TEXT,
  website_url TEXT, is_editable INTEGER NOT NULL, is_deletable INTEGER NOT NULL,
  is_adding_appointments_enabled INTEGER NOT NULL, source TEXT, source_id TEXT,
  sync_status INTEGER NOT NULL);

CREATE TABLE team_profile_appointment (row_id INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL, team_profile_id TEXT NOT NULL, date TEXT NOT NULL, note TEXT,
  is_active INTEGER NOT NULL, reminder_1 TEXT, reminder_2 TEXT,   -- DOS recordatorios
  show_reminders_after TEXT, is_editable INTEGER NOT NULL, is_deletable INTEGER NOT NULL,
  sync_status INTEGER NOT NULL, appointment_status TEXT NOT NULL DEFAULT 'unspecified');

CREATE TABLE team_profile_appointment_follow_up (teamProfileId TEXT NOT NULL,
  appointmentId TEXT NOT NULL, dismissed INTEGER NOT NULL, PRIMARY KEY(teamProfileId));

CREATE TABLE specialist (id TEXT PRIMARY KEY, product INTEGER NOT NULL, name TEXT NOT NULL,
  speciality TEXT, type TEXT NOT NULL, icon_url TEXT, wallpaper_url TEXT, street TEXT,
  zip_code TEXT, city TEXT, phone TEXT, email TEXT, is_active INTEGER NOT NULL,
  website_url TEXT, template_id TEXT NOT NULL);

CREATE TABLE appointment_question (appointment_id TEXT NOT NULL, id TEXT NOT NULL,
  is_selected INTEGER NOT NULL, PRIMARY KEY(appointment_id, id));
```

Dos recordatorios por cita (`reminder_1`, `reminder_2`) + `show_reminders_after`
+ `appointment_question` (preguntas para preparar la consulta) es un patrón muy reutilizable
para el módulo de citas que Quid ya tiene (`MedicalAppointment`).

### 4.7 Inventario, pedidos y farmacia

```sql
CREATE TABLE ordered_medication (id INTEGER PRIMARY KEY AUTOINCREMENT, server_id TEXT,
  order_id TEXT NOT NULL, country INTEGER, name TEXT NOT NULL, number TEXT,
  unit INTEGER NOT NULL, schedule_type INTEGER NOT NULL, inventory_id INTEGER,
  scheduler_id INTEGER, trackable_object_server_id TEXT, trackable_object_local_id INTEGER,
  is_rx INTEGER NOT NULL DEFAULT 0);      -- receta

CREATE TABLE pharmacy (id TEXT PRIMARY KEY, name TEXT NOT NULL, street TEXT, zip_code TEXT,
  city TEXT, phone TEXT, email TEXT, is_active INTEGER NOT NULL, website_url TEXT,
  sync_status INTEGER NOT NULL);
```

### 4.8 Interacciones, síntomas y contenido

```sql
CREATE TABLE drug_interaction (id INTEGER PRIMARY KEY AUTOINCREMENT,
  interactionId INTEGER NOT NULL, clinicalRelevance TEXT NOT NULL,
  leftProductName TEXT NOT NULL, rightProductName TEXT NOT NULL,
  wasDisplayed INTEGER NOT NULL DEFAULT 0,      -- ← ya se avisó
  description TEXT NOT NULL DEFAULT '', riskFactors TEXT NOT NULL DEFAULT '',
  measures TEXT NOT NULL DEFAULT '', subProfileId TEXT);
```

`clinicalRelevance`, `riskFactors`, `measures` = severidad + factores de riesgo + qué hacer.
`wasDisplayed` evita repetir el mismo aviso (patrón que Medisafe resuelve con `chp_record`).

### 4.9 Otros subsistemas con tabla propia

| Subsistema | Tablas |
|---|---|
| Perfil | `user_profile`, `user_sub_profile`, `current_user_profiles` |
| Tratamiento | `user_treatment`, `user_treatment_tmp` |
| Contenido | `content`, `content_topic`, `content_group`, `content_home_page_item`, `content_bookmark` |
| Comunidad | `posts`, `comments`, `replies`, `public_profiles`, `community_configs` |
| Asistente IA | `assistant_thread`, `assistant_message`, `assistant_message_tool_call` |
| SmartPilot | `smart_pilot_configuration`, `nfc_tag_support` |
| Integraciones | `integration`, `program_integration`, `publicly_available_integrations`, `partner_integration_gate` |
| Legal | `legal_consent`, `legal_consent_data` |
| Notificaciones | `notifications`, `scheduled_notification`, `confirm_todo_item_action`, `action` |
| Config | `setting` (`scope`,`module`,`id`,`value`), `region`, `country`, `localization` |
| Onboarding dinámico | `treatment_setup_*` (~40 tablas generadas desde el servidor) |

`setting(scope, module, id, value)` es un KV jerárquico: **un solo punto** para configuración
remota por feature sin migraciones.

---

## 5. Motor de notificaciones y lista del día

### 5.1 Componentes nativos

| Componente | Rol |
|---|---|
| `notificationmanagement.NotificationTrampolineActivity` | abre la pantalla correcta desde la notificación |
| `notificationmanagement.NotificationBroadcastReceiver` | acciones desde la notificación (tomar, posponer) |
| `notificationmanagement.ScheduledNotificationBroadcastReceiver` | dispara notificaciones programadas |
| `dailytodolist.presentation.largealert.LargeAlertActivity` | **alerta a pantalla completa** (`USE_FULL_SCREEN_INTENT`) |
| `synchronizationmanagement.TimeCriticalWorkAlarmReceiver` | trabajo time-critical (WorkManager) |
| `umbrella.SystemEventsReceiver` | boot, cambio de hora, cambio de zona |
| `dailytodolist.domain.TodaySettings` | configuración del "hoy" (6 campos) |

Tablas de apoyo:

```sql
CREATE TABLE scheduled_notification (date TEXT NOT NULL, tag TEXT NOT NULL,
  notifications TEXT NOT NULL, PRIMARY KEY(date, tag));   -- idempotencia por día+tag
CREATE TABLE notifications (id TEXT PRIMARY KEY, updatedAt INTEGER NOT NULL,
  authors TEXT NOT NULL, text TEXT NOT NULL, isRead INTEGER NOT NULL,
  action_itemType TEXT, action_itemId TEXT, action_parentId TEXT);  -- bandeja in-app
```

`scheduled_notification` con PK `(date, tag)` es la forma barata de no duplicar avisos
si el BOOT_RECEIVED corre dos veces. **Copiar tal cual.**

### 5.2 "Crítico" vs "normal"

`scheduler.is_critical` + `feature.scheduler.presentation.CriticalReminderConfig` +
`CreateCriticalNotificationChannelsUseCase` + `USE_FULL_SCREEN_INTENT`:
los planes críticos usan canal de notificación propio, alerta a pantalla completa
y permiso de política de notificaciones (`ACCESS_NOTIFICATION_POLICY`).

Esto es un requisito regulatorio real en tratamientos (p. ej. antirretrovirales,
inmunosupresores): **el recordatorio no puede perderse silenciosamente**.

### 5.3 La lista del día

`feature.dailytodolist` mezcla en una sola lista:
- `to_do_item` (cuestionarios/tareas),
- ocurrencias de `scheduler` del día,
- `team_profile_appointment` (citas),
- `event_log` con `STATUS_OPEN` (pendientes de confirmar).

Con `snooze_info` por `toDoItemId` (un snooze por ítem del día, no por notificación).

### 5.4 Ajustes verificados del motor (`DailyToDoListSettings`) — **[verificado]**

```java
Setting<LocalDateTime> toDoItemsGenerationDate;      // marca de idempotencia del cierre diario
Setting<Boolean>       recurringReminderEnabled;     // re-avisar mientras siga pendiente
Setting<Long>          recurringReminderFrequencyMillis;  // cada cuánto re-avisar
Setting<Boolean>       therapyRemindersAsAlarms;     // usar ALARMA (no notificación)
Setting<Integer>       alertStyle;                   // estilo de la alerta
```

Esto introduce dos conceptos que Quid no tiene:

1. **Recordatorio recurrente** (`recurringReminderEnabled` + `frequencyMillis`): mientras la
   toma siga `OPEN`, se re-notifica cada N ms. Es distinto del snooze: el snooze es una acción
   del usuario; esto es insistencia del sistema hasta que el estado cambie.
2. **`therapyRemindersAsAlarms`**: el recordatorio puede ser una **alarma de reloj**
   (`AlarmManager`, `USE_EXACT_ALARM`) o una notificación. En Android moderno esto es la
   diferencia entre llegar y no llegar con la pantalla bloqueada.

---

## 6. Adherencia y progreso

### 6.1 Del evento a la métrica

```
scheduler + scheduler_time + scheduler_modification
        ↓ (generación de ocurrencias del día)
event_log(status=OPEN, scheduled_date, scheduled_value)
        ↓ (acción del usuario o vencimiento)
event_log(status=CONFIRMED|SKIPPED|AUTOMATICALLY_SKIPPED|INTERRUPTED, actual_date, value)
```

Métricas posibles sin cálculo adicional:

| Métrica | Fórmula sobre `event_log` |
|---|---|
| Adherencia simple | `count(status=CONFIRMED) / count(status in (CONFIRMED, SKIPPED, AUTOMATICALLY_SKIPPED))` |
| Adherencia "estricta" | numerador solo si `value >= scheduled_value` |
| Tasa de omisión activa | `SKIPPED / total` (decisión del paciente) |
| Tasa de olvido | `AUTOMATICALLY_SKIPPED / total` (fallo de ejecución) |
| Retraso medio | `avg(actual_date - scheduled_date)` |
| Fricción | nº de `snooze_info` / ocurrencia |
| Cobertura de datos | eventos `external_source IS NOT NULL` vs manuales |

Separar *omisión* de *olvido* es lo que permite intervenir distinto (educación vs
mejora técnica de recordatorios). Es la mejor idea del modelo de MyTherapy.

### 6.2 Informe de salud

`feature.healthreport` (142 clases) + `com.rajat.pdfviewer.PdfViewerActivity`:
el informe se genera como **PDF** y se visualiza con un visor PDF nativo.
No hay generación en servidor: el PDF se arma en el cliente **[inferencia]**.

---

## 7. Integraciones (lo que diferencia a MyTherapy)

### 7.1 Health Connect

Permisos declarados (12): `READ_BLOOD_GLUCOSE`, `READ_BLOOD_PRESSURE`, `READ_EXERCISE`,
`READ_HEALTH_DATA_IN_BACKGROUND`, `READ_HYDRATION`, `READ_MINDFULNESS`,
`READ_OXYGEN_SATURATION`, `READ_RESTING_HEART_RATE`, `READ_SLEEP`, `READ_STEPS`,
`READ_VO2_MAX`, `READ_WEIGHT`.

Componentes: `HealthConnectConnectionActivity`, `HealthConnectPrivacyPolicyActivity`,
`androidx.health.platform.client.impl.sdkservice.HealthDataSdkService`,
`feature.integrationmanagement`.

**Solo lectura.** MyTherapy **no escribe** en Health Connect (no hay `WRITE_*`).
Eso evita el ciclo de revisión de Google Play para apps que escriben datos de salud.

### 7.2 SmartPilot (dispositivo conectado)

`feature.smartpilot` (4 104 métodos), `SmartPilotNfcActivity`,
`SmartPilotConnectionService`, `nfc_tag_support`, `smart_pilot_configuration`,
permisos `NFC`, `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `FOREGROUND_SERVICE_CONNECTED_DEVICE`.
Hosts: `gateway.nexus-device-center.cloud`, `gateway.int.nexus-device-center.cloud`.

**[inferencia]** SmartPilot es un *hub* de dispositivos (inyectores/plumas conectadas):
el teléfono se acerca por NFC al dispositivo y se conecta por BLE para leer dosis administradas,
que entran como `event_log` con `external_source`.

### 7.3 Otros

| Integración | Evidencia |
|---|---|
| Farmacia / pedidos | `orderingfromshop`, `www.shop-apotheke.com`, `shop-apotheke-com.onelink.me` |
| Comunidad | `octopuscommunity.com`, `feature.community`, `posts/comments/replies` |
| Asistente IA | `feature.assistant`, `assistant_*` (hilo + mensajes + `tool_call` con `arguments` JSON) |
| Importación de medicación | `feature.medicationimport`, `ScheduleType`, `MedicationPlanType`, escaneo |
| Analítica | `clevertap`, `appsflyer`, `feature.analytics` (taxonomía tipada por feature) |
| Push | `FcmListenerService`, `pushcampaign`, `clevertap` |

El asistente guarda `assistant_message_tool_call(name, arguments)` → **el LLM ejecuta
herramientas** y el historial queda local. Es el mismo patrón que Quid ya usa con Aura.

---

## 8. Red y backend

| Host | Uso |
|---|---|
| `production.smartpatient.eu` | API de producción |
| `sae-api.smartpatient.eu` | API secundaria/servicio |
| `functions.smartpatient.eu` | funciones serverless |
| `static.smartpatient.eu` | assets estáticos |
| `activate.mytherapyapp.com` | activación de cuenta/dispositivo |
| `licenses.mytherapyapp.com` | licencias (partner SDK) |
| `legal.mytherapyapp.com` | legal/consentimientos |
| `octopuscommunity.com` | comunidad |
| `gateway(.*).nexus-device-center.cloud` | SmartPilot |

Auth: Google Sign-In + Play Core; sin Cognito. Red: **Ktor** cliente multiplataforma.

---

## 9. Permisos y privacidad

49 permisos. Diferenciales frente a Medisafe:

| Permiso | Por qué |
|---|---|
| `android.permission.health.READ_*` (12) | Health Connect (solo lectura) |
| `NFC`, `BLUETOOTH_SCAN/CONNECT`, `FOREGROUND_SERVICE_CONNECTED_DEVICE` | SmartPilot |
| `USE_FULL_SCREEN_INTENT` | alerta crítica a pantalla completa |
| `ACCESS_NOTIFICATION_POLICY` | canal crítico / DND |
| `DETECT_SCREEN_CAPTURE` | ocultar datos sensibles en capturas |
| `DISABLE_KEYGUARD` | mostrar alerta sobre pantalla bloqueada |
| `com.amazon.privacypass.ATTEST` | atestación (anti-fraude publicitario) |
| `com.android.vending.CHECK_LICENSE` | verificación de licencia |

**No** pide ubicación en background, ni calendario, ni contactos.
Es una app de salud con **huella de permisos más contenida** que Medisafe pese a tener más features.

---

## 10. Lecciones para Quid

### Copiar

1. **`event_log` con `scheduled_value` + `value`** y cinco estados (incluye
   `AUTOMATICALLY_SKIPPED` e `INTERRUPTED`).
2. **`scheduler_modification`** como capa de overrides por fecha en lugar de mutar la recurrencia.
3. **`scale(min,max,step)` + `unit` + `trackable_object`** para un catálogo único de mediciones.
4. **`mission` con racha configurable** (`last_n_days`, `min_gap`, `max_gap`).
5. **`scheduled_notification PK(date, tag)`** para idempotencia.
6. **`is_critical` + canal propio + full-screen intent** para tratamientos que no pueden fallar.
7. **`phase`/`next_phase`** para tratamientos por fases (titulación) en lugar de campos sueltos.
8. **Health Connect solo-lectura** para enriquecer sin entrar al proceso de revisión de escritura.

### Evitar

1. **Dos enums de modo** (`SchedulerModeType` vs `SchedulerTimeMode`) y `UNKNOWN` como valor.
2. **40 tablas `treatment_setup_*`** generadas desde el servidor: migraciones imposibles.
   Quid debería modelar pantallas dinámicas como JSON validado (una tabla), no como tablas.
3. **Tablas `_tmp` duplicadas** para cada entidad (patrón `X` y `X_tmp`): duplica el esquema.
4. **Campos ofuscados en DTOs** (`a`, `b`, `c`) que impiden mantener el contrato.
5. Publicidad agresiva dentro de una app de salud (6 redes de anuncios en el manifiesto).

---

## 11. Apéndice

Clases y tablas de referencia:

| Tema | Referencia |
|---|---|
| Plan | tabla `scheduler`, enum `SchedulerModeType` |
| Horarios | tabla `scheduler_time` (`planned_time`, `dose`, `active_on_days`) |
| Overrides | tabla `scheduler_modification`, `SchedulerModificationType` |
| Tomas | tabla `event_log`, enum `EventLogStatus`, `EventLog` (21 campos) |
| Valores | tabla `event_log_value` (`value` vs `scheduled_value`) |
| Catálogo | `trackable_object`, `unit`, `scale`, `TrackableObject` |
| Rachas | tabla `mission` + `Mission$Streak` (3 ints) |
| Citas | `team_profile_appointment` (`reminder_1`, `reminder_2`) |
| Interacciones | tabla `drug_interaction` |
| Notificaciones | `scheduled_notification`, `notificationmanagement.*` |
| Health Connect | `flutter`-no aplica; `androidx.health.*`, permisos `health.READ_*` |
| Dispositivo | `feature.smartpilot`, `nfc_tag_support`, `smart_pilot_configuration` |

Artefactos (ruta real en esta máquina: `C:\Users\rqqui\rea-targets\analysis\mytherapy\`):
`meta.json`, `manifest.xml`, `res.json`, `tables.txt`, `ddl_app.txt`,
`classes*.classes.jsonl`, `classes*.methods.txt`, `classes*.strings.txt`.
Código descompilado: `src2/` (estructurado, 1 464 archivos `.java`), `src/` (primera pasada, 1 261) y
`src_fb/` (fallback, para corrutinas que el modo estructurado no resuelve).
Herramientas reutilizables: `C:\Users\rqqui\rea-targets\analysis\tools\`
(`extract_meta.py`, `arsc.py`, `dex_inventory.py`, `ddl.py`, `scan.py`, `disasm.py`, `q.py`,
`DumpClasses.java`).

