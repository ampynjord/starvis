/**
 * Prisma client singleton.
 *
 * Usage:
 *   import { getPrisma, initPrisma } from '@/db/index.js';
 *
 *   // At startup:
 *   initPrisma();
 *
 *   // In services:
 *   const rows = await getPrisma().$queryRawUnsafe<Row[]>('SELECT ...', ...params);
 */

import { PrismaClient } from '@prisma/client';

let _prisma: PrismaClient | null = null;

/**
 * Initialise the PrismaClient.
 * Call this once at startup.
 */
export function initPrisma(databaseUrl: string): PrismaClient {
  _prisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  return _prisma;
}

/**
 * Returns the PrismaClient instance.
 * Throws if initPrisma() has not been called.
 */
export function getPrisma(): PrismaClient {
  if (!_prisma) throw new Error('Prisma not initialised — call initPrisma(url) first');
  return _prisma;
}

export { PrismaClient } from '@prisma/client';
