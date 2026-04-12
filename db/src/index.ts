/**
 * Database client — single PostgreSQL connection using multi-schema Prisma.
 *
 * Schemas:
 *   game  — game data (ships, components, items, etc.)  env = "live" | "ptu"
 *   rsi   — RSI website scraped data
 *   meta  — extraction logs, changelogs, manufacturers
 */
import { PrismaClient } from '../generated/client/index.js';

export { PrismaClient };

/** Minimal interface covering the raw-SQL methods used across all services. */
export interface PrismaLike {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}

let prismaClient: PrismaClient | null = null;

/**
 * Initialise the global Prisma client with the given DATABASE_URL.
 * Must be called once at startup before any other helper.
 */
export function initPrisma(databaseUrl: string): PrismaClient {
  prismaClient = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  return prismaClient;
}

/** Return the singleton Prisma client (throws if not yet initialised). */
export function getPrisma(): PrismaClient {
  if (!prismaClient) throw new Error('PrismaClient not initialised — call initPrisma() first');
  return prismaClient;
}

/**
 * Normalise an env string to the two canonical values used in the `env` column.
 * Anything that isn't explicitly "ptu" is treated as "live".
 */
export function resolveEnv(env: string | undefined): 'live' | 'ptu' {
  return env === 'ptu' ? 'ptu' : 'live';
}

// ── Legacy aliases kept for backwards-compat while the rest of the codebase migrates ──

/** @deprecated Use getPrisma() */
export function getStarvisPrisma(): PrismaClient {
  return getPrisma();
}

/** @deprecated Use getPrisma() */
export function getGamePrisma(_env?: string): PrismaClient {
  return getPrisma();
}

/** @deprecated Use getPrisma() */
export function getRsiWebsitePrisma(): PrismaClient {
  return getPrisma();
}

/**
 * @deprecated Use initPrisma(databaseUrl) instead.
 * Kept only so existing call sites compile; returns the new singleton client.
 */
export function initAllPrisma(urlBuilder: (db: string) => string): PrismaClient {
  return initPrisma(urlBuilder('starvis'));
}

// Re-export legacy type aliases so existing imports still resolve
/** @deprecated Use PrismaClient directly. */
export type GamePrismaClient = PrismaClient;
/** @deprecated Use PrismaClient directly. */
export type RsiPrismaClient = PrismaClient;
/** @deprecated Use PrismaClient directly. */
export type StarvisPrismaClient = PrismaClient;
