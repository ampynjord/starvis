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
export type { GameComponentCategory } from './shared/component-taxonomy.js';
export {
  GAME_COMPONENT_CATEGORIES,
  GAME_COMPONENT_CATEGORY_TYPES,
  getGameComponentCategory,
} from './shared/component-taxonomy.js';
export type { PrismaLike } from './types/prisma.js';
