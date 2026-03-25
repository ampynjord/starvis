/**
 * Database clients — Multi-DB architecture.
 *
 * Three databases in one MySQL container:
 *   - starvis : shared/meta (manufacturers, ship_matrix, changelog…)
 *   - live    : game data for LIVE build
 *   - ptu     : game data for PTU build
 *
 * Usage:
 *   import { initAllPrisma, getGamePrisma, getStarvisPrisma } from '@/db/index.js';
 *
 *   // At startup:
 *   initAllPrisma(buildDatabaseUrl);
 *
 *   // In services:
 *   const prisma = getGamePrisma(env); // env = 'live' | 'ptu'
 *   const starvis = getStarvisPrisma();
 */

import { PrismaClient } from '@prisma/client';

const clients: Record<string, PrismaClient> = {};

/**
 * Initialise Prisma clients for all 3 databases.
 * Call once at startup.
 */
export function initAllPrisma(urlBuilder: (db: string) => string): PrismaClient {
  clients.starvis = new PrismaClient({ datasources: { db: { url: urlBuilder('starvis') } } });
  clients.live = new PrismaClient({ datasources: { db: { url: urlBuilder('live') } } });
  clients.ptu = new PrismaClient({ datasources: { db: { url: urlBuilder('ptu') } } });
  return clients.starvis;
}

/** Returns the Prisma client for a game environment (live or ptu). */
export function getGamePrisma(env: string): PrismaClient {
  const key = env === 'ptu' ? 'ptu' : 'live';
  const client = clients[key];
  if (!client) throw new Error(`Prisma not initialised for "${key}" — call initAllPrisma() first`);
  return client;
}

/** Returns the Prisma client for the shared "starvis" database. */
export function getStarvisPrisma(): PrismaClient {
  if (!clients.starvis) throw new Error('Prisma not initialised — call initAllPrisma() first');
  return clients.starvis;
}

/** Returns the starvis Prisma client (backward-compatible alias). */
export function getPrisma(): PrismaClient {
  return getStarvisPrisma();
}

export { PrismaClient } from '@prisma/client';
