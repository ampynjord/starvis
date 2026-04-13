import { Router } from 'express';
import { mountAdminRoutes } from './admin.js';
import { mountCalculateRoutes } from './calculate.js';
import { mountChatRoutes } from './chat.js';
import { mountCommodityRoutes } from './commodities.js';
import { mountComponentRoutes } from './components.js';
import { mountCraftingRoutes } from './crafting.js';
import { mountItemRoutes } from './items.js';
import { mountLocationRoutes } from './locations.js';
import { mountManufacturerRoutes } from './manufacturers.js';
import { mountMiningRoutes } from './mining.js';
import { mountMissionRoutes } from './missions.js';
import { mountPaintRoutes } from './paints.js';
import { mountRsiWebsiteRoutes } from './rsi-website.js';
import { mountSearchRoutes } from './search.js';
import { mountShipMatrixRoutes } from './ship-matrix.js';
import { mountShipRoutes } from './ships.js';
import { mountShopRoutes } from './shops.js';
import { mountSystemRoutes } from './system.js';
import { mountTradeRoutes } from './trade.js';
import type { RouteDependencies } from './types.js';

export type { RouteDependencies } from './types.js';

const routeMounts = [
  mountShipMatrixRoutes,
  mountShipRoutes,
  mountComponentRoutes,
  mountManufacturerRoutes,
  mountPaintRoutes,
  mountShopRoutes,
  mountItemRoutes,
  mountCommodityRoutes,
  mountCraftingRoutes,
  mountMiningRoutes,
  mountMissionRoutes,
  mountLocationRoutes,
  mountSearchRoutes,
  mountCalculateRoutes,
  mountTradeRoutes,
  mountSystemRoutes,
  mountAdminRoutes,
  mountRsiWebsiteRoutes,
  mountChatRoutes,
] as const;

export function createRoutes(deps: RouteDependencies): Router {
  const router = Router();
  for (const mount of routeMounts) {
    mount(router, deps);
  }
  return router;
}
