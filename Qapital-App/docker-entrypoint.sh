#!/bin/sh
set -e

echo "🚀 Iniciando Qapital App..."

# Initialize SQLite database if it doesn't exist
DB_PATH="/data/db/custom.db"

if [ ! -f "$DB_PATH" ]; then
  echo "📦 Base de datos no encontrada. Inicializando..."
  npx prisma db push
  echo "✅ Base de datos creada exitosamente."
else
  echo "✅ Base de datos existente encontrada."
  # Apply any pending schema changes
  npx prisma db push --accept-data-loss 2>/dev/null || true
fi

echo "🌐 Iniciando servidor Next.js..."
exec node server.js
