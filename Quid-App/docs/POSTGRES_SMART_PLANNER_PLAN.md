# Plan de accion: PostgreSQL, Smart Planner y descubrimiento

## 1. PostgreSQL local

Se agrego un contenedor PostgreSQL local en `docker-compose.postgres.yml`.

Para levantarlo desde `F:\Proyectos\Quid-proyect`:

```powershell
npm run postgres:up
```

Para crear las tablas PostgreSQL desde el schema paralelo:

```powershell
cd F:\Proyectos\Quid-proyect\Quid-App
$env:POSTGRES_DATABASE_URL="postgresql://quid:quid-local-dev@localhost:5432/quid?schema=public"
npm run db:postgres:push
```

## 2. Migracion de SQLite a PostgreSQL

Se agregaron dos schemas paralelos:

- `prisma/schema.sqlite.prisma`: lee SQLite como origen.
- `prisma/schema.postgres.prisma`: escribe PostgreSQL como destino.

Primero genera los clientes:

```powershell
npm run db:sqlite:generate
$env:POSTGRES_DATABASE_URL="postgresql://quid:quid-local-dev@localhost:5432/quid?schema=public"
npm run db:postgres:generate
```

Para auditar la DB SQLite sin escribir nada:

```powershell
$env:POSTGRES_DATABASE_URL="postgresql://quid:quid-local-dev@localhost:5432/quid?schema=public"
npm run db:migrate:sqlite-to-postgres -- --dry-run
```

Para migrar a PostgreSQL local y limpiar antes el destino:

```powershell
$env:POSTGRES_DATABASE_URL="postgresql://quid:quid-local-dev@localhost:5432/quid?schema=public"
npm run db:migrate:sqlite-to-postgres -- --reset
```

## 3. Validacion en la app

Cuando la app este corriendo, entra a:

```text
http://localhost:3000
```

Despues de iniciar sesion, ve a `Inicio`.

Deberias ver:

- Una nueva tarjeta llamada `Radar de Quid`.
- Eventos de pagos recurrentes, ingresos programados, citas, documentos, mantenimientos, tanqueos proyectados o despensa si existen datos proximos.
- En pagos recurrentes y citas, botones para confirmar la accion.

## 4. Tutorial por descubrimiento

El tutorial no reemplaza el onboarding inicial. Es una guia suave y contextual.

En la app:

- Ve a `Inicio`, `Finanzas`, `Transporte`, `Salud` o `Despensa`.
- Si hay funciones sin descubrir, aparecera una tarjeta flotante cerca de la parte inferior.
- Puedes pulsar el boton principal para ir a la accion sugerida.
- Puedes pulsar `Luego` o la `X` para ocultar esa pista.

## 5. Antes de Oracle

No ejecutar la migracion en Oracle hasta completar este checklist:

1. Hacer backup del volumen Docker actual donde esta `custom.db`.
2. Copiar ese `custom.db` a local.
3. Ejecutar `--dry-run` con esa copia.
4. Migrar a PostgreSQL local con `--reset`.
5. Comparar conteos tabla por tabla.
6. Abrir la app local apuntando a PostgreSQL y revisar login, finanzas, pagos recurrentes, backups y ajustes.
7. Solo entonces programar ventana de migracion en Oracle.
