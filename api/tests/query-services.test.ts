/**
 * STARVIS - Query service unit tests
 * Tests ShipQueryService, ComponentQueryService, ItemQueryService with mocked prisma
 */
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ComponentQueryService } from '../src/services/component-query-service.js';
import { GameDataService } from '../src/services/game-data-service.js';
import { ItemQueryService } from '../src/services/item-query-service.js';
import { MissionService } from '../src/services/mission-service.js';
import { ShipQueryService } from '../src/services/ship-query-service.js';
import { ShopService } from '../src/services/shop-service.js';

// ── Mock PrismaClient Factory ────────────────────────────

function createMockPrisma(responses: Array<any[]> = []): PrismaClient {
  let callIndex = 0;
  const $queryRawUnsafe = vi.fn(async () => {
    const response = responses[callIndex] || [];
    callIndex++;
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
        [row({ code: 'RSI', name: 'Roberts Space Industries' })],
        [row({ role: 'Combat' }), row({ role: 'Exploration' })],
        [row({ career: 'Military' })],
        [row({ variant_type: 'collector' })],
      ]);
      const svc = new ShipQueryService(createGetClient(prisma));
      const filters = await svc.getShipFilters();
      expect(filters.manufacturers).toEqual([{ code: 'RSI', name: 'Roberts Space Industries' }]);
      expect(filters.roles).toEqual(['Combat', 'Exploration']);
      expect(filters.careers).toEqual(['Military']);
      expect(filters.variant_types).toEqual(['collector']);
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
      // Verify LIKE pattern is passed
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs[1]).toContain('%aurora%');
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
});

// ── ComponentQueryService ────────────────────────────────

describe('ComponentQueryService', () => {
  describe('getComponentFilters', () => {
    it('returns filter values from parallel queries', async () => {
      const prisma = createMockPrisma([
        [row({ type: 'Shield' }), row({ type: 'WeaponGun' })],
        [row({ sub_type: 'Laser' })],
        [row({ size: 1 }), row({ size: 2 })],
        [row({ grade: 'A' }), row({ grade: 'B' })],
      ]);
      const svc = new ComponentQueryService(createGetClient(prisma));
      const f = await svc.getComponentFilters();
      expect(f.types).toEqual(['Shield', 'WeaponGun']);
      expect(f.sub_types).toEqual(['Laser']);
      expect(f.sizes).toEqual([1, 2]);
      expect(f.grades).toEqual(['A', 'B']);
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
      const result = await svc.getComponentShips('component-uuid');

      expect(result).toHaveLength(1);
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs[0]).toContain('LEFT JOIN manufacturers m ON s.manufacturer_code = m.code');
      expect(callArgs[1]).toEqual('component-uuid');
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
});

// ── ItemQueryService ─────────────────────────────────────

describe('ItemQueryService', () => {
  describe('getItemFilters', () => {
    it('returns filter values from parallel queries', async () => {
      const prisma = createMockPrisma([
        [row({ type: 'WeaponPersonal' })],
        [row({ sub_type: 'Rifle' })],
        [row({ manufacturer_code: 'BEHR' })],
      ]);
      const svc = new ItemQueryService(createGetClient(prisma));
      const f = await svc.getItemFilters();
      expect(f.types).toEqual(['WeaponPersonal']);
      expect(f.sub_types).toEqual(['Rifle']);
      expect(f.manufacturers).toEqual(['BEHR']);
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
      expect(countSql).toContain('i.type = ?');
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
      flyable_ships: 80,
      ground_vehicles: 20,
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
    // prisma.$queryRawUnsafe should only be called twice (once for stats, once for latest)
    expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });

  it('getPublicStats passes env to extraction_log query', async () => {
    const statsRow = row({
      ships: 100,
      flyable_ships: 80,
      ground_vehicles: 20,
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
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs[1]).toBe('live');
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
      const prisma = createMockPrisma([[countRow], [m1, m2]]);
      const svc = new MissionService(createGetClient(prisma));
      const result = await svc.getMissions({ env: 'live', page: 1, limit: 50 });
      expect(result.total).toBe(2);
      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
    });

    it('applies type filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new MissionService(createGetClient(prisma));
      await svc.getMissions({ type: 'Bounty' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('COUNT(*)');
    });

    it('applies is_legal = true filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new MissionService(createGetClient(prisma));
      await svc.getMissions({ legal: 'true' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('is_legal = 1');
    });

    it('applies is_legal = false filter', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new MissionService(createGetClient(prisma));
      await svc.getMissions({ legal: 'false' });
      const sql: string = ((prisma as any).$queryRawUnsafe as any).mock.calls[0][0];
      expect(sql).toContain('is_legal = 0');
    });

    it('clamps limit to 200', async () => {
      const prisma = createMockPrisma([[row({ total: 0 })], []]);
      const svc = new MissionService(createGetClient(prisma));
      const result = await svc.getMissions({ limit: 9999 });
      expect(result.limit).toBe(200);
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
      expect(callArgs[1]).toBe(42);
    });
  });
});
