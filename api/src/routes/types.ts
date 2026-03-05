import type { Pool } from 'mysql2/promise';
import type { GameDataService } from '../services/game-data-service.js';
import type { ShipMatrixService } from '../services/ship-matrix-service.js';

export interface RouteDependencies {
  pool: Pool;
  shipMatrixService: ShipMatrixService;
  gameDataService?: GameDataService;
}
