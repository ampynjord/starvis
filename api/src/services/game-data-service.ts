/**
 * GameDataService — Container for all game-data sub-services.
 *
 * Sub-services are exposed as public properties so routes access them directly:
 *   gameDataService.ships.getAllShips(...)
 *   gameDataService.components.getComponentTypes()
 *   gameDataService.loadouts.calculateLoadout(...)
 *
 * Cross-cutting logic (stats, changelog, unified search) lives here.
 */
import type { PrismaClient } from '@prisma/client';
import { CommodityQueryService } from './commodity-query-service.js';
import { ComponentQueryService } from './component-query-service.js';
import { ItemQueryService } from './item-query-service.js';
import { LoadoutService } from './loadout-service.js';
import { MiningQueryService } from './mining-query-service.js';
import { MissionService } from './mission-service.js';
import type { PaginatedResult, Row } from './shared.js';
import { ShipQueryService } from './ship-query-service.js';
import { ShopService } from './shop-service.js';

export type { PaginatedResult, Row };

class TtlCache<T> {
  private data: T | undefined;
  private expiresAt = 0;
  constructor(private ttlMs: number) {}
  get(): T | undefined {
    return Date.now() < this.expiresAt ? this.data : undefined;
  }
  set(value: T): void {
    this.data = value;
    this.expiresAt = Date.now() + this.ttlMs;
  }
}

export class GameDataService {
  // Sub-services — access directly from route handlers
  readonly ships: ShipQueryService;
  readonly components: ComponentQueryService;
  readonly loadouts: LoadoutService;
  readonly shops: ShopService;
  readonly items: ItemQueryService;
  readonly commodities: CommodityQueryService;
  readonly mining: MiningQueryService;
  readonly missions: MissionService;

  private statsCache = new TtlCache<Record<string, unknown>>(60_000);
  private publicStatsCache = new TtlCache<Record<string, unknown>>(60_000);

  constructor(private prisma: PrismaClient) {
    this.ships = new ShipQueryService(prisma);
    this.components = new ComponentQueryService(prisma);
    this.loadouts = new LoadoutService(prisma);
    this.shops = new ShopService(prisma);
    this.items = new ItemQueryService(prisma);
    this.commodities = new CommodityQueryService(prisma);
    this.mining = new MiningQueryService(prisma);
    this.missions = new MissionService(prisma);
  }

  // ── Unified search (cross-cutting — queries ships + components + items) ──

  async unifiedSearch(q: string, limit = 10): Promise<{ ships: Row[]; components: Row[]; items: Row[] }> {
    const cap = Math.min(limit, 20);
    const t = `%${q}%`;
    const [ships, components, items] = await Promise.all([
      this.ships.searchShipsAutocomplete(q, cap),
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT c.uuid, c.class_name, c.name, c.type, c.sub_type, c.size, c.grade, c.manufacturer_code,
                m.name as manufacturer_name
         FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code
         WHERE c.name LIKE ? OR c.class_name LIKE ?
         ORDER BY c.name LIMIT ${cap}`,
        t,
        t,
      ),
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT i.uuid, i.class_name, i.name, i.type, i.sub_type, i.manufacturer_code
         FROM items i WHERE i.name LIKE ? OR i.class_name LIKE ?
         ORDER BY i.name LIMIT ${cap}`,
        t,
        t,
      ),
    ]);
    return { ships, components, items };
  }

  // ── Stats & system info ──────────────────────────────────────────────────

  async getChangelog(params: {
    limit?: string;
    offset?: string;
    entityType?: string;
    changeType?: string;
  }): Promise<{ data: Row[]; total: number }> {
    const where: string[] = [];
    const p: (string | number)[] = [];
    if (params.entityType) {
      where.push('c.entity_type = ?');
      p.push(params.entityType);
    }
    if (params.changeType) {
      where.push('c.change_type = ?');
      p.push(params.changeType);
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';
    const countRows = await this.prisma.$queryRawUnsafe<Row[]>(`SELECT COUNT(*) as total FROM changelog c${w}`, ...p);
    const total = Number(countRows[0]?.total) || 0;

    const limit = Math.min(100, parseInt(params.limit || '50', 10));
    const offset = parseInt(params.offset || '0', 10);
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT c.*, e.game_version, e.extracted_at as extraction_date FROM changelog c LEFT JOIN extraction_log e ON c.extraction_id = e.id${w} ORDER BY c.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      ...p,
    );
    return { data: rows, total };
  }

  async getStats(): Promise<Record<string, unknown>> {
    const cached = this.statsCache.get();
    if (cached) return cached;
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(`
      SELECT
        (SELECT COUNT(*) FROM ships) as ships,
        (SELECT COUNT(*) FROM components) as components,
        (SELECT COUNT(*) FROM items) as items,
        (SELECT COUNT(*) FROM commodities) as commodities,
        (SELECT COUNT(*) FROM manufacturers) as manufacturers,
        (SELECT COUNT(*) FROM ship_loadouts) as loadoutPorts,
        (SELECT COUNT(*) FROM ship_paints) as paints,
        (SELECT COUNT(*) FROM shops) as shops,
        (SELECT COUNT(*) FROM ships WHERE ship_matrix_id IS NOT NULL) as shipsLinkedToMatrix
    `);
    const latest = await this.getLatestExtraction();
    const raw = rows[0];
    // Convert BigInt to Number for JSON serialization
    const result = {
      ships: Number(raw.ships),
      components: Number(raw.components),
      items: Number(raw.items),
      commodities: Number(raw.commodities),
      manufacturers: Number(raw.manufacturers),
      loadoutPorts: Number(raw.loadoutPorts),
      paints: Number(raw.paints),
      shops: Number(raw.shops),
      shipsLinkedToMatrix: Number(raw.shipsLinkedToMatrix),
      latestExtraction: latest,
    };
    this.statsCache.set(result);
    return result;
  }

  async getExtractionLog(): Promise<Row[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>('SELECT * FROM extraction_log ORDER BY extracted_at DESC LIMIT 20');
    return rows;
  }

  async getLatestExtraction(): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>('SELECT * FROM extraction_log ORDER BY extracted_at DESC LIMIT 1');
    return rows[0] || null;
  }

  async getPublicStats(): Promise<Record<string, unknown>> {
    const cached = this.publicStatsCache.get();
    if (cached) return cached;
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(`
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
    const raw = rows[0];
    // Convert BigInt to Number for JSON serialization
    const result = {
      ships: Number(raw.ships),
      flyable_ships: Number(raw.flyable_ships),
      ground_vehicles: Number(raw.ground_vehicles),
      components: Number(raw.components),
      items: Number(raw.items),
      commodities: Number(raw.commodities),
      manufacturers: Number(raw.manufacturers),
      paints: Number(raw.paints),
      shops: Number(raw.shops),
      component_types: Number(raw.component_types),
      item_types: Number(raw.item_types),
      game_version: latest?.game_version || null,
      last_extraction: latest?.extracted_at || null,
    };
    this.publicStatsCache.set(result);
    return result;
  }

  async getChangelogSummary(): Promise<Record<string, unknown>> {
    const byType = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT entity_type, change_type, COUNT(*) as count
       FROM changelog GROUP BY entity_type, change_type ORDER BY entity_type, change_type`,
    );
    const latest = await this.prisma.$queryRawUnsafe<Row[]>('SELECT extracted_at FROM extraction_log ORDER BY id DESC LIMIT 1');
    const total = await this.prisma.$queryRawUnsafe<Row[]>('SELECT COUNT(*) as total FROM changelog');

    const by_entity: Record<string, number> = {};
    const by_change: Record<string, number> = {};
    for (const row of byType) {
      const et = String(row.entity_type);
      const ct = String(row.change_type);
      by_entity[et] = (by_entity[et] ?? 0) + Number(row.count);
      by_change[ct] = (by_change[ct] ?? 0) + Number(row.count);
    }

    return {
      total: Number(total[0]?.total) || 0,
      by_entity,
      by_change,
      last_extraction: (latest[0]?.extracted_at as string) ?? null,
    };
  }
}
