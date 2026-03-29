import type { Router } from 'express';
import { asyncHandler, makeGameDataGuard, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountManufacturerRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  router.get(
    '/api/v1/manufacturers',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = (req.query.env as string) || 'live';
      const data = await gameDataService!.ships.getAllManufacturers(env);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/manufacturers/:code',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = (req.query.env as string) || 'live';
      const mfr = await gameDataService!.ships.getManufacturerByCode(req.params.code, env);
      if (!mfr) return void res.status(404).json({ success: false, error: 'Manufacturer not found' });
      sendWithETag(req, res, { success: true, data: mfr });
    }),
  );

  router.get(
    '/api/v1/manufacturers/:code/ships',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = (req.query.env as string) || 'live';
      const mfr = await gameDataService!.ships.getManufacturerByCode(req.params.code, env);
      if (!mfr) return void res.status(404).json({ success: false, error: 'Manufacturer not found' });
      const data = await gameDataService!.ships.getManufacturerShips(req.params.code, env);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/manufacturers/:code/components',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = (req.query.env as string) || 'live';
      const mfr = await gameDataService!.ships.getManufacturerByCode(req.params.code, env);
      if (!mfr) return void res.status(404).json({ success: false, error: 'Manufacturer not found' });
      const data = await gameDataService!.ships.getManufacturerComponents(req.params.code, env);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );
}
