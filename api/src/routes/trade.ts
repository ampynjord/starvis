/**
 * Trade routes — commodity prices by location and best-routes calculator
 * Inspired by UEX Corp / SC Trade Tools
 *
 * STUB: commodity_prices table does not exist yet.
 * All endpoints return 501 until the price-tracking system is implemented.
 */

import type { Router } from 'express';
import type { RouteDependencies } from './types.js';

const NOT_IMPLEMENTED = { success: false, error: 'Trade price tracking is not yet implemented' } as const;

export function mountTradeRoutes(router: Router, _deps: RouteDependencies): void {
  router.get('/api/v1/trade/prices', (_req, res) => res.status(501).json(NOT_IMPLEMENTED));
  router.get('/api/v1/trade/routes', (_req, res) => res.status(501).json(NOT_IMPLEMENTED));
  router.get('/api/v1/trade/locations', (_req, res) => res.status(501).json(NOT_IMPLEMENTED));
}
