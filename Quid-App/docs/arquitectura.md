# Arquitectura de Quid

Mapa técnico. Para reglas de dinero, ver `reglas-dinero.md`.
Para la guía de trabajo del día a día, ver `../../AGENTS.md`.

---

## 1. Stack y forma de la app

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript strict |
| Datos | Prisma 6 sobre Postgres (producción y local) |
| UI | Tailwind v4 + componentes propios en `src/components/ui` |
| Estado | Zustand (`src/lib/store.ts`) + `useLocalQuery` para datos |
| Pruebas | Vitest 4 (852 pruebas en 55 archivos) |
| Móvil | Capacitor 8: **shell remoto**, `server.url` → producción |

La APK no lleva la app: abre producción dentro de un contenedor nativo. Por eso
una APK vieja muestra la versión nueva, y por eso el arreglo de un bug de UI no
requiere publicar APK.

---

## 2. Mapa de carpetas

```
Quid-App/
├─ prisma/
│  ├─ schema.prisma            ← esquema de desarrollo
│  ├─ schema.postgres.prisma   ← el que usa producción
│  └─ schema.sqlite.prisma     ← export móvil
├─ scripts/
│  ├─ sync-version.mjs         ← único camino para subir versión
│  ├─ migrate-sqlite-to-postgres.mjs
│  └─ build-mobile.mjs
├─ src/
│  ├─ app/                     ← rutas y API (App Router)
│  ├─ components/
│  │  ├─ finance/              ← el módulo más grande
│  │  ├─ layout/               ← shell, header, sidebar, tabs
│  │  └─ ui/                   ← primitivas
│  └─ lib/
│     ├─ finance/              ← TODOS los cálculos de dinero
│     ├─ debts/                ← catálogo y sincronización de deudas
│     ├─ aura/                 ← motor conversacional y herramientas
│     ├─ modules/registry.ts   ← módulos, acciones y ajustes
│     ├─ backup-crypto.ts      ← respaldo cifrado
│     ├─ pin-lock.ts           ← bloqueo local
│     └─ store.ts              ← estado global y tipos de vista
└─ docs/
   ├─ reglas-dinero.md
   ├─ arquitectura.md          ← este archivo
   └─ aura.md
```

---

## 3. Reglas de datos

**Tres esquemas Prisma en paralelo.** Los tres se cambian juntos:
`schema.prisma`, `schema.postgres.prisma`, `schema.sqlite.prisma`.

Si agregas un modelo, además:
1. `src/lib/data-registry.ts` — declara tabla, alcance y estrategia de respaldo.
2. `scripts/migrate-sqlite-to-postgres.mjs` — agrega el par `[clave, Modelo]`.

`data-registry.test.ts` falla si se olvida alguno.

**Migraciones:** no hay carpeta `migrations/`. El entrypoint del contenedor
corre `prisma db push --skip-generate` y luego migraciones idempotentes en Node.

**Trampa grave:** una tabla en Postgres que no esté en el esquema hace que
`db push` falle por pérdida de datos y el contenedor entre en **bucle de
reinicio**. Respalda a **archivo** (`pg_dump` a `backups/`), nunca a una tabla
temporal.

---

## 4. Cálculos de dinero

Viven en `src/lib/finance/` y están probados:

| Archivo | Qué resuelve |
|---|---|
| `available.ts` | total / disponible / apartado de las cuentas |
| `net-worth.ts` | patrimonio neto (activos − pasivos) |
| `project-plan.ts` | proyección de planes (aporte, meses, rango) |
| `plan-advisor.ts` | cuánto puedes aportar sin apretarte |
| `safe-to-spend.ts` | disponible del período con presupuestos y pagos |
| `monthly-report.ts` | KPIs, evolución y narrativa del mes |
| `insights.ts` | hallazgos accionables del período |
| `subscription-detector.ts` | detección de cobros recurrentes |
| `projection.ts` | proyección de saldo día a día |
| `running-balance.ts` | saldo corrido |
| `payment-dates.ts` | días hasta un pago y etiquetas |

**Ninguna vista suma saldos.** Si falta un cálculo, se crea aquí con pruebas.

---

## 5. Navegación

- **Módulos y acciones:** `src/lib/modules/registry.ts` es la fuente única; la
  hamburguesa y los ajustes se pintan con `.map()` sobre él.
- **Pestañas de Finanzas (F-54):** cuatro bloques en `finance-page.tsx` —
  Hoy (`overview`, `inbox`, `accounts`), Planear (`budgets`, `savings`, `cdts`,
  `recurring`), Deudas (`debts`), Análisis (`analysis`). Los `FinanceSubView`
  internos no cambiaron.
- **Enlaces profundos:** `app-deep-link-handler.tsx` lista las acciones válidas.

---

## 6. Verificación y despliegue

```bash
cd Quid-App
npx tsc --noEmit
npx vitest run

node scripts/sync-version.mjs --bump patch --notes "a|b"
cd .. && git add Quid-App/ && git commit -m "..." && git push origin main
ssh -i ~/.ssh/quid_oracle_codex.key ubuntu@157.137.231.170 \
  'cd ~/proyectos/quid-proyect && git pull --ff-only && docker compose up --build -d quid-app'
curl -s https://quid.roquintc.app/version.json
```

Sin el bump de versión el service worker sirve JS viejo.

---

## 7. Trampas conocidas

| Trampa | Qué pasa | Prevención |
|---|---|---|
| Editar JSX a ciegas | Bloques pegados en el componente equivocado | `edit` con anclas de texto; `tsc` después de cada cambio; verificar en pantalla |
| `@unique` nuevo en Prisma | `db push` se niega y tumba el contenedor | Nunca en columnas existentes; índice simple y validación en código |
| Rutas nuevas en `/api` | El proxy responde 401 antes del handler | Agregarlas a `PUBLIC_ROUTES` si se autentican solas |
| `localStorage` de widgets | El orden guardado tapa los valores nuevos | Subir la clave (`...-v2`) |
| Fechas `YYYY-MM-DD` | `new Date("2026-11-17")` es UTC y cae el 16 en Bogotá | `new Date(y, m-1, d)` |
| `build-mobile.mjs` | Mueve `src/app/api` a `api-backup`; si muere, deja la API secuestrada | Verificar que `src/app/api` exista y no haya `api-backup` |
| Tablas sueltas en Postgres | Bucle de reinicio en producción | Respaldo a archivo; `drop table` y reiniciar `quid-app` |
| Opciones de menú que "no aparecen" | Se agregó el import pero no el ítem visible | Revisar en pantalla, no solo que compile |
