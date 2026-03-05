import type { Router } from 'express';
import { SearchQuery, ShipQuery } from '../schemas.js';
import { asyncHandler, makeGameDataGuard, makeShipResolver, sendCsvOrJson, sendWithETag } from './helpers.js';
import type { RouteDependencies } from './types.js';

export function mountShipRoutes(router: Router, deps: RouteDependencies): void {
  const { gameDataService } = deps;
  const requireGameData = makeGameDataGuard(gameDataService);
  const { resolveShipUuid, resolveShip } = makeShipResolver(gameDataService!);

  router.get(
    '/api/v1/ships',
    requireGameData,
    asyncHandler(async (req, res) => {
      const t = Date.now();
      const filters = ShipQuery.parse(req.query);
      const result = await gameDataService!.getAllShips(filters);
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

  router.get(
    '/api/v1/ships/filters',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getShipFilters();
      sendWithETag(req, res, { success: true, data });
    }),
  );

  router.get(
    '/api/v1/ships/search',
    requireGameData,
    asyncHandler(async (req, res) => {
      const { search } = SearchQuery.parse(req.query);
      if (!search || search.length < 2)
        return void res.status(400).json({ success: false, error: "Query 'search' must be at least 2 characters" });
      const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit), 10) || 10));
      const data = await gameDataService!.searchShipsAutocomplete(search, limit);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/ships/random',
    requireGameData,
    asyncHandler(async (req, res) => {
      const ship = await gameDataService!.getRandomShip();
      if (!ship) return void res.status(404).json({ success: false, error: 'No ships available' });
      sendWithETag(req, res, { success: true, data: ship });
    }),
  );

  router.get(
    '/api/v1/ships/manufacturers',
    requireGameData,
    asyncHandler(async (req, res) => {
      const data = await gameDataService!.getShipManufacturers();
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, data as Record<string, unknown>[], { success: true, count: data.length, data });
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid',
    requireGameData,
    asyncHandler(async (req, res) => {
      const ship = await resolveShip(req.params.uuid);
      if (!ship) return void res.status(404).json({ success: false, error: 'Ship not found' });
      if (ship.game_data && typeof ship.game_data === 'string')
        try {
          ship.game_data = JSON.parse(ship.game_data as string);
        } catch {
          /* keep raw */
        }
      sendWithETag(req, res, { success: true, data: ship });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/loadout',
    requireGameData,
    asyncHandler(async (req, res) => {
      const uuid = await resolveShipUuid(req.params.uuid);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const loadout = await gameDataService!.getShipLoadout(uuid);
      if (!loadout.length) return void res.status(404).json({ success: false, error: 'No loadout found' });
      // Build recursive hierarchical tree (supports turret→gimbal→weapon 3+ levels)
      const rootPorts = loadout.filter((p: Record<string, unknown>) => !p.parent_id);
      const childMap = new Map<number, Record<string, unknown>[]>();
      for (const p of loadout) {
        const parentId = p.parent_id != null ? Number(p.parent_id) : null;
        if (parentId) {
          if (!childMap.has(parentId)) childMap.set(parentId, []);
          childMap.get(parentId)!.push(p);
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
      const uuid = await resolveShipUuid(req.params.uuid);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const modules = await gameDataService!.getShipModules(uuid);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, modules as Record<string, unknown>[], { success: true, data: modules });
      sendWithETag(req, res, { success: true, data: modules });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/paints',
    requireGameData,
    asyncHandler(async (req, res) => {
      const uuid = await resolveShipUuid(req.params.uuid);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const paints = await gameDataService!.getShipPaints(uuid);
      if (req.query.format === 'csv')
        return void sendCsvOrJson(req, res, paints as Record<string, unknown>[], { success: true, data: paints });
      sendWithETag(req, res, { success: true, data: paints });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/stats',
    requireGameData,
    asyncHandler(async (req, res) => {
      const uuid = await resolveShipUuid(req.params.uuid);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const raw = await gameDataService!.getShipStats(uuid);
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
      const uuid = await resolveShipUuid(req.params.uuid);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const hardpoints = await gameDataService!.getShipHardpoints(uuid);
      if (!hardpoints) return void res.status(404).json({ success: false, error: 'Ship not found' });
      sendWithETag(req, res, { success: true, count: hardpoints.length, data: hardpoints });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/similar',
    requireGameData,
    asyncHandler(async (req, res) => {
      const uuid = await resolveShipUuid(req.params.uuid);
      if (!uuid) return void res.status(404).json({ success: false, error: 'Ship not found' });
      const limit = Math.min(10, Math.max(1, parseInt(String(req.query.limit), 10) || 5));
      const data = await gameDataService!.getSimilarShips(uuid, limit);
      sendWithETag(req, res, { success: true, count: data.length, data });
    }),
  );

  router.get(
    '/api/v1/ships/:uuid/compare/:uuid2',
    requireGameData,
    asyncHandler(async (req, res) => {
      const [ship1, ship2] = await Promise.all([resolveShip(req.params.uuid), resolveShip(req.params.uuid2)]);
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
}
