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

# ── Data migration: give every existing recurring payment its own series ──
# Antes, "eliminar toda la serie" emparejaba por descripción + tipo + frecuencia,
# lo que borraba otros pagos distintos con el mismo nombre. Ahora la serie tiene
# identidad propia (seriesId). Las filas antiguas reciben seriesId = su propio id:
# cada una queda como su propia serie, sin fusionar nada por error.
echo "🔄 Inicializando series de pagos recurrentes (seriesId)..."
su-exec nextjs:nodejs node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  // 1) Nómina: TODAS las ocurrencias de un grupo comparten la serie del grupo.
  //    (El borrado/edición de serie prioriza seriesId, así que si cada fila de
  //    nómina quedara con su propio id, 'toda la serie' dejaría de funcionar.)
  const payrollRows = await prisma.recurringPayment.findMany({
    where: { payrollGroupId: { not: null } },
    select: { id: true, payrollGroupId: true, seriesId: true },
  });
  let payrollFixed = 0;
  for (const row of payrollRows) {
    if (row.seriesId !== row.payrollGroupId) {
      await prisma.recurringPayment.update({
        where: { id: row.id },
        data: { seriesId: row.payrollGroupId },
      });
      payrollFixed++;
    }
  }

  // 2) Resto: cada fila sin serie es su propia serie (sin fusionar nada).
  const rows = await prisma.recurringPayment.findMany({
    where: { seriesId: null },
    select: { id: true },
  });
  let updated = 0;
  for (const row of rows) {
    await prisma.recurringPayment.update({
      where: { id: row.id },
      data: { seriesId: row.id },
    });
    updated++;
  }
  console.log('✅ Series inicializadas:', updated, '| Nómina agrupada:', payrollFixed);
  await prisma.\$disconnect();
})().catch(async (e) => {
  console.log('⚠️  Migración seriesId omitida:', e.message);
  await prisma.\$disconnect();
});
" 2>/dev/null || echo "⚠️  Migración seriesId omitida."

# ── Data migration (F-28): crear la DEFINICIÓN de cada serie existente ──
# Cada grupo de ocurrencias que comparte seriesId recibe una fila en
# recurring_series con los datos de su ocurrencia más reciente. Idempotente.
echo "🔄 Migrando definiciones de series recurrentes (F-28)..."
su-exec nextjs:nodejs node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.recurringPayment.findMany({
    where: { seriesId: { not: null } },
    orderBy: { scheduledDate: 'desc' },
    select: {
      seriesId: true, userId: true, description: true, amount: true, type: true,
      accountId: true, subAccountId: true, debtId: true, destinationAccountId: true,
      destinationSubAccountId: true, category: true, subCategory: true,
      frequency: true, customDays: true, periodAmounts: true, notes: true,
      isRecurring: true, payrollGroupId: true, savingsGoalId: true,
    },
  });

  const seen = new Set();
  let created = 0;

  for (const r of rows) {
    const id = r.seriesId;
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const exists = await prisma.recurringSeries.findUnique({ where: { id }, select: { id: true } });
    if (exists) continue;

    try {
      await prisma.recurringSeries.create({
        data: {
          id,
          userId: r.userId,
          description: r.description,
          amount: r.amount,
          type: r.type,
          accountId: r.accountId,
          subAccountId: r.subAccountId,
          debtId: r.debtId,
          destinationAccountId: r.destinationAccountId,
          destinationSubAccountId: r.destinationSubAccountId,
          category: r.category,
          subCategory: r.subCategory,
          frequency: r.frequency,
          customDays: r.customDays,
          periodAmounts: r.periodAmounts,
          notes: r.notes,
          isRecurring: r.isRecurring,
          payrollGroupId: r.payrollGroupId,
          savingsGoalId: r.savingsGoalId,
          active: true,
        },
      });
      created++;
    } catch { /* ya existe o carrera: inofensivo */ }
  }

  console.log('✅ Definiciones de serie creadas:', created);
  await prisma.\$disconnect();
})().catch(async (e) => {
  console.log('⚠️  Migración de definiciones omitida:', e.message);
  await prisma.\$disconnect();
});
" 2>/dev/null || echo "⚠️  Migración de definiciones omitida."

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
