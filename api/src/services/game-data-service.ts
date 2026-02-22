/**
 * GameDataService — Facade that delegates to focused sub-services
 *
 * Sub-services:
 *   ShipQueryService      — ship listing, filters, manufacturers
 *   ComponentQueryService  — component CRUD, filters, buy locations
 *   LoadoutService         — loadout calculator, hardpoints, stats
 *   ShopService            — shop listing, inventory
 *   ItemQueryService       — FPS weapons, armor, clothing, gadgets
 *   CommodityQueryService  — tradeable/mineable goods
 *
 * This facade keeps the same public API so routes.ts is untouched.
 */
import type { Pool } from "mysql2/promise";
import { CommodityQueryService } from "./commodity-query-service.js";
import { ComponentQueryService } from "./component-query-service.js";
import { ItemQueryService } from "./item-query-service.js";
import { LoadoutService } from "./loadout-service.js";
import type { PaginatedResult, Row } from "./shared.js";
import { ShipQueryService } from "./ship-query-service.js";
import { ShopService } from "./shop-service.js";

export type { PaginatedResult, Row };

// ── Simple TTL cache ──────────────────────────────────────
class TtlCache<T> {
  private data: T | undefined;
  private expiresAt = 0;
  constructor(private ttlMs: number) {}
  get(): T | undefined { return Date.now() < this.expiresAt ? this.data : undefined; }
  set(value: T): void { this.data = value; this.expiresAt = Date.now() + this.ttlMs; }
  invalidate(): void { this.expiresAt = 0; }
}

export class GameDataService {
  private ships: ShipQueryService;
  private components: ComponentQueryService;
  private loadouts: LoadoutService;
  private shopsSvc: ShopService;
  private itemsSvc: ItemQueryService;
  private commoditiesSvc: CommodityQueryService;
  private statsCache = new TtlCache<Record<string, unknown>>(60_000);       // 1 min
  private publicStatsCache = new TtlCache<Record<string, unknown>>(60_000); // 1 min

  constructor(private pool: Pool) {
    this.ships       = new ShipQueryService(pool);
    this.components  = new ComponentQueryService(pool);
    this.loadouts    = new LoadoutService(pool);
    this.shopsSvc    = new ShopService(pool);
    this.itemsSvc    = new ItemQueryService(pool);
    this.commoditiesSvc = new CommodityQueryService(pool);
  }

  // ── Ships (delegated) ───────────────────────────────────

  getAllShips(filters?: {
    manufacturer?: string; role?: string; career?: string; status?: string;
    vehicle_category?: string; variant_type?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }): Promise<PaginatedResult> {
    return this.ships.getAllShips(filters);
  }

  getShipByUuid(uuid: string) { return this.ships.getShipByUuid(uuid); }
  getShipByClassName(className: string) { return this.ships.getShipByClassName(className); }
  getShipFilters() { return this.ships.getShipFilters(); }
  getAllManufacturers() { return this.ships.getAllManufacturers(); }
  getShipManufacturers() { return this.ships.getShipManufacturers(); }
  getManufacturerByCode(code: string) { return this.ships.getManufacturerByCode(code); }
  getManufacturerShips(code: string) { return this.ships.getManufacturerShips(code); }
  getManufacturerComponents(code: string) { return this.ships.getManufacturerComponents(code); }
  searchShipsAutocomplete(q: string, limit?: number) { return this.ships.searchShipsAutocomplete(q, limit); }
  getRandomShip() { return this.ships.getRandomShip(); }
  getSimilarShips(uuid: string, limit?: number) { return this.ships.getSimilarShips(uuid, limit); }

  // ── Components (delegated) ──────────────────────────────

  getAllComponents(filters?: {
    type?: string; sub_type?: string; size?: string; grade?: string;
    min_size?: string; max_size?: string;
    manufacturer?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }): Promise<PaginatedResult> {
    return this.components.getAllComponents(filters);
  }

  getComponentByUuid(uuid: string) { return this.components.getComponentByUuid(uuid); }
  getComponentByClassName(className: string) { return this.components.getComponentByClassName(className); }
  resolveComponent(id: string) { return this.components.resolveComponent(id); }
  getComponentFilters() { return this.components.getComponentFilters(); }
  getComponentBuyLocations(uuid: string) { return this.components.getComponentBuyLocations(uuid); }
  getComponentShips(uuid: string) { return this.components.getComponentShips(uuid); }
  getComponentTypes() { return this.components.getComponentTypes(); }

  // ── Loadout (delegated) ─────────────────────────────────

  getShipLoadout(shipUuid: string) { return this.loadouts.getShipLoadout(shipUuid); }
  getShipModules(shipUuid: string) { return this.loadouts.getShipModules(shipUuid); }
  getShipPaints(shipUuid: string) { return this.loadouts.getShipPaints(shipUuid); }
  getAllPaints(opts: { search?: string; ship_uuid?: string; page?: number; limit?: number }) { return this.loadouts.getAllPaints(opts); }
  calculateLoadout(shipUuid: string, swaps: { portId?: number; portName?: string; componentUuid: string }[]) { return this.loadouts.calculateLoadout(shipUuid, swaps); }
  getShipStats(shipUuid: string) { return this.loadouts.getShipStats(shipUuid); }
  getShipHardpoints(shipUuid: string) { return this.loadouts.getShipHardpoints(shipUuid); }

  // ── Shops (delegated) ───────────────────────────────────

  getShops(opts: { page?: number; limit?: number; location?: string; type?: string; search?: string }) { return this.shopsSvc.getShops(opts); }
  getShopInventory(shopId: number) { return this.shopsSvc.getShopInventory(shopId); }

  // ── Items (delegated) ──────────────────────────────────

  getAllItems(filters?: {
    type?: string; sub_type?: string; manufacturer?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }) { return this.itemsSvc.getAllItems(filters); }
  getItemByUuid(uuid: string) { return this.itemsSvc.getItemByUuid(uuid); }
  getItemByClassName(className: string) { return this.itemsSvc.getItemByClassName(className); }
  resolveItem(id: string) { return this.itemsSvc.resolveItem(id); }
  getItemFilters() { return this.itemsSvc.getItemFilters(); }
  getItemTypes() { return this.itemsSvc.getItemTypes(); }

  // ── Commodities (delegated) ─────────────────────────────

  getAllCommodities(filters?: {
    type?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }) { return this.commoditiesSvc.getAllCommodities(filters); }
  getCommodityByUuid(uuid: string) { return this.commoditiesSvc.getCommodityByUuid(uuid); }
  getCommodityTypes() { return this.commoditiesSvc.getCommodityTypes(); }

  // ── Unified search ──────────────────────────────────────

  async unifiedSearch(q: string, limit = 10): Promise<{ ships: Row[]; components: Row[]; items: Row[] }> {
    const cap = Math.min(limit, 20);
    const [ships, components, items] = await Promise.all([
      this.ships.searchShipsAutocomplete(q, cap),
      (async () => {
        const t = `%${q}%`;
        const [rows] = await this.pool.execute<Row[]>(
          `SELECT c.uuid, c.class_name, c.name, c.type, c.sub_type, c.size, c.grade, c.manufacturer_code,
                  m.name as manufacturer_name
           FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code
           WHERE c.name LIKE ? OR c.class_name LIKE ?
           ORDER BY c.name LIMIT ${cap}`,
          [t, t],
        );
        return rows;
      })(),
      (async () => {
        const t = `%${q}%`;
        const [rows] = await this.pool.execute<Row[]>(
          `SELECT i.uuid, i.class_name, i.name, i.type, i.sub_type, i.manufacturer_code
           FROM items i
           WHERE i.name LIKE ? OR i.class_name LIKE ?
           ORDER BY i.name LIMIT ${cap}`,
          [t, t],
        );
        return rows;
      })(),
    ]);
    return { ships, components, items };
  }

  // ── Changelog & stats (kept locally — small) ────────────

  async getChangelog(params: { limit?: string; offset?: string; entityType?: string; changeType?: string }): Promise<{ data: Row[]; total: number }> {
    const where: string[] = [];
    const p: (string | number)[] = [];
    if (params.entityType) { where.push("c.entity_type = ?"); p.push(params.entityType); }
    if (params.changeType) { where.push("c.change_type = ?"); p.push(params.changeType); }

    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const [countRows] = await this.pool.execute<Row[]>(`SELECT COUNT(*) as total FROM changelog c${w}`, p);
    const total = Number(countRows[0]?.total) || 0;

    const limit = Math.min(100, parseInt(params.limit || "50"));
    const offset = parseInt(params.offset || "0");
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT c.*, e.game_version, e.extracted_at as extraction_date FROM changelog c LEFT JOIN extraction_log e ON c.extraction_id = e.id${w} ORDER BY c.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      p,
    );
    return { data: rows, total };
  }

  async getStats(): Promise<Record<string, unknown>> {
    const cached = this.statsCache.get();
    if (cached) return cached;
    const [rows] = await this.pool.execute<Row[]>(`
      SELECT
        (SELECT COUNT(*) FROM ships) as ships,
        (SELECT COUNT(*) FROM components) as components,
        (SELECT COUNT(*) FROM items) as items,
        (SELECT COUNT(*) FROM commodities) as commodities,
        (SELECT COUNT(*) FROM manufacturers) as manufacturers,
        (SELECT COUNT(*) FROM ships_loadouts) as loadoutPorts,
        (SELECT COUNT(*) FROM ship_paints) as paints,
        (SELECT COUNT(*) FROM shops) as shops,
        (SELECT COUNT(*) FROM ships WHERE ship_matrix_id IS NOT NULL) as shipsLinkedToMatrix
    `);
    const latest = await this.getLatestExtraction();
    const result = { ...rows[0], latestExtraction: latest };
    this.statsCache.set(result);
    return result;
  }

  async getExtractionLog(): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>("SELECT * FROM extraction_log ORDER BY extracted_at DESC LIMIT 20");
    return rows;
  }

  async getLatestExtraction(): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>("SELECT * FROM extraction_log ORDER BY extracted_at DESC LIMIT 1");
    return rows[0] || null;
  }

  async getPublicStats(): Promise<Record<string, unknown>> {
    const cached = this.publicStatsCache.get();
    if (cached) return cached;
    const [rows] = await this.pool.execute<Row[]>(`
      SELECT
        (SELECT COUNT(*) FROM ships WHERE variant_type IS NULL) as ships,
        (SELECT COUNT(*) FROM ships WHERE variant_type IS NULL AND vehicle_category = 'ship') as flyable_ships,
        (SELECT COUNT(*) FROM ships WHERE variant_type IS NULL AND vehicle_category = 'ground') as ground_vehicles,
        (SELECT COUNT(*) FROM components) as components,
        (SELECT COUNT(*) FROM items) as items,
        (SELECT COUNT(*) FROM commodities) as commodities,
        (SELECT COUNT(*) FROM manufacturers) as manufacturers,
        (SELECT COUNT(*) FROM ship_paints) as paints,
        (SELECT COUNT(*) FROM shops) as shops,
        (SELECT COUNT(DISTINCT type) FROM components) as component_types,
        (SELECT COUNT(DISTINCT type) FROM items) as item_types
    `);
    const latest = await this.getLatestExtraction();
    const result = {
      ...rows[0],
      game_version: latest?.game_version || null,
      last_extraction: latest?.extracted_at || null,
    };
    this.publicStatsCache.set(result);
    return result;
  }

  async getChangelogSummary(): Promise<Record<string, unknown>> {
    const [byType] = await this.pool.execute<Row[]>(
      `SELECT entity_type, change_type, COUNT(*) as count
       FROM changelog GROUP BY entity_type, change_type ORDER BY entity_type, change_type`,
    );
    const [recent] = await this.pool.execute<Row[]>(
      `SELECT c.*, e.game_version FROM changelog c
       LEFT JOIN extraction_log e ON c.extraction_id = e.id
       ORDER BY c.created_at DESC LIMIT 10`,
    );
    const [total] = await this.pool.execute<Row[]>("SELECT COUNT(*) as total FROM changelog");
    return {
      total: Number(total[0]?.total) || 0,
      by_type: byType,
      recent,
    };
  }
}
