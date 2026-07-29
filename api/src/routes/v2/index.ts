import type { Router } from 'express';
import { z } from 'zod';
import { ComponentFamilyService, isComponentFamily } from '../../services/component-family-service.js';
import { asyncHandler, makeGameDataGuard } from '../helpers.js';
import type { RouteDependencies } from '../types.js';
import { sendMissing, sendOne, sendPage } from './envelope.js';

/**
 * Les paramètres de page, déclarés une fois.
 *
 * La v1 les redéclare dans chaque service, avec des bornes qui ont fini par
 * diverger. Ici ils sont ce schéma, et rien d'autre.
 */
const PageQuery = z.object({
  env: z.string().max(10).optional().default('live'),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/**
 * `/api/v2` — ce que la v1 ne peut plus corriger sans casser ses consommateurs.
 *
 * Elle ne recopie pas la v1 en mieux nommé. Elle traite trois défauts que la
 * compatibilité interdit de toucher en v1 :
 *
 *  - **Une enveloppe unique.** La v1 en sert quatre selon la ressource, et la
 *    pagination y vit à deux endroits : sous `meta` pour les vaisseaux, à la
 *    racine pour les composants, les lieux et les boutiques. Un consommateur qui
 *    lit `response.total` obtient un nombre pour trois ressources et `undefined`
 *    pour la quatrième, sans rien qui le signale.
 *  - **Pas de colonnes vides par construction.** Un bouclier ne rend plus les
 *    cent cinq champs des autres familles de composants.
 *  - **La version de la donnée.** Chaque réponse dit de quelle extraction elle
 *    sort, ce qu'aucune route v1 n'indique.
 *
 * **`/api/v1` continue de répondre à l'identique.** La v2 s'ajoute, elle ne
 * remplace pas : les tiers migrent quand ils le décident.
 */
export function mountV2Routes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);
  const families = new ComponentFamilyService(deps.prisma);

  const ShipQuery = PageQuery.extend({
    manufacturer: z.string().max(60).optional(),
    role: z.string().max(60).optional(),
    search: z.string().max(120).optional(),
    sort: z.string().max(40).optional(),
    order: z.enum(['asc', 'desc']).optional(),
  });

  router.get(
    '/api/v2/ships',
    requireGameData,
    asyncHandler(async (req, res) => {
      const query = ShipQuery.parse(req.query);
      const result = await gameDataService!.ships.getAllShips(query);
      sendPage(res, query.env, result.data, result.page, result.limit, result.total);
    }),
  );

  router.get(
    '/api/v2/ships/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const { env } = PageQuery.parse(req.query);
      const ship = await gameDataService!.ships.getShipByUuid(req.params.uuid, env);
      if (!ship) return void sendMissing(res, 'Ship');
      sendOne(res, env, ship);
    }),
  );

  router.get(
    '/api/v2/locations',
    requireGameData,
    asyncHandler(async (req, res) => {
      const query = PageQuery.extend({ type: z.string().max(60).optional(), search: z.string().max(120).optional() }).parse(req.query);
      const result = await gameDataService!.locations.getLocations(query);
      sendPage(res, query.env, result.data, result.page, result.limit, result.total);
    }),
  );

  router.get(
    '/api/v2/locations/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const { env } = PageQuery.parse(req.query);
      // Les commodités viennent avec la fiche : « qu'est-ce qu'il y a sur place »
      // ne mérite pas un second appel.
      const location = await gameDataService!.locations.getLocation(req.params.uuid, env);
      if (!location) return void sendMissing(res, 'Location');
      sendOne(res, env, location);
    }),
  );

  router.get(
    '/api/v2/components/families',
    asyncHandler(async (req, res) => {
      const { env } = PageQuery.parse(req.query);
      sendOne(res, env, await families.families(env));
    }),
  );

  router.get(
    '/api/v2/components/families/:family',
    asyncHandler(async (req, res) => {
      const { family } = req.params;
      if (!isComponentFamily(family)) return void sendMissing(res, `Component family "${family}"`);
      const { env, page, limit } = PageQuery.parse(req.query);
      const result = await families.list(family, env, page, limit);
      sendPage(res, env, result.data, result.page, result.limit, result.total);
    }),
  );

  router.get(
    '/api/v2/components/:uuid',
    asyncHandler(async (req, res) => {
      const { env } = PageQuery.parse(req.query);
      const found = await families.findByUuid(req.params.uuid, env);
      // Les six types sans famille — porte-missiles, rayon tracteur, support de
      // vie, module de saut, modificateur de minage — n'ont aucune statistique
      // propre. Les rendre depuis ici donnerait un objet sans contenu ; ils se
      // lisent sur `/api/v1/components/{uuid}`.
      if (!found) return void sendMissing(res, 'Component with family statistics');
      sendOne(res, env, { family: found.family, ...found.component });
    }),
  );
}
