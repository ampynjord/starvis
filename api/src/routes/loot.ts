import type { Router } from 'express';
import { z } from 'zod';
import { LootService } from '../services/loot-service.js';
import { asyncHandler, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

const LootQuery = z.object({
  env: z.string().max(10).optional().default('live'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/**
 * Ce qui peut tomber, et avec quelle chance.
 *
 * 161 tables, 709 entrées et 267 archétypes étaient extraits depuis longtemps et
 * servis nulle part.
 */
export function mountLootRoutes(router: Router, deps: RouteDependencies): void {
  const service = new LootService(deps.prisma);

  router.get(
    '/api/v1/loot/tables',
    asyncHandler(async (req, res) => {
      const { env, page, limit } = LootQuery.parse(req.query);
      const result = await service.listTables(env, page, limit);
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  router.get(
    '/api/v1/loot/tables/:uuid',
    asyncHandler(async (req, res) => {
      const { env } = LootQuery.parse(req.query);
      const data = await service.getTable(req.params.uuid, env);
      if (!data) return void res.status(404).json({ success: false, error: 'Loot table not found' });
      sendWithETag(req, res, { success: true, data });
    }),
  );
}
