#!/bin/sh
set -e

echo "🚀 Iniciando Quid App..."

# Fix permissions on database directory (may be owned by root if volume was seeded externally)
echo "🔧 Verificando permisos de /data/db..."
chown -R nextjs:nodejs /data/db 2>/dev/null || true
chmod -R 775 /data/db 2>/dev/null || true

case "$DATABASE_URL" in
  postgresql://*|postgres://*)
    echo "🐘 PostgreSQL detectado. Sincronizando schema..."
    su-exec nextjs:nodejs node_modules/.bin/prisma db push --skip-generate
    echo "✅ Migraciones PostgreSQL aplicadas."
    ;;
  *)
    # Initialize SQLite database if it doesn't exist
    DB_PATH="/data/db/custom.db"

    if [ ! -f "$DB_PATH" ]; then
      echo "📦 Base de datos SQLite no encontrada. Inicializando..."
      su-exec nextjs:nodejs node_modules/.bin/prisma db push --skip-generate
      echo "✅ Base de datos SQLite creada exitosamente."
    else
      echo "✅ Base de datos SQLite existente encontrada."
      # Apply additive schema changes only. Never use --accept-data-loss at startup.
      echo "🔄 Sincronizando schema SQLite con la base de datos..."
      if su-exec nextjs:nodejs node_modules/.bin/prisma db push --skip-generate; then
        echo "✅ Schema SQLite sincronizado."
      else
        echo "⚠️  Error sincronizando schema SQLite sin pérdida de datos."
        echo "⚠️  Revisa y ejecuta una migración manual antes de continuar."
        exit 1
      fi
    fi
    ;;
esac

echo "🌐 Iniciando servidor Next.js..."

# ── Data migration: set paymentType for existing loans ──
echo "🔄 Migrando préstamos existentes (paymentType)..."
su-exec nextjs:nodejs node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.debt.updateMany({
  where: { type: 'loan', paymentType: null, monthlyPayment: { not: null } },
  data: { paymentType: 'fixed' }
}).then(r => {
  console.log('✅ Préstamos migrados:', r.count);
  prisma.\$disconnect();
}).catch(e => {
  console.log('⚠️  Migración omitida:', e.message);
  prisma.\$disconnect();
});
" 2>/dev/null || echo "⚠️  Migración de paymentType omitida."

exec su-exec nextjs:nodejs node server.js
