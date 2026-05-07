#!/bin/sh
set -e

echo "🚀 Iniciando Qapital App..."

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
  su-exec nextjs:nodejs node_modules/.bin/prisma db push --accept-data-loss --skip-generate 2>/dev/null || true
fi

echo "🌐 Iniciando servidor Next.js..."
exec su-exec nextjs:nodejs node server.js