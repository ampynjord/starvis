/**
 * Database public API - single PostgreSQL connection using multi-schema Prisma.
 *
 * Schemas:
 *   game - game data (ships, components, items, etc.) with env = "live" | "ptu"
 *   rsi  - RSI website scraped data
 *   meta - extraction logs, changelogs, users
 */

// `Prisma` porte les types d'entree — notamment `InputJsonValue`, qu'un service
// doit nommer pour ecrire une colonne JSON sans casting aveugle.
export type { Prisma, UserRole } from './client/prisma.js';
export { getPrisma, initPrisma, PrismaClient } from './client/prisma.js';
export { resolveEnv } from './env/resolve-env.js';
export type { GameComponentCategory } from './shared/component-taxonomy.js';
export {
  GAME_COMPONENT_CATEGORIES,
  GAME_COMPONENT_CATEGORY_TYPES,
  getGameComponentCategory,
} from './shared/component-taxonomy.js';
export type { PrismaLike } from './types/prisma.js';
