# Módulo Salud — Tomas y recordatorios nativos (implementación)

> Continúa `MODULO_SALUD_REFERENCIA_COMPARADA.md`. Aquí está lo que se construyó,
> cómo migrarlo, cómo probarlo en el celular y qué queda pendiente.

Fecha: 2026-10-24

---

## 1. Qué se implementó

### 1.1 Modelo de datos (Prisma, en los **tres** esquemas)

| Modelo | Tabla | Rol |
|---|---|---|
| `DoseOccurrence` | `dose_occurrences` | La toma concreta: hora programada (inmutable) + hora real + estado |
| `MedicationStockEntry` | `medication_stock_entries` | Libro mayor de existencias: cada movimiento deja asiento |
| `UserSettings.therapyDayStartHour` | `user_settings` | Hora (0-23) a la que empieza el día lógico (default 4) |

Campos clave de `DoseOccurrence`:

```
scheduledAt   instante planificado (UTC)      ← nunca se sobrescribe
scheduledDay  "YYYY-MM-DD" del día lógico     ← agrupa sin pelearse con la zona
plannedDose   dosis prescrita
actualDose    dosis realmente tomada          ← "tomó 1 de 2"
status        pending | taken | skipped | missed | snoozed | dismissed
actedAt       cuándo actuó el usuario
snoozeCount   cuántas veces pospuso
source        scheduled | prn | external
```

Índices y unicidad: `@@unique([medicationId, scheduledAt])` (idempotencia de la
generación), más índices por `(userId, scheduledAt)`, `(userId, status, scheduledAt)`
y `(userId, scheduledDay)`.

**Se usan strings, no enums de Prisma**, para respetar la convención del proyecto
(ver `Medication.frequency`) y no romper el esquema SQLite.

### 1.2 Lógica de dominio (`src/lib/health/`)

| Archivo | Qué resuelve |
|---|---|
| `therapy-day.ts` | Día lógico configurable, `zonedInstant` (hora de pared → UTC), aritmética de días |
| `dose-status.ts` | Estados, transiciones permitidas, etiquetas, topes de snooze |
| `dose-scheduler.ts` | Generación de ocurrencias (recurrencia, bitmask, mensual, pre-4am) |
| `dose-actions.ts` | Tomar / omitir / posponer / descartar / reabrir + stock transaccional |
| `dose-queries.ts` | Listado de tomas del día y búsqueda de la toma accionable |
| `adherence.ts` | Adherencia, omisión vs olvido, retraso medio, racha |

Reglas implementadas (todas con prueba automática):

1. **Día lógico de 04:00**: una toma a la 01:30 pertenece al día anterior.
2. **Hora antes del corte** → cae en el calendario del día siguiente.
3. **`every_n_days`** anclado en `startDate`, no en "hoy".
4. **Mensual** con `min(díaInicio, últimoDíaDelMes)` → el 31 cae al 28/29 de febrero.
5. **`as_needed`** no genera ocurrencias (se registra a demanda).
6. **Cierre automático** solo de días anteriores a hoy, nunca del día en curso.

### 1.3 API

| Ruta | Método | Qué hace |
|---|---|---|
| `/api/doses` | GET | Tomas del rango (default hoy); antes genera faltantes y cierra vencidas |
| `/api/doses` | POST | Toma a demanda (PRN) |
| `/api/doses/[id]/action` | POST | `take` \| `skip` \| `snooze` \| `dismiss` \| `reopen` |
| `/api/health/adherence` | GET | Resumen de adherencia (`?days=7`) |
| `/api/medications/[id]/take` | POST | **Ahora registra la toma** (antes solo descontaba stock) |
| `/api/medications/[id]/stock` | POST | Reposición / corrección con asiento |

Los errores de negocio (toma cerrada, máximo de snoozes) devuelven **409**, no 500.

### 1.4 Notificaciones nativas (`src/lib/native/medication-reminders.ts`)

- Canal propio (`quid-doses-<hash>`) con **sonido configurable** (ver 1.7).
- `actionTypeId` con tres botones: **Tomar / Omitir / En 5 min**.
- `extra` lleva `route`, `occurrenceId` y la toma completa (para que el snooze
  funcione aunque no haya red).
- Sincronización idempotente: programa las abiertas y cancela las cerradas.

`native-device-bridge.tsx` ahora resuelve el `actionId`:

```
notificación (Tomar)   → POST /api/doses/:id/action {action:"take"} → cancela aviso
notificación (Omitir)  → POST … {action:"skip"}                      → cancela aviso
notificación (En 5 min)→ POST … {action:"snooze"} + reprograma local a +5 min
toque en el cuerpo      → abre /?tab=health&healthView=medications
```

### 1.5 Selector de sonido (nativo) — `QuidDoseSoundPlugin`

El primer sonido sintetizado quedó demasiado rápido (parecía un corto circuito), así
que el sonido ya no es fijo: **se puede elegir**.

Regla de Android que obliga al diseño: el sonido pertenece al **canal** y un canal es
**inmutable**. Por eso cada elección estrena canal (`quid-doses-<hash>`) y se borran los
anteriores; si no, quedarían canales duplicados en Ajustes.

Plugin Java (`android/.../QuidDoseSoundPlugin.java`, registrado en `MainActivity`):

| Método | Qué hace |
|---|---|
| `pickSound` | Abre el **selector de tonos del sistema** (`ACTION_RINGTONE_PICKER`) y devuelve `{uri, title, silent}` |
| `applyChannel` | Crea el canal con esa URI (`content://`, `android.resource://` o `"default"`) |
| `listChannels` / `deleteChannel` | Limpieza de canales viejos |
| `preview` / `stopPreview` | Escuchar antes de guardar |

Lado TypeScript (`src/lib/native/notification-sound.ts`):

- Preajustes incluidos: **Pastillero** (`pill_rattle.wav`), **Pastillero (sacudida)**
  (`pill_shake.wav`), **Campana suave** (`soft_chime.wav`).
- Opciones extra: **Sonido del sistema** y **Silencio**.
- **Elegir del teléfono…** → selector nativo, con el nombre real del tono.
- La preferencia se guarda en `localStorage`: el sonido es **por dispositivo**, no por cuenta.
- Si el APK es viejo y no tiene el plugin, cae al canal de Capacitor con archivo incluido.

UI en **Ajustes → Salud → Tomas e Inventario**: selector, botón *Probar* y nota de que
los avisos ya programados se actualizan al cambiar la opción.

Los tres audios se generan con `analysis/tools/make_sounds.py` (numpy + wave): golpes de
plástico secos, espaciado humano (145–260 ms), cuerpo grave y cola de reverberación corta.
Sin copyright.

### 1.6 Android

- `android/app/src/main/res/raw/`: `pill_rattle.wav` (128 KB), `pill_shake.wav` (88 KB),
  `soft_chime.wav` (106 KB).
- `QuidDoseSoundPlugin.java` + registro en `MainActivity`.
- Permisos añadidos al manifiesto: `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`,
  `VIBRATE`, `USE_EXACT_ALARM`.

### 1.7 Registro de datos

`data-registry.ts` (2 entradas nuevas) y `scripts/migrate-sqlite-to-postgres.mjs`
(orden después de `medication`/`user`) actualizados. El test del registro pasa 21/21.


### 1.8 Tarjeta de adherencia (`src/components/health/adherence-card.tsx`)

Montada en **Salud → Resumen**, debajo del widget de hidratación. Consume
`/api/health/adherence?days=7|30` y muestra:

- anillo de adherencia (`taken / evaluable`) con color por umbral (≥90 % verde, ≥75 % ámbar, resto rojo);
- desglose **tomadas / omitidas / no registradas**, con la etiqueta *decisión* vs *olvido*;
- pendientes de hoy;
- barra comparativa **omisión vs olvido**;
- racha actual, retraso medio y nº de tomas pospuestas;
- estado vacío explicativo cuando todavía no hay tomas cerradas.

Se refresca sola: `apiFetch` emite eventos en cada mutación y el bus ahora mapea
`/api/doses` → `doseOccurrences` (y `medications` ↔ `doseOccurrences` como relacionados),
así que confirmar una toma actualiza lista, stock y adherencia a la vez.

### 1.9 Overrides por fecha (`src/lib/health/dose-overrides.ts`)

Modelo `DoseOverride` (`dose_overrides`): `day` (día lógico "YYYY-MM-DD"),
`type` (`modify_time` | `modify_dose` | `skip_day`) y `payload` JSON.
Único por `(medicationId, day, type)`.

Regla tomada de MyTherapy: el override **no muta la recurrencia**. Se aplica al
planificar, así que el patrón base queda intacto y la excepción se puede borrar.

| Endpoint | Qué hace |
|---|---|
| `GET /api/medications/[id]/overrides?from&to` | Lista excepciones del rango |
| `POST /api/medications/[id]/overrides` | Crea/reemplaza la excepción y reconcilia el día |
| `DELETE /api/overrides/[id]` | Quita la excepción y vuelve al patrón base |

**Reconciliación:** al crear o borrar una excepción se recalculan **solo** las tomas
`pending`/`snoozed` de ese día. Las ya resueltas (`taken`, `skipped`, `missed`, `dismissed`)
no se tocan nunca: borrarlas sería falsear la adherencia.

UI: menú de cada toma pendiente en **Salud → Hoy → Ajustar solo este día…**
(`dose-override-dialog.tsx`), con las tres opciones, nota y lista de excepciones
guardadas para quitarlas.


---

## 2. Cómo aplicarlo

```bash
# 1. Base de datos (con Docker/Postgres levantado)
docker desktop start            # o abrir Docker Desktop
npm run db:push                 # aplica las tablas nuevas al Postgres de DATABASE_URL

# 2. Cliente Prisma (ya generado en esta sesión)
npm run db:generate

# 3. APK con el sonido y los permisos nuevos
npx cap sync android
npx cap open android            # o: cd android && ./gradlew assembleDebug
```

Verificación rápida:

```bash
npx tsc --noEmit                                   # 0 errores
npx vitest run src/__tests__/health-dose-scheduler.test.ts   # 15 pruebas
npx vitest run src/__tests__/data-registry.test.ts            # 21 pruebas
```

---

## 3. Cómo probarlo en el celular

1. Instalar el APK nuevo: el sonido, el **plugin nativo** y los permisos van compilados
   (no llegan con recarga web).
2. Aceptar el permiso de notificaciones (Android 13+ lo pide en runtime).
3. **Ajustes → Salud → Sonido del recordatorio**: probar los tres preajustes con *Probar*,
   y después *Elegir del teléfono…* para tomar un tono del sistema (o Silencio).
4. Agregar un medicamento con dos horarios, uno de ellos dentro de 2–3 minutos.
5. Bloquear el teléfono: debe sonar y mostrar los tres botones.
6. Probar cada botón y verificar en la app:
   - **Tomar** → la toma queda `taken`, el stock baja y aparece el asiento.
   - **Omitir** → queda `skipped` (cuenta como decisión, no como olvido).
   - **En 5 min** → vuelve a sonar a los 5 minutos.
7. En **Salud → Hoy** debe verse el estado real (tomada / omitida / no registrada) y el
   menú de cada toma con *Tomar*, *En 5 minutos*, *Omitir* y *Reabrir*.
8. Dejar una toma sin tocar y esperar el cambio de día lógico: pasa a `missed` sin tocar
   el día en curso.

---

## 4. Pendiente (siguiente fase)

| Tema | Estado |
|---|---|
| UI de la lista del día con acciones | **Hecho**: `today-schedule.tsx` usa `/api/doses` y el menú de acciones |
| Panel de adherencia en la UI | **Hecho**: `adherence-card.tsx` en Resumen (rangos 7/30 días) |
| Selector de sonido | **Hecho**: 3 preajustes + predeterminado + silencio + selector del teléfono |
| Perfil de salud desde el medicamento (Aura) | **Pendiente por decisión del usuario**: no tocar Aura todavía |
| Overrides por fecha (`DoseOverride`) | **Hecho**: modelo, API, reconciliación y diálogo en la lista del día |
| Entregas parciales + soportes en carpeta | Requiere SAF (`@capawesome/capacitor-file-picker`) para ruta elegida por el usuario |
| Sincronización de stock al confirmar orden | Pendiente, ya existe el libro mayor |
| Notificaciones de "día no completado" | Pendiente (equivalente a `OnNotClearedTodayOnDeadline`) |

### Notas de comportamiento Android

- **El sonido pertenece al canal**: por eso cada cambio crea un canal nuevo y borra el
  anterior. Si el usuario cambia el sonido en Ajustes del sistema para ese canal, Android
  lo respeta y la app no lo pisa.
- Un tono elegido del selector del teléfono se guarda como `content://…`; si el usuario
  borra ese archivo o cambia de dispositivo, el canal cae al sonido del sistema.
- Para que el aviso llegue con la pantalla bloqueada y en modo Doze, el canal usa
  importancia alta y `allowWhileIdle: true`. Aun así, algunos OEM (Xiaomi, Huawei)
  requieren que el usuario habilite "inicio automático".
- Con `USE_EXACT_ALARM` no se pide el permiso especial de "alarmas y recordatorios";
  si Play Store lo objetara, la alternativa es `SCHEDULE_EXACT_ALARM` (ya declarado)
  y una pantalla que lo solicite.

---

## 5. Estado de Aura frente al módulo Salud (verificado, sin modificar)

Pregunta del usuario: *¿Aura ya es capaz de hacer lo que se quiere en Salud?*
Revisado en el código el 2026-10-24. **Todavía no.**

| Capacidad | Estado real |
|---|---|
| Herramientas de **escritura** | Solo `registrar_transaccion` y `registrar_tanqueo` (`src/lib/aura/tools/registry.ts`) |
| Herramientas de salud | **Solo lectura**: `consultar_medicamentos`, `consultar_citas` |
| Ficha clínica del fármaco | `/api/ai/medication-info` la genera y la **devuelve**; no escribe en la base (0 `db.*.create/update`) |
| Crear `HealthCondition` desde un medicamento | **No existe** ninguna vía |
| Vincular condición ↔ medicamento (`medicationId`) | **No existe** |
| Leer tomas / adherencia | **No existe** herramienta (los datos ya existen desde esta implementación) |

Para habilitar el flujo pedido (registrar medicamento → Aura detecta la enfermedad →
usuario confirma o escribe → Aura marca condiciones como "en ayunas" o "con agua") faltan
tres piezas, en este orden:

1. **Tool de lectura** `consultar_adherencia` (días tomados/omitidos) para que Aura pueda
   responder sobre el tratamiento.
2. **Persistir la ficha** de `medication-info`: guardar `disease`/`howToTake` propuestos en
   `Medication` (hoy se descartan).
3. **Tool de escritura** de condición: crear `HealthCondition` con `origin = "ai_confirmed"`,
   `medicationId` y `profileId` (el enum y la relación ya existen en el esquema).

Eso queda **pendiente por decisión del usuario**; en esta implementación no se tocó nada
de `src/lib/aura/**` ni de `src/app/api/ai/**`.


