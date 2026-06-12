import type { PrismaClient } from '@starvis/db';
import type { GameDataService } from '../services/game-data-service.js';
import type { RsiWebsiteService } from '../services/rsi-website-service.js';
import type { ShipMatrixService } from '../services/ship-matrix-service.js';

export interface RouteDependencies {
  /** Full typed Prisma client — services narrow it as needed (PrismaLike, AuthDb…). */
  prisma: PrismaClient;
  getGamePrisma: (env: string) => PrismaClient;
  shipMatrixService: ShipMatrixService;
  gameDataService?: GameDataService;
  rsiWebsiteService?: RsiWebsiteService;
}
