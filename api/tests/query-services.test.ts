/**
 * STARVIS - Query service unit tests
 * Tests ShipQueryService, ComponentQueryService, ItemQueryService with mocked prisma
 */
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { CommodityQueryService } from '../src/services/commodity-query-service.js';
import { ComponentQueryService } from '../src/services/component-query-service.js';
import { GameDataService } from '../src/services/game-data-service.js';
import { ItemQueryService } from '../src/services/item-query-service.js';
import { LocationQueryService } from '../src/services/location-query-service.js';
import { MissionService } from '../src/services/mission-service.js';
import { ShipQueryService } from '../src/services/ship-query-service.js';
import { ShopService } from '../src/services/shop-service.js';
import { TradeService } from '../src/services/trade-service.js';

// ── Mock PrismaClient Factory ────────────────────────────

function createMockPrisma(responses: Array<any[] | Error> = []): PrismaClient {
  let callIndex = 0;
  const $queryRawUnsafe = vi.fn(async () => {
    const response = responses[callIndex] || [];
    callIndex++;
    if (response instanceof Error) throw response;
    return response;
  });
  return { $queryRawUnsafe } as unknown as PrismaClient;
}

/** Create a plain row object */
function row(data: Record<string, unknown>) {
  return { ...data };
}

function createGetClient(prisma: PrismaClient): (env: string) => PrismaClient {
  return () => prisma;
}

// ── ShipQueryService ─────────────────────────────────────

describe('ShipQueryService', () => {
  describe('getShipFilters', () => {
    it('returns filter values from parallel queries', async () => {
      const prisma = createMockPrisma([
        [row({ value: 'RSI', label: 'Roberts Space Industries', count: 5 })],
        [row({ value: 'Combat' }), row({ value: 'Exploration' })],
        [row({ value: 'Military' })],
        [row({ value: 'collector' })],
        [row({ value: 'ship', count: 10 })],
        [row({ value: 'flight-ready', count: 8 }), row({ value: 'in-concept', count: 2 })],
      ]);
      const svc = new ShipQueryService(createGetClient(prisma));
      const result = await svc.getShipFilters();
      expect(result.filters.manufacturer).toEqual([{ value: 'RSI', label: 'Roberts Space Industries', count: 5 }]);
      expect(result.filters.role?.map((r) => r.value)).toEqual(['Combat', 'Exploration']);
      expect(result.filters.career?.map((r) => r.value)).toEqual(['Military']);
      expect(result.filters.variant_type?.map((r) => r.value)).toEqual(['collector']);
      expect(result.filters.status).toEqual([
        { value: 'flight-ready', label: 'flight-ready', count: 8 },
        { value: 'in-concept', label: 'in-concept', count: 2 },
      ]);
    });
  });

  describe('getRandomShip', () => {
    it('returns null when no ships exist', async () => {
      const prisma = createMockPrisma([[]]);
      const svc = new ShipQueryService(createGetClient(prisma));
      const ship = await svc.getRandomShip();
      expect(ship).toBeNull();
    });
  });

  describe('getSimilarShips', () => {
    it('returns empty array for unknown UUID', async () => {
      const prisma = createMockPrisma([[]]);
      const svc = new ShipQueryService(createGetClient(prisma));
      const ships = await svc.getSimilarShips('nonexistent');
      expect(ships).toEqual([]);
    });
  });

  describe('searchShipsAutocomplete', () => {
    it('calls prisma.$queryRawUnsafe with LIKE pattern', async () => {
      const mockData = [row({ uuid: 'u1', name: 'Aurora MR', class_name: 'RSI_Aurora_MR' })];
      const prisma = createMockPrisma([mockData]);
      const svc = new ShipQueryService(createGetClient(prisma));
      const results = await svc.searchShipsAutocomplete('aurora', 5);
      expect(results).toHaveLength(1);
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(1);
      // Verify LIKE pattern is passed (env is first arg, search term is second)
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs[2]).toContain('%aurora%');
    });
  });

  describe('getAllShips env filtering', () => {
    it('passes env=ptu to query', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new ShipQueryService(createGetClient(prisma));
      await svc.getAllShips({ env: 'ptu' });
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalled();
    });

    it('defaults env to live', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new ShipQueryService(createGetClient(prisma));
      await svc.getAllShips({});
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalled();
    });
  });

  describe('getAllShips concept-only Ship Matrix rows', () => {
    it('includes upcoming Ship Matrix ships in the ships category', async () => {
      const conceptShip = row({
        uuid: 'concept-317',
        class_name: 'odin',
        name: 'Odin',
        manufacturer_code: 'ANVL',
        production_status: 'in-concept',
        vehicle_category: 'ship',
        is_concept_only: true,
      });
      const prisma = createMockPrisma([[row({ total: 0 })], [row({ total: 1 })], [conceptShip]]);
      const svc = new ShipQueryService(createGetClient(prisma));

      const result = await svc.getAllShips({ vehicle_category: 'ship' });

      expect(result.total).toBe(1);
      expect(result.data).toEqual([conceptShip]);
      const calls = ((prisma as any).$queryRawUnsafe as any).mock.calls;
      expect(calls[1][0]).toContain("sm2.production_status IN ('in-concept', 'in-production', 'in-development')");
      expect(calls[1][0]).toContain('END = $2');
      expect(calls[2][0]).toContain('UNION ALL');
      expect(calls[2][0]).toContain('as vehicle_category');
    });

    it('includes upcoming ground Ship Matrix vehicles in ground routes', async () => {
      const conceptGround = row({
        uuid: 'concept-208',
        class_name: 'g12',
        name: 'G12',
        manufacturer_code: 'ORIG',
        production_status: 'in-concept',
        vehicle_category: 'ground',
        is_concept_only: true,
      });
      const prisma = createMockPrisma([[row({ total: 0 })], [row({ total: 1 })], [conceptGround]]);
      const svc = new ShipQueryService(createGetClient(prisma));

      const result = await svc.getAllShips({ vehicle_category: 'ground' });

      expect(result.total).toBe(1);
      expect(result.data).toEqual([conceptGround]);
      const calls = ((prisma as any).$queryRawUnsafe as any).mock.calls;
      expect(calls[1][0]).toContain('END = $2');
      expect(calls[2][0]).toContain('UNION ALL');
    });
  });
});

// ── ComponentQueryService ────────────────────────────────

describe('ComponentQueryService', () => {
  describe('getComponentFilters', () => {
    it('returns filter values from parallel queries', async () => {
      const prisma = createMockPrisma([
        [row({ value: 'Shield', count: 10 }), row({ value: 'WeaponGun', count: 5 })],
        [row({ value: 'Laser', count: 3 })],
        [row({ value: 1 }), row({ value: 2 })],
        [row({ value: 'A' }), row({ value: 'B' })],
        [],
        [],
        [row({ value: 'RSI', label: 'Roberts Space Industries', count: 4 })],
      ]);
      const svc = new ComponentQueryService(createGetClient(prisma));
      const f = await svc.getComponentFilters();
      expect(f.filters.type?.map((r) => r.value)).toEqual(['Shield', 'WeaponGun']);
      expect(f.filters.sub_type?.map((r) => r.value)).toEqual(['Laser']);
      expect(f.filters.size?.map((r) => r.value)).toEqual(['1', '2']);
      expect(f.filters.grade?.map((r) => r.value)).toEqual(['A', 'B']);
      expect(f.filters.manufacturer).toEqual([{ value: 'RSI', label: 'Roberts Space Industries', count: 4 }]);
      const manufacturerSql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[6][0];
      expect(manufacturerSql).toContain('UPPER(TRIM(c.manufacturer_code)) as value');
      expect(manufacturerSql).toContain('GROUP BY UPPER(TRIM(c.manufacturer_code))');
    });
  });

  describe('resolveComponent', () => {
    it('uses UUID path for 36-char id', async () => {
      const uuid = '12345678-1234-1234-1234-123456789012';
      const prisma = createMockPrisma([[row({ uuid, class_name: 'test', name: 'Test' })]]);
      const svc = new ComponentQueryService(createGetClient(prisma));
      const result = await svc.resolveComponent(uuid);
      expect(result).toBeTruthy();
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('uses className path for non-UUID id', async () => {
      const prisma = createMockPrisma([[row({ uuid: 'u1', class_name: 'KLWE_Laser_S3', name: 'Panther' })]]);
      const svc = new ComponentQueryService(createGetClient(prisma));
      const result = await svc.resolveComponent('KLWE_Laser_S3');
      expect(result).toBeTruthy();
    });
  });

  describe('getComponentShips', () => {
    it('joins manufacturers to provide manufacturer_name safely', async () => {
      const prisma = createMockPrisma([[row({ uuid: 'ship-1', name: 'Gladius', class_name: 'AEGS_Gladius', manufacturer_code: 'AEGS' })]]);
      const svc = new ComponentQueryService(createGetClient(prisma));
      const result = await svc.getComponentShips({ uuid: 'component-uuid', class_name: 'KLWE_LaserRepeater_S1' });

      expect(result).toHaveLength(1);
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs[0]).toContain('LEFT JOIN game.manufacturers m ON s.manufacturer_code = m.code');
      expect(callArgs[3]).toEqual('component-uuid');
      expect(callArgs[4]).toEqual('KLWE_LaserRepeater_S1');
      expect(callArgs[0]).toContain('ARRAY_AGG(sl.port_name');
    });
  });

  describe('getComponentBuyLocations', () => {
    it('prefers generic UEX component market rows when available', async () => {
      const prisma = createMockPrisma([[row({ shop_id: 99, shop_name: 'UEX terminal', base_price: 900, source: 'uex' })]]);
      const svc = new ComponentQueryService(createGetClient(prisma));
      const result = await svc.getComponentBuyLocations({ uuid: 'component-uuid', class_name: 'KLWE_LaserRepeater_S1' });

      expect(result).toHaveLength(1);
      expect(result[0].source).toBe('uex');
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs[0]).toContain("p.entity_kind = 'component'");
      expect(callArgs[0]).toContain('game.uex_market_prices');
      expect(callArgs).toContain('component-uuid');
    });

    it('matches shop inventory by uuid and class name', async () => {
      const prisma = createMockPrisma([[], [row({ shop_id: 1, shop_name: 'CenterMass', base_price: 1200 })]]);
      const svc = new ComponentQueryService(createGetClient(prisma));
      const result = await svc.getComponentBuyLocations({ uuid: 'component-uuid', class_name: 'KLWE_LaserRepeater_S1' });

      expect(result).toHaveLength(1);
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[1];
      expect(callArgs[0]).toContain('si.component_uuid = $');
      expect(callArgs[0]).toContain('si.component_class_name = $');
      expect(callArgs[0]).toContain('LOWER(si.component_class_name) = LOWER');
      expect(callArgs).toContain('component-uuid');
      expect(callArgs).toContain('KLWE_LaserRepeater_S1');
    });
  });

  describe('getAllComponents env filtering', () => {
    it('passes env=ptu to SQL queries', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new ComponentQueryService(createGetClient(prisma));
      await svc.getAllComponents({ env: 'ptu' });
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalled();
    });
  });

  describe('getAllComponents weapon subcategory filtering', () => {
    it('derives weapon subtypes used by the frontend chips', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new ComponentQueryService(createGetClient(prisma));
      await svc.getAllComponents({ types: 'WeaponGun', sub_types: 'Beam,Repeater,Scattergun' });

      const countSql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];

      expect(countSql).toContain('weapon_beam_dps IS NOT NULL');
      expect(countSql).toContain("THEN 'Repeater'");
      expect(countSql).toContain("THEN 'Scattergun'");
      expect(countSql).toContain('IN ($');
      expect(callArgs).toContain('Beam');
      expect(callArgs).toContain('Repeater');
      expect(callArgs).toContain('Scattergun');
    });
  });
});

// ── ItemQueryService ─────────────────────────────────────

describe('ItemQueryService', () => {
  describe('getItemFilters', () => {
    it('returns filter values from parallel queries', async () => {
      const prisma = createMockPrisma([
        [row({ value: 'WeaponPersonal', count: 30 })],
        [row({ value: 'Rifle', count: 15 })],
        [row({ value: 'BEHR', label: 'Behring', count: 5 })],
      ]);
      const svc = new ItemQueryService(createGetClient(prisma));
      const f = await svc.getItemFilters();
      expect(f.filters.type?.map((r) => r.value)).toEqual(['WeaponPersonal']);
      expect(f.filters.sub_type?.map((r) => r.value)).toEqual(['Rifle']);
      expect(f.filters.manufacturer?.map((r) => r.value)).toEqual(['BEHR']);
    });
  });

  describe('getItemTypes', () => {
    it('returns type counts', async () => {
      const prisma = createMockPrisma([[row({ type: 'WeaponPersonal', count: 42 }), row({ type: 'Armor', count: 28 })]]);
      const svc = new ItemQueryService(createGetClient(prisma));
      const result = await svc.getItemTypes();
      expect(result.types).toHaveLength(2);
      expect(result.types[0]).toEqual({ type: 'WeaponPersonal', count: 42 });
    });
  });

  describe('getItemBuyLocationResult', () => {
    it('uses UEX item market rows when available', async () => {
      const prisma = createMockPrisma([
        [
          row({
            shop_id: 113,
            shop_name: 'Cubby Area 18',
            location: 'Area 18',
            base_price: 18,
            source: 'uex',
          }),
        ],
      ]);
      const svc = new ItemQueryService(createGetClient(prisma));

      const result = await svc.getItemBuyLocationResult('item-uuid');

      expect(result.source).toBe('uex');
      expect(result.fallbackUsed).toBe(false);
      expect(result.sources.uex).toMatchObject({ status: 'available', count: 1 });
      expect(result.sources.p4k).toMatchObject({ status: 'not_checked', count: null });
      expect(result.data[0]).toMatchObject({ shop_name: 'Cubby Area 18', base_price: 18 });
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('falls back to P4K shop inventory when UEX has no row', async () => {
      const prisma = createMockPrisma([
        [],
        [
          row({
            shop_id: 7,
            shop_name: 'Legacy Shop',
            base_price: 20,
            source: 'p4k',
          }),
        ],
      ]);
      const svc = new ItemQueryService(createGetClient(prisma));

      const result = await svc.getItemBuyLocationResult('item-uuid');

      expect(result.source).toBe('p4k');
      expect(result.fallbackUsed).toBe(true);
      expect(result.reason).toBe('uex_empty_p4k_available');
      expect(result.sources.uex).toMatchObject({ status: 'empty', count: 0 });
      expect(result.sources.p4k).toMatchObject({ status: 'available', count: 1 });
      expect(result.data[0]).toMatchObject({ shop_name: 'Legacy Shop', base_price: 20 });
    });

    it('reports UEX as unavailable when generic market rows are not deployed', async () => {
      const prisma = createMockPrisma([new Error('relation "game.uex_market_prices" does not exist'), []]);
      const svc = new ItemQueryService(createGetClient(prisma));

      const result = await svc.getItemBuyLocationResult('item-uuid');

      expect(result.source).toBe('none');
      expect(result.reason).toBe('no_uex_or_p4k_location_found');
      expect(result.sources.uex).toMatchObject({ status: 'unavailable', count: null, error: 'query_failed' });
      expect(result.sources.p4k).toMatchObject({ status: 'empty', count: 0 });
      expect(result.data).toEqual([]);
    });
  });

  describe('getWeaponAttachmentModifiers', () => {
    it('extracts real weapon modifier multipliers from attachment data_json', async () => {
      const prisma = createMockPrisma([
        [
          row({
            uuid: 'attachment-1',
            class_name: 'test_barrel_s1',
            name: 'Test Barrel',
            display_name: 'Test Barrel',
            manufacturer_code: 'BEHR',
            manufacturer_name: 'Behring',
            data_json: {
              p4kPath: 'libs/foundry/records/entities/scitem/weapons/weapon_modifier/test_barrel_s1.xml',
              rawJson: {
                data: {
                  Components: [
                    {
                      __type: 'SAttachableComponentParams',
                      AttachDef: {
                        SubType: 'BarrelAttachment',
                        mannequinTags: { mannequinBaseTag: 'barrel' },
                      },
                    },
                    {
                      __type: 'SWeaponModifierComponentParams',
                      modifier: {
                        weaponStats: {
                          fireRateMultiplier: 1.12,
                          damageMultiplier: 1.08,
                          spreadModifier: { minMultiplier: 0.9, maxMultiplier: 0.9 },
                        },
                      },
                    },
                  ],
                },
              },
            },
          }),
        ],
      ]);
      const svc = new ItemQueryService(createGetClient(prisma));
      const result = await svc.getWeaponAttachmentModifiers();
      expect(result[0]).toMatchObject({
        slot: 'barrel',
        fire_rate_bonus: 12,
        damage_bonus: 8,
      });
      expect(result[0].effects.map((effect) => effect.key)).toEqual(['fire_rate', 'damage', 'spread']);
    });
  });

  describe('getAllItems env filtering', () => {
    it('passes env=ptu to SQL queries', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new ItemQueryService(createGetClient(prisma));
      await svc.getAllItems({ env: 'ptu' });
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalled();
    });
  });

  describe('getAllItems with types filter', () => {
    it('uses IN clause for multiple types', async () => {
      const prisma = createMockPrisma([[row({ total: 5 })], []]);
      const svc = new ItemQueryService(createGetClient(prisma));
      await svc.getAllItems({ types: 'Armor,Helmet,Undersuit,Clothing' });
      const countSql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(countSql).toContain('IN');
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      // params should include all 4 types
      const paramValues = callArgs.slice(1);
      expect(paramValues).toContain('Armor');
      expect(paramValues).toContain('Helmet');
      expect(paramValues).toContain('Undersuit');
      expect(paramValues).toContain('Clothing');
    });

    it('uses = for a single type via types param', async () => {
      const prisma = createMockPrisma([[row({ total: 3 })], []]);
      const svc = new ItemQueryService(createGetClient(prisma));
      await svc.getAllItems({ types: 'WeaponPersonal' });
      const countSql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(countSql).toContain('i.type = $');
    });

    it('types param takes priority over type param', async () => {
      const prisma = createMockPrisma([[row({ total: 2 })], []]);
      const svc = new ItemQueryService(createGetClient(prisma));
      await svc.getAllItems({ type: 'Gadget', types: 'Armor,Helmet' });
      const countSql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(countSql).toContain('IN');
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      const paramValues = callArgs.slice(1);
      expect(paramValues).toContain('Armor');
      expect(paramValues).toContain('Helmet');
      expect(paramValues).not.toContain('Gadget');
    });
  });
});

// ── GameDataService (cache) ──────────────────────────────

describe('GameDataService cache', () => {
  it('caches getPublicStats for subsequent calls', async () => {
    const statsRow = row({
      ships: 100,
      space_ships: 70,
      ground_vehicles: 20,
      gravlev_vehicles: 10,
      vehicles: 30,
      components: 5000,
      items: 300,
      commodities: 50,
      manufacturers: 40,
      paints: 200,
      shops: 30,
      component_types: 15,
      item_types: 8,
    });
    const latestRow = row({ game_version: '4.0', extracted_at: '2025-01-01' });
    const prisma = createMockPrisma([
      // First call: stats query
      [statsRow],
      // First call: latest extraction
      [latestRow],
      // If cache misses, would need more...
    ]);
    const svc = new GameDataService(createGetClient(prisma), prisma);
    const r1 = await svc.getPublicStats();
    const r2 = await svc.getPublicStats();
    expect(r1).toEqual(r2);
    expect(r1).toMatchObject({
      ships: 100,
      space_ships: 70,
      flyable_ships: 70,
      ground_vehicles: 20,
      gravlev_vehicles: 10,
      vehicles: 30,
    });
    // prisma.$queryRawUnsafe should only be called twice (once for stats, once for latest)
    expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('getPublicStats passes env to extraction_log query', async () => {
    const statsRow = row({
      ships: 100,
      space_ships: 70,
      ground_vehicles: 20,
      gravlev_vehicles: 10,
      vehicles: 30,
      components: 5000,
      items: 300,
      commodities: 50,
      manufacturers: 40,
      paints: 200,
      shops: 30,
      component_types: 15,
      item_types: 8,
    });
    const latestRow = row({ game_version: '4.7', extracted_at: '2026-01-01' });
    const prisma = createMockPrisma([[statsRow], [latestRow]]);
    const svc = new GameDataService(createGetClient(prisma), prisma);
    await svc.getPublicStats('ptu');
    // Second call should be extraction_log query with env=ptu
    const extractionCallArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[1];
    expect(extractionCallArgs[0]).toContain('game_env');
    expect(extractionCallArgs.slice(1)).toContain('ptu');
  });
});

// ── MissionService ───────────────────────────────────────

describe('MissionService', () => {
  describe('getMissionTypes', () => {
    it('returns distinct mission types for given env', async () => {
      const prisma = createMockPrisma([[row({ mission_type: 'Bounty' }), row({ mission_type: 'Delivery' })]]);
      const svc = new MissionService(createGetClient(prisma));
      const types = await svc.getMissionTypes('live');
      expect(types).toEqual(['Bounty', 'Delivery']);
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('defaults to live env', async () => {
      const prisma = createMockPrisma([[row({ mission_type: 'Combat' })]]);
      const svc = new MissionService(createGetClient(prisma));
      const types = await svc.getMissionTypes();
      expect(types).toEqual(['Combat']);
    });
  });

  describe('getMissions', () => {
    it('returns paginated missions', async () => {
      const countRow = row({ total: 2 });
      const m1 = row({
        uuid: 'u1',
        class_name: 'mission_bounty_01',
        title: 'Bounty Hunt',
        mission_type: 'Bounty',
        is_legal: 1,
        can_be_shared: 0,
        game_env: 'live',
      });
      const m2 = row({
        uuid: 'u2',
        class_name: 'mission_delivery_01',
        title: 'Deliver Cargo',
        mission_type: 'Delivery',
        is_legal: 1,
        can_be_shared: 1,
        game_env: 'live',
      });
      const prisma = createMockPrisma([
        [countRow],
        [
          row({
            blueprint_rewards: 1,
            average_reward: 12000,
            legal_missions: 2,
            illegal_missions: 0,
            shareable_missions: 1,
            unique_missions: 0,
            average_danger: 2.5,
          }),
        ],
        [m1, m2],
      ]);
      const svc = new MissionService(createGetClient(prisma));
      const result = await svc.getMissions({ env: 'live', page: 1, limit: 50 });
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.summary).toEqual({
        blueprintRewards: 1,
        averageReward: 12000,
        legalMissions: 2,
        illegalMissions: 0,
        shareableMissions: 1,
        uniqueMissions: 0,
        averageDanger: 2.5,
      });
    });

    it('applies type filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], [row({ blueprint_rewards: 0, average_reward: null })], []]);
      const svc = new MissionService(createGetClient(prisma));
      await svc.getMissions({ type: 'Bounty' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('COUNT(*)');
    });

    it('applies is_legal = true filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], [row({ blueprint_rewards: 0, average_reward: null })], []]);
      const svc = new MissionService(createGetClient(prisma));
      await svc.getMissions({ legal: 'true' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('is_legal = true');
    });

    it('applies is_legal = false filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], [row({ blueprint_rewards: 0, average_reward: null })], []]);
      const svc = new MissionService(createGetClient(prisma));
      await svc.getMissions({ legal: 'false' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('is_legal = false');
    });

    it('applies can_be_shared = false filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], [row({ blueprint_rewards: 0, average_reward: null })], []]);
      const svc = new MissionService(createGetClient(prisma));
      await svc.getMissions({ shared: 'false' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('can_be_shared = false');
    });

    it('clamps limit to 200', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], [row({ blueprint_rewards: 0, average_reward: null })], []]);
      const svc = new MissionService(createGetClient(prisma));
      const result = await svc.getMissions({ limit: 9999 });
      expect(result.limit).toBe(200);
    });

    it('applies blueprint reward filtering and reward sorting in SQL', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], [row({ blueprint_rewards: 0, average_reward: null })], []]);
      const svc = new MissionService(createGetClient(prisma));
      await svc.getMissions({ blueprintReward: 'true', sort: 'reward_desc' });
      const countSql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      const dataSql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[2][0];
      expect(countSql).toContain('has_blueprint_reward = true');
      expect(dataSql).toContain('COALESCE(m.reward_max, m.reward_min, 0) DESC');
    });
  });

  describe('getMissionByUuid', () => {
    it('returns mission when found', async () => {
      const mission = row({ uuid: 'abc-123', class_name: 'test', title: 'Test Mission', mission_type: 'Bounty' });
      const prisma = createMockPrisma([[mission]]);
      const svc = new MissionService(createGetClient(prisma));
      const result = await svc.getMissionByUuid('abc-123');
      expect(result).toBeTruthy();
      expect(result?.uuid).toBe('abc-123');
    });

    it('returns null when not found', async () => {
      const prisma = createMockPrisma([[]]);
      const svc = new MissionService(createGetClient(prisma));
      const result = await svc.getMissionByUuid('nonexistent');
      expect(result).toBeNull();
    });
  });
});

// ── ShopService ──────────────────────────────────────────

describe('ShopService', () => {
  describe('getShops', () => {
    it('returns paginated shops', async () => {
      const prisma = createMockPrisma([
        [row({ count: 3 })],
        [row({ id: 1, name: "Dumper's Depot", location: 'Area 18' }), row({ id: 2, name: 'Astro Armada', location: 'Area 18' })],
      ]);
      const svc = new ShopService(createGetClient(prisma));
      const result = await svc.getShops({});
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(2);
    });

    it('applies search filter', async () => {
      const prisma = createMockPrisma([[row({ count: 0 })], []]);
      const svc = new ShopService(createGetClient(prisma));
      await svc.getShops({ search: 'Dumper' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('WHERE');
    });

    it('applies type filter', async () => {
      const prisma = createMockPrisma([[row({ count: 0 })], []]);
      const svc = new ShopService(createGetClient(prisma));
      await svc.getShops({ type: 'Weapons' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('shop_type');
    });
  });

  describe('getShopInventory', () => {
    it('returns inventory for given shop id', async () => {
      const inv = [row({ id: 1, shop_id: 42, component_name: 'Laser Cannon' })];
      const prisma = createMockPrisma([inv]);
      const svc = new ShopService(createGetClient(prisma));
      const result = await svc.getShopInventory(42);
      expect(result).toHaveLength(1);
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs[2]).toBe(42);
    });
  });

  describe('getShopsByLocation', () => {
    it('returns shops attached by location uuid or canonical location key', async () => {
      const shops = [row({ id: 1, name: 'Cubby Blast', location_uuid: 'loc-1', inventory_count: BigInt(195) })];
      const prisma = createMockPrisma([shops]);
      const svc = new ShopService(createGetClient(prisma));
      const result = await svc.getShopsByLocation('loc-1');
      expect(result).toHaveLength(1);
      expect(result[0].inventory_count).toBe(195);
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('s.location_uuid');
      expect(sql).toContain('canonical_location_key');
    });
  });
});

// ── ShipQueryService — Manufacturers ────────────────────

describe('ShipQueryService manufacturers', () => {
  describe('getAllManufacturers', () => {
    it('returns manufacturers with counts as Numbers', async () => {
      const rows = [
        { code: 'AEGS', name: 'Aegis', ship_count: BigInt(12), component_count: BigInt(45), item_count: BigInt(0) },
        { code: 'ANVL', name: 'Anvil', ship_count: BigInt(8), component_count: BigInt(20), item_count: BigInt(3) },
      ];
      const prisma = createMockPrisma([rows]);
      const svc = new ShipQueryService(createGetClient(prisma));
      const result = await svc.getAllManufacturers();
      expect(result).toHaveLength(2);
      expect(result[0].ship_count).toBe(12);
      expect(result[0].component_count).toBe(45);
      expect(result[1].item_count).toBe(3);
      expect(typeof result[0].ship_count).toBe('number');
    });

    it('uses pre-aggregated subqueries (no cartesian cross-join)', async () => {
      const prisma = createMockPrisma([
        [{ code: 'RSI', name: 'RSI', ship_count: BigInt(1), component_count: BigInt(0), item_count: BigInt(0) }],
      ]);
      const svc = new ShipQueryService(createGetClient(prisma));
      await svc.getAllManufacturers();
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      // Must use subquery GROUP BY for each table, not a single multi-table JOIN with COUNT(DISTINCT)
      expect(sql).toContain('GROUP BY manufacturer_code');
      expect(sql).not.toContain('COUNT(DISTINCT');
    });

    it('filters with onlyWithData=true by default', async () => {
      const prisma = createMockPrisma([[]]);
      const svc = new ShipQueryService(createGetClient(prisma));
      await svc.getAllManufacturers('live', true);
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('WHERE');
    });

    it('omits outer WHERE filter when onlyWithData=false', async () => {
      const prisma = createMockPrisma([[]]);
      const svc = new ShipQueryService(createGetClient(prisma));
      await svc.getAllManufacturers('live', false);
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).not.toContain('WHERE COALESCE');
    });

    it('orders by m.name', async () => {
      const prisma = createMockPrisma([[]]);
      const svc = new ShipQueryService(createGetClient(prisma));
      await svc.getAllManufacturers();
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('ORDER BY m.name');
    });

    it('supports ptu env', async () => {
      const prisma = createMockPrisma([[]]);
      const getClientSpy = vi.fn(() => prisma);
      const svc = new ShipQueryService(getClientSpy as (env: string) => PrismaClient);
      await svc.getAllManufacturers('ptu');
      expect(getClientSpy).toHaveBeenCalledWith('ptu');
    });
  });

  describe('getManufacturerByCode', () => {
    it('returns manufacturer when found', async () => {
      const prisma = createMockPrisma([
        [
          {
            code: 'AEGS',
            name: 'Aegis',
            description: 'Military ships',
            ship_count: BigInt(12),
            component_count: BigInt(45),
            item_count: BigInt(0),
          },
        ],
      ]);
      const svc = new ShipQueryService(createGetClient(prisma));
      const result = await svc.getManufacturerByCode('aegs');
      expect(result).not.toBeNull();
      expect(result?.code).toBe('AEGS');
      expect(result?.ship_count).toBe(12);
    });

    it('returns null when not found', async () => {
      const prisma = createMockPrisma([[]]);
      const svc = new ShipQueryService(createGetClient(prisma));
      const result = await svc.getManufacturerByCode('UNKNOWN');
      expect(result).toBeNull();
    });

    it('uppercases the code before query', async () => {
      const prisma = createMockPrisma([
        [{ code: 'AEGS', name: 'Aegis', ship_count: BigInt(1), component_count: BigInt(0), item_count: BigInt(0) }],
      ]);
      const svc = new ShipQueryService(createGetClient(prisma));
      await svc.getManufacturerByCode('aegs');
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs.slice(1)).toContain('AEGS');
    });

    it('uses pre-aggregated subqueries without cartesian join', async () => {
      const prisma = createMockPrisma([[{ code: 'RSI', ship_count: BigInt(5), component_count: BigInt(10), item_count: BigInt(2) }]]);
      const svc = new ShipQueryService(createGetClient(prisma));
      await svc.getManufacturerByCode('RSI');
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).not.toContain('COUNT(DISTINCT');
      expect(sql).toContain('WHERE manufacturer_code = $');
    });
  });

  describe('getManufacturerShips', () => {
    it('returns ships list for given manufacturer', async () => {
      const ships = [
        row({ uuid: 'u1', name: 'Gladius', class_name: 'AEGS_Gladius', manufacturer_code: 'AEGS' }),
        row({ uuid: 'u2', name: 'Hammerhead', class_name: 'AEGS_Hammerhead', manufacturer_code: 'AEGS' }),
      ];
      const prisma = createMockPrisma([ships]);
      const svc = new ShipQueryService(createGetClient(prisma));
      const result = await svc.getManufacturerShips('AEGS');
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Gladius');
    });

    it('passes code to WHERE clause', async () => {
      const prisma = createMockPrisma([[]]);
      const svc = new ShipQueryService(createGetClient(prisma));
      await svc.getManufacturerShips('ANVL');
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs.slice(1)).toContain('ANVL');
    });
  });
});

// ── CommodityQueryService ────────────────────────────────

describe('CommodityQueryService', () => {
  describe('getCommodityTypes', () => {
    it('returns type counts array', async () => {
      const prisma = createMockPrisma([[row({ type: 'RawMaterial', count: 20 }), row({ type: 'Gas', count: 5 })]]);
      const svc = new CommodityQueryService(createGetClient(prisma));
      const result = await svc.getCommodityTypes();
      expect(result.types).toHaveLength(2);
      expect(result.types[0]).toMatchObject({ type: 'RawMaterial', count: 20 });
    });
  });

  describe('getAllCommodities', () => {
    it('returns paginated commodities', async () => {
      const prisma = createMockPrisma([
        [row({ total: 2 })],
        [row({ uuid: 'c1', name: 'Laranite', type: 'RawMaterial' }), row({ uuid: 'c2', name: 'Agricium', type: 'RawMaterial' })],
      ]);
      const svc = new CommodityQueryService(createGetClient(prisma));
      const result = await svc.getAllCommodities({});
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
    });

    it('applies search filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new CommodityQueryService(createGetClient(prisma));
      await svc.getAllCommodities({ search: 'lara' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('LIKE');
    });

    it('applies type filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new CommodityQueryService(createGetClient(prisma));
      await svc.getAllCommodities({ type: 'Gas' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('type');
    });

    it('applies multiple types filter (IN clause)', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new CommodityQueryService(createGetClient(prisma));
      await svc.getAllCommodities({ types: 'Gas,RawMaterial' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('IN');
    });
  });
});

// ── LocationQueryService ─────────────────────────────────

// --- TradeService -----------------------------------------------------------

describe('TradeService', () => {
  describe('getCommodityPriceResult', () => {
    it('uses UEX commodity prices before P4K fallback', async () => {
      const prisma = createMockPrisma([
        [
          row({
            id: 10,
            buy_price: 42,
            sell_price: 55,
            shop_id: 99,
            shop_name: 'UEX Terminal',
            source: 'uex',
          }),
        ],
      ]);
      const svc = new TradeService(createGetClient(prisma));

      const result = await svc.getCommodityPriceResult('commodity-1');

      expect(result.source).toBe('uex');
      expect(result.fallbackUsed).toBe(false);
      expect(result.sources.uex).toMatchObject({ status: 'available', count: 1 });
      expect(result.sources.p4k).toMatchObject({ status: 'not_checked', count: null });
      expect(result.data[0]).toMatchObject({ shop_name: 'UEX Terminal', buy_price: 42 });
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('falls back to P4K shop inventory prices when UEX has no row', async () => {
      const prisma = createMockPrisma([
        [],
        [
          row({
            id: 20,
            buy_price: 35,
            sell_price: 48,
            shop_id: 5,
            shop_name: 'Legacy Shop',
          }),
        ],
      ]);
      const svc = new TradeService(createGetClient(prisma));

      const result = await svc.getCommodityPriceResult('commodity-1');

      expect(result.source).toBe('p4k');
      expect(result.fallbackUsed).toBe(true);
      expect(result.reason).toBe('uex_empty_p4k_available');
      expect(result.sources.uex).toMatchObject({ status: 'empty', count: 0 });
      expect(result.sources.p4k).toMatchObject({ status: 'available', count: 1 });
      expect(result.data[0]).toMatchObject({ shop_name: 'Legacy Shop', sell_price: 48 });
    });

    it('reports UEX as unavailable when the UEX query fails and no P4K price exists', async () => {
      const prisma = createMockPrisma([new Error('relation "game.uex_market_prices" does not exist'), []]);
      const svc = new TradeService(createGetClient(prisma));

      const result = await svc.getCommodityPriceResult('commodity-1');

      expect(result.source).toBe('none');
      expect(result.reason).toBe('no_uex_or_p4k_price_found');
      expect(result.sources.uex).toMatchObject({ status: 'unavailable', count: null, error: 'query_failed' });
      expect(result.sources.p4k).toMatchObject({ status: 'empty', count: 0 });
      expect(result.data).toEqual([]);
    });
  });
});

describe('LocationQueryService', () => {
  describe('getLocationTypes', () => {
    it('returns distinct location types', async () => {
      const prisma = createMockPrisma([[row({ type: 'Planet' }), row({ type: 'Station' })]]);
      const svc = new LocationQueryService(createGetClient(prisma));
      const result = await svc.getLocationTypes();
      expect(result).toEqual(['Planet', 'Station']);
    });
  });

  describe('getLocationSystems', () => {
    it('returns distinct systems', async () => {
      const prisma = createMockPrisma([[row({ system_code: 'Stanton' }), row({ system_code: 'Pyro' })]]);
      const svc = new LocationQueryService(createGetClient(prisma));
      const result = await svc.getLocationSystems();
      expect(result).toEqual(['Stanton', 'Pyro']);
    });
  });

  describe('getLocations', () => {
    it('returns paginated locations', async () => {
      const prisma = createMockPrisma([[row({ total: 3 })], [row({ uuid: 'l1', name: 'New Babbage', type: 'City', system: 'Stanton' })]]);
      const svc = new LocationQueryService(createGetClient(prisma));
      const result = await svc.getLocations({});
      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(1);
    });

    it('applies type filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new LocationQueryService(createGetClient(prisma));
      await svc.getLocations({ type: 'Planet' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('type');
    });

    it('applies system filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new LocationQueryService(createGetClient(prisma));
      await svc.getLocations({ system: 'Stanton' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('system');
    });
  });

  describe('getLocation', () => {
    it('returns a single location by uuid', async () => {
      const prisma = createMockPrisma([[row({ uuid: 'loc-1', name: 'Lorville', type: 'City', system: 'Stanton' })]]);
      const svc = new LocationQueryService(createGetClient(prisma));
      const result = await svc.getLocation('loc-1');
      expect(result?.name).toBe('Lorville');
    });

    it('returns null for unknown uuid', async () => {
      const prisma = createMockPrisma([[]]);
      const svc = new LocationQueryService(createGetClient(prisma));
      const result = await svc.getLocation('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getTree', () => {
    it('nests locations and attaches shops to their location', async () => {
      const locationRows = [
        row({ uuid: 'system-1', name: 'Stanton', type: 'system', loc_key: 'stanton', parent_uuid: null }),
        row({ uuid: 'city-1', name: 'Area18', type: 'landing_zone', loc_key: 'area18', parent_uuid: 'system-1' }),
      ];
      const shopRows = [row({ id: 12, name: 'Cubby Blast', shop_type: 'weapons', location_uuid: 'city-1', inventory_count: BigInt(195) })];
      const prisma = createMockPrisma([locationRows, shopRows]);
      const svc = new LocationQueryService(createGetClient(prisma));
      const tree = await svc.getTree();
      expect(tree).toHaveLength(1);
      expect((tree[0].children as any[])[0].name).toBe('Area18');
      expect((tree[0].children as any[])[0].shops[0].name).toBe('Cubby Blast');
      expect((tree[0].children as any[])[0].shops[0].inventory_count).toBe(195);
    });
  });
});
