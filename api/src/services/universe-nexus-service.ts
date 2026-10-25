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
  status?: string;
  page?: number;
  limit?: number;
  env?: string;
  lang?: string;
}

type NexusLang = 'fr' | 'en';

function asLang(lang?: string): NexusLang {
  return lang === 'en' ? 'en' : 'fr';
}

function translationJoin(alias: string): string {
  return `LEFT JOIN game.game_insights tr ON tr.uuid = ${alias}.uuid AND tr.env = ${alias}.env AND tr.category = 'translation_fr'`;
}

/** One human name for the active language. Identical proper nouns keep a single casing. */
function displayNameSql(alias: string, column: string, lang: NexusLang): string {
  const base = `${alias}.${column}`;
  const english = `COALESCE(NULLIF(tr.raw_json->>'name_en', ''), ${base})`;
  if (lang === 'en') return english;
  const french = `NULLIF(tr.raw_json->>'name_fr', '')`;
  return `CASE
    WHEN ${french} IS NOT NULL AND lower(${french}) IS DISTINCT FROM lower(${english})
    THEN ${french}
    ELSE ${english}
  END`;
}

function nameMatchSql(alias: string, column: string, param: string): string {
  return `(
    ${alias}.${column} ILIKE ${param}
    OR COALESCE(tr.raw_json->>'name_fr', '') ILIKE ${param}
    OR COALESCE(tr.raw_json->>'name_en', '') ILIKE ${param}
    OR COALESCE(tr.name, '') ILIKE ${param}
  )`;
}

function uiLabel(lang: NexusLang, fr: string, en: string): string {
  return lang === 'fr' ? fr : en;
}

/**
 * Reject workshop leftovers (`Pulse Collector Civ`, `Corsair Exec StealthIndustrial`,
 * raw `ANVL_…` class names) so Nexus never shows DataForge identifiers.
 */
function readableShipNameSql(alias: string, column = 'name'): string {
  return `(
    ${alias}.${column} NOT ILIKE '%placeholder%'
    AND ${alias}.${column} !~ '^[A-Z]{2,5}_'
    AND ${alias}.${column} !~* '(Collector\\s+(Civ|Military|Stealth|Mod|Indust|Grad)|Exec\\s+(Military|Stealth)|StealthIndustrial|\\bGrad\\d+\\b)'
  )`;
}

/** Concept / lore / upcoming rows that exist only in Ship Matrix (not yet in game.ships). */
function conceptShipsSelectSql(searchParam: string | null, statusParam?: string | null): string {
  const search = searchParam
    ? `AND (sm2.name ILIKE ${searchParam} OR COALESCE(sm2.manufacturer_name, '') ILIKE ${searchParam} OR COALESCE(sm2.focus, '') ILIKE ${searchParam})`
    : '';
  let statusCondition =
    "COALESCE(sm2.production_status, 'in-concept') IN ('in-concept', 'in-production', 'in-development', 'lore', 'flight-ready')";
  if (statusParam === 'flight-ready') {
    statusCondition = "sm2.production_status = 'flight-ready'";
  } else if (statusParam === 'in-concept') {
    statusCondition = "sm2.production_status IN ('in-concept', 'in-production', 'in-development')";
  } else if (statusParam === 'lore') {
    statusCondition = "sm2.production_status = 'lore'";
  }
  return `
    SELECT
      ('concept-' || sm2.id::text) AS uuid,
      LOWER(REPLACE(REPLACE(sm2.name, ' ', '_'), '''', '')) AS class_name,
      sm2.name AS name,
      COALESCE(sm2.manufacturer_name, sm2.manufacturer_code) AS manufacturer_name,
      sm2.manufacturer_code,
      sm2.focus AS role,
      CASE WHEN sm2.type IS NULL OR sm2.type = '' THEN NULL ELSE INITCAP(REPLACE(sm2.type, '-', ' ')) END AS career,
      NULL::text AS vehicle_category,
      COALESCE(sm2.media_store_small, sm2.media_store_large) AS thumbnail,
      sm2.production_status
    FROM rsi.ship_matrix sm2
    WHERE ${statusCondition}
      AND sm2.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL)
      AND sm2.name NOT ILIKE '%placeholder%'
      ${search}
  `;
}

function shipStatusFilterSql(status?: string): string {
  if (status === 'flight-ready') {
    return "AND (sm.production_status = 'flight-ready' OR sm.production_status IS NULL)";
  }
  if (status === 'in-concept') {
    return "AND sm.production_status IN ('in-concept', 'in-production', 'in-development')";
  }
  if (status === 'lore') {
    return "AND sm.production_status = 'lore'";
  }
  return '';
}

function readTranslation(
  row: Row,
): { name_en?: string | null; name_fr?: string | null; description_en?: string | null; description_fr?: string | null } | null {
  const raw = row.translation_json;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as {
        name_en?: string | null;
        name_fr?: string | null;
        description_en?: string | null;
        description_fr?: string | null;
      };
    } catch {
      return null;
    }
  }
  return raw as { name_en?: string | null; name_fr?: string | null; description_en?: string | null; description_fr?: string | null };
}

function applyLanguage(row: Row, lang: NexusLang): Row {
  const parsed = readTranslation(row);
  const english = parsed?.name_en || row.name;
  const french = parsed?.name_fr || row.translation_name;
  const name =
    lang === 'fr' && french && String(french).toLowerCase() !== String(english || '').toLowerCase() ? french : english || row.name;
  const description = lang === 'fr' ? parsed?.description_fr || row.description : parsed?.description_en || row.description;
  const next: Row = { ...row, name };
  if (description) next.description = description;
  delete next.translation_json;
  delete next.translation_name;
  return next;
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
  async omniSearch(query: string, env = 'live', limit = 20, lang?: string): Promise<UniverseOmniResult[]> {
    const cleanQuery = (query || '').trim();
    if (!cleanQuery) return [];

    const safeLimit = Math.min(Math.max(1, limit), 50);
    const likePattern = `%${cleanQuery}%`;
    const language = asLang(lang);

    // Parallel multi-domain query with human-name resolution and placeholder exclusion
    const [ships, components, items, locations, commodities] = await Promise.all([
      // 1. Ships (game.ships + concept/lore Ship Matrix rows)
      this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT * FROM (
          SELECT 
            s.uuid::text AS uuid,
            s.class_name,
            ${displayNameSql('s', 'name', language)} AS name,
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
          ${translationJoin('s')}
          WHERE s.env = $1
            AND ${nameMatchSql('s', 'name', '$2')}
            AND ${readableShipNameSql('s')}
          UNION ALL
          ${conceptShipsSelectSql('$2')}
        ) ships
        ORDER BY 
          CASE WHEN name ILIKE $3 THEN 0 ELSE 1 END,
          name ASC
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
          ${displayNameSql('c', 'name', language)} AS name,
          c.type,
          c.sub_type,
          c.size,
          c.grade,
          c.manufacturer_code,
          COALESCE(m.name, c.manufacturer_code) AS manufacturer_name
        FROM game.components c
        LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
        ${translationJoin('c')}
        WHERE c.env = $1
          AND ${nameMatchSql('c', 'name', '$2')}
          AND c.name NOT ILIKE '%placeholder%'
          AND c.name != ''
          AND c.name !~ '^[A-Z]{2,5}_'
          AND c.name !~ '^[A-Z]{2,5} '
          AND c.type NOT IN ('Thruster', 'FuelIntake')
          AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ORDER BY 
          CASE WHEN ${displayNameSql('c', 'name', language)} ILIKE $3 THEN 0 ELSE 1 END,
          ${displayNameSql('c', 'name', language)} ASC
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
          ${displayNameSql('i', 'name', language)} AS name,
          i.type,
          i.sub_type,
          i.manufacturer_code,
          COALESCE(m.name, i.manufacturer_code) AS manufacturer_name
        FROM game.items i
        LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
        ${translationJoin('i')}
        WHERE i.env = $1
          AND ${nameMatchSql('i', 'name', '$2')}
          AND i.name NOT ILIKE '%placeholder%'
          AND i.name != ''
          AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ORDER BY 
          CASE WHEN ${displayNameSql('i', 'name', language)} ILIKE $3 THEN 0 ELSE 1 END,
          ${displayNameSql('i', 'name', language)} ASC
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
          ${displayNameSql('l', 'name', language)} AS name,
          l.type,
          l.system_code,
          l.description
        FROM game.locations l
        ${translationJoin('l')}
        WHERE l.env = $1
          AND ${nameMatchSql('l', 'name', '$2')}
          AND l.name NOT ILIKE '%placeholder%'
          AND l.name != ''
          AND LOWER(l.type) IN ('landing_zone', 'station', 'rest_stop', 'planet', 'moon', 'outpost', 'bunker', 'jump_point', 'comm_array', 'mining_claim', 'system', 'star', 'spacestation', 'city', 'settlement', 'lagrangepoint')
        ORDER BY 
          CASE WHEN ${displayNameSql('l', 'name', language)} ILIKE $3 THEN 0 ELSE 1 END,
          ${displayNameSql('l', 'name', language)} ASC
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
          ${displayNameSql('cm', 'name', language)} AS name,
          cm.type,
          cm.sub_type,
          cm.symbol
        FROM game.commodities cm
        ${translationJoin('cm')}
        WHERE cm.env = $1
          AND ${nameMatchSql('cm', 'name', '$2')}
          AND cm.name NOT ILIKE '%placeholder%'
          AND cm.name != ''
        ORDER BY 
          CASE WHEN ${displayNameSql('cm', 'name', language)} ILIKE $3 THEN 0 ELSE 1 END,
          ${displayNameSql('cm', 'name', language)} ASC
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
        type: s.role || uiLabel(language, 'Vaisseau', 'Ship'),
        subType: s.career,
        manufacturer: s.manufacturer_name,
        manufacturerCode: s.manufacturer_code,
        thumbnail: s.thumbnail,
        storePriceUsd: s.price_usd ? Number(s.price_usd) : null,
        productionStatus: s.production_status || 'flight-ready',
        badge: {
          label:
            s.production_status === 'lore'
              ? 'Lore / SQ42'
              : s.production_status === 'in-concept'
                ? uiLabel(language, 'Concept', 'Concept')
                : s.role || uiLabel(language, 'Vaisseau', 'Ship'),
          color: s.production_status === 'lore' ? 'purple' : s.production_status === 'in-concept' ? 'amber' : 'blue',
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
        type: c.type || uiLabel(language, 'Composant', 'Component'),
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
        type: i.type || uiLabel(language, 'Équipement', 'Equipment'),
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
        type: l.type || uiLabel(language, 'Lieu', 'Location'),
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
        type: cm.type || uiLabel(language, 'Marchandise', 'Commodity'),
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
    const { category = 'all', search, manufacturer, type, status, page = 1, limit = 24, env = 'live', lang } = params;
    const language = asLang(lang);
    const offset = Math.max(0, (page - 1) * limit);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    // Build category queries
    const whereSearch = search ? `%${search.trim()}%` : null;

    if (category === 'all') {
      const shipSearch = whereSearch ? `AND ${nameMatchSql('s', 'name', '$2')}` : '';
      const conceptSearch = whereSearch ? '$2' : null;
      const shipStatusSql = shipStatusFilterSql(status);
      const isOnlyConceptOrLore = status === 'in-concept' || status === 'lore';

      const componentSearch = whereSearch ? `AND ${nameMatchSql('c', 'name', '$2')}` : '';
      const itemSearch = whereSearch ? `AND ${nameMatchSql('i', 'name', '$2')}` : '';
      const locationSearch = whereSearch ? `AND ${nameMatchSql('l', 'name', '$2')}` : '';
      const commoditySearch = whereSearch ? `AND ${nameMatchSql('cm', 'name', '$2')}` : '';

      const nonShipSql = isOnlyConceptOrLore
        ? ''
        : `
        UNION ALL
        SELECT c.uuid::text, c.class_name, ${displayNameSql('c', 'name', language)},
          'components', COALESCE(c.type, 'Component'), c.sub_type,
          COALESCE(m.name, c.manufacturer_code), c.manufacturer_code,
          NULL::text, NULL::text, NULL::text, c.size
        FROM game.components c
        LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
        ${translationJoin('c')}
        WHERE c.env = $1 AND c.name NOT ILIKE '%placeholder%' AND c.name != ''
          AND c.name !~ '^[A-Z]{2,5}_'
          AND c.name !~ '^[A-Z]{2,5} '
          AND c.type NOT IN ('Thruster', 'FuelIntake')
          AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
          ${componentSearch}
        UNION ALL
        SELECT i.uuid::text, i.class_name, ${displayNameSql('i', 'name', language)},
          'items', COALESCE(i.type, 'Equipment'), i.sub_type,
          COALESCE(m.name, i.manufacturer_code), i.manufacturer_code,
          NULL::text, NULL::text, NULL::text, NULL::int
        FROM game.items i
        LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
        ${translationJoin('i')}
        WHERE i.env = $1 AND i.name NOT ILIKE '%placeholder%' AND i.name != ''
          AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
          ${itemSearch}
        UNION ALL
        SELECT l.uuid::text, NULL::text, ${displayNameSql('l', 'name', language)},
          'locations', COALESCE(l.type, 'Location'), NULL::text,
          NULL::text, NULL::text, NULL::text, l.system_code, NULL::text, NULL::int
        FROM game.locations l
        ${translationJoin('l')}
        WHERE l.env = $1 AND l.name NOT ILIKE '%placeholder%' AND l.name != ''
          AND LOWER(l.type) IN ('landing_zone', 'station', 'rest_stop', 'planet', 'moon', 'outpost', 'bunker', 'jump_point', 'comm_array', 'mining_claim', 'system', 'star', 'spacestation', 'city', 'settlement', 'lagrangepoint')
          ${locationSearch}
        UNION ALL
        SELECT cm.uuid::text, NULL::text, ${displayNameSql('cm', 'name', language)},
          'commodities', COALESCE(cm.type, 'Commodity'), cm.sub_type,
          NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::int
        FROM game.commodities cm
        ${translationJoin('cm')}
        WHERE cm.env = $1 AND cm.name NOT ILIKE '%placeholder%' AND cm.name != ''
          ${commoditySearch}
      `;

      const universeSql = `
        SELECT s.uuid::text AS id, s.class_name, ${displayNameSql('s', 'name', language)} AS name,
          'ships'::text AS category, COALESCE(s.role, 'Ship') AS type, s.career AS sub_type,
          COALESCE(m.name, s.manufacturer_code) AS manufacturer_name, s.manufacturer_code,
          COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail,
          NULL::text AS system_code, sm.production_status, NULL::int AS size
        FROM game.ships s
        LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
        LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
        ${translationJoin('s')}
        WHERE s.env = $1 AND ${readableShipNameSql('s')} ${shipStatusSql} ${shipSearch}
        UNION ALL
        SELECT cs.uuid AS id, cs.class_name, cs.name, 'ships', COALESCE(cs.role, 'Ship'), cs.career,
          cs.manufacturer_name, cs.manufacturer_code, cs.thumbnail, NULL::text, cs.production_status, NULL::int
        FROM (${conceptShipsSelectSql(conceptSearch, status)}) cs
        ${nonShipSql}
      `;
      const countParams: unknown[] = [toPostgres(env)];
      if (whereSearch) countParams.push(whereSearch);
      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT COUNT(*) AS total FROM (${universeSql}) universe`,
        ...countParams,
      );
      const total = Number(totalCountRow[0]?.total || 0);
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT * FROM (${universeSql}) universe ORDER BY name ASC LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`,
        ...countParams,
        safeLimit,
        offset,
      );
      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((row: Row) => ({
        id: row.id,
        uuid: row.id,
        className: row.class_name,
        name: row.name,
        category: row.category,
        type: row.type,
        subType: row.sub_type,
        manufacturer: row.manufacturer_name,
        manufacturerCode: row.manufacturer_code,
        thumbnail: row.thumbnail,
        system: row.system_code,
        size: row.size,
        productionStatus: row.production_status,
        badge: {
          label: row.production_status === 'lore' ? 'Lore / SQ42' : row.type,
          color: row.category === 'ships' ? 'blue' : row.category === 'locations' ? 'amber' : 'cyan',
        },
      }));
      return {
        data,
        total,
        page,
        limit: safeLimit,
        pages: Math.ceil(total / safeLimit) || 1,
        facets: { category: 'all' },
      };
    }

    if (category === 'ships') {
      const conceptSearch = whereSearch ? '$2' : null;
      const shipStatusSql = shipStatusFilterSql(status);
      const shipsUnionSql = `
        SELECT s.uuid::text AS uuid, s.class_name, ${displayNameSql('s', 'name', language)} AS name,
          COALESCE(m.name, s.manufacturer_code) AS manufacturer_name, s.manufacturer_code,
          s.role, s.career, COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail, sm.production_status
        FROM game.ships s
        LEFT JOIN game.manufacturers m ON m.code = s.manufacturer_code
        LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
        ${translationJoin('s')}
        WHERE s.env = $1 AND ${readableShipNameSql('s')} ${shipStatusSql}
          ${whereSearch ? `AND ${nameMatchSql('s', 'name', '$2')}` : ''}
        UNION ALL
        SELECT cs.uuid, cs.class_name, cs.name, cs.manufacturer_name, cs.manufacturer_code,
          cs.role, cs.career, cs.thumbnail, cs.production_status
        FROM (${conceptShipsSelectSql(conceptSearch, status)}) cs
      `;
      const countParams = whereSearch ? [toPostgres(env), whereSearch] : [toPostgres(env)];
      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT COUNT(*) as total FROM (${shipsUnionSql}) ships`,
        ...countParams,
      );
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT * FROM (${shipsUnionSql}) ships
        ORDER BY name ASC
        LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((s: Row) => ({
        id: s.uuid,
        uuid: s.uuid,
        className: s.class_name,
        name: s.name,
        category: 'ships',
        type: s.role || uiLabel(language, 'Vaisseau', 'Ship'),
        subType: s.career,
        manufacturer: s.manufacturer_name,
        manufacturerCode: s.manufacturer_code,
        thumbnail: s.thumbnail,
        storePriceUsd: s.price_usd ? Number(s.price_usd) : null,
        productionStatus: s.production_status || 'flight-ready',
        badge: {
          label:
            s.production_status === 'lore'
              ? 'Lore / SQ42'
              : s.production_status === 'in-concept'
                ? uiLabel(language, 'Concept', 'Concept')
                : s.role || uiLabel(language, 'Vaisseau', 'Ship'),
          color: s.production_status === 'lore' ? 'purple' : s.production_status === 'in-concept' ? 'amber' : 'blue',
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
        ${translationJoin('c')}
        WHERE c.env = $1 
          AND c.name NOT ILIKE '%placeholder%' 
          AND c.name != '' 
          AND c.name !~ '^[A-Z]{2,5}_'
          AND c.name !~ '^[A-Z]{2,5} '
          AND c.type NOT IN ('Thruster', 'FuelIntake')
          AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
          ${whereSearch ? `AND ${nameMatchSql('c', 'name', '$2')}` : ''}
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
        ${displayNameSql('c', 'name', language)} AS name,
        c.type,
        c.sub_type,
        c.size,
        c.grade,
        c.manufacturer_code,
        COALESCE(m.name, c.manufacturer_code) AS manufacturer_name
      FROM game.components c
      LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
      ${translationJoin('c')}
      WHERE c.env = $1
        AND c.name NOT ILIKE '%placeholder%'
        AND c.name != ''
        AND c.name !~ '^[A-Z]{2,5}_'
        AND c.name !~ '^[A-Z]{2,5} '
        AND c.type NOT IN ('Thruster', 'FuelIntake')
        AND c.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ${whereSearch ? `AND ${nameMatchSql('c', 'name', '$2')}` : ''}
        ${manufacturer ? `AND c.manufacturer_code = $${whereSearch ? 3 : 2}` : ''}
        ${type ? `AND c.type = $${whereSearch ? (manufacturer ? 4 : 3) : manufacturer ? 3 : 2}` : ''}
      ORDER BY ${displayNameSql('c', 'name', language)} ASC
      LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((c: Row) => ({
        id: c.uuid,
        uuid: c.uuid,
        className: c.class_name,
        name: c.name,
        category: 'components',
        type: c.type || uiLabel(language, 'Composant', 'Component'),
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
        ${translationJoin('i')}
        WHERE i.env = $1 
          AND i.name NOT ILIKE '%placeholder%' 
          AND i.name != '' 
          AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
          ${whereSearch ? `AND ${nameMatchSql('i', 'name', '$2')}` : ''}`;
      const countParams: unknown[] = [toPostgres(env)];
      if (whereSearch) countParams.push(whereSearch);

      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT 
        i.uuid,
        i.class_name,
        ${displayNameSql('i', 'name', language)} AS name,
        i.type,
        i.sub_type,
        i.manufacturer_code,
        COALESCE(m.name, i.manufacturer_code) AS manufacturer_name
      FROM game.items i
      LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
      ${translationJoin('i')}
      WHERE i.env = $1
        AND i.name NOT ILIKE '%placeholder%'
        AND i.name != ''
        AND i.class_name !~* '(^temp_|_temp(_|$)|_temporary|_template|_test|^test_|_debug|_placeholder)'
        ${whereSearch ? `AND ${nameMatchSql('i', 'name', '$2')}` : ''}
      ORDER BY ${displayNameSql('i', 'name', language)} ASC
      LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((i: Row) => ({
        id: i.uuid,
        uuid: i.uuid,
        className: i.class_name,
        name: i.name,
        category: 'items',
        type: i.type || uiLabel(language, 'Équipement', 'Equipment'),
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
        ${translationJoin('l')}
        WHERE l.env = $1
          AND l.name NOT ILIKE '%placeholder%' 
          AND l.name != '' 
          AND LOWER(l.type) IN ('landing_zone', 'station', 'rest_stop', 'planet', 'moon', 'outpost', 'bunker', 'jump_point', 'comm_array', 'mining_claim', 'system', 'star', 'spacestation', 'city', 'settlement', 'lagrangepoint')
          ${whereSearch ? `AND ${nameMatchSql('l', 'name', '$2')}` : ''}`;
      const countParams: unknown[] = [toPostgres(env)];
      if (whereSearch) countParams.push(whereSearch);

      const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
      const total = Number(totalCountRow[0]?.total || 0);

      const itemsSql = `SELECT 
        l.uuid,
        ${displayNameSql('l', 'name', language)} AS name,
        l.type,
        l.system_code,
        l.description
      FROM game.locations l
      ${translationJoin('l')}
      WHERE l.env = $1
        AND l.name NOT ILIKE '%placeholder%'
        AND l.name != ''
        AND LOWER(l.type) IN ('landing_zone', 'station', 'rest_stop', 'planet', 'moon', 'outpost', 'bunker', 'jump_point', 'comm_array', 'mining_claim', 'system', 'star', 'spacestation', 'city', 'settlement', 'lagrangepoint')
        ${whereSearch ? `AND ${nameMatchSql('l', 'name', '$2')}` : ''}
      ORDER BY ${displayNameSql('l', 'name', language)} ASC
      LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

      const itemsParams = [...countParams, safeLimit, offset];
      const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

      const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((l: Row) => ({
        id: l.uuid,
        uuid: l.uuid,
        name: l.name,
        category: 'locations',
        type: l.type || uiLabel(language, 'Lieu', 'Location'),
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
      ${translationJoin('cm')}
      WHERE cm.env = $1
        AND cm.name NOT ILIKE '%placeholder%' 
        AND cm.name != '' 
        ${whereSearch ? `AND ${nameMatchSql('cm', 'name', '$2')}` : ''}`;
    const countParams: unknown[] = [toPostgres(env)];
    if (whereSearch) countParams.push(whereSearch);

    const totalCountRow = await this.prisma.$queryRawUnsafe<Row[]>(countSql, ...countParams);
    const total = Number(totalCountRow[0]?.total || 0);

    const itemsSql = `SELECT 
      cm.uuid,
      ${displayNameSql('cm', 'name', language)} AS name,
      cm.type,
      cm.sub_type,
      cm.symbol
    FROM game.commodities cm
    ${translationJoin('cm')}
    WHERE cm.env = $1
      AND cm.name NOT ILIKE '%placeholder%'
      AND cm.name != ''
      ${whereSearch ? `AND ${nameMatchSql('cm', 'name', '$2')}` : ''}
    ORDER BY ${displayNameSql('cm', 'name', language)} ASC
    LIMIT $${countParams.length + 1} OFFSET $${countParams.length + 2}`;

    const itemsParams = [...countParams, safeLimit, offset];
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(itemsSql, ...itemsParams);

    const data: UniverseOmniResult[] = convertBigIntToNumber(rows).map((cm: Row) => ({
      id: cm.uuid,
      uuid: cm.uuid,
      name: cm.name,
      category: 'commodities',
      type: cm.type || uiLabel(language, 'Marchandise', 'Commodity'),
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
    lang?: string,
  ): Promise<UniverseEntityNexus | null> {
    const language = asLang(lang);
    if (category === 'ships') {
      if (id.startsWith('concept-')) {
        const smId = Number(id.replace('concept-', ''));
        if (!Number.isFinite(smId)) return null;
        const conceptRows = await this.prisma.$queryRawUnsafe<Row[]>(
          `SELECT
            ('concept-' || sm2.id::text) AS uuid,
            LOWER(REPLACE(REPLACE(sm2.name, ' ', '_'), '''', '')) AS class_name,
            sm2.name,
            sm2.manufacturer_code,
            COALESCE(sm2.manufacturer_name, sm2.manufacturer_code) AS manufacturer_name,
            sm2.focus AS role,
            CASE WHEN sm2.type IS NULL OR sm2.type = '' THEN NULL ELSE INITCAP(REPLACE(sm2.type, '-', ' ')) END AS career,
            sm2.mass, sm2.beam AS size_x, sm2.length AS size_y, sm2.height AS size_z,
            sm2.scm_speed, sm2.afterburner_speed AS max_speed, sm2.cargocapacity AS cargo_capacity,
            sm2.min_crew AS crew_size, sm2.min_crew, sm2.max_crew,
            sm2.media_store_small AS thumbnail, sm2.media_store_large AS thumbnail_large,
            sm2.production_status, sm2.description AS sm_description, sm2.url AS store_url,
            sm2.ctm_url, sm2.id AS ship_matrix_id
          FROM rsi.ship_matrix sm2
          WHERE sm2.id = $1
          LIMIT 1`,
          smId,
        );
        if (!conceptRows?.length) return null;
        const ship = convertBigIntToNumber(conceptRows[0]);
        return {
          entity: ship,
          category: 'ships',
          connections: {
            loadout: [],
            purchasableAt: [],
            manufacturer: ship.manufacturer_name ? { code: ship.manufacturer_code, name: ship.manufacturer_name } : null,
          },
        };
      }

      const shipRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          s.*,
          tr.raw_json AS translation_json,
          tr.name AS translation_name,
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
        ${translationJoin('s')}
        WHERE s.env = $1 AND (s.uuid = $2 OR s.class_name = $2)
        LIMIT 1`,
        toPostgres(env),
        id,
      );

      if (!shipRows || shipRows.length === 0) return null;
      const ship = applyLanguage(convertBigIntToNumber(shipRows[0]), language);

      // Fetch equipped loadout with human component names and tree relationships (parent_id)
      const loadoutRows = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT 
          sl.id,
          sl.parent_id,
          sl.port_name,
          sl.port_type,
          sl.port_min_size,
          sl.port_max_size,
          sl.component_class_name,
          sl.component_uuid,
          ${displayNameSql('c', 'name', language)} AS component_name,
          COALESCE(c.type, sl.port_type) AS component_type,
          c.sub_type AS component_sub_type,
          COALESCE(c.size, sl.port_max_size, sl.port_min_size) AS component_size,
          c.grade AS component_grade,
          c.manufacturer_code AS component_manufacturer
        FROM game.ship_loadouts sl
        LEFT JOIN game.components c ON (c.uuid = sl.component_uuid OR c.class_name = sl.component_class_name) AND c.env = $1
        ${translationJoin('c')}
        WHERE sl.ship_uuid = $2 AND sl.env = $1
          AND sl.component_class_name !~* '(door|interior|airlock|seat|light|hatch|bed|toilet|ladder|cockpit|flair|dashboard|radar_helper|screen_mfd|controller_|screen_annunciator|display_hud)'
          AND sl.port_name !~* '(door|interior|airlock|seat|light|hatch|bed|toilet|ladder|cockpit|flair|screen_|display_|controller_|^\\$.*|^bar\\d|^mec|^pow|^ven|landingpad)'
          AND (c.name IS NOT NULL OR sl.port_type IN ('Turret', 'WeaponGun', 'MissileRack', 'Gimbal', 'QuantumDrive'))
          AND (c.name IS NULL OR (c.name NOT ILIKE '%placeholder%' AND c.name !~ '^[A-Z]{2,5}_'))
        ORDER BY sl.id ASC`,
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
          tr.raw_json AS translation_json,
          tr.name AS translation_name,
          COALESCE(m.name, c.manufacturer_code) AS manufacturer_name,
          m.known_for AS manufacturer_known_for
        FROM game.components c
        LEFT JOIN game.manufacturers m ON m.code = c.manufacturer_code
        ${translationJoin('c')}
        WHERE c.env = $1 AND (c.uuid = $2 OR c.class_name = $2)
        LIMIT 1`,
        toPostgres(env),
        id,
      );

      if (!compRows || compRows.length === 0) return null;
      const component = applyLanguage(convertBigIntToNumber(compRows[0]), language);

      // Find ships equipping this component
      const equippedShips = await this.prisma.$queryRawUnsafe<Row[]>(
        `SELECT DISTINCT
          s.uuid,
          s.class_name,
          ${displayNameSql('s', 'name', language)} AS name,
          s.role,
          COALESCE(sm.media_store_small, sm.media_store_large) AS thumbnail,
          sl.port_name,
          sl.port_type
        FROM game.ship_loadouts sl
        JOIN game.ships s ON s.uuid = sl.ship_uuid AND s.env = $1
        LEFT JOIN rsi.ship_matrix sm ON sm.id = s.ship_matrix_id
        ${translationJoin('s')}
        WHERE (sl.component_uuid = $2 OR sl.component_class_name = $3)
          AND s.name NOT ILIKE '%placeholder%'
        ORDER BY ${displayNameSql('s', 'name', language)} ASC
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
          tr.raw_json AS translation_json,
          tr.name AS translation_name,
          sml.name AS starmap_name,
          sml.code AS starmap_code
        FROM game.locations l
        LEFT JOIN rsi.starmap_locations sml ON sml.id = l.rsi_starmap_location_id
        ${translationJoin('l')}
        WHERE l.env = $1 AND l.uuid = $2
        LIMIT 1`,
        toPostgres(env),
        id,
      );

      if (!locRows || locRows.length === 0) return null;
      const location = applyLanguage(convertBigIntToNumber(locRows[0]), language);

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
        tr.raw_json AS translation_json,
        tr.name AS translation_name,
        COALESCE(m.name, i.manufacturer_code) AS manufacturer_name,
        m.known_for AS manufacturer_known_for
      FROM game.items i
      LEFT JOIN game.manufacturers m ON m.code = i.manufacturer_code
      ${translationJoin('i')}
      WHERE i.env = $1 AND (i.uuid = $2 OR i.class_name = $2)
      LIMIT 1`,
      toPostgres(env),
      id,
    );

    if (!itemRows || itemRows.length === 0) return null;
    const item = applyLanguage(convertBigIntToNumber(itemRows[0]), language);

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
