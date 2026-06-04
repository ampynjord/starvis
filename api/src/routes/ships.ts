import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { request as httpsRequest } from 'node:https';
import { join } from 'node:path';
import type { Router } from 'express';
import { SearchQuery, ShipQuery } from '../schemas.js';
import { parseIncludes } from '../services/shared.js';
import { CTM_CACHE_DIR } from '../utils/config.js';
import { asyncHandler, makeGameDataGuard, makeShipResolver, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

const RANKING_STATS = [
  { key: 'scm_speed', label: 'SCM Speed', unit: 'm/s', higher_is_better: true, category: 'Flight', vehicleCategories: ['ship', 'gravlev'] },
  { key: 'max_speed', label: 'Max Speed', unit: 'm/s', higher_is_better: true, category: 'Flight' },
  {
    key: 'boost_speed_forward',
    label: 'AB Forward',
    unit: 'm/s',
    higher_is_better: true,
    category: 'Flight',
    vehicleCategories: ['ship', 'gravlev'],
  },
  { key: 'pitch_max', label: 'Pitch', unit: 'deg/s', higher_is_better: true, category: 'Flight', vehicleCategories: ['ship', 'gravlev'] },
  { key: 'yaw_max', label: 'Yaw', unit: 'deg/s', higher_is_better: true, category: 'Flight', vehicleCategories: ['ship', 'gravlev'] },
  { key: 'roll_max', label: 'Roll', unit: 'deg/s', higher_is_better: true, category: 'Flight', vehicleCategories: ['ship', 'gravlev'] },
  { key: 'total_hp', label: 'Hull HP', unit: 'HP', higher_is_better: true, category: 'Combat' },
  { key: 'shield_hp', label: 'Shield HP', unit: 'HP', higher_is_better: true, category: 'Combat', vehicleCategories: ['ship', 'gravlev'] },
  {
    key: 'weapon_damage_total',
    label: 'Weapon DPS',
    unit: 'DPS',
    higher_is_better: true,
    category: 'Combat',
    vehicleCategories: ['ship', 'gravlev'],
  },
  {
    key: 'missile_damage_total',
    label: 'Missile Dmg',
    unit: '',
    higher_is_better: true,
    category: 'Combat',
    vehicleCategories: ['ship', 'gravlev'],
  },
  { key: 'cargo_capacity', label: 'Cargo', unit: 'SCU', higher_is_better: true, category: 'Transport' },
  { key: 'crew_size', label: 'Crew', unit: '', higher_is_better: true, category: 'Transport' },
  {
    key: 'hydrogen_fuel_capacity',
    label: 'H2 Fuel',
    unit: 'L',
    higher_is_better: true,
    category: 'Fuel',
    vehicleCategories: ['ship', 'gravlev'],
  },
  { key: 'quantum_fuel_capacity', label: 'QT Fuel', unit: 'L', higher_is_better: true, category: 'Fuel', vehicleCategories: ['ship'] },
  { key: 'mass', label: 'Mass', unit: '', higher_is_better: false, category: 'Dimensions' },
  { key: 'cross_section_z', label: 'Length', unit: 'm', higher_is_better: false, category: 'Dimensions' },
  { key: 'cross_section_x', label: 'Width', unit: 'm', higher_is_better: false, category: 'Dimensions' },
  { key: 'cross_section_y', label: 'Height', unit: 'm', higher_is_better: false, category: 'Dimensions' },
] as const;

const RANKING_STAT_CATEGORIES = ['All', 'Flight', 'Combat', 'Transport', 'Fuel', 'Dimensions'];
const RANKING_VEHICLE_CATEGORIES = [
  { label: 'Ships', value: 'ship' },
  { label: 'Ground', value: 'ground' },
  { label: 'Grav-lev', value: 'gravlev' },
];
const RANKING_TOP_OPTIONS = [
  { label: 'Top 25', value: 25 },
  { label: 'Top 50', value: 50 },
  { label: 'Top 100', value: 100 },
  { label: 'All', value: 0 },
];
const DEFAULT_RANKING_SORT: Record<string, string> = {
  ship: 'scm_speed',
  ground: 'max_speed',
  gravlev: 'scm_speed',
};

function numericStat(row: Record<string, unknown>, key: string): number {
  const value = Number(row[key] ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function getRankingStats(vehicleCategory: string, statCategory: string) {
  return RANKING_STATS.filter(
    (stat) =>
      (!('vehicleCategories' in stat) || stat.vehicleCategories.includes(vehicleCategory as never)) &&
      (statCategory === 'All' || stat.category === statCategory),
  );
}

export function mountShipRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);
  const { resolveShipUuid, resolveShip } = makeShipResolver(gameDataService!.ships);

  // ── Helper for vehicle listing routes (ships / ground-vehicles / gravlev) ──
  function mountVehicleListing(path: string, category: 'ship' | 'ground' | 'gravlev'): void {
    router.get(
      path,
      requireGameData,
      asyncHandler(async (req, res) => {
        const t = Date.now();
        const filters = ShipQuery.parse(req.query);
        // Override vehicle_category to the route's category (ignore query param)
        filters.vehicle_category = category;
        const result = await gameDataService!.ships.getAllShips(filters);
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
  }

  mountVehicleListing('/api/v1/ships', 'ship');
  mountVehicleListing('/api/v1/ground-vehicles', 'ground');
  mountVehicleListing('/api/v1/gravlev', 'gravlev');

  router.get(
    '/api/v1/ships/ranking',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const category = String(req.query.category ?? 'ship') || 'ship';
      const requestedSort = String(req.query.sort_by ?? req.query.sort ?? DEFAULT_RANKING_SORT[category] ?? 'scm_speed');
      const stats = getRankingStats(category, String(req.query.stat_category ?? 'All'));
      const sort = stats.some((stat) => stat.key === requestedSort) ? requestedSort : (DEFAULT_RANKING_SORT[category] ?? 'max_speed');
      const order = String(req.query.order ?? 'desc').toUpperCase() === 'ASC' ? 'asc' : 'desc';
      const top = Math.min(500, Math.max(0, Number(req.query.top ?? 50) || 0));
      const result = await gameDataService!.ships.getAllShips({
        env,
        sort,
        order,
        vehicle_category: category || undefined,
        manufacturer: req.query.manufacturer ? String(req.query.manufacturer) : undefined,
        variant_type: 'none', // exclude non-playable variants
        limit: 500,
        page: 1,
      });
      const ships = top > 0 ? result.data.slice(0, top) : result.data;
      const maxByKey = Object.fromEntries(
        stats.map((stat) => {
          const values = result.data.map((ship) => numericStat(ship, stat.key)).filter((value) => value > 0);
          return [stat.key, values.length ? Math.max(...values) : 1];
        }),
      );
      const activeStat = stats.find((stat) => stat.key === sort) ?? stats[0] ?? RANKING_STATS[0];
      const chartData = ships
        .map((ship) => ({
          name: String(ship.name ?? ship.class_name ?? '').slice(0, 22),
          value: numericStat(ship, activeStat.key),
          uuid: String(ship.uuid),
        }))
        .filter((item) => item.value > 0);
      sendWithETag(req, res, {
        success: true,
        data: {
          ships,
          total: result.data.length,
          sort,
          order,
          category,
          statCategory: String(req.query.stat_category ?? 'All'),
          top,
          stats,
          statCategories: RANKING_STAT_CATEGORIES,
          vehicleCategories: RANKING_VEHICLE_CATEGORIES,
          topOptions: RANKING_TOP_OPTIONS,
          maxByKey,
          chartData,
        },
      });
    }),
  );

  // Filters endpoints — ships, ground-vehicles, gravlev each get their own
  for (const [path, cat] of [
    ['/api/v1/ships/filters', 'ship'],
    ['/api/v1/ground-vehicles/filters', 'ground'],
    ['/api/v1/gravlev/filters', 'gravlev'],
  ] as const) {
    router.get(
      path,
      requireGameData,
      asyncHandler(async (req, res) => {
        const env = String(req.query.env ?? 'live');
        const result = await gameDataService!.ships.getShipFilters(env, cat);
        sendWithETag(req, res, { success: true, ...result });
      }),
    );
  }

  router.get(
    '/api/v1/ships/search',
    requireGameData,
    asyncHandler(async (req, res) => {
      const { search } = SearchQuery.parse(req.query);
      if (!search || search.length < 2)
        return void res.status(400).json({ success: false, error: "Query 'search' must be at least 2 characters" });
      const env = String(req.query.env ?? 'live');
      const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
      const data = await gameDataService!.ships.searchShipsAutocomplete(search, limit, env);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/ships/random',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const ship = await gameDataService!.ships.getRandomShip(env);
      if (!ship) return void res.status(404).json({ success: false, error: 'No ships available' });
      sendWithETag(req, res, { success: true, data: ship });
    }),
  );

  router.get(
    '/api/v1/ships/manufacturers',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.ships.getShipManufacturers();
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/ships/audit',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const data = await gameDataService!.ships.getShipCoverageAudit(env);
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const includes = parseIncludes(String(req.query.include ?? ''));
      const ship = await resolveShip(req.params.uuid, env);
      if (!ship) return void res.status(404).json({ success: false, error: 'Ship not found' });
      if (ship.game_data && typeof ship.game_data === 'string')
        try {
          ship.game_data = JSON.parse(ship.game_data as string);
        } catch {
          /* keep raw */
        }
      // Attach lightweight variant list if ship belongs to a chassis family
      if (ship.chassis_id) {
        ship.variants = await gameDataService!.ships.getVariantSummary(Number(ship.chassis_id), String(ship.uuid), env);
      }
      // Optional included relations
      const extras = await Promise.all([
        includes.has('manufacturer') && ship.manufacturer_code
          ? gameDataService!.ships.getManufacturerByCode(String(ship.manufacturer_code), env)
          : null,
        includes.has('paints') ? gameDataService!.paints.getAllPaints({ env, ship_uuid: String(ship.uuid), limit: 200 }) : null,
        includes.has('similar') ? gameDataService!.ships.getSimilarShips(String(ship.uuid), 5, env) : null,
      ]);
      if (extras[0]) ship.manufacturer = extras[0];
      if (extras[1]) ship.paints = extras[1].data;
      if (extras[2]) ship.similar = extras[2];
      sendWithETag(req, res, { success: true, data: ship });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/loadout',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const uuid = await resolveShipUuid(req.params.uuid, env);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const loadout = await gameDataService!.loadouts.getShipLoadout(uuid, env);
      if (!loadout.length) return void res.status(404).json({ success: false, error: 'No loadout found' });
      // Build recursive hierarchical tree (supports turret→gimbal→weapon 3+ levels)
      // Deduplicate by port_name per parent to handle duplicate DB rows from extractor.
      const seenRootNames = new Set<string>();
      const seenChildNames = new Map<number, Set<string>>();
      const rootPorts: Record<string, unknown>[] = [];
      const childMap = new Map<number, Record<string, unknown>[]>();
      for (const p of loadout) {
        const parentId = p.parent_id != null ? Number(p.parent_id) : null;
        const pname = String(p.port_name || '');
        if (parentId) {
          if (!seenChildNames.has(parentId)) seenChildNames.set(parentId, new Set());
          const seen = seenChildNames.get(parentId)!;
          if (seen.has(pname)) continue;
          seen.add(pname);
          if (!childMap.has(parentId)) childMap.set(parentId, []);
          childMap.get(parentId)!.push(p);
        } else {
          if (seenRootNames.has(pname)) continue;
          seenRootNames.add(pname);
          rootPorts.push(p);
        }
      }
      function buildTree(node: Record<string, unknown>): Record<string, unknown> {
        const children = childMap.get(Number(node.id)) || [];
        return { ...node, children: children.map(buildTree) };
      }
      const hierarchical = rootPorts.map(buildTree);
      sendWithETag(req, res, { success: true, data: hierarchical });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/modules',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const uuid = await resolveShipUuid(req.params.uuid, env);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const modules = await gameDataService!.loadouts.getShipModules(uuid, env);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, modules as Record<string, unknown>[], { success: true, data: modules });
      sendWithETag(req, res, { success: true, data: modules });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/paints',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const uuid = await resolveShipUuid(req.params.uuid, env);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const paints = await gameDataService!.loadouts.getShipPaints(uuid, env);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, paints as Record<string, unknown>[], { success: true, data: paints });
      sendWithETag(req, res, { success: true, data: paints });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/stats',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const uuid = await resolveShipUuid(req.params.uuid, env);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const raw = await gameDataService!.loadouts.getShipStats(uuid, env);
      if (!raw) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const s = (raw.stats ?? {}) as Record<string, Record<string, unknown>>;
      const weaponCount = Number((s.weapons as Record<string, unknown>)?.count ?? 0);
      const shieldCount = Number((s.shields as Record<string, unknown>)?.count ?? 0);
      const missileCount = Number((s.missiles as Record<string, unknown>)?.count ?? 0);
      const powerDetails = ((s.power as Record<string, unknown>)?.details as unknown[]) ?? [];
      const coolerDetails = ((s.thermal as Record<string, unknown>)?.details as unknown[]) ?? [];
      const cmDetails = ((s.countermeasures as Record<string, unknown>)?.details as unknown[]) ?? [];
      const utilCount = Number((s.utility as Record<string, unknown>)?.count ?? 0);
      const hasQD = !!(s.quantum as Record<string, unknown>)?.drive_name;
      const by_type: Record<string, number> = {};
      if (weaponCount > 0) by_type.Weapon = weaponCount;
      if (shieldCount > 0) by_type.Shield = shieldCount;
      if (missileCount > 0) by_type.Missile = missileCount;
      if (powerDetails.length > 0) by_type['Power Plant'] = powerDetails.length;
      if (coolerDetails.length > 0) by_type.Cooler = coolerDetails.length;
      if (hasQD) by_type['Quantum Drive'] = 1;
      if (cmDetails.length > 0) by_type.Countermeasure = cmDetails.length;
      if (utilCount > 0) by_type.Utility = utilCount;
      const total_hardpoints = Object.values(by_type).reduce((a, b) => a + b, 0);
      sendWithETag(req, res, {
        success: true,
        data: {
          total_hardpoints,
          weapons: weaponCount,
          shields: shieldCount,
          quantum_drives: hasQD ? 1 : 0,
          fuel_tanks: 0,
          coolers: coolerDetails.length,
          power_plants: powerDetails.length,
          by_type,
        },
      });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/hardpoints',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const uuid = await resolveShipUuid(req.params.uuid, env);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const hardpoints = await gameDataService!.loadouts.getShipHardpoints(uuid, env);
      if (!hardpoints) return void res.status(404).json({ success: false, error: 'Ship not found' });
      sendWithETag(req, res, { success: true, count: hardpoints.length, data: hardpoints });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/similar',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const uuid = await resolveShipUuid(req.params.uuid, env);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const limit = Math.min(10, Math.max(1, parseInt(String(req.query.limit), 10) || 5));
      const data = await gameDataService!.ships.getSimilarShips(uuid, limit, env);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/variants',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const uuid = await resolveShipUuid(req.params.uuid, env);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const data = await gameDataService!.ships.getShipVariants(uuid, env);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/compare/:uuid2',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const [ship1, ship2] = await Promise.all([resolveShip(req.params.uuid, env), resolveShip(req.params.uuid2, env)]);
      if (!ship1) return void res.status(404).json({ success: false, error: `Ship '${req.params.uuid}' not found` });
      if (!ship2) return void res.status(404).json({ success: false, error: `Ship '${req.params.uuid2}' not found` });
      for (const s of [ship1, ship2]) {
        if (s.game_data && typeof s.game_data === 'string')
          try {
            s.game_data = JSON.parse(s.game_data as string);
          } catch {
            /* keep */
          }
      }
      const numericFields = [
        'mass',
        'scm_speed',
        'max_speed',
        'boost_speed_forward',
        'boost_speed_backward',
        'pitch_max',
        'yaw_max',
        'roll_max',
        'total_hp',
        'shield_hp',
        'hydrogen_fuel_capacity',
        'quantum_fuel_capacity',
        'crew_size',
        'armor_physical',
        'armor_energy',
        'armor_distortion',
        'cross_section_x',
        'cross_section_y',
        'cross_section_z',
        'cargo_capacity',
        'missile_damage_total',
        'weapon_damage_total',
        'insurance_claim_time',
        'insurance_expedite_cost',
      ];
      const deltas: Record<string, { ship1: number; ship2: number; diff: number; pct: string }> = {};
      for (const f of numericFields) {
        const v1 = parseFloat(String(ship1[f])) || 0,
          v2 = parseFloat(String(ship2[f])) || 0;
        if (v1 !== 0 || v2 !== 0) {
          const diff = v2 - v1;
          const pct = v1 !== 0 ? `${diff >= 0 ? '+' : ''}${((diff / v1) * 100).toFixed(1)}%` : v2 !== 0 ? '+inf' : '0%';
          deltas[f] = { ship1: v1, ship2: v2, diff: Math.round(diff * 100) / 100, pct };
        }
      }
      res.json({
        success: true,
        data: {
          ship1: { uuid: ship1.uuid, name: ship1.name, class_name: ship1.class_name, manufacturer_code: ship1.manufacturer_code },
          ship2: { uuid: ship2.uuid, name: ship2.name, class_name: ship2.class_name, manufacturer_code: ship2.manufacturer_code },
          comparison: deltas,
          full: { ship1, ship2 },
        },
      });
    }),
  );

  // ── 3D model routes ─────────────────────────────────────────────────────────

  /**
   * GET /api/v1/ships/:uuid/model
   * Returns 3D model metadata (url, format, estimated size).
   */
  router.get(
    '/api/v1/ships/:uuid/model',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const uuid = await resolveShipUuid(req.params.uuid, env);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });

      const ship = await resolveShip(req.params.uuid, env);
      if (!ship) return void res.status(404).json({ success: false, error: 'Ship not found' });

      const ctmUrl = ship.ctm_url as string | null;
      if (!ctmUrl) return void res.status(404).json({ success: false, error: 'No 3D model available for this ship' });

      sendWithETag(req, res, {
        success: true,
        data: {
          uuid,
          name: ship.name,
          format: 'ctm',
          url: ctmUrl,
          proxy_url: `/api/v1/ships/${req.params.uuid}/model/file`,
        },
      });
    }),
  );

  /**
   * GET /api/v1/ships/:uuid/model/file
   * Serves the binary .ctm file with disk cache (lazy).
   * - First request: downloads from RSI, saves to CTM_CACHE_DIR/{uuid}.ctm
   * - Subsequent requests: serves the local file directly
   * - If ctm_url changes in DB (new extraction): sidecar {uuid}.url detects
   *   the change and re-downloads automatically
   */
  router.get(
    '/api/v1/ships/:uuid/model/file',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const uuid = await resolveShipUuid(req.params.uuid, env);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });

      const ship = await resolveShip(req.params.uuid, env);
      if (!ship) return void res.status(404).json({ success: false, error: 'Ship not found' });

      const ctmUrl = ship.ctm_url as string | null;
      if (!ctmUrl) return void res.status(404).json({ success: false, error: 'No 3D model available for this ship' });

      // ── Disk cache ───────────────────────────────────────────────────────
      mkdirSync(CTM_CACHE_DIR, { recursive: true });
      const cacheFile = join(CTM_CACHE_DIR, `${uuid}.ctm`);
      const sidecar = join(CTM_CACHE_DIR, `${uuid}.url`);

      // Invalidate cache if the URL changed since last download
      const cachedUrl = existsSync(sidecar) ? readFileSync(sidecar, 'utf-8').trim() : null;
      if (cachedUrl && cachedUrl !== ctmUrl && existsSync(cacheFile)) {
        unlinkSync(cacheFile);
        unlinkSync(sidecar);
      }

      const etag = `"${createHash('md5').update(ctmUrl).digest('hex').slice(0, 16)}"`;
      const headers = {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${ship.class_name}.ctm"`,
        'Cache-Control': 'public, max-age=86400',
        ETag: etag,
      };

      // ── Serve from cache ─────────────────────────────────────────────────
      if (existsSync(cacheFile)) {
        if (req.headers['if-none-match'] === etag) {
          res.status(304).end();
          return;
        }
        for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
        res.setHeader('X-CTM-Cache', 'HIT');
        res.sendFile(cacheFile);
        return;
      }

      // ── Download from RSI + save ─────────────────────────────────────────
      if (req.headers['if-none-match'] === etag) {
        res.status(304).end();
        return;
      }

      const url = new URL(ctmUrl);
      await new Promise<void>((resolve, reject) => {
        const proxyReq = httpsRequest(
          { hostname: url.hostname, path: url.pathname, method: 'GET', headers: { 'User-Agent': 'starvis/1.0' } },
          (upstream) => {
            if (upstream.statusCode !== 200) {
              res.status(upstream.statusCode ?? 502).json({ success: false, error: 'Upstream error' });
              upstream.resume();
              resolve();
              return;
            }
            for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
            res.setHeader('X-CTM-Cache', 'MISS');
            if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);

            // Pipe simultaneously to the client AND disk cache
            const writer = createWriteStream(cacheFile);
            upstream.pipe(res);
            upstream.pipe(writer);
            writer.on('finish', () => writeFileSync(sidecar, ctmUrl, 'utf-8'));
            writer.on('error', () => {
              try {
                unlinkSync(cacheFile);
              } catch {}
            });
            upstream.on('end', resolve);
            upstream.on('error', (err) => {
              try {
                unlinkSync(cacheFile);
              } catch {}
              reject(err);
            });
          },
        );
        proxyReq.on('error', reject);
        proxyReq.end();
      });
    }),
  );

  // ── Ship modules listing ─────────────────────────────────────────────────────

  router.get(
    '/api/v1/ship-modules',
    requireGameData,
    asyncHandler(async (req, res) => {
      const env = String(req.query.env ?? 'live');
      const ship_uuid = req.query.ship_uuid ? String(req.query.ship_uuid) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const data = await gameDataService!.loadouts.getAllShipModules({ env, ship_uuid, search });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );
}
