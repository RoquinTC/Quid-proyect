# Medisafe 9.52.1 — Ingeniería inversa completa del módulo de Salud

> Documento de referencia para el módulo **Salud** de Quid-App.
> Artefacto analizado: `Medisafe_com.medisafe.android.client_20880_U_SV4.apk`
> SHA-256: `13ceb895f7b6bb5afbe482dfd14ad692689feaa271e5fa25445059e855f62a80`
> Fecha de análisis: 2026-10-24

---

## 0. Resumen ejecutivo

Medisafe es, funcionalmente, **el "pillbox digital" clásico**: recordatorios por horario,
confirmación de toma, adherencia histórica, mediciones de salud, refills de farmacia,
círculo de cuidado (MedFriend) y una capa de "programas" farmacéuticos (co-branding).

Tres hallazgos arquitectónicos que cambian cómo se debe diseñar un módulo equivalente:

1. **El núcleo es un motor de recordatorios genérico, no un CRUD de medicamentos.**
   `reminder/domain/services/ReminderNotificationGenerator` recibe
   `(ReminderSettingDto, List<RemindableDataRecordDto>, time, snoozeNumber)` y devuelve
   notificaciones. La app calcula *items* de recordatorio, los agrupa y los publica.
   El medicamento es solo **un tipo de registro recordable**.

2. **El estado de una toma es una cadena, no un booleano.**
   `ScheduleItem` maneja `STATUS_PENDING / STATUS_TAKEN / STATUS_MISSED / STATUS_SNOOZE /
   STATUS_DISMISSED / STATUS_DELETED`, y guarda simultáneamente la hora **programada**
   (`originalDateTimeLong`) y la hora **real** (`actualDateTimeLong`), más `snoozeCounter`
   y `lastReminderAt`. Sin esos cinco campos es imposible reconstruir la adherencia real.

3. **La plataforma "CHP" (Care/Health Platform) es un motor de reglas con tarjetas.**
   Tablas `chp_record`, `chp_record_relation`, `calculated_rule`, `profile_intervention`,
   `room_page`, `maestro_rule`, con un motor "JITI" (just-in-time intervention) que decide
   qué tarjeta mostrar a qué perfil y en qué momento. Es lo que convierte a Medisafe en un
   producto de *programas* (farmacéuticas) y no solo de recordatorios.

---

## 1. Metodología y trazabilidad

### 1.1 Qué se ejecutó

El entorno no permitía levantar la JVM de JADX en el primer intento (el *commit charge* de Windows
estaba agotado por la VM de Docker: `os::commit_memory ... DOS error/errno=1455`). Se liberó
memoria (Docker/WSL detenidos) y entonces **sí** se pudo descompilar con JADX.

Resultado: **dos pasadas complementarias**.

| Paso | Herramienta | Salida |
|---|---|---|
| Manifiesto + componentes | `androguard` 4.1.3 (AXML) | `analysis/medisafe/meta.json`, `manifest.xml` |
| Recursos (`resources.arsc`) | parser propio (`tools/arsc.py`) | `analysis/medisafe/res.json` (11 767 strings, 76 arrays) |
| Inventario DEX (7 dex) | `androguard` + `tools/dex_inventory.py` | `*.classes.jsonl`, `*.methods.txt`, `*.strings.txt` |
| Esquema SQLite | minado de `const-string` (`tools/ddl.py`) | `analysis/medisafe/tables.txt` (105 tablas) |
| Modelo de dominio | `tools/scan.py fields/enums` sobre DEX | campos y enums |
| **Código Java descompilado** | **JADX 0.7.1 vía `tools/DumpClasses.java`** (heap acotado) | `analysis/medisafe/src2/` |

Clases descompiladas y leídas línea a línea para este documento:
`ReminderNotificationGeneratorImpl`, `TimeHelper`, `ReminderSettingDto`, `ReminderTimeRefDto`,
`ReminderNotificationDto(+Template/Button)`, `RemindableDataRecordDto`, `GeneratorPolicy`,
`StrategyType`, `StrategyParameters`, `CycleData`, `ItemTemplate`, `CalendarData`,
`ReminderMetadata`, `ScheduleGroup`, `ScheduleItem`, `WakeAlarmHelper`, `ItemAlarmUtils`.

Totales extraídos: **59 979 clases** (15 312 propias de Medisafe), **349 578 métodos**,
**360 808 campos**, **7 dex**, 116 Activities, 19 Services, 29 Receivers, 9 Providers.

### 1.2 Límites explícitos

- Lo marcado como **[verificado]** proviene de código Java descompilado (JADX) o de SQL/enums
  literales en el binario. Lo marcado **[inferencia]** es lectura de diseño, no de ejecución.
- **No se ejecutó la app** (sin emulador/ADB en esta máquina): no hay evidencia de runtime.
- El APK está **parcialmente ofuscado**: `com.medisafe.network.v3.dt` y algunos DTO usan nombres
  cortos; el dominio (`com.medisafe.model.dataobject`, `multiplatform.core.models`) es legible.
- JADX no descompila algunos métodos Kotlin con corrutinas muy inlinadas; para esos se usó el
  **modo fallback** (bytecode estilo registro), que sigue siendo evidencia fiable de la lógica.

### 1.3 Validación cruzada con REA (JADX headless, vía MCP)

Una vez liberada la memoria, el proveedor Android de REA funcionó y sirvió para contrastar la
extracción propia:

| Dato | REA (Evidence) | Extracción propia | Coincide |
|---|---|---|---|
| SHA-256 | `13ceb895…5f62a80` | idéntico | ✅ |
| package / versión | `com.medisafe.android.client` 9.52.1 (20880) | idéntico | ✅ |
| minSdk / targetSdk | 30 / 36 | 30 / 36 | ✅ |
| clases de nivel superior | 35 562 | 35 562 (`classes_total` de JADX) | ✅ |
| definiciones de clase en DEX | — | 59 979 (incluye anidadas y sintéticas) | — |
| recursos | 4 384 | 4 384 `entries` en el APK | ✅ |
| permisos solicitados | 31 entradas | 29 (androguard omite 2) | ⚠️ corregido |

Evidencia: `inspect_android_package` →
`ev_d0e361d5ff0542d0b6e2ca5b9acd9b3092ff3b53dcb687a14e2c03f2281f4477`
(vista `ev_e57979a5fbdb5f943b1d5996a15778fe6cdc9401de9f5317c28dd3a25de08b96`).

**Corrección aplicada:** REA muestra `android.permission.SYSTEM_ALERT_WINDOW`, que
`androguard.get_permissions()` no devolvió. Ese permiso es justamente el que sostiene
`ReminderDisplayOverAppsActivity` (§6.7): Medisafe **dibuja sobre otras apps** para el
recordatorio. Se corrigió §13.

**Sobre los dos conteos de clases:** no se contradicen. 59 979 es el número de *class_def*
en los 7 dex (incluye clases internas, anónimas y sintéticas); 35 562 es el número de clases
de nivel superior que JADX/REA reportan. Este documento usa 59 979 para inventario de código
y 35 562 al comparar con REA.

### 1.4 Cómo reproducir

```powershell
# manifiesto + componentes
python tools/extract_meta.py <apk> analysis/medisafe
# recursos
python tools/arsc.py <apk> analysis/medisafe/res.json
# inventario por dex (índice 0..6)
python tools/dex_inventory.py <apk> 0 analysis/medisafe
# esquema
python tools/ddl.py analysis/medisafe/tables.txt chp_record calculated_rule
# modelo de dominio
python tools/scan.py <apk> fields 'com\.medisafe\.model\.dataobject\.ScheduleGroup$'
python tools/scan.py <apk> enums  'com\.medisafe\.common\.entities_helper\.MeasurementType$'

# descompilación selectiva (requiere JVM libre: cerrar Docker/WSL si el commit charge está lleno)
javac -cp jadx-headless-mcp-0.7.1-all.jar -d tools/classes tools/DumpClasses.java
java -Xmx5g -cp "tools/classes;jadx-headless-mcp-0.7.1-all.jar" DumpClasses `
     <apk> analysis/medisafe/src2 `
     com.medisafe.multiplatform.reminder com.medisafe.model.dataobject `
     com.medisafe.android.base.managealarms
# métodos Kotlin que no descompila en modo estructurado: reintentar en modo fallback
$env:DUMP_FALLBACK='1'; java -Xmx5g -cp "tools/classes;..." DumpClasses <apk> <outdir> <prefijo>
```

---

## 2. Identidad y empaquetado

| Campo | Valor |
|---|---|
| Paquete | `com.medisafe.android.client` |
| Nombre visible | Medisafe |
| Versión | 9.52.1 (versionCode 20880) |
| minSdk / targetSdk | 30 / 36 |
| Tamaño | 80,2 MB (APK), 60,5 MB de bytecode en 7 dex |
| Arquitectura | Kotlin Multiplatform (KMP) + Android "legacy" + Jetpack Compose |
| Backend | AWS (Cognito/Amplify) + API propia |
| Auth | `com.amplifyframework.auth.cognito` (Hosted UI + Custom Tabs) |

Firma del manifiesto: **116 activities**, 19 services, 29 receivers, 9 providers, 29 permisos.

---

## 3. Arquitectura

### 3.1 Capas reales (deducidas del árbol de paquetes)

```
com.medisafe.multiplatform.*          ← KMP: lógica compartida (dominio + reglas)
  ├── reminder/                       ← motor de recordatorios (el corazón)
  ├── jiti/                           ← motor de intervenciones (room, rule, chp_rule, dto)
  ├── policy/                         ← políticas por medicamento (medicine/, project/)
  ├── room/                           ← "rooms"/páginas dinámicas, tracker, calendar
  ├── core/                           ← dto, trackers, common
  ├── database/chp                    ← persistencia CHP
  └── sdk/                            ← SDK embebible (medisafe.sdk.*)
com.medisafe.android.base.*           ← UI + plumbing Android
  ├── addmed/  (1079 clases)          ← alta/edición de medicamento (el flujo más grande)
  ├── activities/ (926)               ← pantallas
  ├── client/ (782)                   ← widgets, views, bootstrap
  ├── managealarms/ (90)              ← AlarmManager + WorkManager
  ├── modules/, actions/, helpers/, main/, feed/, geofence/, managers
com.medisafe.android.flow.ui (1310)   ← motor de "flows" (cuestionarios/onboarding dinámicos)
com.medisafe.network.v3.*             ← API v3 (DTOs ofuscados)
com.medisafe.model.*                  ← dataobject (dominio), room_db, dto, enums
com.medisafe.orm.ormlite (190)        ← ORMLite legacy
com.medisafe.room.ui.*                ← "Room" = sección de contenido/feed (cards, reproductor)
com.medisafe.uicomponents.*           ← design system (trackergraphs, compose)
```

Observación de diseño: **`addmed` tiene 1079 clases** — más que cualquier feature.
El alta de medicamento es el producto: wizard con plantillas, búsqueda de fármaco,
dosis, patrones de ciclo, recordatorios, soporte ("supportive meds").

### 3.2 Persistencia: tres motores conviviendo

| Motor | Evidencia | Uso |
|---|---|---|
| ORMLite legacy | `com.medisafe.orm.ormlite` (190 clases), tablas `medisafeAppointment`, `medisafeDoctor`, `notes`, `refill`, `schedulegroup` | Modelo heredado de citas/notas/refill |
| Room | `*Entity`, `*Dao_Impl`, `CREATE TABLE IF NOT EXISTS \`...\`` | Alarmas, trackers, CHP, flows, feed |
| SQLite directo | `CREATE TABLE chp_record (...)`, `maestro_rule` | CHP/JITI (SQL manual) |
| DataStore | `androidx.datastore.preferences.protobuf` | Preferencias |

Consecuencia: hay **dos esquemas de alarma** (`alarm_tbl` legacy y `AlarmEntity` Room) y el
código mantiene `getAllAlarmLegacy()` junto a `getAllAlarmEntities()`. Es deuda técnica visible:
al diseñar Quid hay que elegir **un** esquema desde el día uno.

---

## 4. Superficie funcional (116 activities, agrupadas)

| Dominio | Pantallas representativas |
|---|---|
| Núcleo de medicación | `AddDoseActivity`, `EditDoseActivity`, `TakeDialogActivity`, `MainActivity`, `AddFirstMedActivity`, `TemplateFlowActivity`, `BulkActionsActivity`, `PillboxSelectionActivity`, `WeekendModeActivity` |
| Recordatorios | `ReminderActivity`, `CrossAlarmActivity`, `ReminderProblemActivity` (+ OnBoarding/Instruction), `ReminderDisplayOverAppsActivity`, `SoundSettingsActivity`, `RingtoneListActivity`, `PreferenceNestedScreenActivity` |
| Tiempo/zona | `TimeZoneActivity`, `TimeZoneSelectRemindersActivity`, `TimeZoneSetIndividualMedsActivity` |
| Mediciones | `AddEditMeasurementActivity`, `MeasurementsListActivity`, `MeasurementDetailsActivity`, `MeasurementsUnitsSelectionActivity`, `SelectMeasurementsActivity` |
| Condiciones / fármacos | `ConditionSearchActivity`, `MedDetailsActivity`, `InteractionDetailsActivity`, `LeafletActivity` |
| Citas y médicos | `AppointmentsListActivity`, `AddAppointmentSilentActivity`, `EditAppointmentActivity`, `DoctorListActivity`, `DoctorDetailsActivity`, `EditDoctorActivity` |
| Refill / farmacia | `RefillActivity`, `PharmacyWebViewActivity` |
| Adherencia / reportes | `DiaryActivity`, `ReportActivity`, `SendReportActivity` |
| Círculo de cuidado | `AddMedFriendActivity`, `EditMedFriendActivity`, `MedFriendFirstConnectionActivity`, `AddDependentActivity`, `InvitationCodeSentActivity`, `ProviderConfirmDoctorInviteActivity` |
| Safety Net | `SafetyNetOnBoardingActivity`, `SafetyNetPreferenceActivity`, `SafetyNetAllDoneActivity` |
| Cuenta / confianza | `LoginSignUpActivity`, `ManageAccountActivity`, `EnterPasscodeActivity`, `SetPasscodeActivity`, `EulaActivity`, `TermsAndConditionsActivity`, `AboutActivity`, `SyncPostLoginActivity` |
| "Rooms"/comunidad | `MainRoomActivity`, `PlayerActivity` (contenido en video), `DiaryActivity` |
| Debug (en release) | `DebugMenuActivity`, `DebugPreferenceNestedActivity`, `FlowInspectorActivity`, `JsonViewActivity` |

> Nota de producto: Medisafe deja el menú de debug **habilitado en el build de release**
> (`com.medisafe.debugmenu.ui.*` declarado en el manifiesto). No copiar.

---

## 5. Modelo de datos

### 5.1 Modelo de dominio (no es el esquema SQL, es el objeto de negocio)

#### `ScheduleGroup` — el "plan de medicación"
52 campos; tabla conceptual del tratamiento.

| Campo | Tipo | Significado |
|---|---|---|
| `id` / `serverId` / `uuid` | int / long / String | identidad local, remota, global |
| `medicine` | `Medicine` | fármaco (FK) |
| `reminderType` | int | `REMINDER_TYPE_FREQUENCY`=0, `REMINDER_TYPE_INTERVAL`=1 |
| `everyXDays` | int | intervalo en días (modo interval) |
| `days` / `daysToTake` / `continues` | int / int / bool | duración del tratamiento |
| `fourWeeksPattern` | int | patrón de 4 semanas (bitmask) |
| `cyclePillDays` / `cycleBreakDays` / `isCycleShowPlacebo` | int / int / bool | ciclo tipo anticonceptivo (tomas + descanso + placebos) |
| `consumptionHoursString` / `startConsumptionHourString` | String | horas de toma serializadas |
| `dose`, `dosageValue`, `dosageUnit`, `form` | float/String | dosis y forma farmacéutica |
| `foodInstructions` | int | `NM_FOOD=0`, `BEFORE_FOOD=1`, `WITH_FOOD=2`, `AFTER_FOOD=3` |
| `defaultPills` / `currentPills` | int / float | inventario de pastillas |
| `rxNumber` / `rxRefillPillsTime` | String | receta y umbral de refill |
| `changingDoseDateStart` / `changingDoseDaysInterval` / `changingDoseValEnd` / `changingDoseValIncrement` | Date/int/float/float | **titulación**: subida progresiva de dosis |
| `customScheduleJson` / `customScheduleType` | String | escape hatch para patrones no cubiertos |
| `metadata` | String | JSON libre (co-branding, programa) |
| `conditionId` | String | condición asociada |
| `status` | `GroupStatus` | `ACTIVE`, `PENDING`, `SUSPENDED`, `DELETED` |
| `tag`, `syncAccounts`, `encryptedVersion`, `doctor` | | multi-cuenta, cifrado, médico prescriptor |

**Decisión clave para Quid:** el patrón de repetición **no es un enum de frecuencia**.
Son 6 ejes independientes: `reminderType`, `everyXDays`, `fourWeeksPattern`,
`cyclePillDays/cycleBreakDays`, `daysToTake/continues`, `customScheduleJson`.
Un `frequency: "daily" | "weekly"` (como el de Quid hoy) no cubre ni el 40 % de los casos reales.

#### `ScheduleItem` — la toma concreta
39 campos.

| Campo | Tipo | Significado |
|---|---|---|
| `status` | String | `pending` / `taken` / `missed` / `snooze` / `dismissed` / `deleted` |
| `originalDateTimeLong` | Date | hora **programada** (inmutable) |
| `actualDateTimeLong` | Date | hora **real** de la acción |
| `snoozeCounter` | int | nº de snoozes (para limitar y para metricas) |
| `lastReminderAt` | Long | último aviso emitido |
| `nextAlarm` | bool | marca de "esta es la próxima alarma" |
| `sequence` | int | orden dentro del bloque horario |
| `doseType`, `doseValue`, `quantity` | int/float/float | dosis efectiva de esa toma |
| `dosageValue` / `dosageUnit` / `strengthValue` / `strengthUnit` | | presentación |
| `itemType` | int | `TYPE_NUVARING_INSERT` / `TYPE_NUVARING_REMOVE` / `TYPE_PLACEEBO` (eventos no-fármaco) |
| `location` | String | lugar de la toma **[inferencia: geofence/My Places]** |
| `metadata`, `neuraEvent`, `source`, `notes` | String | contexto (Neura = SDK de contexto) |
| `RescheduleItemSource` | enum | `SOURCE_MANUAL`, `SOURCE_MANUAL_FROM_REMINDER`, `SOURCE_WEEKEND` |

Un `ScheduleItem` **no es un registro de log**: es la entidad planificada que muta de estado.
Eso permite "arrastrar" una toma pendiente a otro horario sin perder el original
(`RescheduleItemSource.SOURCE_MANUAL`).

#### `Medicine` — catálogo de fármaco

`name`, `barcode`, `ndcCode`, `form`, `strengthValue/Unit`, `strengthPerVolumeValue/Unit`,
`defaultDaysToTake`, `defaultAdultMinDay/MaxDay`, `food`, `hasLeaflet`, `info`, `infoUrl`,
`imageUrl/imagePath/imageResourseName`, `color`, `shape`, `vucaVideoUrl`, `approved`,
`scheduled`, `extId`, `serverId`, `created`.

`color`+`shape` no son estética: identifican el aspecto físico de la pastilla
(búsqueda visual en el alta). `ndcCode` es el código nacional de fármaco de EE. UU.

### 5.2 Esquema SQLite (105 `CREATE TABLE` propios, sin librerías de Google/WorkManager; aquí el subconjunto de salud)

```sql
-- Alarmas (Room, esquema nuevo)
CREATE TABLE AlarmEntity (time INTEGER NOT NULL, scheduledItemsTime INTEGER NOT NULL,
                          alarmCounter INTEGER NOT NULL, id INTEGER PRIMARY KEY AUTOINCREMENT);
-- Alarmas (ORMLite, esquema legacy)
CREATE TABLE alarm_tbl (_id INTEGER, alarm_date_long INTEGER NOT NULL,
                        alarmCounter INTEGER NOT NULL, meta TEXT, PRIMARY KEY(_id));

-- Mediciones (datos cifrados en JSON)
CREATE TABLE TrackerGroupEntity (uuid TEXT PRIMARY KEY, user_id INTEGER NOT NULL, state TEXT NOT NULL,
   client_entity_version INTEGER NOT NULL, server_entity_version INTEGER, data TEXT NOT NULL,
   version INTEGER NOT NULL, encryption_version INTEGER NOT NULL);
CREATE TABLE TrackerItemEntity (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
   tracker_group_uuid TEXT NOT NULL, state TEXT NOT NULL, actual_datetime INTEGER NOT NULL,
   data TEXT NOT NULL, client_entity_version INTEGER NOT NULL, server_entity_version INTEGER,
   version INTEGER NOT NULL, encryption_version INTEGER NOT NULL);
CREATE TABLE MeasurementMigrationEntity (id INTEGER PRIMARY KEY AUTOINCREMENT, userId INTEGER NOT NULL,
   measurementType TEXT NOT NULL, trackerGroupUuid TEXT NOT NULL);

-- Citas / médicos / notas / refill (ORMLite)
CREATE TABLE medisafeAppointment (title VARCHAR, doctor_id VARCHAR, id VARCHAR, notes VARCHAR,
   summary VARCHAR, serialNumber INTEGER, reminder BIGINT, date BIGINT, userId INTEGER, PRIMARY KEY(id));
CREATE TABLE medisafeDoctor (email VARCHAR, id VARCHAR, imageName VARCHAR, name VARCHAR,
   phoneNumber VARCHAR, userId INTEGER, PRIMARY KEY(id));
CREATE TABLE notes (noteId VARCHAR, noteType VARCHAR, userId INTEGER, text VARCHAR, date BIGINT,
   id INTEGER PRIMARY KEY AUTOINCREMENT);
CREATE TABLE refill (id INTEGER PRIMARY KEY AUTOINCREMENT, refill_id TEXT NOT NULL, group_id INTEGER,
   user_id INTEGER, amount FLOAT NOT NULL DEFAULT 0, price FLOAT NOT NULL DEFAULT 0,
   currency TEXT, date BIGINT, created BIGINT);
CREATE TABLE feedCardStates (uniqueId VARCHAR, type VARCHAR, isRead INTEGER DEFAULT 0,
   isDismissed INTEGER DEFAULT 0, createdAt BIGINT, updatedAt BIGINT);
```

### 5.3 El generador de ocurrencias del CHP (`GeneratorPolicy`) — **[verificado]**

Cada `chp_record` no genera ocurrencias por sí mismo: lleva una lista de **políticas generadoras**
(`generatorPolicy`), y `CalendarData` solo apunta a cuál aplica
(`generatorPolicyId`, `generatorRecordId`).

```java
public final class GeneratorPolicy {
    private String  id;
    private long    startDate;
    private Long    endDate;              // null = sin fin
    private String  timeZone;
    private StrategyType strategy;
    private StrategyParameters strategyParameters;
    private ItemTemplate itemTemplate;    // forma de cada ocurrencia generada
    private boolean continuous;           // cadena sin huecos
    private boolean autoAdjustTimeZone;   // recalcular al cambiar de zona
}

public enum StrategyType { EVERY_X_DAYS, EVERY_X_MONTHS, DAYS_OF_WEEK, EMPTY }

public final class StrategyParameters {
    private String    consumptionHour;    // hora de toma
    private CycleData cycleData;          // ciclo tipo anticonceptivo
    private Integer   daysOfWeek;         // bitmask
    private Integer   daysToTake;         // duración
    private Integer   everyXDays;
    private Integer   everyXMonths;
    private Integer   fourWeeksPattern;   // patrón de 4 semanas
}

public final class CycleData {
    private int     pillDaysNum;
    private int     breakDaysNum;
    private long    firstPillDate;
    private boolean showPlacebo;
}

public final class ItemTemplate {   // cómo materializar cada ocurrencia
    private final String       status;
    private final List<String> tags;
    private final String       type;
}
```

Y los tipos de registro (*qué* se puede recordar) — **[verificado]**:

```java
public enum GeneratorType {
    MEDICINE, DOSE, OPH_MED, OPH_MED_DOSE,     // medicación (oral y oftálmica)
    APPOINTMENT,                                // citas
    TASK,                                       // tareas
    TRACKER, TRACKER_ITEM,                      // mediciones
    HEALTH_CONTACT,                             // contacto sanitario
    CALENDAR_RECORD                             // evento de calendario
}
```

Diferencias de diseño frente a MyTherapy:

| | Medisafe | MyTherapy |
|---|---|---|
| Estrategias | 4 (`EVERY_X_DAYS`, `EVERY_X_MONTHS`, `DAYS_OF_WEEK`, `EMPTY`) | 6 modos + `AS_NEEDED` |
| Modificadores | `daysToTake`, `fourWeeksPattern`, `cycleData` | `daysActive`/`daysPaused`, `activeOnDays` |
| Dónde vive la regla | **JSON del servidor** dentro de `chp_record` | **columnas propias** en `scheduler`/`scheduler_time` |
| Zona horaria | `timeZone` + `autoAdjustTimeZone` **por política** | `timezone` por `event_log` |
| Forma del ítem | `ItemTemplate` (status/tags/type) | derivada del tipo de `trackable_object` |

Moraleja para Quid: **una tabla de políticas de recurrencia** (estrategia + parámetros +
template) es más flexible que columnas sueltas, pero exige validación de esquema (JSON Schema)
y migración cuidadosa — Medisafe lo resuelve con `versioning` en el propio record.

### 5.4 Plataforma CHP / JITI — esquema (motor de programas)

```sql
CREATE TABLE chp_record (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  data TEXT NOT NULL,             -- payload del record (JSON)
  generator_policy TEXT,          -- cómo se generan ocurrencias
  settings TEXT, reminder TEXT,   -- config de recordatorio del record
  versioning TEXT NOT NULL, calendar TEXT NOT NULL,
  client_entity_version INTEGER, server_entity_version INTEGER,
  original_datetime INTEGER, actual_datetime INTEGER, tags TEXT);

CREATE TABLE chp_record_relation (   -- grafo entre records (med ↔ condición ↔ cita)
  id INTEGER PRIMARY KEY AUTOINCREMENT, profile_id TEXT NOT NULL,
  first_id TEXT NOT NULL, first_type TEXT NOT NULL,
  second_id TEXT NOT NULL, second_type TEXT NOT NULL,
  first_second_relation_type TEXT NOT NULL, first_second_relation_data TEXT NOT NULL,
  second_first_relation_type TEXT NOT NULL, second_first_relation_data TEXT NOT NULL,
  versioning TEXT NOT NULL, UNIQUE(first_id, second_id));

CREATE TABLE calculated_rule (       -- resultado del motor de reglas
  calculated_rule_hash TEXT PRIMARY KEY, chp_profile_id TEXT NOT NULL, key TEXT NOT NULL,
  status TEXT, statuses TEXT, card_list TEXT, time_ref INTEGER, next_recalc INTEGER,
  mustache TEXT NOT NULL, program_id TEXT, uniqueness_type TEXT, uniqueness_id TEXT,
  always_set_mustache INTEGER, should_ignore_client_rule INTEGER NOT NULL,
  rule_source TEXT NOT NULL, active INTEGER NOT NULL, server_entity_version INTEGER);

CREATE TABLE profile_intervention (  -- qué tarjeta se mostró a quién y cuándo
  intervention_hash TEXT PRIMARY KEY, chp_profile_id TEXT NOT NULL, program_id TEXT NOT NULL,
  jiti_channel TEXT NOT NULL, page_key TEXT NOT NULL, section TEXT NOT NULL,
  component_key TEXT NOT NULL, context TEXT, uniqueness_type TEXT, uniqueness_id TEXT,
  timestamp INTEGER NOT NULL);

CREATE TABLE client_input (          -- respuestas del usuario a preguntas del programa
  client_input_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, input_key TEXT NOT NULL,
  uniqueness_type TEXT, uniqueness_id TEXT, program_id TEXT NOT NULL, answer TEXT,
  input_status TEXT NOT NULL, from_partner_data INTEGER NOT NULL,
  client_entity_version INTEGER NOT NULL, client_entity_created_on INTEGER NOT NULL,
  server_entity_version INTEGER, server_entity_created_on INTEGER);
```

Además: `room_page`, `room_user_data`, `maestro_rule`, `maestro_component`, `theme`,
`flow`, `settings`, `generic_record`, `localization`, `account`, `cardLikes`.

**Cómo funciona [inferencia bien soportada]:** el servidor define `maestro_rule` (layout) y
`chp_record` (datos del programa); el cliente evalúa `calculated_rule` localmente
(`should_ignore_client_rule`, `next_recalc`, `time_ref`), renderiza tarjetas y registra la
impresión en `profile_intervention`. `uniqueness_type`/`uniqueness_id` evitan duplicados.
Esto es un **feature-flag + remote-config + content engine** para programas de farmacéuticas.

---

## 6. Motor de recordatorios (el hallazgo central)

### 6.1 Cadena de ejecución observada

```
AlarmManagerHelper (setAlarm, con SetAlarmException)
   └── WakeAlarmReceiver          ← despierta el dispositivo
        └── ReminderNotificationGenerator
              ├── ReminderItem(record, reminderSetting, time, actualDateTime, snoozeNumber, grouping)
              ├── ReminderItemGroupingConfig (agrupa tomas del mismo bloque)
              ├── ReminderMustacheContext  → plantilla de texto
              └── DeviceNotificationRepo (publica / limpia)
TimeZoneReceiver · StartupReceiver · PackageReplacedReceiver → recalculan todo
DailyJobWorker (WorkManager, runContinuous) → mantenimiento diario
DeviceStateLogger → snapshot de estado (alarmas + ScheduledMed) para diagnóstico
```

### 6.2 El generador, paso a paso — **[verificado en `ReminderNotificationGeneratorImpl`]**

```java
// generateReminders(chpRecords, devicePermissions, profiles, programs, localization, now)
items = generateNotGroupedReminderItems(chpRecords, devicePermissions, profiles, now);
if (items.isEmpty()) return emptyList();
return generateTemplates(devicePermissions,
                         take(groupReminderItems(items),
                              reminderSettingsRepo.getPlatformLimitNotificationsCount()),
                         profiles, programs, localization);
```

**a) Cascada de ajustes (4 niveles).** Para cada registro se concatenan, en este orden:

```java
flatten( recordSettings,                                   // 1. ajustes del propio registro
         generatorRecordId != null
             ? getRecordSettings(generatorRecordId) : null, // 2. ajustes del registro generador
         currentProfileSettings,                            // 3. ajustes del perfil
         appSettings )                                      // 4. ajustes globales de la app
```

y se resuelve con `findAcceptableSettings(record, profile, cascade, devicePermissions)`.
Si devuelve `null`, **no hay recordatorio** (permisos y configuración son una puerta, no un adorno).
Después se descarta todo lo que ya pasó: `item.time >= now`.

**b) Construcción de items (`createReminderItems`).** Con `snoozeCount` y `snoozeTime`
(ambos `Integer?`, por defecto 0):

```java
actual = record.calendar.actualDatetime;
if (actual == null) return emptyList();          // sin fecha base no hay recordatorio

// snooze: N avisos extra, snoozeTime está en SEGUNDOS
for (i = 1; i <= snoozeCount; i++)
    items += new ReminderItem(Instant.fromEpochSeconds(actual + snoozeTime * i),
                              actual, setting, i, record, grouping);

// horas fijas: cada ReminderTimeRefDto se aplica sobre 'actual' con el DSL de TimeHelper
for (ref : setting.reminderTimeConfig)
    items += new ReminderItem(TimeHelper.adjustTime(actual, ref, TimeZone.of(profile.timeZone)),
                              actual, setting, 0, record, grouping);

return reminderTimeConfigItems + snoozeItems;
```

**c) Agrupación (`groupReminderItems`).** Los items con `grouping == true` se agrupan por
`record.type` y luego por la clave `(time, actualDateTime, reminderSetting, snoozeNumber)`;
los demás van individuales. El resultado se ordena por hora y se recorta al límite de plataforma.

**d) Plantilla (`generateTemplates` → `createReminderDto`).** El texto no está en el código:
se toma un `ReminderSettingsTemplateDto` que referencia un `componentKey` y un
`programCode`; se serializa el `ReminderMustacheContext` a JSON, se aplana
(`recursiveNonNullMap`) y se rellena un componente del servidor (`MaestroComponentsProvider`).
El `interruption_level` viene en `component.additionalParameters` (por defecto `MEDIUM`).

> Consecuencia de diseño: **el contenido de la notificación es dato, no código**.
> Eso permite cambiar textos por programa sin publicar la app… y es exactamente el
> punto donde Quid debería decidir entre i18n local (`next-intl`, que ya tiene) y plantillas
> servidas.

### 6.3 El DSL de tiempos (`ReminderTimeRefDto` + `TimeHelper`) — **[verificado]**

Las horas de recordatorio no son "08:00" ni un offset: son una **transformación declarativa**
de la fecha del registro.

```java
public final class ReminderTimeRefDto {
    Long addYears, addMonths, addWeeks, addDays, addHours, addMinutes;
    Integer setYear, setMonth, setMonthDay, setHour, setMinute, setMinutes, setWeekday;
}
```

`TimeHelper.adjustTime(source, ref, zone)` aplica, en este orden exacto:
`plusYears → plusMonths → plusWeeks → plusDays → plusHours → plusMinutes`,
luego `withYear → withMonth → withDayOfMonth → withHour → withMinute`, y por último
`adjustWeekDay(setWeekday + 1)`.

```java
// adjustWeekDay: diferencia contra el día ISO actual; si jumpToNext y diff <= 0, suma 7
int diff = isoDay(setWeekDay) - isoDay(source.dayOfWeek);
if (!jumpToNext) return source.plusDays(diff);
if (diff <= 0) diff += 7;
return source.plusDays(diff);
```

Con eso se expresan sin código: "3 días antes", "el mismo día a las 08:00", "el lunes siguiente
a las 09:00", "1 mes después". **Copiar esta idea** evita llenar el esquema de columnas
`offset_*` y `hour_*`.

### 6.4 Contrato de la notificación y de los ajustes — **[verificado]**

```java
public final class ReminderSettingDto {
    private final Boolean                     grouping;          // agrupar varias tomas
    private final Boolean                     presentMedName;    // mostrar el nombre del fármaco
    private final List<ReminderTimeRefDto>    reminderTimeConfig;
    private final Integer                     snoozeCount;       // nº de snooze permitidos
    private final Integer                     snoozeTime;        // segundos entre snooze
    private final List<ReminderSettingsTemplateDto> templates;
}

public final class ReminderNotificationDto {
    private final String  title, body, icon, image, sound, action;
    private final Map<String, Object> actionPayload;
    private final List<ReminderNotificationDtoButton> buttons;   // (title, icon, action, payload)
    private final ReminderNotificationInterruptionLevel interruptionLevel;
    private final long    reminderDatetime;
}
```

Identidad de alarma en el lado Android — **[verificado]**:

```java
// ItemAlarmUtils.convertDateToAction(date) → "alarm:YYYY-M-D-H-M"
"alarm:" + year + "-" + (month+1) + "-" + day + "-" + hour + "-" + minute
// snooze del sistema en MINUTOS (distinto del snoozeTime de la nube, en segundos)
ItemAlarmUtils.getSnoozeSettingsInMinutes(ctx) → Config.loadSnoozeTimerMinutesPref(ctx)
```

> Ojo al detalle: conviven **dos unidades de snooze** — `snoozeTime` (segundos, política del
> programa) y `snooze timer` (minutos, preferencia local). Es una fuente real de bugs;
> en Quid debe haber **una** unidad (minutos) y un solo campo.

### 6.5 Estados de error que la app contempla

`ReminderNotificationUpdateStatus`:
`ProcessedSuccessfully`, `NoPermission`, `OverLimit`, `DataCorrupted`, `GenericError`.

`ReminderError$ErrorType` + excepciones: `AccessDeniedException`, `InvalidSettingsException`,
`NetworkException`, `NoPermissionException`, `NoProfileException`, `ParsingException`.

**Consecuencia para Quid:** el motor de recordatorios **debe** modelar el fallo, no solo el éxito.
`OverLimit` existe porque Android limita alarmas/notificaciones por app
(`PlatformLimitNotificationsCountProvidable`, aplicado con `take(limit)`) — hay que degradar
con elegancia: primero las tomas críticas.

### 6.6 Modo fin de semana, refill y citas — **[verificado en `WakeAlarmHelper`]**

```java
private boolean shouldChangeRefillAlarmToWeekend(Context ctx) {
    Calendar c = Calendar.getInstance();
    return c.get(HOUR_OF_DAY) < Config.loadWeekendModeHourPref(ctx)   // antes de la hora umbral
        && AlarmUtils.isDateIsWeekendDay(ctx, c.get(DAY_OF_WEEK));    // y hoy es fin de semana
}
```

Y el guardado de un recordatorio de refill exige:

```java
group != null && group.isRefillByPillsLow() && !group.isDeleted() && !group.isSuspended()
```

Es decir: **modo fin de semana = posponer las alarmas que caen antes de una hora configurable
en sábado/domingo**, no mover el plan. La misma idea aplica a citas (dos recordatorios) y a
refill (umbral de pastillas).

### 6.7 Casos que Medisafe resuelve y que casi nadie implementa

| Caso | Evidencia | Lección |
|---|---|---|
| Cambio de zona horaria | `TimeZoneActivity`, `TimeZoneSelectRemindersActivity`, `TimeZoneSetIndividualMedsActivity`, `TimeZoneReceiver` | Al viajar, las tomas deben **recalcularse** por zona; el usuario elige si el cambio aplica a todos los meds o a algunos |
| "Modo fin de semana" | `WeekendModeActivity`, `RescheduleItemSource.SOURCE_WEEKEND` | Permite mover tomas de fin de semana conservando el histórico |
| Alarma cruzada | `CrossAlarmActivity` | Dos medicamentos a la misma hora → una sola pantalla |
| Alarma perdida por el SO | `ReminderProblemActivity`, `ReminderOnBoardingActivity`, `ReminderDisplayOverAppsActivity` | Diagnóstico explícito de OEM (Xiaomi/Huawei…) y guía para "permitir pantalla sobre apps" |
| Límite de notificaciones | `OverLimit` | Fallback cuando Android recorta |
| Toma "no fármaco" | `TYPE_NUVARING_INSERT/REMOVE`, `TYPE_PLACEEBO` | El plan puede incluir eventos (insertar anillo, retirar) |

---

## 7. Adherencia

### 7.1 Máquina de estados de la toma

```
pending ──(usuario confirma)──► taken
   │                              ▲
   ├──(usuario pospone)──► snooze ─┘ (snoozeCounter++)
   ├──(ventana vence)───► missed
   ├──(usuario descarta)─► dismissed
   └──(plan borrado)────► deleted
```

Campos que hacen posible la métrica: `originalDateTimeLong` vs `actualDateTimeLong`
(retraso real), `snoozeCounter` (fricción), `lastReminderAt` (cuántos avisos se necesitaron).

### 7.2 Reportes

`ReportActivity` + `SendReportActivity` (envío al médico/cuidador) y `DiaryActivity`
(bitácora). `PositiveFeedbackActivity`/`PositiveFeedbackAlarmReceiver` → refuerzo positivo
tras racha. `FeedCardState` (`isRead`, `isDismissed`) mide consumo de contenido clínico.

**Inferencia:** la adherencia se calcula sobre `ScheduleItem` (no sobre logs aparte),
porque el item ya guarda ambos tiempos y el estado. Es la decisión más importante a copiar.

---

## 8. Catálogos verificados

### 8.1 `MeasurementType` (25 valores, `com.medisafe.common.entities_helper`)

`A1C`, `BLOOD_PRESSURE`, `BODY_FAT`, `BOWEL_MOVEMENT_LEVEL`, `CALORIES`, `CALORIES_SPENT`,
`CD4_CELL_COUNT`, `CD4_PERCENTAGE`, `CREATININE`, `EGFR`, `GLUCOSE_LEVEL`, `HDL_COL`,
`HIV_VIRAL_LOAD`, `INR`, `LDL_COL`, `MOOD`, `PAIN`, `PEAK`, `PULSE`, `SPO2`, `STEPS_COUNT`,
`TEMPERATURE`, `TRIGLYCERIDES`, `T_SCORE`, `WEIGHT`.

Lectura: el catálogo es **clínico, no de bienestar**. Incluye VIH (CD4, carga viral),
anticoagulación (INR), función renal (creatinina, eGFR), osteoporosis (T-score),
y también estados subjetivos (`MOOD`, `PAIN`, `BOWEL_MOVEMENT_LEVEL` con escala).

### 8.2 `MeasurementUnit` (23 valores)

`BPM`, `C`, `CALORIES`, `CELLS_MM3`, `CM`, `COPIES_ML`, `F`, `INCH`, `INR_LEVEL`, `KG`, `LB`,
`LEVEL`, `L_MIN`, `MG_DL`, `ML_MIN`, `MMHG`, `MMOL_L`, `MOOD`, `PAIN`, `PERCENTAGE`, `STEPS`,
`ST_LB`, `UNITS`.

`MeasurementReading` guarda `value` **y `secondValue`** → soporta presión arterial
(sistólica/diastólica) sin tabla aparte. También `reportingApp`/`reportingPlatform`
(procedencia: `PLATFORM_MEDISAFE`, Health Connect, báscula) y `migrationStatus`.

### 8.3 Otros enums

| Enum | Valores |
|---|---|
| `GroupStatus` | `ACTIVE`, `PENDING`, `SUSPENDED`, `DELETED` (+ `serverCode`) |
| `ScheduleGroup.RX_TYPE` | `NONE`, `PILLS` |
| `ItemSnoozeLocation` | (3 valores; snooze desde notificación / app / otro) |
| `MeasurementCategory` | agrupa tipos para la UI |
| `Medicine.food` | `NM_FOOD`, `BEFORE_FOOD`, `WITH_FOOD`, `AFTER_FOOD` |
| `Server` / `WebRequestType` (102 constantes) | catálogo de endpoints internos |

---

## 9. Fármacos e interacciones

- `Medicine` trae `ndcCode`, `barcode`, `strength*`, `form`, `hasLeaflet`, `infoUrl`,
  `vucaVideoUrl`, `approved` → hay **catálogo servidor-side** con contenido aprobado.
- Interacciones: `DdiDrugInteractionsDto` (`Participant`, `Severity`), `DdiLifestyleInteractionsDto`
  (`Interaction`) → interacciones **fármaco-fármaco** y **fármaco-estilo de vida**
  (alcohol, etc.), con severidad y participantes. UI en `InteractionDetailsActivity`.
- `IndicationListDto`, `MedDataDto` (`MedBrand`, `MedDosage`, `MedDosageType`, `MedHour`,
  `MedSchedule`, `MedScheduleType`) → el catálogo de marcas/dosis/indicaciones viene del backend.
- `DosingTime` / `DosingTimeLimit` → límites de horario por fármaco (**[inferencia]**:
  "no tomar después de X").

---

## 10. Círculo de cuidado y perfiles

| Mecanismo | Evidencia |
|---|---|
| MedFriend (cuidador recibe avisos) | `AddMedFriendActivity`, `EditMedFriendActivity`, `MedFriendFirstConnectionActivity`, permiso `READ_CONTACTS` |
| Perfiles dependientes | `AddDependentActivity`, `com.medisafe.sdk` (SDK embebible), `chp_profile_id` en todo el esquema CHP |
| Safety Net | `SafetyNetOnBoarding/Preference/AllDone` → plan de contingencia si el paciente no responde |
| Passcode / biometría | `SetPasscodeActivity`, `EnterPasscodeActivity`, `USE_BIOMETRIC`, `androidx.biometric` |
| Invitación de médico | `ProviderConfirmDoctorInviteActivity`, `InvitationCodeSentActivity`, `CeoRxLetterActivity` |

`chp_profile_id` aparece en **todas** las tablas CHP: el diseño es **multi-perfil desde el origen**
(un usuario puede gestionar varios pacientes). Quid hoy tiene `HealthProfile` (owner/guest),
pero sus tablas de medicación cuelgan de `userId`, no del perfil.

---

## 11. Farmacia, refills y pedidos

- `Refill` (tabla `refill`): `refill_id`, `group_id`, `user_id`, `amount`, `price`, `currency`,
  `date`, `created` → un refill es **una transacción con dinero**, no solo un contador.
- `ScheduleGroup.rxNumber`, `rxRefillPillsTime`, `defaultPills`, `currentPills` →
  el stock vive **en el plan**, y el umbral de aviso es configurable por medicamento.
- `PharmacyWebViewActivity` → la compra se delega a web (sin SDK de farmacia).
- `BulkActionsActivity` → acciones masivas (pausar/borrar muchos meds a la vez).

---

## 12. Red, backend e integraciones

Hosts observados en el binario (constantes de cadena):

| Host | Uso |
|---|---|
| `api.medisafeproject.com` | API de producción |
| `stgsync.medisafeproject.com`, `stgunstable.medisafeproject.com` | staging |
| `general-functions.medisafe.com` | funciones auxiliares |
| `license.medisafe.com` | licencias (SDK/partner) |
| `cognito-idp*.amazonaws.com`, `sts.amazonaws.com` | auth AWS |
| `d3h4g506po3un6.cloudfront.net` | CDN de assets |
| `www.theneura.com` | SDK de contexto (Neura) |
| `ib.adnxs.com`, `adsdk.microsoft.com`, `pagead2.googlesyndication.com` | publicidad |

Componentes de integración en el manifiesto:
`FirebaseMessagingService` + `FcmMessageService` (push), `WatchResponseService` (Wear),
`GeoFenceTransitionBroadcastReceiver` + `LocationServicesStatusBroadcastReceiver` (My Places),
`WidgetDailyListViewsService`/`WidgetDailyListReceiver` (widget de la lista del día),
`EncryptionUpgradeService` (migración de cifrado), `SdkBootReceiver`/`SdkNotificationsBroadcastReceiver`
(SDK para apps de terceros), `Scandit` (escaneo de código de barras), ML Kit (OCR de recetas,
modelos `mlkit-google-ocr-models`).

**Nota [inferencia]:** hay `androidx.room.MultiInstanceInvalidationService` y `com.medisafe.sdk.*`
declarados como componentes propios: el SDK permitiría que **otra app** (farmacéutica) monte
recordatorios Medisafe dentro de sí misma. Es la lectura más consistente con
`license.medisafe.com`, `SdkBootReceiver` y `SdkNotificationsBroadcastReceiver`.

---

## 13. Permisos y privacidad

29 permisos según `androguard` (**31 entradas** según REA/JADX: añade `SYSTEM_ALERT_WINDOW`
y repite `ACCESS_FINE_LOCATION` por `maxSdkVersion`). Los relevantes para salud:

| Permiso | Por qué |
|---|---|
| `USE_EXACT_ALARM` + `SCHEDULE_EXACT_ALARM` | alarmas exactas (recordatorios) |
| `POST_NOTIFICATIONS`, `VIBRATE`, `WAKE_LOCK`, `FOREGROUND_SERVICE` | notificación y servicio |
| `RECEIVE_BOOT_COMPLETED` | reprogramar tras reinicio |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | sobrevivir al *doze* |
| `ACCESS_FINE/COARSE/BACKGROUND_LOCATION` | geofence "My Places" |
| `SYSTEM_ALERT_WINDOW` | **dibujar sobre otras apps** para el recordatorio (`ReminderDisplayOverAppsActivity`) |
| `READ/WRITE_CALENDAR` | citas médicas |
| `READ_CONTACTS` | invitar MedFriend |
| `USE_BIOMETRIC`, `USE_FINGERPRINT` | bloqueo de la app |
| `CAMERA` | escanear pastilla/receta |
| `com.android.vending.BILLING` | suscripción premium |

No pide `BODY_SENSORS` ni Health Connect: las mediciones son **declaradas por el usuario**.

Datos sensibles: `TrackerItemEntity.data` y `chp_record.data` van con `encryption_version`
y `encryptedVersion` → **cifrado a nivel de campo**, no solo SQLCipher. Es el patrón correcto
para datos de salud en reposo.

---

## 14. Qué copiar y qué evitar para Quid

### Copiar

1. **`ScheduleItem` como entidad de primera clase** con `original_scheduled_at`,
   `actual_at`, `status` (6 estados), `snooze_count`, `last_reminded_at`.
2. **Motor de ocurrencias separado del medicamento**: `(plan, ventana) → items`.
3. **El DSL de tiempos `add*/set*`** (§6.3) en lugar de columnas `offset_*`: cubre
   "3 días antes", "lunes siguiente 09:00", "mismo día 08:00" con un solo JSON validado.
4. **Cascada de ajustes de 4 niveles** (registro → registro generador → perfil → app) y
   permisos como puerta (`findAcceptableSettings` devuelve `null` ⇒ sin recordatorio).
5. **Enumerar fallos del sistema** (`OverLimit`, `NoPermission`, `DataCorrupted`) y tener
   pantalla de diagnóstico OEM; al recortar por límite, priorizar lo crítico.
6. **Zona horaria explícita por plan** + `autoAdjustTimeZone` por política, y decisión del
   usuario al viajar.
7. **`secondValue`** para signos vitales de dos componentes (presión arterial).
8. **Cifrado por campo** con `encryption_version` para datos clínicos.
9. **`chp_record_relation`** como grafo: medicamento ↔ condición ↔ cita ↔ médico.
10. **Una sola unidad de snooze**: Medisafe tiene segundos en la nube y minutos en local —
    es una fuente real de bugs (§6.4).

### Evitar

1. Dos esquemas de alarma en paralelo (`alarm_tbl` + `AlarmEntity`).
2. Menú de debug en release.
3. `frequency` como string libre con valores mágicos.
4. Depender de `USE_EXACT_ALARM` sin *fallback* (Android 14+ restringe).
5. Guardar el plan como JSON opaco (`customScheduleJson`) sin esquema validado.

---

## 15. Apéndice — artefactos del análisis

Ruta real de los artefactos en esta máquina:
`C:\Users\rqqui\rea-targets\analysis\medisafe\` (herramientas en `...\analysis\tools\`).
Código descompilado: `analysis/medisafe/src2/` (modo estructurado, 190 archivos `.java`)
y `analysis/medisafe/src/` (primera pasada en modo fallback).

```
analysis/medisafe/
├── meta.json             # paquete, versión, 116 activities, 29 receivers, permisos, cert
├── manifest.xml          # manifiesto AXML decodificado
├── res.json              # 11 767 strings + 76 arrays de resources.arsc
├── tables.txt            # 105 CREATE TABLE + 72 índices + 269 ALTER
├── ddl_app.txt           # subconjunto de salud (CHP, alarms, trackers, citas, refill)
├── classes*.classes.jsonl# 58 000 clases con métodos, campos y strings por clase
├── classes*.methods.txt  # 369 133 firmas de método
└── classes*.strings.txt  # 7 pools de cadenas (≈ 419 000 entradas con duplicados)
```

Clases de referencia rápida:

| Tema | Clase |
|---|---|
| Plan de medicación | `com.medisafe.model.dataobject.ScheduleGroup` |
| Toma | `com.medisafe.model.dataobject.ScheduleItem` |
| Fármaco | `com.medisafe.model.dataobject.Medicine` |
| Medición | `com.medisafe.model.dataobject.MeasurementReading` |
| Alarmas | `com.medisafe.android.base.managealarms.model.Alarm` / `AlarmDao_Impl` |
| Generador de recordatorios | `com.medisafe.multiplatform.reminder.domain.services.ReminderNotificationGeneratorImpl` |
| Plantillas de notificación | `...reminder.domain.services.mustache.ReminderMustacheContext` |
| Reglas CHP | `com.medisafe.multiplatform.jiti.rule.*`, tabla `calculated_rule` |
| Políticas por fármaco | `com.medisafe.multiplatform.policy.medicine.*` (p. ej. `LeqembiIVMesMedicinePolicy`) |

