# AGENTS.md — Quid

Guía para quien retome este proyecto. Léela completa antes de tocar código:
son ~200 líneas que ahorran horas de redescubrimiento.

---

## 1. Qué es esto

**Quid** es una app de finanzas personales (Colombia). Web + Android.

| | |
|---|---|
| Stack | Next.js 16 (App Router), React 19, TypeScript strict, Prisma 6, Tailwind v4, Zustand, Zod 4, Vitest 4 |
| Móvil | Capacitor 8 (requiere Node ≥ 22) |
| Producción | `https://quid.roquintc.app` (túnel Cloudflare) |
| Servidor | Oracle `ubuntu@157.137.231.170`, repo en `~/proyectos/quid-proyect` |
| Local | Docker: `quid-app` (:3000), `quid-cron`, `quid-postgres` |
| Repo | `github.com/RoquinTC/Quid-proyect` |

**La app móvil es un shell remoto:** `capacitor.config.json` apunta
`server.url` a producción. El contenido (pantallas, lógica) siempre viene del
servidor; la APK solo aporta el contenedor y los plugins nativos. Por eso una
APK vieja sigue mostrando la versión nueva.

---

## 2. Orden de lectura (lo que importa, en orden)

1. **Este archivo.**
2. `docs/finanzas-backlog-mapa.md` — el mapa maestro de 51 ideas (F-01…F-51)
   con prioridad, tamaño, dependencias y estado. **Está sin rastrear en git
   a propósito** (ver §7). Si no existe en tu copia, pídelo al usuario.
3. `docs/finanzas-rea-maestro-v3.md` — análisis de apps de la competencia.
   **Solo inspiración**, nunca clonar.
4. `prisma/schema.prisma` — la verdad del modelo de datos (y sus gemelos
   `schema.postgres.prisma`, `schema.sqlite.prisma`, ver §6).
5. `src/lib/modules/registry.ts` — fuente única de módulos, acciones y
   secciones de ajustes.
6. `src/components/finance/finance-page.tsx` — las pestañas del módulo.

No empieces por los componentes grandes sin leer lo anterior:
`finance-overview.tsx` y `accounts-view.tsx` pasan de 1.500 líneas.

---

## 3. Arrancar

```bash
cd Quid-App
npm install
docker compose up --build -d quid-app     # local en http://localhost:3000
npx vitest run                            # 785 pruebas
npx tsc --noEmit                          # tipos
```

**Cada cambio de versión se hace con el script, nunca a mano:**

```bash
node scripts/sync-version.mjs --bump patch --notes "texto|otra línea"
```

Ese script actualiza `package.json`, `sw.js`, `release-notes.json`,
`version.json` y `android/app/build.gradle`.

---

## 4. Desplegar

```bash
# 1. bump de versión (obligatorio si cambió el front)
cd Quid-App && node scripts/sync-version.mjs --bump patch --notes "..."

# 2. commit + push
cd .. && git add Quid-App/ && git commit -m "..." && git push origin main

# 3. servidor
ssh -i ~/.ssh/quid_oracle_codex.key ubuntu@157.137.231.170 \
  'cd ~/proyectos/quid-proyect && git pull --ff-only && docker compose up --build -d quid-app'

# 4. verificar
curl -s https://quid.roquintc.app/version.json | head -c 40
```

**Sin el bump de versión el service worker sirve JS viejo.** No es opcional.

**La APK se publica sola:** el workflow `.github/workflows/android-apk.yml`
compara la versión de `package.json` con los releases y publica el que falte
en cada push a `main`. No hace falta crear tags.

---

## 5. Trampas que ya costaron tiempo

| Trampa | Qué pasa | Prevención |
|---|---|---|
| **Editar JSX por número de línea** | Inserté bloques en el componente equivocado y rompí el archivo 3 veces | Usa la herramienta `edit` con anclas de texto exactas; lee el bloque completo antes de envolverlo; `npx tsc --noEmit` después de **cada** cambio |
| `@unique` nuevo en Prisma | `db push` se niega sin `--accept-data-loss` y el contenedor entra en bucle de reinicio (**tumba producción**) | Nunca agregues `@unique` a una columna existente. Usa índice simple y valida en código. **Nunca** pases `--accept-data-loss` |
| Rutas nuevas en `/api` | El proxy (`src/proxy.ts`) devuelve 401 antes de llegar al handler | Si la ruta se autentica sola (token propio), agrégala a `PUBLIC_ROUTES` |
| `localStorage` de widgets | El orden guardado tapa los valores por defecto nuevos | Al cambiar el orden/visibilidad por defecto, sube la clave (`...-v2`) |
| Fechas `YYYY-MM-DD` | `new Date("2026-11-17")` se interpreta UTC y en Bogotá cae el 16 | Construye con `new Date(y, m-1, d)` |
| `build-mobile.mjs` | Mueve `src/app/api` → `api-backup` durante el export; si muere a medias, deja la API secuestrada | Verifica que `src/app/api` exista y que no haya `api-backup` |
| Datos de dinero | En producción hay transacciones **reales** del usuario | Nunca borres datos sin respaldo; informa antes |
| **Tablas sueltas en Postgres** | Crear una tabla que no esté en `schema.prisma` hace que `db push` (entrypoint) falle por "data loss" y el contenedor entra en **bucle de reinicio: producción cae** | Respalda a **archivo** (`pg_dump` a `backups/`), nunca a una tabla temporal. Si ya existe, `drop table` y reinicia `quid-app` |
| Credenciales | La app no guarda contraseñas de correo | Usa tokens por usuario, nunca IMAP con password |

---

## 6. Reglas de datos

**Tres esquemas Prisma en paralelo**, los tres deben cambiarse juntos:
`schema.prisma`, `schema.postgres.prisma`, `schema.sqlite.prisma`.

Si agregas un modelo, además:
1. `src/lib/data-registry.ts`
2. `scripts/migrate-sqlite-to-postgres.mjs`

Hay una prueba que falla si lo olvidas (`data-registry.test.ts`).

**Migraciones:** el entrypoint del contenedor corre `prisma db push
--skip-generate` y luego migraciones idempotentes en Node. No hay carpeta
`migrations/` para Postgres.

---

## 7. `docs/` está sin rastrear a propósito

Contiene el análisis REA de APKs de terceros (competencia). **No lo subas a
GitHub.** Al `git add`, usa rutas concretas:

```bash
git add Quid-App/            # sí
git add .                    # NO — arrastra docs/
```

---

## 8. Principios de trabajo del dueño

- Trabajo **por fases**, con verificación local antes de desplegar.
- Quiere saber **el comando exacto** y **qué cambio visible** esperar.
- Prefiere explicaciones en texto plano, honestas: si algo falló, decirlo.
- **Nunca** borrar datos en silencio.
- Nunca publicar montos o nombres de cuentas reales en resúmenes.
- La inspiración de otras apps es para **mejorar**, no para copiar.

---

## 9. Estado al 2026-11-07

| | |
|---|---|
| Versión producción | ver `/version.json` (al cierre de esta sesión: **1.1.43**) |
| Último commit | ver `git log -1` (no lo fijes aquí, se desactualiza) |
| Pruebas | 804 en 47 archivos |

**Fases 0, 1 y 2 completas.** Fase 3 en curso.

Entregado en las últimas sesiones:
- F-49 Bandeja de capturas (SMS, correo, pegado) con clasificador y duplicados
- F-01 Captura por SMS opt-in · F-22 Captura por correo con token
- F-36 Reglas texto → categoría/cuenta
- F-41 Proyección del saldo (punto más ajustado)
- F-51 Decimales + F-51b máscara de miles en los montos
- Reestructura: 19 widgets duplicados → Resumen (3) + Cuentas (4) + Análisis (nuevo)
- Ajustes agrupados en GENERAL / MÓDULOS / SISTEMA
- `src/lib/modules/registry.ts` creado
- Recordatorios: un solo motor (`src/lib/reminders/engine.ts`). Las fechas se
  comparan por clave `YYYY-MM-DD` (nunca restando milisegundos) y cada aviso
  suena al cambiar de tramo —30 · 7 · 1 · 0 · vencido—, no todos los días.
- **F-10 · hallazgos del período**: `src/lib/finance/insights.ts` (reglas puras)
  + `/api/finance/insights` + panel en Análisis. Seis tarjetas accionables:
  tasa de ahorro, ritmo de gasto, categoría que subió, presupuestos, gasto más
  grande y categoría que bajó.
- **F-09 · reporte mensual**: `lib/finance/monthly-report.ts` (modelo y
  narrativa) + `/api/finance/monthly-report` + hoja en Análisis. KPIs con
  cambio, evolución de 6 meses, dona de distribución, tablas de gasto e
  ingreso y los hallazgos de F-10. Se comparte como texto y como **imagen PNG**
  (`html-to-image`, cargado en diferido: comparte el archivo o lo descarga).
- **F-23 · suscripciones**: `lib/finance/subscription-detector.ts` (cobros
  mensuales repetidos: mismo comercio normalizado, intervalo 25–35 días y monto
  estable) + `/api/finance/subscriptions/detect` y `/dismiss` + cápsula en
  Análisis. Al crear se elige gasto / ingreso / transferencia y se reusa
  `POST /api/recurring`. El descarte vive en `subscription_suggestion_dismissals`
  (base, no dispositivo) para que valga en todos los equipos.
- **Aura con más herramientas (base de F-21)**: **55 herramientas** en
  `lib/aura/tools/` (29 lectura, 26 escritura), cubriendo los cuatro módulos y
  los datos transversales (listas, recetas, salud, logros, compartidas,
  movimientos de despensa, autorizaciones). Todas las escrituras van por
  propuesta + confirmación. El `userId` lo resuelve el servidor (sesión o
  `x-aura-token` + `telegramId`) y nunca se acepta del cliente; hay test de
  aislamiento entre usuarios. **Único flujo sin exponer a propósito:** pagar la
  cuota de una tarjeta con interés/ciclo (vive en `/api/debts/[id]/pay`).
- **Chat de Aura en la app** (`components/aura/aura-chat.tsx`): botón flotante
  sobre la barra inferior, hoja de conversación con preguntas rápidas, y las
  propuestas de escritura llegan como tarjeta con **Confirmar / Cancelar**.
  Usa el mismo motor que Telegram (`/api/aura/chat`) y el mismo gateway de
  confirmación (`/api/aura/tools/confirm`), así que no hay un segundo camino de
  escritura.
- **Aura en Telegram (radar diario)**: `GET /api/aura/digest` arma el mensaje
  del día (pagos pendientes + citas) y devuelve `items` con el **id** de cada
  pago, para que el bot pueda pintar botones. Es idempotente por día
  (`appNotification` tipo `aura_daily_digest`). La confirmación desde Telegram
  usa `POST /api/recurring/{id}/confirm` con `x-aura-token` + `telegramId`: el
  usuario se resuelve en la base y la lógica de dinero es **la misma** de la app
  (no hay un segundo camino). Ese cambio además corrigió un `Decimal` que
  entraba como `any` en `confirmedAmount`.

- **F-30 · privacidad de montos (parcial)**: botón de ojo en el encabezado,
  `lib/privacy-mode.ts` (estado en `localStorage`) y la clase `quid-money` que
  el CSS difumina cuando `<html>` tiene `quid-hide-amounts`. Ya aplicada al
  tablero (balance, ingresos, gastos). **Pendiente:** marcarla en el resto de
  pantallas (cuentas, deudas, presupuestos, análisis, reporte).

- **F-17 · respaldo cifrado**: `lib/backup-crypto.ts` cifra el export completo
  con AES-256-GCM y llave derivada por PBKDF2-SHA256 (200.000 vueltas, sal e IV
  por archivo). El archivo `.quid` se descarga o se comparte desde el menú de
  usuario; la contraseña nunca se guarda ni sale del dispositivo. El descifrado
  para **restaurar** ocurre en el teléfono y el import pide confirmación en dos
  toques (reemplaza los datos de la cuenta).
- **F-16 · bloqueo con PIN**: `lib/pin-lock.ts` guarda solo el **hash** SHA-256
  del PIN en el dispositivo (nunca en la base ni en el servidor) y bloquea al
  abrir la app o tras 3 minutos de inactividad. El menú de usuario abre
  "Bloqueo con PIN". La biometría queda pendiente: exige instalar un plugin
  nativo y reconstruir la APK.
- **Catálogo de tipos de deuda** (`lib/debts/debt-types.ts`): ocho tipos —
  tarjeta de crédito, tarjeta de tienda, personal/libre inversión, vehículo,
  hipoteca, educativo, informal y "otra"— y cada uno declara su
  **comportamiento**: `revolving` (corte, pago = transferencia), `installment`
  (cuotas, interés, pago = gasto) u `open_balance` (saldo sin cuotas). El resto
  del código pregunta por el comportamiento (`isInstallmentDebt`,
  `isRevolvingDebt`), no por el nombre; los valores históricos `loan` y `other`
  siguen funcionando por alias. Sin migración: `debt.type` es texto.

**Bugs corregidos:**

- **Reverso de pago en deudas** (`/api/debts/[id]/reverse-pay`): el pago deja
  `remainingBalance = 0`, y el reverso no lo restauraba; la cuota volvía como
  "pagada" con pendiente $0 y no se podía cobrar otra vez (solo se notaba en
  préstamos, donde el capital pendiente vive en ese campo). Ahora el reverso
  devuelve el capital, y en préstamos lo iguala al saldo de la deuda.
  `reverse-abono` ya lo hacía bien.

**Pendiente técnico (importante):**

1. **Extraer el pago de cuota de deuda** a `lib/finance/debt-payment.ts` para
   que la ruta `/api/debts/[id]/pay` y Aura usen el mismo código. Hoy ese flujo
   (606 líneas, intereses, ciclos, presupuestos) **no tiene pruebas** y no se
   expuso a Aura a propósito. Plan acordado: pruebas de caracterización primero,
   extracción mecánica después, y verificar que las pruebas pasan **sin
   cambios**.

**Pendiente funcional, en este orden:**

1. ✅ **Hamburguesa cableada al registro** (2026-11-07) — `app-sidebar.tsx`
   ya hace `.map()` sobre `QUID_MODULES`; cada módulo abre con "Abrir ⟨módulo⟩"
   y sus acciones agrupadas por verbo (CREAR / REGISTRAR / GESTIONAR). El
   registro ahora tipa `id` contra `ModuleType` y `SidebarAction`, así que una
   acción nueva no compila si ninguna página la atiende.
2. ✅ **Ajustes cableado al registro** (2026-11-07) — `settings-page.tsx`
   arma las 7 tarjetas con `.map()` sobre `APP_SETTINGS_SECTIONS` agrupado por
   `group`. La tarjeta (icono, gradiente, borde, ancho, solo-admin) vive en el
   registro, y `Record<SettingsSectionId, …>` obliga a que toda sección nueva
   tenga su pantalla.
3. ✅ **Ajustes plegados** (2026-11-07) — Finanzas pasa de 4 filas (una con 8
   bloques dentro) a **7 filas de un tema cada una**: Ciclo y fechas ·
   Presentación · Captura automática · Corte y reinicio · Cuentas · Categorías
   · Importación. Generales: "Personalización" (5 tarjetas) se parte en
   "Apariencia" y "Alertas en la app"; quedan 7 filas. Transporte ya tenía una
   fila por tema (5). Salud 3, Despensa 2, Aura 4.
4. **Portada de Análisis** — el donut de "dónde se va la plata", en pesos.
5. **Consejos con IA** — Aura redacta sobre cifras que Quid calcula
   (nunca al revés). Puente existente: `/api/aura/tools` con `x-aura-token`.

---

## 10. Verificar antes de decir "listo"

```bash
cd Quid-App
npx tsc --noEmit          # obligatorio
npx vitest run            # obligatorio
git status --porcelain    # que no queden restos
```

Y si el cambio es visual, **míralo**: el teléfono del dueño se conecta por
USB (`adb`) y produce capturas reales. No declares una pantalla arreglada sin
haberla visto.

---

## 11. Roadmap por fases

Del mapa (`docs/finanzas-backlog-mapa.md` §4). **Ya no inventes el orden: está fijado.**

### ✅ FASE 0 — "Una tarde cada una" · COMPLETA
`F-29` edición solo-este/futuros · `F-42` ciclo presupuestal + quincena ·
`F-03` calculadora en el alta · `F-45` saldo corrido · `F-51` preferencias
(decimales, inicio de semana)

### ✅ FASE 1 — "El núcleo del HOY" · COMPLETA
`F-39` separar Gasto de Pago · `F-28` instancias de recurrentes ·
`F-06` vencidos vs próximos · `F-43` grupos de categorías ·
`F-05` Safe to Spend · `F-38` anatomía del disponible

### ✅ FASE 2 — "Captura sin fricción" · COMPLETA
`F-49` bandeja unificada · `F-01` SMS opt-in · `F-22` correo con token ·
`F-36` reglas texto→categoría · `F-41` proyección del saldo ·
`F-02` voz → **ya cubierta por Aura** (Whisper en Telegram, verificado)

Pendiente menor de esta fase: `F-04` onboarding de permisos.

### 🔄 FASE 3 — "Que valga volver" · EN CURSO
Añadido por el dueño, fuera del mapa: **rediseño de menús** (§12).
Después, en el orden del mapa:

| | Idea | Nota |
|---|---|---|
| 1 | ✅ `F-10` Insights | Hecho: 6 hallazgos accionables en Análisis (`lib/finance/insights.ts`) |
| 2 | ✅ `F-09` Reporte mensual | Hecho: KPIs, 6 meses, dona, tablas y narrativa; compartir texto o **imagen PNG** |
| 3 | ✅ `F-23` Suscripciones | Hecho: cápsula en Análisis con candidatos detectados; crea el recurrente eligiendo gasto/ingreso/transferencia; descarte en base |
| 4 | 🔄 `F-21` Chat IA con acciones | **Chat + 29 lecturas + 26 escrituras**. Solo falta exponer el pago de cuota de tarjeta con interés/ciclo |
| 5 | 🔄 `F-30` Privacidad de montos | Hecho en tablero, deudas, cuentas y presupuestos. **Análisis y reporte no aplican bien**: los montos van dentro de frases y del PNG exportado, donde el CSS no llega |
| 6 | ✅ `F-16` PIN | Bloqueo con PIN local (`lib/pin-lock.ts`), se activa desde el menú de usuario. Biometría **no**: falta plugin nativo y recompilar APK |
| 7 | ✅ `F-17` Respaldo cifrado | `lib/backup-crypto.ts` (AES-256-GCM + PBKDF2 200k); crear y **restaurar** `.quid` desde el menú de usuario (el restore pide confirmación en dos toques) |

Sueltos al final de la fase: `F-32` portapapeles · `F-44` bolsillos ·
`F-47` naturalezas de cuenta. **`F-33` hecho**: `components/layout/release-notes.tsx`
lee `public/release-notes.json` y muestra las novedades; se abre una sola vez
por versión (marca en `localStorage`) y desde el menú de usuario.

**Nota de esa entrega:** los ítems del menú de usuario para PIN y respaldo se
habían agregado solo como imports, sin la entrada visible. En 1.1.57 el menú
quedó completo (Novedades · Respaldo cifrado · Bloqueo con PIN · Cerrar sesión).
Si se agrega una opción ahí, **verificar en pantalla** que aparece.

### ⏳ FASE 4 — "Diferenciación"
`F-24` patrimonio neto → `F-25` préstamos/me deben → `F-26`/`F-27` pareja y
workspaces → `F-50` viajes → `F-13` recurrencia granular → `F-12` multi-moneda
→ `F-14` ledger verificable → `F-11` widgets de inicio

**F-24 · patrimonio neto (hecho)**: `lib/finance/net-worth.ts` (función pura),
`/api/finance/net-worth` y tarjeta en Análisis + tablero. Activos = cuentas +
ahorros + CDT (capital + interés); pasivos = deudas; el neto se muestra con
"Tienes" y "Debes". Falta el histórico (evolución mes a mes).

**F-25 · préstamos entre personas (hecho)**: modelo `PersonLoan`
(`person_loans`) con `direction` (`lent` = me deben · `borrowed` = debo),
monto, abonos y estado. API `/api/person-loans` (listar con totales y crear) y
`/api/person-loans/[id]` (abonar/saldar, borrar). Tarjeta en Análisis. No se
mezcla con las deudas de banco: sin corte, ciclo ni cuotas. Falta el histórico
de abonos por persona y llevarlo al patrimonio neto como activo/pasivo.

### ⏳ FASE 5 — "Largo plazo"
`F-19` contrato de datos para agentes · `F-34` simulación premium ·
`F-37` infra de producto

### Decisión cerrada
`F-15` unidades menores → **no migrar**. Los montos se guardan como están.

---

## 12. Rediseño de menús (en curso, pedido del dueño)

**Motivo:** el menú hamburguesa y los ajustes se armaban con listas escritas
a mano en cada archivo, y se desincronizaron. Finanzas terminó dentro de
"TU CUENTA" aunque es un módulo completo. Además, la hamburguesa solo ofrece
acciones de *crear*, sin ninguna de *ir al módulo*.

**Principio:** una sola fuente de verdad, abierta a futuro. Agregar un módulo
(Viajes, Inversiones, Pareja) debe ser **agregar una entrada**, no editar tres
archivos.

### Hecho
- `src/lib/modules/registry.ts` — 5 módulos, 18 acciones (con icono y verbo),
  7 secciones de ajustes, 9 pruebas de invariantes.
- Ajustes agrupado: **GENERAL** (generales, Aura) · **MÓDULOS** (Finanzas,
  Transporte, Salud, Despensa) · **SISTEMA** (administración).
- Finanzas salió de "tu cuenta" y quedó donde corresponde.
- **Hamburguesa cableada al registro** (`app-sidebar.tsx`, 2026-11-07): se
  borraron las ~130 líneas de lista escrita a mano. Cada módulo abre con
  "Abrir ⟨módulo⟩" y sus acciones agrupadas por verbo. El registro tipa `id`
  contra `ModuleType` y `SidebarAction`: una acción nueva no compila si ninguna
  página la atiende.
- **Ajustes cableado al registro** (`settings-page.tsx`, 2026-11-07): las 7
  tarjetas se pintan con `.map()` sobre `APP_SETTINGS_SECTIONS` agrupado por
  `group`. Icono, gradiente, borde, ancho y "solo admin" viven en el registro.
  El título y el subtítulo de cada pantalla salen de `label`/`hint` (ya no hay
  ocho ternarios ni un `if` por pestaña). `Record<SettingsSectionId, …>` impide
  agregar una sección sin pantalla: no compila.
- **Ajustes plegados** (`finance-settings.tsx`, `general-settings.tsx`,
  2026-11-07): cada tema tiene su propia fila plegable.
  Finanzas: 4 filas → **7** (Ciclo y fechas · Presentación · Captura automática
  · Corte y reinicio · Cuentas · Categorías · Importación). La fila "Ciclo"
  tenía 8 tarjetas dentro; ahora ninguna fila pasa de tres.
  Generales: "Personalización" (5 tarjetas) → "Apariencia" + "Alertas en la
  app"; quedan 7 filas. Transporte ya estaba bien (5 filas); Salud 3,
  Despensa 2, Aura 4.

### Pendiente (cosmético, no urgente)
1. **Quitar la tarjeta anidada** dentro de cada fila: al abrir una fila se ve
   una `Card` dentro de la `Card` del acordeón (borde doble). Recortarlo no
   cambia la estructura, solo el acabado.

### Objetivo visual
Cada pestaña de módulo con la misma estructura:

```
▸ Ciclo y fechas
▸ Captura automática       (SMS · correo · reglas)
▸ Presentación             (decimales · inicio de semana)
▸ Cuentas e importación
▸ Categorías
```

Y la hamburguesa:

```
Finanzas ▸
   CREAR       Nueva Transacción · Cuenta · Presupuesto · Meta · Deuda · CDT · Pago
   GESTIONAR   Categorías
```

### Lo que NO se toca
El dueño decidió **mantener dos menús** (hamburguesa = trabajar, ajustes =
configurar). No unificar en uno. Solo hay que hacer evidente la diferencia.
