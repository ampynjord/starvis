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
import { COMPONENT_VISIBLE_WHERE, ComponentQueryService } from './component-query-service.js';
import { CorrelationService } from './correlation-service.js';
import { CraftingService } from './crafting-service.js';
import { ItemQueryService } from './item-query-service.js';
import { LoadoutService } from './loadout-service.js';
import { LocationQueryService } from './location-query-service.js';
import { MiningQueryService } from './mining-query-service.js';
import { MissionService } from './mission-service.js';
import { PaintQueryService } from './paint-query-service.js';
import type {
  PublicChangelogEntry,
  PublicExtractionLogEntry,
  PublicGameVersion,
  PublicRsiRoadmapItem,
  PublicTranslation,
  PublicUnifiedSearchHit,
} from './game-data/cross-cutting-types.js';
import type { PaginatedResult, Row } from './shared.js';
import { parseIncludes, toPostgres } from './shared.js';
import { ShipQueryService } from './ship-query-service.js';
import { ShopService } from './shop-service.js';
import { TradeService } from './trade-service.js';

export type { PaginatedResult, Row };
export type {
  PublicChangelogEntry,
  PublicExtractionLogEntry,
  PublicGameVersion,
  PublicRsiRoadmapItem,
  PublicTranslation,
  PublicUnifiedSearchHit,
} from './game-data/cross-cutting-types.js';

export type ObjectDetailType = 'ship' | 'component' | 'item' | 'commodity' | 'shop' | 'location';

export interface ObjectDetailResult {
  type: ObjectDetailType;
  id: string;
  env: string;
  data: Row;
  related: Record<string, unknown>;
  meta: {
    includes: string[];
    generated_at: string;
  };
}

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
  readonly correlations: CorrelationService;

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
    this.correlations = new CorrelationService(getClient);
  }

  // ── Unified search (cross-cutting — queries ships + components + items) ──

  async unifiedSearch(
    q: string,
    limit = 10,
    env = 'live',
  ): Promise<{
    ships: PublicUnifiedSearchHit[];
    components: PublicUnifiedSearchHit[];
    items: PublicUnifiedSearchHit[];
    commodities: PublicUnifiedSearchHit[];
    missions: PublicUnifiedSearchHit[];
    recipes: PublicUnifiedSearchHit[];
    locations: PublicUnifiedSearchHit[];
  }> {
    const cap = Math.min(limit, 20);
    const t = `%${q}%`;
    const [ships, components, items, commodities, missions, recipes, locations] = await Promise.all([
      this.ships.searchShipsAutocomplete(q, cap, env) as Promise<PublicUnifiedSearchHit[]>,
      this.getClient(env).$queryRawUnsafe<PublicUnifiedSearchHit[]>(
        toPostgres(`SELECT c.uuid, c.class_name, c.name, c.type, c.sub_type, c.size, c.grade, c.manufacturer_code,
                m.name as manufacturer_name
         FROM game.components c LEFT JOIN game.manufacturers m ON c.manufacturer_code = m.code
         WHERE c.env = ? AND ${COMPONENT_VISIBLE_WHERE} AND (c.name ILIKE ? OR c.class_name ILIKE ?)
         ORDER BY c.name LIMIT ${cap}`),
        env,
        t,
        t,
      ),
      this.getClient(env).$queryRawUnsafe<PublicUnifiedSearchHit[]>(
        toPostgres(`SELECT i.uuid, i.class_name, i.name, i.type, i.sub_type, i.manufacturer_code
         FROM game.items i WHERE i.env = ? AND (i.name ILIKE ? OR i.class_name ILIKE ?)
         ORDER BY i.name LIMIT ${cap}`),
        env,
        t,
        t,
      ),
      this.getClient(env).$queryRawUnsafe<PublicUnifiedSearchHit[]>(
        toPostgres(`SELECT co.uuid, co.class_name, co.name, co.type
         FROM game.commodities co WHERE co.env = ? AND (co.name ILIKE ? OR co.class_name ILIKE ?)
         ORDER BY co.name LIMIT ${cap}`),
        env,
        t,
        t,
      ),
      this.getClient(env).$queryRawUnsafe<PublicUnifiedSearchHit[]>(
        toPostgres(`SELECT ms.uuid, ms.class_name, ms.title as name, ms.mission_type as type
         FROM game.missions ms WHERE ms.env = ? AND (ms.title ILIKE ? OR ms.class_name ILIKE ?)
         ORDER BY ms.title LIMIT ${cap}`),
        env,
        t,
        t,
      ),
      this.getClient(env).$queryRawUnsafe<PublicUnifiedSearchHit[]>(
        toPostgres(`SELECT cr.uuid, cr.class_name, cr.name, cr.category
         FROM game.crafting_recipes cr WHERE cr.env = ? AND (cr.name ILIKE ? OR cr.class_name ILIKE ? OR cr.output_item_name ILIKE ?)
         ORDER BY cr.name LIMIT ${cap}`),
        env,
        t,
        t,
        t,
      ),
      // Les lieux ont un nom lisible dans 1112 cas sur 1120 et une description
      // dans 1091 : ils se cherchent par nom comme le reste. Ils manquaient a la
      // recherche unifiee, donc rien dans l'interface ne menait a leur fiche —
      // la carte stellaire, seule porte d'entree, n'en relie que 58.
      this.getClient(env).$queryRawUnsafe<PublicUnifiedSearchHit[]>(
        toPostgres(`SELECT l.uuid, l.class_name, l.name, l.type, l.system_code
         FROM game.locations l WHERE l.env = ? AND (l.name ILIKE ? OR l.class_name ILIKE ?)
         ORDER BY l.name LIMIT ${cap}`),
        env,
        t,
        t,
      ),
    ]);
    return { ships, components, items, commodities, missions, recipes, locations };
  }

  // ── Stats & system info ──────────────────────────────────────────────────

  async getObjectDetail(type: string, id: string, opts: { env?: string; include?: string } = {}): Promise<ObjectDetailResult | null> {
    const env = opts.env ?? 'live';
    const normalizedType = this.normalizeObjectDetailType(type);
    if (!normalizedType) return null;
    const includes = this.resolveObjectIncludes(normalizedType, opts.include);
    const related: Record<string, unknown> = {};
    let data: Row | null = null;

    if (normalizedType === 'ship') {
      data = (await this.ships.getShipByUuid(id, env)) ?? (await this.ships.getShipByClassName(id, env));
      if (!data) return null;
      if (data.game_data && typeof data.game_data === 'string') {
        try {
          data.game_data = JSON.parse(data.game_data);
        } catch {
          /* keep raw */
        }
      }
      const uuid = String(data.uuid);
      const [manufacturer, loadout, paints, modules, hardpoints, variants, similar, buyLocations, gallery] = await Promise.all([
        includes.has('manufacturer') && data.manufacturer_code
          ? this.ships.getManufacturerByCode(String(data.manufacturer_code), env)
          : null,
        includes.has('loadout') ? this.loadouts.getShipLoadout(uuid, env) : null,
        includes.has('paints') ? this.loadouts.getShipPaints(uuid, env) : null,
        includes.has('modules') ? this.loadouts.getShipModules(uuid, env) : null,
        includes.has('hardpoints') ? this.loadouts.getShipHardpoints(uuid, env) : null,
        includes.has('variants') ? this.ships.getShipVariants(uuid, env) : null,
        includes.has('similar') ? this.ships.getSimilarShips(uuid, 5, env) : null,
        includes.has('buy_locations') ? this.ships.getShipBuyLocations(data, env) : null,
        includes.has('gallery') && data.ship_matrix_id ? this.ships.getShipGallery(Number(data.ship_matrix_id)) : null,
      ]);
      if (manufacturer) related.manufacturer = manufacturer;
      if (loadout) related.loadout = loadout;
      if (paints) related.paints = paints;
      if (modules) related.modules = modules;
      if (hardpoints) related.hardpoints = hardpoints;
      if (variants) related.variants = variants;
      if (similar) related.similar = similar;
      if (buyLocations) related.buy_locations = buyLocations;
      if (gallery) related.gallery = gallery;
    } else if (normalizedType === 'component') {
      data = await this.components.resolveComponent(id, env);
      if (!data) return null;
      const [buyLocations, ships] = await Promise.all([
        includes.has('buy_locations') ? this.components.getComponentBuyLocations(data, env) : null,
        includes.has('ships') ? this.components.getComponentShips(data, env) : null,
      ]);
      if (buyLocations) related.buy_locations = buyLocations;
      if (ships) related.ships = ships;
    } else if (normalizedType === 'item') {
      data = await this.items.resolveItem(id, env);
      if (!data) return null;
      const [manufacturer, buyLocations] = await Promise.all([
        includes.has('manufacturer') && data.manufacturer_code
          ? this.ships.getManufacturerByCode(String(data.manufacturer_code), env)
          : null,
        includes.has('buy_locations') ? this.items.getItemBuyLocations(String(data.uuid), env) : null,
      ]);
      if (manufacturer) related.manufacturer = manufacturer;
      if (buyLocations) related.buy_locations = buyLocations;
    } else if (normalizedType === 'commodity') {
      data = await this.commodities.getCommodityByUuid(id, env);
      if (!data) return null;
      const prices = includes.has('prices') ? await this.trade.getCommodityPrices(String(data.uuid), env) : null;
      if (prices) related.prices = prices;
    } else if (normalizedType === 'shop') {
      const shopId = Number(id);
      if (!Number.isInteger(shopId)) return null;
      data = await this.shops.getShopById(shopId, env);
      if (!data) return null;
      const [inventory, prices] = await Promise.all([
        includes.has('inventory') ? this.shops.getShopInventory(shopId, env) : null,
        includes.has('prices') ? this.trade.getLocationPrices(shopId, env) : null,
      ]);
      if (inventory) related.inventory = inventory;
      if (prices) related.prices = prices;
    } else if (normalizedType === 'location') {
      data = await this.locations.getLocation(id, env);
      if (!data) return null;
      const children = includes.has('children') ? await this.locations.getLocationChildren(String(data.uuid), env) : null;
      if (children) related.children = children;
    }
    if (!data) return null;

    return {
      type: normalizedType,
      id,
      env,
      data,
      related,
      meta: {
        includes: [...includes].sort(),
        generated_at: new Date().toISOString(),
      },
    };
  }

  private normalizeObjectDetailType(type: string): ObjectDetailType | null {
    const normalized = type.toLowerCase().replace(/_/g, '-');
    if (['ship', 'ships', 'vehicle', 'vehicles', 'ground-vehicle', 'gravlev'].includes(normalized)) return 'ship';
    if (['component', 'components'].includes(normalized)) return 'component';
    if (['item', 'items'].includes(normalized)) return 'item';
    if (['commodity', 'commodities'].includes(normalized)) return 'commodity';
    if (['shop', 'shops', 'store'].includes(normalized)) return 'shop';
    if (['location', 'locations', 'place'].includes(normalized)) return 'location';
    return null;
  }

  private resolveObjectIncludes(type: ObjectDetailType, include?: string): Set<string> {
    if (include === 'none') return new Set();
    const requested = parseIncludes(include);
    if (requested.size) return requested;
    const defaults: Record<ObjectDetailType, string[]> = {
      ship: ['manufacturer', 'loadout', 'paints', 'modules', 'hardpoints', 'variants', 'similar', 'buy_locations', 'gallery'],
      component: ['buy_locations', 'ships'],
      item: ['manufacturer', 'buy_locations'],
      commodity: ['prices'],
      shop: ['inventory', 'prices'],
      location: ['children'],
    };
    return new Set(defaults[type]);
  }

  async getChangelog(params: {
    env?: string;
    gameVersion?: string;
    limit?: string;
    offset?: string;
    entityType?: string;
    changeType?: string;
    markersOnly?: boolean;
    /** Lignes de diff uniquement (`field_name` renseigné), exclut les marqueurs d'entité. */
    changesOnly?: boolean;
  }): Promise<{ data: PublicChangelogEntry[]; total: number }> {
    const env = params.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['e.game_env = ?'];
    const p: (string | number)[] = [env];
    if (params.entityType) {
      where.push('c.entity_type = ?');
      p.push(params.entityType);
    }
    if (params.gameVersion) {
      where.push('e.game_version = ?');
      p.push(params.gameVersion);
    }
    if (params.changeType) {
      where.push('c.change_type = ?');
      p.push(params.changeType);
    }
    if (params.markersOnly) {
      where.push('c.field_name IS NULL');
    } else if (params.changesOnly) {
      where.push('c.field_name IS NOT NULL');
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const countRows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT COUNT(*) as total FROM meta.changelog c INNER JOIN meta.extraction_log e ON c.extraction_id = e.id${w}`),
      ...p,
    );
    const total = Number(countRows[0]?.total) || 0;

    const limit = Math.min(1000, parseInt(params.limit || '50', 10));
    const offset = parseInt(params.offset || '0', 10);
    const rows = await prisma.$queryRawUnsafe<PublicChangelogEntry[]>(
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

  async getExtractionLog(): Promise<PublicExtractionLogEntry[]> {
    const rows = await this.getClient('live').$queryRawUnsafe<PublicExtractionLogEntry[]>(
      'SELECT * FROM meta.extraction_log ORDER BY extracted_at DESC LIMIT 20',
    );
    return rows;
  }

  async getLatestExtraction(env = 'live'): Promise<PublicExtractionLogEntry | null> {
    const rows = await this.getClient('live').$queryRawUnsafe<PublicExtractionLogEntry[]>(
      toPostgres('SELECT * FROM meta.extraction_log WHERE game_env = ? AND ships_count > 0 ORDER BY extracted_at DESC LIMIT 1'),
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
        (SELECT COUNT(*) FROM game.ships WHERE env = ? AND variant_type IS NULL AND vehicle_category = 'ship') as space_ships,
        (SELECT COUNT(*) FROM game.ships WHERE env = ? AND variant_type IS NULL AND vehicle_category = 'ground') as ground_vehicles,
        (SELECT COUNT(*) FROM game.ships WHERE env = ? AND variant_type IS NULL AND vehicle_category = 'gravlev') as gravlev_vehicles,
        (SELECT COUNT(*) FROM game.ships WHERE env = ? AND variant_type IS NULL AND vehicle_category IN ('ground', 'gravlev')) as vehicles,
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
      env,
      env,
    );
    const latest = await this.getLatestExtraction(env);
    const raw = rows[0];
    const result = {
      ships: Number(raw.ships),
      space_ships: Number(raw.space_ships),
      // Legacy field kept for external consumers. It means space ships, not an actual flyable status.
      flyable_ships: Number(raw.space_ships),
      ground_vehicles: Number(raw.ground_vehicles),
      gravlev_vehicles: Number(raw.gravlev_vehicles),
      vehicles: Number(raw.vehicles),
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

  async getLatestStats(env = 'live'): Promise<Record<string, unknown>> {
    const [overview, latest, extractionRows] = await Promise.all([
      this.getPublicStats(env),
      this.getLatestExtraction(env),
      this.getClient('live').$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT id, game_version, game_env, extracted_at, status, duration_ms,
               ships_count, components_count, items_count, commodities_count, manufacturers_count,
               loadout_ports_count, shops_count, recipes_count
          FROM meta.extraction_log
          WHERE game_env = ?
          ORDER BY extracted_at DESC
          LIMIT 1`),
        env,
      ),
    ]);
    const extraction = extractionRows[0] ?? latest;
    return {
      env,
      game_version: latest?.game_version ?? extraction?.game_version ?? null,
      extracted_at: latest?.extracted_at ?? extraction?.extracted_at ?? null,
      overview,
      extraction,
    };
  }

  async getGameVersions(
    opts: { env?: string; limit?: number; offset?: number } = {},
  ): Promise<{ data: PublicGameVersion[]; total: number }> {
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
    const rows = await prisma.$queryRawUnsafe<PublicGameVersion[]>(
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

  async getVersionChangelog(
    version: string,
    opts: {
      env?: string;
      limit?: string;
      offset?: string;
      changesOnly?: boolean;
      entityType?: string;
      changeType?: string;
    } = {},
  ): Promise<{
    data: PublicChangelogEntry[];
    total: number;
    version: string;
    env: string;
  }> {
    const env = opts.env ?? 'live';
    const result = await this.getChangelog({
      env,
      gameVersion: version,
      limit: opts.limit,
      offset: opts.offset,
      entityType: opts.entityType,
      changeType: opts.changeType,
      changesOnly: opts.changesOnly === true,
    });
    return { ...result, version, env };
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

  async getTranslations(
    opts: { env?: string; domain?: string; search?: string; page?: number; limit?: number } = {},
  ): Promise<PaginatedResult<PublicTranslation>> {
    const env = opts.env ?? 'live';
    const prisma = this.getClient(env);
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
    const offset = (page - 1) * limit;

    const where: string[] = [`env = ?`, `category = 'translation_fr'`];
    const params: (string | number)[] = [env];
    if (opts.domain) {
      where.push(`source_type = ?`);
      params.push(opts.domain);
    }
    if (opts.search) {
      where.push(`(name ILIKE ? OR class_name ILIKE ? OR value_text ILIKE ?)`);
      const q = `%${opts.search}%`;
      params.push(q, q, q);
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const countRows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(`SELECT COUNT(*) AS total FROM game.game_insights${w}`), ...params);
    const total = Number(countRows[0]?.total) || 0;
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT uuid, env, source_type AS domain, class_name, name AS name_fr, value_text AS description_fr, raw_json, extracted_at
         FROM game.game_insights${w}
         ORDER BY class_name ASC
         LIMIT ${Number(limit)} OFFSET ${Number(offset)}`,
      ),
      ...params,
    );

    const data: PublicTranslation[] = rows.map((r) => {
      const parsed = typeof r.raw_json === 'string' ? JSON.parse(r.raw_json) : (r.raw_json as Record<string, unknown> | null);
      return {
        uuid: String(r.uuid),
        env: String(r.env),
        domain: r.domain,
        class_name: r.class_name as string | null,
        name_en: (parsed?.name_en as string | null) ?? null,
        name_fr: (r.name_fr as string | null) ?? (parsed?.name_fr as string | null) ?? null,
        description_en: (parsed?.description_en as string | null) ?? null,
        description_fr: (r.description_fr as string | null) ?? (parsed?.description_fr as string | null) ?? null,
        extracted_at: r.extracted_at as string | Date | null,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getTranslationById(id: string, env = 'live'): Promise<PublicTranslation | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT uuid, env, source_type AS domain, class_name, name AS name_fr, value_text AS description_fr, raw_json, extracted_at
         FROM game.game_insights
         WHERE env = ? AND category = 'translation_fr' AND (uuid = ? OR LOWER(class_name) = LOWER(?))
         LIMIT 1`,
      ),
      env,
      id,
      id,
    );
    const r = rows[0];
    if (!r) return null;
    const parsed = typeof r.raw_json === 'string' ? JSON.parse(r.raw_json) : (r.raw_json as Record<string, unknown> | null);
    return {
      uuid: String(r.uuid),
      env: String(r.env),
      domain: r.domain,
      class_name: r.class_name as string | null,
      name_en: (parsed?.name_en as string | null) ?? null,
      name_fr: (r.name_fr as string | null) ?? (parsed?.name_fr as string | null) ?? null,
      description_en: (parsed?.description_en as string | null) ?? null,
      description_fr: (r.description_fr as string | null) ?? (parsed?.description_fr as string | null) ?? null,
      extracted_at: r.extracted_at as string | Date | null,
    };
  }

  async getRefineries(env = 'live'): Promise<Record<string, unknown>> {
    const prisma = this.getClient(env);
    const [terminals, yields] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT uex_id, name, nickname, code, star_system, planet, orbit, moon, city, space_station, outpost, company_name, is_available, game_version
           FROM game.uex_terminals
           WHERE env = ? AND (type ILIKE '%refinery%' OR name ILIKE '%refinery%')
           ORDER BY star_system ASC, name ASC`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT uex_id, entity_uuid AS commodity_uuid, entity_name AS commodity_name, terminal_uex_id, terminal_name, price AS yield_bonus, raw_json, date_modified
           FROM game.uex_market_prices
           WHERE env = ? AND resource = 'refineries_yields'
           ORDER BY terminal_name ASC, entity_name ASC`,
        ),
        env,
      ),
    ]);
    return {
      env,
      terminals_count: terminals.length,
      yields_count: yields.length,
      terminals,
      yields,
    };
  }

  async getDatasetManifest(env = 'live'): Promise<Record<string, unknown>> {
    const overview = await this.getPublicStats(env);
    const packs = [
      {
        pack: 'ships',
        description: 'All ships and ground/gravlev vehicles with P4K stats and RSI Matrix cross-ref',
        count: overview.ships,
      },
      {
        pack: 'components',
        description: 'All vehicle components (shields, quantum drives, weapons, power plants, coolers)',
        count: overview.components,
      },
      { pack: 'items', description: 'All FPS weapons, armor, clothing, attachments, consumables and utilities', count: overview.items },
      { pack: 'commodities', description: 'All tradeable and minable commodities with UEX market metadata', count: overview.commodities },
      { pack: 'shops', description: 'In-game shops and UEX terminals', count: overview.shops },
      { pack: 'manufacturers', description: 'All ship, weapon and item manufacturers', count: overview.manufacturers },
      { pack: 'translations', description: 'Bilingual EN/FR localization entries', count: null },
      { pack: 'refineries', description: 'Refinery terminals and ore yield bonuses', count: null },
    ].map((p) => ({
      ...p,
      endpoint: `/api/v1/datasets/${p.pack}?env=${encodeURIComponent(env)}`,
    }));

    return {
      env,
      game_version: overview.game_version ?? null,
      last_extraction: overview.last_extraction ?? null,
      packs,
    };
  }

  async getDatasetPack(pack: string, env = 'live'): Promise<Record<string, unknown> | null> {
    const prisma = this.getClient(env);
    const key = pack.toLowerCase();
    let rows: Row[] = [];

    if (key === 'ships') {
      rows = await prisma.$queryRawUnsafe<Row[]>(toPostgres('SELECT * FROM game.ships WHERE env = ? ORDER BY name ASC'), env);
    } else if (key === 'components') {
      rows = await prisma.$queryRawUnsafe<Row[]>(toPostgres('SELECT * FROM game.components WHERE env = ? ORDER BY name ASC'), env);
    } else if (key === 'items') {
      rows = await prisma.$queryRawUnsafe<Row[]>(toPostgres('SELECT * FROM game.items WHERE env = ? ORDER BY name ASC'), env);
    } else if (key === 'commodities') {
      rows = await prisma.$queryRawUnsafe<Row[]>(toPostgres('SELECT * FROM game.commodities WHERE env = ? ORDER BY name ASC'), env);
    } else if (key === 'shops') {
      rows = await prisma.$queryRawUnsafe<Row[]>(toPostgres('SELECT * FROM game.shops WHERE env = ? ORDER BY name ASC'), env);
    } else if (key === 'manufacturers') {
      rows = await prisma.$queryRawUnsafe<Row[]>('SELECT * FROM game.manufacturers ORDER BY name ASC');
    } else if (key === 'translations') {
      const res = await this.getTranslations({ env, page: 1, limit: 200 });
      return { pack: key, env, total: res.total, count: res.data.length, data: res.data };
    } else if (key === 'refineries') {
      const ref = await this.getRefineries(env);
      return { pack: key, ...ref };
    } else {
      return null;
    }

    return {
      pack: key,
      env,
      count: rows.length,
      data: rows,
    };
  }

  async getRsiRoadmap(): Promise<PublicRsiRoadmapItem[]> {
    const prisma = this.getClient('live');
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT class_name AS release_key, name AS release_name, raw_json, extracted_at
       FROM game.game_insights
       WHERE category = 'rsi_roadmap'
       ORDER BY extracted_at DESC, name DESC`,
    );
    return rows.map((r) => {
      const parsed = typeof r.raw_json === 'string' ? JSON.parse(r.raw_json) : (r.raw_json as Record<string, unknown> | null);
      return {
        release_key: r.release_key,
        release_name: r.release_name,
        ...(parsed ?? {}),
        synced_at: r.extracted_at,
      };
    });
  }

  async getRsiStatus(): Promise<Record<string, unknown>> {
    const prisma = this.getClient('live');
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT name AS summary_status, raw_json, extracted_at
       FROM game.game_insights
       WHERE category = 'rsi_status' AND class_name = 'current'
       LIMIT 1`,
    );
    const r = rows[0];
    if (r) {
      const parsed = typeof r.raw_json === 'string' ? JSON.parse(r.raw_json) : (r.raw_json as Record<string, unknown> | null);
      return {
        summary_status: r.summary_status,
        synced_at: r.extracted_at,
        ...(parsed ?? {}),
      };
    }
    return { summary_status: 'unknown', synced_at: null };
  }

  async getRsiOrganization(symbol: string): Promise<Record<string, unknown> | null> {
    const cleanSymbol = symbol.trim().toUpperCase();
    if (!cleanSymbol || !/^[A-Z0-9_-]{1,20}$/.test(cleanSymbol)) return null;

    const prisma = this.getClient('live');
    const cached = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT raw_json, extracted_at
         FROM game.game_insights
         WHERE category = 'rsi_org' AND UPPER(class_name) = ?
           AND extracted_at >= NOW() - INTERVAL '24 hours'
         LIMIT 1`,
      ),
      cleanSymbol,
    );
    if (cached[0]?.raw_json) {
      const parsed = typeof cached[0].raw_json === 'string' ? JSON.parse(cached[0].raw_json) : cached[0].raw_json;
      return { ...(parsed as Record<string, unknown>), cached_at: cached[0].extracted_at };
    }

    const res = await fetch('https://robertsspaceindustries.com/api/orgs/getOrgs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; StarvisBot/2.0; +https://starvis.ampynjord.bzh)',
      },
      body: JSON.stringify({
        sort: 'SIZE',
        commitment: '',
        roleplay: '',
        membercount: '',
        archetype: '',
        language: '',
        recruiting: '',
        search: cleanSymbol,
        pagesize: 5,
        page: 1,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const payload = (await res.json()) as { success?: number; data?: { html?: string } };
    const html = payload?.data?.html ?? '';
    const cells = html.split(/<div class="org-cell[^"]*">/);
    for (const cell of cells.slice(1)) {
      const orgName = cell.match(/class="trans-03s name">([^<]+)/)?.[1]?.trim() ?? null;
      const orgSymbol = cell.match(/class="symbol">([^<]+)/)?.[1]?.trim() ?? null;
      if (!orgName || !orgSymbol || orgSymbol.toUpperCase() !== cleanSymbol) continue;
      const logoSrc = cell.match(/<span class="thumb">\s*<img src="([^"]+)"/)?.[1] ?? null;
      const logoUrl = logoSrc ? (logoSrc.startsWith('http') ? logoSrc : `https://robertsspaceindustries.com${logoSrc}`) : null;
      const memberCountRaw = cell.match(/Members: <\/span><span class="value">([^<]+)/)?.[1]?.trim() ?? null;
      const orgData = {
        symbol: orgSymbol,
        name: orgName,
        logo_url: logoUrl,
        archetype: cell.match(/Archetype: <\/span><span class="value">([^<]+)/)?.[1]?.trim() ?? null,
        language: cell.match(/Lang: <\/span><span class="value">([^<]+)/)?.[1]?.trim() ?? null,
        commitment: cell.match(/Commitment: <\/span><span class="value[^"]*">([^<]+)/)?.[1]?.trim() ?? null,
        recruiting: cell.match(/Recruiting: <\/span><span class="value[^"]*">([^<]+)/)?.[1]?.trim() === 'Yes',
        roleplay: cell.match(/Role play: <\/span><span class="value[^"]*">([^<]+)/)?.[1]?.trim() === 'Yes',
        member_count: memberCountRaw ? Number.parseInt(memberCountRaw, 10) : null,
        rsi_url: `https://robertsspaceindustries.com/orgs/${orgSymbol}`,
      };
      const hexSuffix = Buffer.from(cleanSymbol, 'utf8').toString('hex').padStart(12, '0').slice(-12);
      const deterministicUuid = `00000000-0000-4000-8003-${hexSuffix}`;
      await prisma.$executeRawUnsafe(
        toPostgres(
          `INSERT INTO game.game_insights (uuid, env, category, source_type, class_name, name, subtype, value_numeric, value_text, raw_json, extracted_at)
           VALUES (?, 'live', 'rsi_org', 'rsi_orgs', ?, ?, ?, ?, ?, ?::jsonb, NOW())
           ON CONFLICT (uuid, env, category) DO UPDATE SET
             name = EXCLUDED.name,
             subtype = EXCLUDED.subtype,
             value_numeric = EXCLUDED.value_numeric,
             value_text = EXCLUDED.value_text,
             raw_json = EXCLUDED.raw_json,
             extracted_at = NOW()`,
        ),
        deterministicUuid,
        cleanSymbol,
        orgData.name,
        orgData.archetype ?? 'Organization',
        orgData.member_count ?? 0,
        orgData.language ?? null,
        JSON.stringify(orgData),
      );
      return orgData;
    }
    return null;
  }
}
