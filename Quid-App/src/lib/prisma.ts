// Compatibility re-export: some files import { prisma } from "@/lib/prisma"
// while the canonical import is { db } from "@/lib/db".
// This module ensures both patterns resolve to the same PrismaClient instance.
export { db as prisma } from "@/lib/db";
