import type { Router } from 'express';
import { z } from 'zod';
import { MarketOfferService } from '../services/market-offer-service.js';
import { asyncHandler, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

const OfferQuery = z.object({
  env: z.string().max(10).optional().default('live'),
  limit: z.coerce.number().int().min(1).max(500).optional().default(200),
});

/**
 * « Où acheter ceci » — une question, une route.
 *
 * L'entité peut être un objet, un composant, une marchandise ou un vaisseau : la
 * vue sous-jacente ne fait pas la différence, et c'est ce qui permet de poser la
 * question une seule fois au lieu d'une par domaine.
 */
export function mountMarketRoutes(router: Router, deps: RouteDependencies): void {
  const service = new MarketOfferService(deps.prisma);

  router.get(
    '/api/v1/market/offers/:uuid',
    asyncHandler(async (req, res) => {
      const { env, limit } = OfferQuery.parse(req.query);
      const data = await service.forEntity(req.params.uuid, env, limit);
      sendWithETag(req, res, { success: true, data, total: data.offers.length });
    }),
  );
}
