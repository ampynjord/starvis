/**
 * STARVIS - Query service unit tests
 * Tests ShipQueryService, ComponentQueryService, ItemQueryService with mocked prisma
 */
import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { ComponentQueryService } from '../src/services/component-query-service.js';
import { GameDataService } from '../src/services/game-data-service.js';
import { ItemQueryService } from '../src/services/item-query-service.js';
import { ShipQueryService } from '../src/services/ship-query-service.js';

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
      const svc = new ShipQueryService(prisma);
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
      const svc = new ShipQueryService(prisma);
      const ship = await svc.getRandomShip();
      expect(ship).toBeNull();
    });
  });

  describe('getSimilarShips', () => {
    it('returns empty array for unknown UUID', async () => {
      const prisma = createMockPrisma([[]]);
      const svc = new ShipQueryService(prisma);
      const ships = await svc.getSimilarShips('nonexistent');
      expect(ships).toEqual([]);
    });
  });

  describe('searchShipsAutocomplete', () => {
    it('calls prisma.$queryRawUnsafe with LIKE pattern', async () => {
      const mockData = [row({ uuid: 'u1', name: 'Aurora MR', class_name: 'RSI_Aurora_MR' })];
      const prisma = createMockPrisma([mockData]);
      const svc = new ShipQueryService(prisma);
      const results = await svc.searchShipsAutocomplete('aurora', 5);
      expect(results).toHaveLength(1);
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(1);
      // Verify LIKE pattern is passed
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs[1]).toContain('%aurora%');
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
      const svc = new ComponentQueryService(prisma);
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
      const svc = new ComponentQueryService(prisma);
      const result = await svc.resolveComponent(uuid);
      expect(result).toBeTruthy();
      expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(1);
    });

    it('uses className path for non-UUID id', async () => {
      const prisma = createMockPrisma([[row({ uuid: 'u1', class_name: 'KLWE_Laser_S3', name: 'Panther' })]]);
      const svc = new ComponentQueryService(prisma);
      const result = await svc.resolveComponent('KLWE_Laser_S3');
      expect(result).toBeTruthy();
    });
  });

  describe('getComponentShips', () => {
    it('joins manufacturers to provide manufacturer_name safely', async () => {
      const prisma = createMockPrisma([[row({ uuid: 'ship-1', name: 'Gladius', class_name: 'AEGS_Gladius', manufacturer_code: 'AEGS' })]]);
      const svc = new ComponentQueryService(prisma);
      const result = await svc.getComponentShips('component-uuid');

      expect(result).toHaveLength(1);
      const callArgs = ((prisma as any).$queryRawUnsafe as any).mock.calls[0];
      expect(callArgs[0]).toContain('LEFT JOIN manufacturers m ON s.manufacturer_code = m.code');
      expect(callArgs[1]).toEqual('component-uuid');
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
      const svc = new ItemQueryService(prisma);
      const f = await svc.getItemFilters();
      expect(f.types).toEqual(['WeaponPersonal']);
      expect(f.sub_types).toEqual(['Rifle']);
      expect(f.manufacturers).toEqual(['BEHR']);
    });
  });

  describe('getItemTypes', () => {
    it('returns type counts', async () => {
      const prisma = createMockPrisma([[row({ type: 'WeaponPersonal', count: 42 }), row({ type: 'Armor', count: 28 })]]);
      const svc = new ItemQueryService(prisma);
      const result = await svc.getItemTypes();
      expect(result.types).toHaveLength(2);
      expect(result.types[0]).toEqual({ type: 'WeaponPersonal', count: 42 });
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
    const svc = new GameDataService(prisma);
    const r1 = await svc.getPublicStats();
    const r2 = await svc.getPublicStats();
    expect(r1).toEqual(r2);
    // prisma.$queryRawUnsafe should only be called twice (once for stats, once for latest)
    expect((prisma as any).$queryRawUnsafe).toHaveBeenCalledTimes(2);
  });
});
