/**
 * Database public API - single PostgreSQL connection using multi-schema Prisma.
 *
 * Schemas:
 *   game - game data (ships, components, items, etc.) with env = "live" | "ptu"
 *   rsi  - RSI website scraped data
 *   meta - extraction logs, changelogs, users
 */

export type { UserRole } from './client/prisma.js';
export { getPrisma, initPrisma, PrismaClient } from './client/prisma.js';
export { resolveEnv } from './env/resolve-env.js';
export { getGamePrisma, getRsiWebsitePrisma, getStarvisPrisma, initAllPrisma } from './legacy.js';
export type { GamePrismaClient, PrismaLike, RsiPrismaClient, StarvisPrismaClient } from './types/prisma.js';
