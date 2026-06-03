import type { Router } from 'express';
import { ItemQuery } from '../schemas.js';
import { parseIncludes } from '../services/shared.js';
import { asyncHandler, makeGameDataGuard, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

type CategoryDef = { types: string[]; subTypes?: string[]; excludeSubTypes?: string[]; label: string; group: string };

/** Semantic category definitions — new in-game taxonomy.
 *  DB types are P4K-faithful; this layer maps them to the player-facing classification.
 */
const CATEGORY_DEFS: Record<string, CategoryDef> = {
  // ── Armor ─────────────────────────────────────────────────────────────────────
  armor: {
    group: 'armor',
    label: 'All Armor',
    types: ['Armor_Helmet', 'Armor_Torso', 'Armor_Arms', 'Armor_Legs', 'Armor_Backpack', 'Undersuit'],
  },
  'armor-undersuits': { group: 'armor', label: 'Undersuits', types: ['Undersuit'] },
  'armor-helmets': { group: 'armor', label: 'Helmets', types: ['Armor_Helmet'] },
  'armor-core': { group: 'armor', label: 'Core', types: ['Armor_Torso'] },
  'armor-arms': { group: 'armor', label: 'Arms', types: ['Armor_Arms'] },
  'armor-legs': { group: 'armor', label: 'Legs', types: ['Armor_Legs'] },
  'armor-backpacks': { group: 'armor', label: 'Backpacks', types: ['Armor_Backpack'] },
  'armor-flair': { group: 'armor', label: 'Flair', types: ['Attachment'], subTypes: ['Appearance'] },

  // ── Clothing ──────────────────────────────────────────────────────────────────
  clothing: { group: 'clothing', label: 'All Clothing', types: ['Clothing'] },

  // ── Weapons ───────────────────────────────────────────────────────────────────
  weapons: { group: 'weapons', label: 'All Weapons', types: ['FPS_Weapon'], excludeSubTypes: ['Throwable', 'Mine'] },
  'weapons-sidearms': { group: 'weapons', label: 'Sidearms', types: ['FPS_Weapon'], subTypes: ['Pistol'] },
  'weapons-primary': {
    group: 'weapons',
    label: 'Primary',
    types: ['FPS_Weapon'],
    subTypes: ['Assault Rifle', 'SMG', 'Shotgun', 'Sniper Rifle', 'LMG'],
  },
  'weapons-primary-ar': { group: 'weapons-primary', label: 'Assault Rifles', types: ['FPS_Weapon'], subTypes: ['Assault Rifle'] },
  'weapons-primary-smg': { group: 'weapons-primary', label: 'SMGs', types: ['FPS_Weapon'], subTypes: ['SMG'] },
  'weapons-primary-shotgun': { group: 'weapons-primary', label: 'Shotguns', types: ['FPS_Weapon'], subTypes: ['Shotgun'] },
  'weapons-primary-sniper': { group: 'weapons-primary', label: 'Sniper Rifles', types: ['FPS_Weapon'], subTypes: ['Sniper Rifle'] },
  'weapons-primary-lmg': { group: 'weapons-primary', label: 'LMGs', types: ['FPS_Weapon'], subTypes: ['LMG'] },
  'weapons-special': { group: 'weapons', label: 'Special', types: ['FPS_Weapon'], subTypes: ['Launcher'] },
  'weapons-melee': { group: 'weapons', label: 'Melee', types: ['FPS_Weapon'], subTypes: ['Melee'] },
  'weapons-attachments': { group: 'weapons', label: 'Attachments', types: ['Attachment'], subTypes: ['Weapon Modifier'] },
  'weapons-throwables': { group: 'weapons', label: 'Throwables', types: ['FPS_Weapon'], subTypes: ['Throwable', 'Mine'] },

  // ── Utility ───────────────────────────────────────────────────────────────────
  utility: {
    group: 'utility',
    label: 'All Utility',
    types: ['Tool', 'Gadget', 'Consumable'],
    excludeSubTypes: [
      'Food',
      'Drink',
      'OxygenCap',
      'Stim',
      'Assault Rifle',
      'SMG',
      'Shotgun',
      'Sniper Rifle',
      'LMG',
      'Pistol',
      'Launcher',
      'Melee',
      'Throwable',
      'Mine',
    ],
  },
  'utility-gadgets': { group: 'utility', label: 'Gadgets', types: ['Gadget'], subTypes: ['Handheld', 'Two-handed', 'Device'] },
  'utility-medical': { group: 'utility', label: 'Medical', types: ['Consumable', 'Tool'], subTypes: ['Medical', 'MedPack', 'Stim'] },
  'utility-cryptokeys': { group: 'utility', label: 'Cryptokeys', types: ['Consumable'], subTypes: ['Hacking', 'SystemAccess'] },
  'utility-technology': { group: 'utility', label: 'Technology', types: ['Tool', 'Gadget'], subTypes: ['Multitool', 'Module'] },

  // ── Ammo ──────────────────────────────────────────────────────────────────────
  ammo: { group: 'ammo', label: 'Ammo', types: ['Magazine'] },

  // ── Sustenance ────────────────────────────────────────────────────────────────
  sustenance: { group: 'sustenance', label: 'All Sustenance', types: ['Consumable'], subTypes: ['Food', 'Drink', 'OxygenCap'] },
  'sustenance-food': { group: 'sustenance', label: 'Food', types: ['Consumable'], subTypes: ['Food'] },
  'sustenance-drink': { group: 'sustenance', label: 'Drinks', types: ['Consumable'], subTypes: ['Drink'] },
  'sustenance-oxygen': { group: 'sustenance', label: 'Oxygen', types: ['Consumable'], subTypes: ['OxygenCap'] },

  // ── Other (catch-all) ─────────────────────────────────────────────────────────
  other: { group: 'other', label: 'Other', types: ['Gadget'], excludeSubTypes: ['Handheld', 'Two-handed', 'Device'] },
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
    '/api/v1/items/navigation',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.items.getItemNavigation(env);
      sendWithETag(req, res, { success: true, data });
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
