import type { PrismaClient } from '@prisma/client';
import type { GameDataService } from '../services/game-data-service.js';
import type { ShipMatrixService } from '../services/ship-matrix-service.js';

export interface RouteDependencies {
  prisma: PrismaClient;
  shipMatrixService: ShipMatrixService;
  gameDataService?: GameDataService;
}
