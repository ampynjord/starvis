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
      const data = await gameDataService!.getAllManufacturers();
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/manufacturers/:code',
    requireGameData,
    asyncHandler(async (req, res) => {
      const mfr = await gameDataService!.getManufacturerByCode(req.params.code);
      if (!mfr) return void res.status(404).json({ success: false, error: 'Manufacturer not found' });
      sendWithETag(req, res, { success: true, data: mfr });
    }),
  );

  router.get(
    '/api/v1/manufacturers/:code/ships',
    requireGameData,
    asyncHandler(async (req, res) => {
      const mfr = await gameDataService!.getManufacturerByCode(req.params.code);
      if (!mfr) return void res.status(404).json({ success: false, error: 'Manufacturer not found' });
      const data = await gameDataService!.getManufacturerShips(req.params.code);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/manufacturers/:code/components',
    requireGameData,
    asyncHandler(async (req, res) => {
      const mfr = await gameDataService!.getManufacturerByCode(req.params.code);
      if (!mfr) return void res.status(404).json({ success: false, error: 'Manufacturer not found' });
      const data = await gameDataService!.getManufacturerComponents(req.params.code);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );
}
