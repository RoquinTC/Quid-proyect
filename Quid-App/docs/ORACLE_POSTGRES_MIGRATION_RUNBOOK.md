# Migracion Oracle: SQLite custom.db a PostgreSQL

Este runbook es el procedimiento operativo para mover QUID en Oracle desde el
archivo `custom.db` hacia PostgreSQL en Docker sin borrar el origen.

## 1. Antes de tocar Oracle

En local debe estar verificado:

- `npm run lint`
- `npm test`
- `npm run build`
- `npm run db:sqlite:generate`
- `npm run db:postgres:generate`
- `npm run db:migrate:sqlite-to-postgres -- --dry-run`

Si cualquiera falla, no se migra Oracle.

## 2. Backup del SQLite real en Oracle

En el servidor, ubica el volumen donde está `custom.db`. Luego crea una copia
con fecha. Ejemplo conceptual:

```bash
mkdir -p ~/quid-backups
cp /ruta/real/custom.db ~/quid-backups/custom-$(date +%Y%m%d-%H%M%S).db
gzip -k ~/quid-backups/custom-*.db
```

No borres `custom.db`. Queda como respaldo histórico.

## 3. PostgreSQL productivo

El `docker-compose.yml` principal ya define:

- Servicio `postgres`
- Volumen persistente `quid-postgres-data`
- Servicio `quid-app` apuntando a `postgresql://...@postgres:5432/quid`

En Oracle, ajusta las variables reales en `.env`:

```env
POSTGRES_DB=quid
POSTGRES_USER=quid
POSTGRES_PASSWORD=usa-una-clave-larga
DATABASE_URL=postgresql://quid:usa-una-clave-larga@postgres:5432/quid?schema=public
AURA_MODEL=hermes3:8b
OLLAMA_URL=http://host.docker.internal:11434/api
```

## 4. Ensayo final

Primero levanta solo PostgreSQL y crea el schema:

```bash
docker compose up -d postgres
npm run db:postgres:push --prefix Quid-App
```

Ejecuta dry-run contra la copia de Oracle:

```bash
SQLITE_DATABASE_URL=file:/ruta/backup/custom.db \
POSTGRES_DATABASE_URL=postgresql://quid:clave@localhost:5432/quid?schema=public \
npm run db:migrate:sqlite-to-postgres --prefix Quid-App -- --dry-run
```

## 5. Migracion real

Hazlo en ventana corta:

```bash
docker compose stop quid-app
SQLITE_DATABASE_URL=file:/ruta/backup/custom.db \
POSTGRES_DATABASE_URL=postgresql://quid:clave@localhost:5432/quid?schema=public \
npm run db:migrate:sqlite-to-postgres --prefix Quid-App -- --reset
docker compose up -d --build quid-app
```

## 6. Validacion

Valida en la app:

- Login con usuario real.
- Finanzas: cuentas, saldos, gastos, presupuestos, recurrentes.
- Transporte: vehiculos, placa, tanqueos, documentos, mantenimientos.
- Salud: citas y medicamentos.
- Despensa: productos y listas.
- Inicio: Resumen y Planner.
- Ajustes: backup y Aura.

Valida en consola:

```bash
docker compose logs --tail=200 quid-app
docker compose logs --tail=200 postgres
```

Exito significa: sin errores 500, sin loops 429 en navegador y sin diferencias
visibles frente al SQLite respaldado.
