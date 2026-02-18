/**
 * GameDataService — Facade that delegates to focused sub-services
 *
 * Sub-services:
 *   ShipQueryService      — ship listing, filters, manufacturers
 *   ComponentQueryService  — component CRUD, filters, buy locations
 *   LoadoutService         — loadout calculator, hardpoints, stats
 *   ShopService            — shop listing, inventory
 *
 * This facade keeps the same public API so routes.ts is untouched.
 */
import type { Pool } from "mysql2/promise";
import type { Row, PaginatedResult } from "./shared.js";
import { ShipQueryService }      from "./ship-query-service.js";
import { ComponentQueryService } from "./component-query-service.js";
import { LoadoutService }        from "./loadout-service.js";
import { ShopService }           from "./shop-service.js";

export type { Row, PaginatedResult };

export class GameDataService {
  private ships: ShipQueryService;
  private components: ComponentQueryService;
  private loadouts: LoadoutService;
  private shopsSvc: ShopService;

  constructor(private pool: Pool) {
    this.ships       = new ShipQueryService(pool);
    this.components  = new ComponentQueryService(pool);
    this.loadouts    = new LoadoutService(pool);
    this.shopsSvc    = new ShopService(pool);
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

  // ── Loadout (delegated) ─────────────────────────────────

  getShipLoadout(shipUuid: string) { return this.loadouts.getShipLoadout(shipUuid); }
  getShipModules(shipUuid: string) { return this.loadouts.getShipModules(shipUuid); }
  getShipPaints(shipUuid: string) { return this.loadouts.getShipPaints(shipUuid); }
  getAllPaints(opts: { search?: string; ship_uuid?: string; page?: number; limit?: number }) { return this.loadouts.getAllPaints(opts); }
  calculateLoadout(shipUuid: string, swaps: { portId?: number; portName?: string; componentUuid: string }[]) { return this.loadouts.calculateLoadout(shipUuid, swaps); }
  getShipStats(shipUuid: string) { return this.loadouts.getShipStats(shipUuid); }

  // ── Shops (delegated) ───────────────────────────────────

  getShops(opts: { page?: number; limit?: number; location?: string; type?: string; search?: string }) { return this.shopsSvc.getShops(opts); }
  getShopInventory(shopId: number) { return this.shopsSvc.getShopInventory(shopId); }

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
    const [rows] = await this.pool.execute<Row[]>(`
      SELECT
        (SELECT COUNT(*) FROM ships) as ships,
        (SELECT COUNT(*) FROM components) as components,
        (SELECT COUNT(*) FROM manufacturers) as manufacturers,
        (SELECT COUNT(*) FROM ships_loadouts) as loadoutPorts,
        (SELECT COUNT(*) FROM ship_paints) as paints,
        (SELECT COUNT(*) FROM shops) as shops,
        (SELECT COUNT(*) FROM ships WHERE ship_matrix_id IS NOT NULL) as shipsLinkedToMatrix
    `);
    const latest = await this.getLatestExtraction();
    return { ...rows[0], latestExtraction: latest };
  }

  async getExtractionLog(): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>("SELECT * FROM extraction_log ORDER BY extracted_at DESC LIMIT 20");
    return rows;
  }

  async getLatestExtraction(): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>("SELECT * FROM extraction_log ORDER BY extracted_at DESC LIMIT 1");
    return rows[0] || null;
  }
}
