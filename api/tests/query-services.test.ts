/**
 * STARVIS - Query service unit tests
 * Tests ShipQueryService, ComponentQueryService, ItemQueryService with mocked pool
 */
import type { Pool } from "mysql2/promise";
import { describe, expect, it, vi } from "vitest";
import { ComponentQueryService } from "../src/services/component-query-service.js";
import { GameDataService } from "../src/services/game-data-service.js";
import { ItemQueryService } from "../src/services/item-query-service.js";
import { ShipQueryService } from "../src/services/ship-query-service.js";

// ── Mock Pool Factory ────────────────────────────────────

function createMockPool(responses: Array<[any[], any[]]> = []): Pool {
  let callIndex = 0;
  const execute = vi.fn(async () => {
    const response = responses[callIndex] || [[], []];
    callIndex++;
    return response;
  });
  return { execute } as unknown as Pool;
}

/** Create a row with RowDataPacket shape */
function row(data: Record<string, unknown>) {
  return { ...data, constructor: { name: "RowDataPacket" } };
}

// ── ShipQueryService ─────────────────────────────────────

describe("ShipQueryService", () => {
  describe("getShipFilters", () => {
    it("returns filter values from parallel queries", async () => {
      const pool = createMockPool([
        [[row({ role: "Combat" }), row({ role: "Exploration" })], []],
        [[row({ career: "Military" })], []],
        [[row({ variant_type: "collector" })], []],
      ]);
      const svc = new ShipQueryService(pool);
      const filters = await svc.getShipFilters();
      expect(filters.roles).toEqual(["Combat", "Exploration"]);
      expect(filters.careers).toEqual(["Military"]);
      expect(filters.variant_types).toEqual(["collector"]);
    });
  });

  describe("getRandomShip", () => {
    it("returns null when no ships exist", async () => {
      const pool = createMockPool([[[], []]]);
      const svc = new ShipQueryService(pool);
      const ship = await svc.getRandomShip();
      expect(ship).toBeNull();
    });
  });

  describe("getSimilarShips", () => {
    it("returns empty array for unknown UUID", async () => {
      const pool = createMockPool([[[], []]]);
      const svc = new ShipQueryService(pool);
      const ships = await svc.getSimilarShips("nonexistent");
      expect(ships).toEqual([]);
    });
  });

  describe("searchShipsAutocomplete", () => {
    it("calls pool.execute with LIKE pattern", async () => {
      const mockData = [row({ uuid: "u1", name: "Aurora MR", class_name: "RSI_Aurora_MR" })];
      const pool = createMockPool([[mockData, []]]);
      const svc = new ShipQueryService(pool);
      const results = await svc.searchShipsAutocomplete("aurora", 5);
      expect(results).toHaveLength(1);
      expect(pool.execute).toHaveBeenCalledTimes(1);
      // Verify LIKE pattern is passed
      const callArgs = (pool.execute as any).mock.calls[0];
      expect(callArgs[1]).toContain("%aurora%");
    });
  });
});

// ── ComponentQueryService ────────────────────────────────

describe("ComponentQueryService", () => {
  describe("getComponentFilters", () => {
    it("returns filter values from parallel queries", async () => {
      const pool = createMockPool([
        [[row({ type: "Shield" }), row({ type: "WeaponGun" })], []],
        [[row({ sub_type: "Laser" })], []],
        [[row({ size: 1 }), row({ size: 2 })], []],
        [[row({ grade: "A" }), row({ grade: "B" })], []],
      ]);
      const svc = new ComponentQueryService(pool);
      const f = await svc.getComponentFilters();
      expect(f.types).toEqual(["Shield", "WeaponGun"]);
      expect(f.sub_types).toEqual(["Laser"]);
      expect(f.sizes).toEqual([1, 2]);
      expect(f.grades).toEqual(["A", "B"]);
    });
  });

  describe("resolveComponent", () => {
    it("uses UUID path for 36-char id", async () => {
      const uuid = "12345678-1234-1234-1234-123456789012";
      const pool = createMockPool([[
        [row({ uuid, class_name: "test", name: "Test" })], [],
      ]]);
      const svc = new ComponentQueryService(pool);
      const result = await svc.resolveComponent(uuid);
      expect(result).toBeTruthy();
      expect(pool.execute).toHaveBeenCalledTimes(1);
    });

    it("uses className path for non-UUID id", async () => {
      const pool = createMockPool([[
        [row({ uuid: "u1", class_name: "KLWE_Laser_S3", name: "Panther" })], [],
      ]]);
      const svc = new ComponentQueryService(pool);
      const result = await svc.resolveComponent("KLWE_Laser_S3");
      expect(result).toBeTruthy();
    });
  });
});

// ── ItemQueryService ─────────────────────────────────────

describe("ItemQueryService", () => {
  describe("getItemFilters", () => {
    it("returns filter values from parallel queries", async () => {
      const pool = createMockPool([
        [[row({ type: "WeaponPersonal" })], []],
        [[row({ sub_type: "Rifle" })], []],
        [[row({ manufacturer_code: "BEHR" })], []],
      ]);
      const svc = new ItemQueryService(pool);
      const f = await svc.getItemFilters();
      expect(f.types).toEqual(["WeaponPersonal"]);
      expect(f.sub_types).toEqual(["Rifle"]);
      expect(f.manufacturers).toEqual(["BEHR"]);
    });
  });

  describe("getItemTypes", () => {
    it("returns type counts", async () => {
      const pool = createMockPool([[
        [row({ type: "WeaponPersonal", count: 42 }), row({ type: "Armor", count: 28 })], [],
      ]]);
      const svc = new ItemQueryService(pool);
      const result = await svc.getItemTypes();
      expect(result.types).toHaveLength(2);
      expect(result.types[0]).toEqual({ type: "WeaponPersonal", count: 42 });
    });
  });
});

// ── GameDataService (cache) ──────────────────────────────

describe("GameDataService cache", () => {
  it("caches getPublicStats for subsequent calls", async () => {
    const statsRow = row({
      ships: 100, flyable_ships: 80, ground_vehicles: 20,
      components: 5000, items: 300, commodities: 50,
      manufacturers: 40, paints: 200, shops: 30,
      component_types: 15, item_types: 8,
    });
    const latestRow = row({ game_version: "4.0", extracted_at: "2025-01-01" });
    const pool = createMockPool([
      // First call: stats query
      [[statsRow], []],
      // First call: latest extraction
      [[latestRow], []],
      // If cache misses, would need more...
    ]);
    const svc = new GameDataService(pool);
    const r1 = await svc.getPublicStats();
    const r2 = await svc.getPublicStats();
    expect(r1).toEqual(r2);
    // pool.execute should only be called twice (once for stats, once for latest)
    expect(pool.execute).toHaveBeenCalledTimes(2);
  });
});
