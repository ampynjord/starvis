import type { Router } from 'express';
import { z } from 'zod';
import { ComponentFamilyService, isComponentFamily } from '../services/component-family-service.js';
import { asyncHandler, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

const FamilyQuery = z.object({
  env: z.string().max(10).optional().default('live'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/**
 * Les composants par famille, avec leurs seules statistiques.
 *
 * `/components` sert la table large — 124 colonnes, dont cent cinq vides pour un
 * bouclier. Ces routes servent la vue de la famille : ce qui la concerne, et
 * rien d'autre.
 */
export function mountComponentFamilyRoutes(router: Router, deps: RouteDependencies): void {
  const service = new ComponentFamilyService(deps.prisma);

  router.get(
    '/api/v1/components/families',
    asyncHandler(async (req, res) => {
      const { env } = FamilyQuery.parse(req.query);
      const data = await service.families(env);
      sendWithETag(req, res, { success: true, data, total: data.length });
    }),
  );

  router.get(
    '/api/v1/components/families/:family',
    asyncHandler(async (req, res) => {
      const { family } = req.params;
      if (!isComponentFamily(family)) {
        return void res.status(404).json({ success: false, error: `Unknown component family: ${family}` });
      }
      const { env, page, limit } = FamilyQuery.parse(req.query);
      const result = await service.list(family, env, page, limit);
      sendWithETag(req, res, { success: true, ...result });
    }),
  );
}
