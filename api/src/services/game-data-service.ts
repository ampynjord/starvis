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
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { CommodityQueryService } from './commodity-query-service.js';
import { ComponentQueryService } from './component-query-service.js';
import { CraftingService } from './crafting-service.js';
import { ItemQueryService } from './item-query-service.js';
import { LoadoutService } from './loadout-service.js';
import { LocationQueryService } from './location-query-service.js';
import { MiningQueryService } from './mining-query-service.js';
import { MissionService } from './mission-service.js';
import { PaintQueryService } from './paint-query-service.js';
import type { PaginatedResult, Row } from './shared.js';
import { toPostgres } from './shared.js';
import { ShipQueryService } from './ship-query-service.js';
import { ShopService } from './shop-service.js';
import { TradeService } from './trade-service.js';

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
  readonly ships: ShipQueryService;
  readonly components: ComponentQueryService;
  readonly loadouts: LoadoutService;
  readonly paints: PaintQueryService;
  readonly shops: ShopService;
  readonly items: ItemQueryService;
  readonly commodities: CommodityQueryService;
  readonly mining: MiningQueryService;
  readonly missions: MissionService;
  readonly crafting: CraftingService;
  readonly trade: TradeService;
  readonly locations: LocationQueryService;

  private statsCache = new TtlCache<Record<string, unknown>>(60_000);
  private publicStatsCache = new TtlCache<Record<string, unknown>>(60_000);

  constructor(
    private getClient: (env: string) => PrismaClient,
    _metaClient: PrismaClient,
  ) {
    this.ships = new ShipQueryService(getClient);
    this.components = new ComponentQueryService(getClient);
    this.loadouts = new LoadoutService(getClient);
    this.paints = new PaintQueryService(getClient);
    this.shops = new ShopService(getClient);
    this.items = new ItemQueryService(getClient);
    this.commodities = new CommodityQueryService(getClient);
    this.mining = new MiningQueryService(getClient);
    this.missions = new MissionService(getClient);
    this.crafting = new CraftingService(getClient);
    this.trade = new TradeService(getClient);
    this.locations = new LocationQueryService(getClient);
  }

  // ── Unified search (cross-cutting — queries ships + components + items) ──

  async unifiedSearch(
    q: string,
    limit = 10,
    env = 'live',
  ): Promise<{ ships: Row[]; components: Row[]; items: Row[]; commodities: Row[]; missions: Row[]; recipes: Row[] }> {
    const cap = Math.min(limit, 20);
    const t = `%${q}%`;
    const [ships, components, items, commodities, missions, recipes] = await Promise.all([
      this.ships.searchShipsAutocomplete(q, cap, env),
      this.getClient(env).$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT c.uuid, c.class_name, c.name, c.type, c.sub_type, c.size, c.grade, c.manufacturer_code,
                m.name as manufacturer_name
         FROM game.components c LEFT JOIN game.manufacturers m ON c.manufacturer_code = m.code
         WHERE c.env = ? AND (c.name ILIKE ? OR c.class_name ILIKE ?)
         ORDER BY c.name LIMIT ${cap}`),
        env,
        t,
        t,
      ),
      this.getClient(env).$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT i.uuid, i.class_name, i.name, i.type, i.sub_type, i.manufacturer_code
         FROM game.items i WHERE i.env = ? AND (i.name ILIKE ? OR i.class_name ILIKE ?)
         ORDER BY i.name LIMIT ${cap}`),
        env,
        t,
        t,
      ),
      this.getClient(env).$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT co.uuid, co.class_name, co.name, co.type
         FROM game.commodities co WHERE co.env = ? AND (co.name ILIKE ? OR co.class_name ILIKE ?)
         ORDER BY co.name LIMIT ${cap}`),
        env,
        t,
        t,
      ),
      this.getClient(env).$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT ms.uuid, ms.class_name, ms.title as name, ms.mission_type as type
         FROM game.missions ms WHERE ms.env = ? AND (ms.title ILIKE ? OR ms.class_name ILIKE ?)
         ORDER BY ms.title LIMIT ${cap}`),
        env,
        t,
        t,
      ),
      this.getClient(env).$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT cr.uuid, cr.class_name, cr.name, cr.category
         FROM game.crafting_recipes cr WHERE cr.env = ? AND (cr.name ILIKE ? OR cr.class_name ILIKE ? OR cr.output_item_name ILIKE ?)
         ORDER BY cr.name LIMIT ${cap}`),
        env,
        t,
        t,
        t,
      ),
    ]);
    return { ships, components, items, commodities, missions, recipes };
  }

  // ── Stats & system info ──────────────────────────────────────────────────

  async getChangelog(params: {
    env?: string;
    limit?: string;
    offset?: string;
    entityType?: string;
    changeType?: string;
    markersOnly?: boolean;
  }): Promise<{ data: Row[]; total: number }> {
    const env = params.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['e.game_env = ?'];
    const p: (string | number)[] = [env];
    if (params.entityType) {
      where.push('c.entity_type = ?');
      p.push(params.entityType);
    }
    if (params.changeType) {
      where.push('c.change_type = ?');
      p.push(params.changeType);
    }
    if (params.markersOnly) {
      where.push('c.field_name IS NULL');
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const countRows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT COUNT(*) as total FROM meta.changelog c INNER JOIN meta.extraction_log e ON c.extraction_id = e.id${w}`),
      ...p,
    );
    const total = Number(countRows[0]?.total) || 0;

    const limit = Math.min(1000, parseInt(params.limit || '50', 10));
    const offset = parseInt(params.offset || '0', 10);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT c.*, e.game_version, e.game_env, e.extracted_at as extraction_date FROM meta.changelog c INNER JOIN meta.extraction_log e ON c.extraction_id = e.id${w} ORDER BY c.created_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      ),
      ...p,
    );
    return { data: rows, total };
  }

  async getStats(env = 'live'): Promise<Record<string, unknown>> {
    if (env === 'live') {
      const cached = this.statsCache.get();
      if (cached) return cached;
    }
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`
      SELECT
        (SELECT COUNT(*) FROM game.ships WHERE env = ?) as ships,
        (SELECT COUNT(*) FROM game.components WHERE env = ?) as components,
        (SELECT COUNT(*) FROM game.items WHERE env = ?) as items,
        (SELECT COUNT(*) FROM game.commodities WHERE env = ?) as commodities,
        (SELECT COUNT(*) FROM game.manufacturers) as manufacturers,
        (SELECT COUNT(*) FROM game.ship_loadouts WHERE env = ?) as loadoutPorts,
        (SELECT COUNT(*) FROM game.ship_paints WHERE env = ?) as paints,
        (SELECT COUNT(*) FROM game.shops WHERE env = ?) as shops,
        (SELECT COUNT(*) FROM game.ships WHERE env = ? AND ship_matrix_id IS NOT NULL) as shipsLinkedToMatrix
    `),
      env,
      env,
      env,
      env,
      env,
      env,
      env,
      env,
    );
    const latest = await this.getLatestExtraction(env);
    const raw = rows[0];
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
    if (env === 'live') this.statsCache.set(result);
    return result;
  }

  async getExtractionLog(): Promise<Row[]> {
    const rows = await this.getClient('live').$queryRawUnsafe<Row[]>(
      'SELECT * FROM meta.extraction_log ORDER BY extracted_at DESC LIMIT 20',
    );
    return rows;
  }

  async getLatestExtraction(env = 'live'): Promise<Row | null> {
    const rows = await this.getClient('live').$queryRawUnsafe<Row[]>(
      toPostgres('SELECT * FROM meta.extraction_log WHERE game_env = ? ORDER BY extracted_at DESC LIMIT 1'),
      env,
    );
    return rows[0] || null;
  }

  async getPublicStats(env = 'live'): Promise<Record<string, unknown>> {
    if (env === 'live') {
      const cached = this.publicStatsCache.get();
      if (cached) return cached;
    }
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`
      SELECT
        (SELECT COUNT(*) FROM game.ships WHERE env = ? AND variant_type IS NULL) as ships,
        (SELECT COUNT(*) FROM game.ships WHERE env = ? AND variant_type IS NULL AND vehicle_category = 'ship') as flyable_ships,
        (SELECT COUNT(*) FROM game.ships WHERE env = ? AND variant_type IS NULL AND vehicle_category = 'ground') as ground_vehicles,
        (SELECT COUNT(*) FROM game.components WHERE env = ?) as components,
        (SELECT COUNT(*) FROM game.items WHERE env = ?) as items,
        (SELECT COUNT(*) FROM game.commodities WHERE env = ?) as commodities,
        (SELECT COUNT(*) FROM game.manufacturers) as manufacturers,
        (SELECT COUNT(*) FROM game.ship_paints WHERE env = ?) as paints,
        (SELECT COUNT(*) FROM game.shops WHERE env = ?) as shops,
        (SELECT COUNT(DISTINCT type) FROM game.components WHERE env = ?) as component_types,
        (SELECT COUNT(DISTINCT type) FROM game.items WHERE env = ?) as item_types
    `),
      env,
      env,
      env,
      env,
      env,
      env,
      env,
      env,
      env,
      env,
    );
    const latest = await this.getLatestExtraction(env);
    const raw = rows[0];
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
    if (env === 'live') this.publicStatsCache.set(result);
    return result;
  }

  async getGameVersions(opts: { env?: string; limit?: number; offset?: number } = {}): Promise<{ data: Row[]; total: number }> {
    const prisma = this.getClient('live');
    const limit = Math.min(100, opts.limit || 20);
    const offset = Math.max(0, opts.offset || 0);
    const where = opts.env ? 'WHERE game_env = ?' : '';
    const params: (string | number)[] = opts.env ? [opts.env] : [];
    const countRows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT COUNT(*) as total FROM meta.extraction_log ${where}`),
      ...params,
    );
    const total = Number(countRows[0]?.total) || 0;
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT id, game_version, game_env, extracted_at,
             ships_count as ships, components_count as components,
             items_count as items, commodities_count as commodities,
             shops_count as shops
       FROM meta.extraction_log ${where} ORDER BY extracted_at DESC LIMIT ${Number(limit)} OFFSET ${Number(offset)}`),
      ...params,
    );
    return {
      data: rows.map((r) => ({
        ...r,
        id: Number(r.id),
        ships: Number(r.ships),
        components: Number(r.components),
        items: Number(r.items),
        commodities: Number(r.commodities),
        shops: Number(r.shops),
      })),
      total,
    };
  }

  async getChangelogSummary(env = 'live'): Promise<Record<string, unknown>> {
    const prisma = this.getClient(env);
    // Count distinct entities per type/change_type to avoid inflating counts with field-level detail rows
    const byType = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT c.entity_type, c.change_type, COUNT(DISTINCT c.entity_uuid) as count
         FROM meta.changelog c INNER JOIN meta.extraction_log e ON c.extraction_id = e.id
         WHERE e.game_env = ? GROUP BY c.entity_type, c.change_type ORDER BY c.entity_type, c.change_type`,
      ),
      env,
    );
    const latest = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT extracted_at FROM meta.extraction_log WHERE game_env = ? ORDER BY id DESC LIMIT 1`),
      env,
    );
    const total = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT COUNT(*) as total FROM (SELECT DISTINCT c.entity_uuid, c.change_type FROM meta.changelog c INNER JOIN meta.extraction_log e ON c.extraction_id = e.id WHERE e.game_env = ?) sub`,
      ),
      env,
    );

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
