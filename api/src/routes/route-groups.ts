import { mountAdminRoutes } from './admin.js';
import { mountAuthRoutes } from './auth.js';
import { mountBugReportRoutes } from './bug-reports.js';
import { mountCalculateRoutes } from './calculate.js';
import { mountChatRoutes } from './chat.js';
import { mountCommodityRoutes } from './commodities.js';
import { mountComponentRoutes } from './components.js';
import { mountCorporationRoutes } from './corporations.js';
import { mountCorrelationRoutes } from './correlations.js';
import { mountCraftingRoutes } from './crafting.js';
import { mountFactionRoutes } from './factions.js';
import { mountItemRoutes } from './items.js';
import { mountLocationRoutes } from './locations.js';
import { mountManufacturerRoutes } from './manufacturers.js';
import { mountMiningRoutes } from './mining.js';
import { mountMissionRoutes } from './missions.js';
import { mountObjectRoutes } from './objects.js';
import { mountPaintRoutes } from './paints.js';
import { mountRsiWebsiteRoutes } from './rsi-website.js';
import { mountSearchRoutes } from './search.js';
import { mountShipMatrixRoutes } from './ship-matrix.js';
import { mountShipRoutes } from './ships.js';
import { mountShopRoutes } from './shops.js';
import { mountSystemRoutes } from './system.js';
import { mountTradeRoutes } from './trade.js';
import type { RouteDependencies } from './types.js';

export type RouteMount = (router: import('express').Router, deps: RouteDependencies) => void;

export interface RouteGroup {
  id: string;
  description: string;
  mounts: readonly RouteMount[];
}

export const routeGroups = [
  {
    id: 'platform',
    description: 'Health, auth, admin, bug reports and operational API routes.',
    mounts: [mountSystemRoutes, mountAuthRoutes, mountAdminRoutes, mountBugReportRoutes],
  },
  {
    id: 'static-game-data',
    description: 'P4K/DataForge-backed catalog and economy endpoints.',
    mounts: [
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
      mountFactionRoutes,
      mountLocationRoutes,
      mountObjectRoutes,
      mountSearchRoutes,
      mountCalculateRoutes,
      mountTradeRoutes,
      mountCorrelationRoutes,
    ],
  },
  {
    id: 'rsi-network-data',
    description: 'RSI website, SC Wiki and community-facing network data.',
    mounts: [mountRsiWebsiteRoutes],
  },
  {
    id: 'user-features',
    description: 'Corporations and assistant/chat features.',
    mounts: [mountCorporationRoutes, mountChatRoutes],
  },
] as const satisfies readonly RouteGroup[];

export const routeMounts = routeGroups.flatMap((group) => group.mounts);
