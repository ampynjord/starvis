import type { Router } from 'express';
import { ItemQuery } from '../schemas.js';
import { parseIncludes } from '../services/shared.js';
import { asyncHandler, makeGameDataGuard, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

/** Semantic category definitions — each slug is a dedicated API route.
 *  Types use the P4K-faithful naming (Armor unified type; sub-types from AttachDef).
 */
const CATEGORY_DEFS: Record<string, { types: string[]; subTypes?: string[]; excludeSubTypes?: string[]; label: string }> = {
  weapons: { label: 'Weapons', types: ['FPS_Weapon'], excludeSubTypes: ['Throwable', 'Mine'] },
  throwable: { label: 'Throwable', types: ['FPS_Weapon'], subTypes: ['Throwable', 'Mine'] },
  helmet: { label: 'Helmet', types: ['Armor_Helmet'] },
  core: { label: 'Core', types: ['Armor_Torso'] },
  arms: { label: 'Arms', types: ['Armor_Arms'] },
  legs: { label: 'Legs', types: ['Armor_Legs'] },
  backpack: { label: 'Backpack', types: ['Armor_Backpack'] },
  undersuit: { label: 'Undersuit', types: ['Undersuit'] },
  'tools-medics': { label: 'Tools & Medics', types: ['Tool', 'Consumable'] },
  magazines: { label: 'Magazines', types: ['Magazine'] },
  attachments: { label: 'Attachments', types: ['Attachment'] },
  clothing: { label: 'Clothing', types: ['Clothing'] },
  other: { label: 'Other', types: ['Gadget'] },
};

export function mountItemRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);

  // ─── Static filter routes (must be before /:uuid) ────────────────────────

  router.get(
    '/api/v1/items/types',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.items.getItemTypes(env);
      sendWithETag(req, res, { success: true, ...data });
    }),
  );

  router.get(
    '/api/v1/items/filters',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const result = await gameDataService!.items.getItemFilters(env);
      sendWithETag(req, res, { success: true, ...result });
    }),
  );

  router.get(
    '/api/v1/items/sub-types',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const type = req.query.type ? String(req.query.type) : undefined;
      const data = await gameDataService!.items.getItemSubTypes(type, env);
      sendWithETag(req, res, { success: true, ...data });
    }),
  );

  router.get(
    '/api/v1/items/manufacturers',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const type = req.query.type ? String(req.query.type) : undefined;
      const data = await gameDataService!.items.getItemManufacturers(type, env);
      sendWithETag(req, res, { success: true, ...data });
    }),
  );

  /** List available semantic categories with their item counts */
  router.get(
    '/api/v1/items/categories',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const counts = await gameDataService!.items.getCategoryCounts(env);
      const categories = Object.entries(CATEGORY_DEFS).map(([slug, def]) => ({
        slug,
        label: def.label,
        count: counts[slug] ?? 0,
      }));
      sendWithETag(req, res, { success: true, data: categories });
    }),
  );

  /** Generic item list — supports all filters via query params */
  router.get(
    '/api/v1/items',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const filters = ItemQuery.parse(req.query) as Record<string, unknown>;
      const result = await gameDataService!.items.getAllItems(filters);
      const payload = {
        success: true,
        count: result.data.length,
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.pages,
        data: result.data,
        meta: { source: 'Game Data', responseTime: `${Date.now() - t}ms` },
      };
      if (req.query.format === 'csv') return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], payload);
      sendWithETag(req, res, payload);
    }),
  );

  /** Semantic category routes — /api/v1/items/category/:slug */
  router.get(
    '/api/v1/items/category/:slug',
    requireGameData,
    asyncHandler(async (req, res) => {
      const slug = req.params.slug.toLowerCase();
      const def = CATEGORY_DEFS[slug];
      if (!def) return void res.status(404).json({ success: false, error: `Unknown category: ${slug}` });

      const t = Date.now();
      const base = ItemQuery.parse(req.query) as Record<string, unknown>;
      const result = await gameDataService!.items.getAllItems({
        ...base,
        types: def.types.join(','),
        sub_types: def.subTypes?.join(','),
        exclude_sub_types: def.excludeSubTypes?.join(','),
      });
      const payload = {
        success: true,
        category: { slug, label: def.label },
        count: result.data.length,
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.pages,
        data: result.data,
        meta: { source: 'Game Data', responseTime: `${Date.now() - t}ms` },
      };
      if (req.query.format === 'csv') return void sendCsvOrJson(req, res, result.data as Record<string, unknown>[], payload);
      sendWithETag(req, res, payload);
    }),
  );

  // ─── Item detail routes (must be after /category/:slug) ──────────────────

  router.get(
    '/api/v1/items/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const includes = parseIncludes(String(req.query.include ?? ''));
      const item = await gameDataService!.items.resolveItem(req.params.uuid, env);
      if (!item) return void res.status(404).json({ success: false, error: 'Item not found' });
      if (includes.has('manufacturer') && item.manufacturer_code) {
        item.manufacturer = await gameDataService!.ships.getManufacturerByCode(String(item.manufacturer_code), env);
      }
      sendWithETag(req, res, { success: true, data: item });
    }),
  );

  router.get(
    '/api/v1/items/:uuid/buy-locations',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const item = await gameDataService!.items.resolveItem(req.params.uuid, env);
      if (!item) return void res.status(404).json({ success: false, error: 'Item not found' });
      const data = await gameDataService!.items.getItemBuyLocations(String(item.uuid), env);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );
}
