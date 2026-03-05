/**
 * STARVIS v2.0 - Routes (re-export shim)
 * Implementation split across api/src/routes/ directory.
 */

export { createRoutes } from './routes/index.js';
export type { RouteDependencies } from './routes/types.js';
// Re-export schemas so existing consumers are unaffected
export {
  arrayToCsv,
  ChangelogQuery,
  CommodityQuery,
  ComponentQuery,
  ItemQuery,
  LoadoutBody,
  PaintQuery,
  qInt,
  qStr,
  SearchQuery,
  ShipQuery,
  ShopQuery,
} from './schemas.js';
