import type { Router } from 'express';
import { asyncHandler, makeGameDataGuard, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountMiningRoutes(router: Router, deps: RouteDependencies): void {
  const { prisma, gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  // GET /api/v1/mining/elements — all mineral elements
  router.get(
    '/api/v1/mining/elements',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.mining.getAllElements(env);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  // GET /api/v1/mining/elements/:uuid — single element + rocks containing it
  router.get(
    '/api/v1/mining/elements/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.mining.getElementById(req.params.uuid, env);
      if (!data) return void res.status(404).json({ success: false, error: 'Element not found' });
      sendWithETag(req, res, { success: true, data });
    }),
  );

  // GET /api/v1/mining/compositions — all rock compositions (with part count)
  router.get(
    '/api/v1/mining/compositions',
    requireGameData,
    asyncHandler(async (req, res) => {
      const includeEmpty = req.query.include_empty === 'true';
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.mining.getAllCompositions(includeEmpty, env);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  // GET /api/v1/mining/compositions/:uuid — single rock with all minerals
  router.get(
    '/api/v1/mining/compositions/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.mining.getCompositionByUuid(req.params.uuid, env);
      if (!data) return void res.status(404).json({ success: false, error: 'Composition not found' });
      sendWithETag(req, res, { success: true, data });
    }),
  );

  // GET /api/v1/mining/solver?element=<uuid>&min_probability=<0-1>
  // Returns rocks sorted by probability for the given mineral
  router.get(
    '/api/v1/mining/solver',
    requireGameData,
    asyncHandler(async (req, res) => {
      const { element, composition, min_probability } = req.query as Record<string, string | undefined>;
      const env = String(req.query.env ?? 'live');

      if (!element && !composition) {
        return void res.status(400).json({ success: false, error: 'Provide either element or composition query param' });
      }

      const minProb = min_probability !== undefined ? Number(min_probability) : 0;

      if (element) {
        const data = await gameDataService!.mining.solveForElement(element, { minProbability: minProb, env });
        return void sendWithETag(req, res, { success: true, count: data.length, data });
      }

      const data = await gameDataService!.mining.solveForComposition(composition!, env);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  // GET /api/v1/mining/stats
  router.get(
    '/api/v1/mining/stats',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.mining.getStats(env);
      sendWithETag(req, res, { success: true, data });
    }),
  );

  // GET /api/v1/mining/lasers — all mining lasers & gadgets
  router.get(
    '/api/v1/mining/lasers',
    asyncHandler(async (req, res) => {
      const _env = String(req.query.env ?? 'live');
      const components = await prisma.component.findMany({
        where: { type: 'MiningLaser', miningSpeed: { not: null } },
        select: {
          uuid: true,
          name: true,
          size: true,
          grade: true,
          manufacturerCode: true,
          miningSpeed: true,
          miningRange: true,
          miningResistance: true,
          miningInstability: true,
        },
        orderBy: [{ size: 'asc' }, { name: 'asc' }],
      });
      const data = components.map((c) => ({
        uuid: c.uuid,
        name: c.name,
        size: c.size,
        grade: c.grade,
        manufacturerCode: c.manufacturerCode ?? null,
        manufacturerName: null,
        miningSpeed: Number(c.miningSpeed),
        miningRange: Number(c.miningRange ?? 0),
        miningResistance: Number(c.miningResistance ?? 0),
        miningInstability: Number(c.miningInstability ?? 0),
      }));
      res.json({ success: true, count: data.length, data });
    }),
  );
}
