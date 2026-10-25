import type { PrismaLike as PrismaClient } from '@starvis/db';
import { convertBigIntToNumber, type PaginatedResult, type Row, toPostgres } from './shared.js';

export interface UniverseOmniResult {
  id: string;
  uuid?: string;
  className?: string;
  name: string;
  category: 'ships' | 'components' | 'items' | 'locations' | 'commodities';
  type: string;
  subType?: string | null;
  manufacturer?: string | null;
  manufacturerCode?: string | null;
  thumbnail?: string | null;
  priceAuec?: number | null;
  storePriceUsd?: number | null;
  productionStatus?: string | null;
  size?: string | number | null;
  system?: string | null;
  badge?: {
    label: string;
    color: 'blue' | 'purple' | 'amber' | 'emerald' | 'cyan' | 'slate';
  };
}

export interface UniverseExploreParams {
  category?: 'all' | 'ships' | 'components' | 'items' | 'locations' | 'commodities';
  search?: string;
  manufacturer?: string;
  type?: string;
  system?: string;
  page?: number;
  limit?: number;
  env?: string;
}

export interface UniverseEntityNexus {
  entity: Row;
  category: 'ships' | 'components' | 'items' | 'locations' | 'commodities';
  connections: {
    equippedOn?: Row[]; // for components: ships equipping this item
    loadout?: Row[]; // for ships: components equipped by slot
    purchasableAt?: Row[]; // shops & locations selling this entity with prices
    shops?: Row[]; // for locations: shops located here
    inventory?: Row[]; // for shops: items/ships sold
    marketOffers?: Row[]; // for commodities: buy/sell terminals & price spreads
    manufacturer?: Row | null;
  };
}

export class UniverseNexusService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Omni-search across ships, modular components, FPS gear, locations, and commodities.
   * Strictly filters out dev placeholders, engine thruster pipes, and ghost records.
   * Returns human-readable in-game names.
   */
  async omniSearch(query: string, env = 'live', limit = 20): Promise<UniverseOmniResult[]> {
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return [];

    const safeLimit = Math.min(Math.max(1, limit), 50);
    const likePattern = `%${cleanQuery}%`;

    // Parallel multi-domain query with human-name resolution and placeholder exclusion
    const [ships, components, items, locations, commodities] = await Promise.all([
      // 1. Ships (game.ships + rsi.ship_matrix)
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          s.uuid,
          s.class_name,
          s.name,
          COALESCE(m.name, s.manufacturer_code) AS manufacturer_name,
          s.manufacturer_code,
          s.role,
          s.career,
          s.vehicle_category,
          COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail,
          sm.production_status
        FROM game.ships s
        LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
        LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
        WHERE s.env = $1
          AND s.name ILIKE $2
          AND s.name NOT ILIKE '%placeholder%'
        ORDER BY 
          CASE WHEN s.name ILIKE $3 THEN 0 ELSE 1 END,
          s.name ASC
        LIMIT $4`,
        toPostgres(env),
        likePattern,
        cleanQuery,
        safeLimit,
      ),

      // 2. Components (excluding internal engine thrusters, pipes, and placeholders)
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          c.uuid,
          c.class_name,
          c.name,
          c.type,
          c.sub_type,
          c.size,
          c.grade,
          c.manufacturer_code,
          COALESCE(m.name, c.manufacturer_code) AS manufacturer_name
        FROM game.components c
        LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
        WHERE c.env = $1
          AND c.name ILIKE $2
          AND c.name NOT ILIKE '%placeholder%'
          AND c.name != ''
          AND c.type NOT IN ('Thruster', 'FuelIntake')
          AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ORDER BY 
          CASE WHEN c.name ILIKE $3 THEN 0 ELSE 1 END,
          c.name ASC
        LIMIT $4`,
        toPostgres(env),
        likePattern,
        cleanQuery,
        safeLimit,
      ),

      // 3. FPS Items & Equipment (Armors, Weapons, Gadgets)
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          i.uuid,
          i.class_name,
          i.name,
          i.type,
          i.sub_type,
          i.manufacturer_code,
          COALESCE(m.name, i.manufacturer_code) AS manufacturer_name
        FROM game.items i
        LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
        WHERE i.env = $1
          AND i.name ILIKE $2
          AND i.name NOT ILIKE '%placeholder%'
          AND i.name != ''
          AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ORDER BY 
          CASE WHEN i.name ILIKE $3 THEN 0 ELSE 1 END,
          i.name ASC
        LIMIT $4`,
        toPostgres(env),
        likePattern,
        cleanQuery,
        safeLimit,
      ),

      // 4. Locations & Stations
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          l.uuid,
          l.name,
          l.type,
          l.system_code,
          l.description
        FROM game.locations l
        WHERE l.env = $1
          AND l.name ILIKE $2
          AND l.name NOT ILIKE '%placeholder%'
          AND l.name != ''
          AND l.type IN ('SpaceStation', 'LandingZone', 'City', 'Outpost', 'Planet', 'Moon', 'Settlement', 'LagrangePoint')
        ORDER BY 
          CASE WHEN l.name ILIKE $3 THEN 0 ELSE 1 END,
          l.name ASC
        LIMIT $4`,
        toPostgres(env),
        likePattern,
        cleanQuery,
        safeLimit,
      ),

      // 5. Commodities
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          cm.uuid,
          cm.name,
          cm.type,
          cm.sub_type,
          cm.symbol
        FROM game.commodities cm
        WHERE cm.env = $1
          AND cm.name ILIKE $2
          AND cm.name NOT ILIKE '%placeholder%'
          AND cm.name != ''
        ORDER BY 
          CASE WHEN cm.name ILIKE $3 THEN 0 ELSE 1 END,
          cm.name ASC
        LIMIT $4`,
        toPostgres(env),
        likePattern,
        cleanQuery,
        safeLimit,
      ),
    ]);

    const results: UniverseOmniResult[] = [];

    // Map ships
    for (const s of convertBigIntToNumber(ships)) {
      results.push({
        id: s.uuid,
        uuid: s.uuid,
        className: s.class_name,
        name: s.name,
        category: 'ships',
        type: s.role || 'Ship',
        subType: s.career,
        manufacturer: s.manufacturer_name,
        manufacturerCode: s.manufacturer_code,
        thumbnail: s.thumbnail,
        storePriceUsd: s.price_usd ? Number(s.price_usd) : null,
        productionStatus: s.production_status || 'flight-ready',
        badge: {
          label: s.production_status === 'lore' ? 'Lore / SQ42' : s.role || 'Vaisseau',
          color: s.production_status === 'lore' ? 'purple' : 'blue',
        },
      });
    }

    // Map components
    for (const c of convertBigIntToNumber(components)) {
      results.push({
        id: c.uuid,
        uuid: c.uuid,
        className: c.class_name,
        name: c.name,
        category: 'components',
        type: c.type || 'Composant',
        subType: c.sub_type,
        manufacturer: c.manufacturer_name,
        manufacturerCode: c.manufacturer_code,
        size: c.size,
        badge: {
          label: `T${c.size || 1} ${c.type}`,
          color: 'cyan',
        },
      });
    }

    // Map items
    for (const i of convertBigIntToNumber(items)) {
      results.push({
        id: i.uuid,
        uuid: i.uuid,
        className: i.class_name,
        name: i.name,
        category: 'items',
        type: i.type || 'Équipement',
        subType: i.sub_type,
        manufacturer: i.manufacturer_name,
        manufacturerCode: i.manufacturer_code,
        badge: {
          label: i.type || 'Item',
          color: 'emerald',
        },
      });
    }

    // Map locations
    for (const l of convertBigIntToNumber(locations)) {
      results.push({
        id: l.uuid,
        uuid: l.uuid,
        name: l.name,
        category: 'locations',
        type: l.type || 'Lieu',
        system: l.system_code,
        badge: {
          label: l.system_code ? `${l.system_code} • ${l.type}` : l.type,
          color: 'amber',
        },
      });
    }

    // Map commodities
    for (const cm of convertBigIntToNumber(commodities)) {
      results.push({
        id: cm.uuid,
        uuid: cm.uuid,
        name: cm.name,
        category: 'commodities',
        type: cm.type || 'Marchandise',
        subType: cm.sub_type,
        badge: {
          label: cm.type || 'Commodity',
          color: 'slate',
        },
      });
    }

    return results.slice(0, safeLimit);
  }

  /**
   * Unified Explore endpoint powering the main Nexus view.
   * Can browse everything or focus on a specific category with intelligent facets.
   */
  async explore(params: UniverseExploreParams): Promise<PaginatedResult<UniverseOmniResult> & { facets: Row }> {
    const { category = 'all', search, manufacturer, type, page = 1, limit = 24, env = 'live' } = params;
    const offset = Math.max(0, (page - 1) * limit);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    // Build category queries
    const whereSearch = search ? `%${search.trim()}%` : null;

    if (category === 'ships' || category === 'all') {
      // Return ships exploration
      const countSql = `SELECT COUNT(*) as total FROM game.ships s WHERE s.env = $1 AND s.name NOT ILIKE '%placeholder%' ${
        whereSearch ? 'AND s.name ILIKE $2' : ''
      }`;
      const countParams = whereSearch ? [toPostgres(env), whereSearch] : [toPostgres(env)];
      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT 
        s.uuid,
        s.class_name,
        s.name,
        COALESCE(m.name, s.manufacturer_code) AS manufacturer_name,
        s.manufacturer_code,
        s.role,
        s.career,
        s.vehicle_category,
        COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail,
        s.size_x,
        s.size_y,
        s.size_z,
        s.mass,
        s.scm_speed,
        s.max_speed,
        s.total_hp,
        s.cargo_capacity,
        s.crew_size,
        sm.production_status
      FROM game.ships s
      LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
      LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
      WHERE s.env = $1
        AND s.name NOT ILIKE '%placeholder%'
        ${whereSearch ? 'AND s.name ILIKE $2' : ''}
      ORDER BY s.name ASC
      LIMIT $${whereSearch ? 3 : 2} OFFSET $${whereSearch ? 4 : 3}`;

      const itemsParams = whereSearch ? [toPostgres(env), whereSearch, safeLimit, offset] : [toPostgres(env), safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((s: Row) => ({
        id: s.uuid,
        uuid: s.uuid,
        className: s.class_name,
        name: s.name,
        category: 'ships',
        type: s.role || 'Ship',
        subType: s.career,
        manufacturer: s.manufacturer_name,
        manufacturerCode: s.manufacturer_code,
        thumbnail: s.thumbnail,
        storePriceUsd: s.price_usd ? Number(s.price_usd) : null,
        productionStatus: s.production_status || 'flight-ready',
        badge: {
          label: s.production_status === 'lore' ? 'Lore / SQ42' : s.role || 'Vaisseau',
          color: s.production_status === 'lore' ? 'purple' : 'blue',
        },
      }));

      return {
        data,
        total,
        page,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
        facets: {
          category: 'ships',
          availableCategories: ['ships', 'components', 'items', 'locations', 'commodities'],
        },
      };
    }

    if (category === 'components') {
      const countSql = `SELECT COUNT(*) as total FROM game.components c 
        WHERE c.env = $1 
          AND c.name NOT ILIKE '%placeholder%' 
          AND c.name != '' 
          AND c.type NOT IN ('Thruster', 'FuelIntake')
          AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
          ${whereSearch ? 'AND c.name ILIKE $2' : ''}
          ${manufacturer ? `AND c.manufacturer_code = $${whereSearch ? 3 : 2}` : ''}
          ${type ? `AND c.type = $${whereSearch ? (manufacturer ? 4 : 3) : manufacturer ? 3 : 2}` : ''}`;

      const countParams: unknown[] = [toPostgres(env)];
      if (whereSearch) countParams.push(whereSearch);
      if (manufacturer) countParams.push(manufacturer);
      if (type) countParams.push(type);

      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT 
        c.uuid,
        c.class_name,
        c.name,
        c.type,
        c.sub_type,
        c.size,
        c.grade,
        c.manufacturer_code,
        COALESCE(m.name, c.manufacturer_code) AS manufacturer_name
      FROM game.components c
      LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
      WHERE c.env = $1
        AND c.name NOT ILIKE '%placeholder%'
        AND c.name != ''
        AND c.type NOT IN ('Thruster', 'FuelIntake')
        AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ${whereSearch ? 'AND c.name ILIKE $2' : ''}
        ${manufacturer ? `AND c.manufacturer_code = $${whereSearch ? 3 : 2}` : ''}
        ${type ? `AND c.type = $${whereSearch ? (manufacturer ? 4 : 3) : manufacturer ? 3 : 2}` : ''}
      ORDER BY c.name ASC
      LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((c: Row) => ({
        id: c.uuid,
        uuid: c.uuid,
        className: c.class_name,
        name: c.name,
        category: 'components',
        type: c.type || 'Composant',
        subType: c.sub_type,
        manufacturer: c.manufacturer_name,
        manufacturerCode: c.manufacturer_code,
        size: c.size,
        badge: {
          label: `T${c.size || 1} ${c.type}`,
          color: 'cyan',
        },
      }));

      return {
        data,
        total,
        page,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
        facets: {
          category: 'components',
        },
      };
    }

    if (category === 'items') {
      const countSql = `SELECT COUNT(*) as total FROM game.items i 
        WHERE i.env = $1 
          AND i.name NOT ILIKE '%placeholder%' 
          AND i.name != '' 
          AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
          ${whereSearch ? 'AND i.name ILIKE $2' : ''}`;
      const countParams: unknown[] = [toPostgres(env)];
      if (whereSearch) countParams.push(whereSearch);

      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT 
        i.uuid,
        i.class_name,
        i.name,
        i.type,
        i.sub_type,
        i.manufacturer_code,
        COALESCE(m.name, i.manufacturer_code) AS manufacturer_name
      FROM game.items i
      LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
      WHERE i.env = $1
        AND i.name NOT ILIKE '%placeholder%'
        AND i.name != ''
        AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ${whereSearch ? 'AND i.name ILIKE $2' : ''}
      ORDER BY i.name ASC
      LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((i: Row) => ({
        id: i.uuid,
        uuid: i.uuid,
        className: i.class_name,
        name: i.name,
        category: 'items',
        type: i.type || 'Équipement',
        subType: i.sub_type,
        manufacturer: i.manufacturer_name,
        manufacturerCode: i.manufacturer_code,
        badge: {
          label: i.type || 'Item',
          color: 'emerald',
        },
      }));

      return {
        data,
        total,
        page,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
        facets: {
          category: 'items',
        },
      };
    }

    if (category === 'locations') {
      const countSql = `SELECT COUNT(*) as total FROM game.locations l 
        WHERE l.env = $1 
          AND l.name NOT ILIKE '%placeholder%' 
          AND l.name != '' 
          AND l.type IN ('SpaceStation', 'LandingZone', 'City', 'Outpost', 'Planet', 'Moon', 'Settlement', 'LagrangePoint')
          ${whereSearch ? 'AND l.name ILIKE $2' : ''}`;
      const countParams: unknown[] = [toPostgres(env)];
      if (whereSearch) countParams.push(whereSearch);

      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT 
        l.uuid,
        l.name,
        l.type,
        l.system_code,
        l.description
      FROM game.locations l
      WHERE l.env = $1
        AND l.name NOT ILIKE '%placeholder%'
        AND l.name != ''
        AND l.type IN ('SpaceStation', 'LandingZone', 'City', 'Outpost', 'Planet', 'Moon', 'Settlement', 'LagrangePoint')
        ${whereSearch ? 'AND l.name ILIKE $2' : ''}
      ORDER BY l.name ASC
      LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((l: Row) => ({
        id: l.uuid,
        uuid: l.uuid,
        name: l.name,
        category: 'locations',
        type: l.type || 'Lieu',
        system: l.system_code,
        badge: {
          label: l.system_code ? `${l.system_code} • ${l.type}` : l.type,
          color: 'amber',
        },
      }));

      return {
        data,
        total,
        page,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
        facets: {
          category: 'locations',
        },
      };
    }

    // Default: commodities
    const countSql = `SELECT COUNT(*) as total FROM game.commodities cm 
      WHERE cm.env = $1 
        AND cm.name NOT ILIKE '%placeholder%' 
        AND cm.name != '' 
        ${whereSearch ? 'AND cm.name ILIKE $2' : ''}`;
    const countParams: unknown[] = [toPostgres(env)];
    if (whereSearch) countParams.push(whereSearch);

    const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
    const total = Number(totalCountRow[0]?.total || 0);

    const itemsSql = `SELECT 
      cm.uuid,
      cm.name,
      cm.type,
      cm.sub_type,
      cm.symbol
    FROM game.commodities cm
    WHERE cm.env = $1
      AND cm.name NOT ILIKE '%placeholder%'
      AND cm.name != ''
      ${whereSearch ? 'AND cm.name ILIKE $2' : ''}
    ORDER BY cm.name ASC
    LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

    const itemsParams = [...countParams, safeLimit, offset];
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

    const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((cm: Row) => ({
      id: cm.uuid,
      uuid: cm.uuid,
      name: cm.name,
      category: 'commodities',
      type: cm.type || 'Marchandise',
      subType: cm.sub_type,
      badge: {
        label: cm.type || 'Commodity',
        color: 'slate',
      },
    }));

    return {
      data,
      total,
      page,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit) || 1,
      facets: {
        category: 'commodities',
      },
    };
  }

  /**
   * Get 360° Pivot Nexus Sheet for an entity, including all relational connections.
   */
  async getEntityNexus(
    category: 'ships' | 'components' | 'items' | 'locations' | 'commodities',
    id: string,
    env = 'live',
  ): Promise<UniverseEntityNexus | null> {
    if (category === 'ships') {
      const shipRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          s.*,
          COALESCE(m.name, s.manufacturer_code) AS manufacturer_name,
          m.known_for AS manufacturer_known_for,
          COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail,
          sm.description AS sm_description,
          sm.url AS store_url,
          sm.production_status,
          sm.focus AS sm_focus,
          sm.type AS sm_type
        FROM game.ships s
        LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
        LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
        WHERE s.env = $1 AND (s.uuid = $2 OR s.class_name = $2)
        LIMIT 1`,
        toPostgres(env),
        id,
      );

      if (!shipRows || shipRows.length === 0) return null;
      const ship = convertBigIntToNumber(shipRows[0]);

      // Fetch equipped loadout with human component names
      const loadoutRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          sl.id,
          sl.port_name,
          sl.port_type,
          sl.port_min_size,
          sl.port_max_size,
          sl.component_class_name,
          sl.component_uuid,
          c.name AS component_name,
          c.type AS component_type,
          c.sub_type AS component_sub_type,
          c.size AS component_size,
          c.grade AS component_grade,
          c.manufacturer_code AS component_manufacturer
        FROM game.ship_loadouts sl
        LEFT JOIN game.components c ON (c.uuid = sl.component_uuid OR c.class_name = sl.component_class_name) AND c.env = $1
        WHERE sl.ship_uuid = $2 AND sl.env = $1
          AND sl.component_class_name !~* '(door|interior|airlock|seat|light|hatch|bed|toilet|ladder|cockpit)'
          AND (c.name IS NULL OR c.name NOT ILIKE '%placeholder%')
        ORDER BY sl.port_type ASC, sl.port_name ASC`,
        toPostgres(env),
        ship.uuid,
      );

      // Fetch shops where this ship is purchasable / rentable in aUEC
      const shopsRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          sh.id AS shop_id,
          sh.name AS shop_name,
          sh.location,
          sh.system,
          sh.planet_moon,
          sh.city,
          si.base_price AS price_auec,
          si.rental_price_1d,
          si.rental_price_3d,
          si.rental_price_7d,
          si.rental_price_30d
        FROM game.shop_inventory si
        JOIN game.shops sh ON sh.id = si.shop_id AND sh.env = $1
        WHERE (si.component_uuid = $2 OR si.component_class_name = $3)
        ORDER BY si.base_price ASC`,
        toPostgres(env),
        ship.uuid,
        ship.class_name,
      );

      return {
        entity: ship,
        category: 'ships',
        connections: {
          loadout: convertBigIntToNumber(loadoutRows),
          purchasableAt: convertBigIntToNumber(shopsRows),
          manufacturer: ship.manufacturer_name
            ? {
                code: ship.manufacturer_code,
                name: ship.manufacturer_name,
                known_for: ship.manufacturer_known_for,
              }
            : null,
        },
      };
    }

    if (category === 'components') {
      const compRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          c.*,
          COALESCE(m.name, c.manufacturer_code) AS manufacturer_name,
          m.known_for AS manufacturer_known_for
        FROM game.components c
        LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
        WHERE c.env = $1 AND (c.uuid = $2 OR c.class_name = $2)
        LIMIT 1`,
        toPostgres(env),
        id,
      );

      if (!compRows || compRows.length === 0) return null;
      const component = convertBigIntToNumber(compRows[0]);

      // Find ships equipping this component
      const equippedShips = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT DISTINCT
          s.uuid,
          s.class_name,
          s.name,
          s.role,
          COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail,
          sl.port_name,
          sl.port_type
        FROM game.ship_loadouts sl
        JOIN game.ships s ON s.uuid = sl.ship_uuid AND s.env = $1
        LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
        WHERE (sl.component_uuid = $2 OR sl.component_class_name = $3)
          AND s.name NOT ILIKE '%placeholder%'
        ORDER BY s.name ASC
        LIMIT 30`,
        toPostgres(env),
        component.uuid,
        component.class_name,
      );

      // Find shops selling this component
      const shopRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          sh.id AS shop_id,
          sh.name AS shop_name,
          sh.location,
          sh.system,
          sh.planet_moon,
          sh.city,
          si.base_price AS price_auec,
          si.current_inventory AS stock
        FROM game.shop_inventory si
        JOIN game.shops sh ON sh.id = si.shop_id AND sh.env = $1
        WHERE (si.component_uuid = $2 OR si.component_class_name = $3)
        ORDER BY si.base_price ASC`,
        toPostgres(env),
        component.uuid,
        component.class_name,
      );

      return {
        entity: component,
        category: 'components',
        connections: {
          equippedOn: convertBigIntToNumber(equippedShips),
          purchasableAt: convertBigIntToNumber(shopRows),
          manufacturer: component.manufacturer_name
            ? {
                code: component.manufacturer_code,
                name: component.manufacturer_name,
                known_for: component.manufacturer_known_for,
              }
            : null,
        },
      };
    }

    if (category === 'locations') {
      const locRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          l.*,
          sml.name AS starmap_name,
          sml.code AS starmap_code
        FROM game.locations l
        LEFT JOIN rsi.starmap_locations sml ON sml.id = l.rsi_starmap_location_id
        WHERE l.env = $1 AND l.uuid = $2
        LIMIT 1`,
        toPostgres(env),
        id,
      );

      if (!locRows || locRows.length === 0) return null;
      const location = convertBigIntToNumber(locRows[0]);

      // Fetch shops attached to this location
      const shops = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          sh.id,
          sh.name,
          sh.shop_type,
          sh.city,
          sh.planet_moon,
          sh.system,
          (SELECT COUNT(*) FROM game.shop_inventory si WHERE si.shop_id = sh.id) AS inventory_count
        FROM game.shops sh
        WHERE sh.env = $1 AND (sh.location_uuid = $2 OR sh.location ILIKE $3)
        ORDER BY sh.name ASC`,
        toPostgres(env),
        location.uuid,
        `%${location.name}%`,
      );

      return {
        entity: location,
        category: 'locations',
        connections: {
          shops: convertBigIntToNumber(shops),
        },
      };
    }

    // Default item / commodity
    const itemRows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT 
        i.*,
        COALESCE(m.name, i.manufacturer_code) AS manufacturer_name,
        m.known_for AS manufacturer_known_for
      FROM game.items i
      LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
      WHERE i.env = $1 AND (i.uuid = $2 OR i.class_name = $2)
      LIMIT 1`,
      toPostgres(env),
      id,
    );

    if (!itemRows || itemRows.length === 0) return null;
    const item = convertBigIntToNumber(itemRows[0]);

    // Shops selling this item
    const shopRows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT 
        sh.id AS shop_id,
        sh.name AS shop_name,
        sh.location,
        sh.system,
        sh.planet_moon,
        sh.city,
        si.base_price AS price_auec,
        si.current_inventory AS stock
      FROM game.shop_inventory si
      JOIN game.shops sh ON sh.id = si.shop_id AND sh.env = $1
      WHERE (si.component_uuid = $2 OR si.component_class_name = $3)
      ORDER BY si.base_price ASC`,
      toPostgres(env),
      item.uuid,
      item.class_name,
    );

    return {
      entity: item,
      category: 'items',
      connections: {
        purchasableAt: convertBigIntToNumber(shopRows),
        manufacturer: item.manufacturer_name
          ? {
              code: item.manufacturer_code,
              name: item.manufacturer_name,
              known_for: item.manufacturer_known_for,
            }
          : null,
      },
    };
  }
}
