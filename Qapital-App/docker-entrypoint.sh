#!/bin/sh
set -e

echo "🚀 Iniciando Quid App..."

# Fix permissions on database directory (may be owned by root if volume was seeded externally)
echo "🔧 Verificando permisos de /data/db..."
chown -R nextjs:nodejs /data/db 2>/dev/null || true
chmod -R 775 /data/db 2>/dev/null || true

# Initialize SQLite database if it doesn't exist
DB_PATH="/data/db/custom.db"

if [ ! -f "$DB_PATH" ]; then
  echo "📦 Base de datos no encontrada. Inicializando..."
  su-exec nextjs:nodejs node_modules/.bin/prisma db push --skip-generate
  echo "✅ Base de datos creada exitosamente."
else
  echo "✅ Base de datos existente encontrada."
  # Apply any pending schema changes (skip-generate because client was built in Docker build stage)
  echo "🔄 Sincronizando schema con la base de datos..."
  if su-exec nextjs:nodejs node_modules/.bin/prisma db push --accept-data-loss --skip-generate; then
    echo "✅ Schema sincronizado."
  else
    echo "⚠️  Error sincronizando schema. Intentando migrate deploy..."
    su-exec nextjs:nodejs node_modules/.bin/prisma migrate deploy || echo "⚠️  migrate deploy también falló. Continuando..."
  fi
fi

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