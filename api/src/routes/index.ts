import { Router } from 'express';
import { mountAdminRoutes } from './admin.js';
import { mountCommodityRoutes } from './commodities.js';
import { mountComponentRoutes } from './components.js';
import { mountItemRoutes } from './items.js';
import { mountManufacturerRoutes } from './manufacturers.js';
import { mountMiningRoutes } from './mining.js';
import { mountPaintRoutes } from './paints.js';
import { mountSearchRoutes } from './search.js';
import { mountShipMatrixRoutes } from './ship-matrix.js';
import { mountShipRoutes } from './ships.js';
import { mountShopRoutes } from './shops.js';
import { mountSystemRoutes } from './system.js';
import { mountTradeRoutes } from './trade.js';
import type { RouteDependencies } from './types.js';

export type { RouteDependencies } from './types.js';

export function createRoutes(deps: RouteDependencies): Router {
  const router = Router();
  mountShipMatrixRoutes(router, deps);
  mountShipRoutes(router, deps);
  mountComponentRoutes(router, deps);
  mountManufacturerRoutes(router, deps);
  mountPaintRoutes(router, deps);
  mountShopRoutes(router, deps);
  mountItemRoutes(router, deps);
  mountCommodityRoutes(router, deps);
  mountMiningRoutes(router, deps);
  mountSearchRoutes(router, deps);
  mountSystemRoutes(router, deps);
  mountTradeRoutes(router, deps);
  mountAdminRoutes(router, deps);
  return router;
}
