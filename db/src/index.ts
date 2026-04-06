/**
 * Database clients — Multi-DB architecture.
 *
 *   game client    → live / ptu   (game data: ships, components, items, etc.)
 *   starvis client → starvis      (extraction_log, changelog)
 *   rsi client     → rsi_website  (ship_matrix, galactapedia, comm_links, starmap_locations)
 */
import { PrismaClient as GamePrismaClient } from '../generated/game/index.js';
import { PrismaClient as RsiPrismaClient } from '../generated/rsi/index.js';
import { PrismaClient as StarvisPrismaClient } from '../generated/starvis/index.js';

/** Minimal interface covering the raw-SQL methods used across all services. */
export interface PrismaLike {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}

/** @deprecated Use PrismaLike or a specific typed client instead. */
export type { GamePrismaClient as PrismaClient };

export { GamePrismaClient, RsiPrismaClient, StarvisPrismaClient };

const gameClients: Record<string, GamePrismaClient> = {};
let starvisClient: StarvisPrismaClient | null = null;
let rsiClient: RsiPrismaClient | null = null;

export function initAllPrisma(urlBuilder: (db: string) => string): StarvisPrismaClient {
  gameClients.live = new GamePrismaClient({ datasources: { db: { url: urlBuilder('live') } } });
  gameClients.ptu = new GamePrismaClient({ datasources: { db: { url: urlBuilder('ptu') } } });
  starvisClient = new StarvisPrismaClient({ datasources: { db: { url: urlBuilder('starvis') } } });
  rsiClient = new RsiPrismaClient({ datasources: { db: { url: urlBuilder('rsi_website') } } });
  return starvisClient;
}

export function getGamePrisma(env: string): GamePrismaClient {
  const key = env === 'ptu' ? 'ptu' : 'live';
  const client = gameClients[key];
  if (!client) throw new Error(`GamePrismaClient not initialised for "${key}" — call initAllPrisma() first`);
  return client;
}

export function getStarvisPrisma(): StarvisPrismaClient {
  if (!starvisClient) throw new Error('StarvisPrismaClient not initialised — call initAllPrisma() first');
  return starvisClient;
}

export function getRsiWebsitePrisma(): RsiPrismaClient {
  if (!rsiClient) throw new Error('RsiPrismaClient not initialised — call initAllPrisma() first');
  return rsiClient;
}

/** @deprecated Use getStarvisPrisma() */
export function getPrisma(): StarvisPrismaClient {
  return getStarvisPrisma();
}
