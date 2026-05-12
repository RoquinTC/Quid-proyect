// IMPORTANT: Import decimal-serializer BEFORE using Prisma.
// This patches Decimal.prototype.toJSON and valueOf so that
// Prisma Decimal values serialize as numbers in API responses
// and arithmetic operators work correctly (no more "$ NaN").
import './decimal-serializer';

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
