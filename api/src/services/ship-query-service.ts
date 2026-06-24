/**
 * ShipQueryService — Ship listing, search, filters, manufacturers
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { convertBigIntToNumber, type FiltersResult, num, type PaginatedResult, type Row, toPostgres } from './shared.js';
import {
  CONCEPT_SELECT,
  GALLERY_SOURCE_ORDER,
  galleryImageRank,
  galleryMediaKey,
  gallerySource,
  isGalleryImageUrl,
  SHIP_JOINS,
  SHIP_JSON_SORT_MAP,
  SHIP_MATRIX_CATEGORY_SQL,
  SHIP_MATRIX_UPCOMING_SQL,
  SHIP_MATRIX_UPCOMING_STATUSES,
  SHIP_SELECT,
  SHIP_SORT,
  SHIP_SORT_EXPRESSION_MAP,
} from './ships/ship-helpers.js';
export class ShipQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getAllShips(filters?: {
    env?: string;
    manufacturer?: string;
    role?: string;
    career?: string;
    status?: string;
    vehicle_category?: string;
    variant_type?: string;
    search?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const env = filters?.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['s.env = ?'];
    const params: (string | number)[] = [env];

    if (filters?.manufacturer) {
      where.push('s.manufacturer_code = ?');
      params.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.role) {
      where.push('s.role = ?');
      params.push(filters.role);
    }
    if (filters?.career) {
      where.push('s.career = ?');
      params.push(filters.career);
    }
    if (filters?.vehicle_category) {
      where.push('s.vehicle_category = ?');
      params.push(filters.vehicle_category);
    }
    if (filters?.variant_type) {
      if (filters.variant_type === 'none') {
        where.push('s.variant_type IS NULL');
      } else {
        where.push('s.variant_type = ?');
        params.push(filters.variant_type);
      }
    } else {
      where.push("(s.variant_type IS NULL OR s.variant_type NOT IN ('npc', 'tutorial', 'enemy_ai', 'arena_ai', 'competition'))");
    }

    const wantConceptOnly = false;
    const wantInGameOnly = filters?.status === 'in-game-only';
    const wantFlightReady = filters?.status === 'flight-ready';
    const excludeConcept = wantInGameOnly || wantFlightReady;

    if (wantFlightReady) {
      where.push('sm.production_status = ?');
      params.push('flight-ready');
    }
    if (filters?.status && SHIP_MATRIX_UPCOMING_STATUSES.has(filters.status)) {
      where.push('sm.production_status = ?');
      params.push(filters.status);
    }
    if (wantInGameOnly) {
      where.push('s.ship_matrix_id IS NULL');
    }

    if (filters?.search) {
      where.push('(s.name ILIKE ? OR s.class_name ILIKE ? OR s.short_name ILIKE ? OR sm.name ILIKE ?)');
      const t = `%${filters.search}%`;
      params.push(t, t, t, t);
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const includeConceptShips =
      !excludeConcept && (!filters?.vehicle_category || ['ship', 'ground', 'gravlev'].includes(filters.vehicle_category));

    const conceptWhere: string[] = [
      'sm2.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL AND env = ?)',
      SHIP_MATRIX_UPCOMING_SQL,
    ];
    const conceptParams: (string | number)[] = [env];
    if (filters?.status && SHIP_MATRIX_UPCOMING_STATUSES.has(filters.status)) {
      conceptWhere.push('sm2.production_status = ?');
      conceptParams.push(filters.status);
    }
    if (filters?.vehicle_category) {
      conceptWhere.push(`${SHIP_MATRIX_CATEGORY_SQL} = ?`);
      conceptParams.push(filters.vehicle_category);
    }
    if (filters?.manufacturer) {
      conceptWhere.push('sm2.manufacturer_code = ?');
      conceptParams.push(filters.manufacturer.toUpperCase());
    }
    if (filters?.search) {
      conceptWhere.push('(sm2.name ILIKE ? OR sm2.manufacturer_name ILIKE ?)');
      const t = `%${filters.search}%`;
      conceptParams.push(t, t);
    }
    const cw = ` WHERE ${conceptWhere.join(' AND ')}`;

    let totalCount = 0;
    if (!wantConceptOnly) {
      const countRows = await prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT COUNT(*) as total FROM game.ships s LEFT JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id${w}`),
        ...params,
      );
      totalCount += Number(countRows[0]?.total) || 0;
    }
    if (includeConceptShips || wantConceptOnly) {
      const conceptCount = await prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT COUNT(*) as total FROM rsi.ship_matrix sm2${cw}`),
        ...conceptParams,
      );
      totalCount += Number(conceptCount[0]?.total) || 0;
    }

    const order = filters?.order === 'desc' ? 'DESC' : 'ASC';
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(200, Math.max(1, filters?.limit || 50));
    const offset = (page - 1) * limit;

    const sortKey = filters?.sort || '';
    const jsonExpr = SHIP_JSON_SORT_MAP[sortKey];
    const sortExpr = SHIP_SORT_EXPRESSION_MAP[sortKey];
    const sortCol = jsonExpr || sortExpr ? null : SHIP_SORT.has(sortKey) ? sortKey : 'name';

    const nullSafeOrder = jsonExpr
      ? `${jsonExpr} IS NULL, ${jsonExpr} ${order}`
      : sortExpr
        ? `${sortKey} IS NULL, ${sortKey} ${order}`
        : `${sortCol} IS NULL, ${sortCol} ${order}`;
    const qualifiedOrder = jsonExpr
      ? `${jsonExpr} IS NULL, ${jsonExpr} ${order}`
      : sortExpr
        ? `${sortExpr} IS NULL, ${sortExpr} ${order}`
        : `s.${sortCol} IS NULL, s.${sortCol} ${order}`;

    let sql: string;
    let allParams: (string | number)[];

    if (wantConceptOnly) {
      sql = `SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only FROM rsi.ship_matrix sm2${cw} ORDER BY ${nullSafeOrder} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...conceptParams];
    } else if (includeConceptShips) {
      const unionOrder = jsonExpr ? `name IS NULL, name ${order}` : `${sortCol} IS NULL, ${sortCol} ${order}`;
      sql = `SELECT * FROM ((SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}${w}) UNION ALL (SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only FROM rsi.ship_matrix sm2${cw})) ship_rows ORDER BY ${unionOrder} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...params, ...conceptParams];
    } else {
      sql = `SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}${w} ORDER BY ${qualifiedOrder} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...params];
    }

    const rows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(sql), ...allParams);
    const data = rows.map(convertBigIntToNumber);
    return { data, total: totalCount, page, limit, pages: Math.ceil(totalCount / limit) };
  }

  async getShipByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    if (uuid.startsWith('concept-')) {
      const smId = Number(uuid.replace('concept-', ''));
      if (!Number.isInteger(smId)) return null;
      const rows = await prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only FROM rsi.ship_matrix sm2 WHERE sm2.id = ? AND ${SHIP_MATRIX_UPCOMING_SQL} AND sm2.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL AND env = ?)`,
        ),
        smId,
        env,
      );
      return rows[0] ? convertBigIntToNumber(rows[0]) : null;
    }
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ${SHIP_SELECT}, s.game_data, FALSE as is_concept_only,
              sm.length as sm_length, sm.beam as sm_beam, sm.height as sm_height
       ${SHIP_JOINS} WHERE s.uuid = ? AND s.env = ?`),
      uuid,
      env,
    );
    if (!rows[0]) return null;
    const ship = rows[0];
    if (!num(ship.size_y)) {
      if (ship.sm_beam) ship.size_x = num(ship.sm_beam);
      if (ship.sm_length) ship.size_y = num(ship.sm_length);
      if (ship.sm_height) ship.size_z = num(ship.sm_height);
    }
    delete (ship as any).sm_length;
    delete (ship as any).sm_beam;
    delete (ship as any).sm_height;
    return convertBigIntToNumber(ship);
  }

  async getShipByClassName(className: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS} WHERE s.class_name = ? AND s.env = ?`),
      className,
      env,
    );
    return rows[0] ? convertBigIntToNumber(rows[0]) : null;
  }

  async getShipGallery(shipMatrixId: number): Promise<Row[]> {
    const prisma = this.getClient('live');
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT id, ship_matrix_id, url, thumbnail_url, title, kind, position, synced_at
       FROM rsi.ship_galleries
       WHERE ship_matrix_id = ?
       ORDER BY position ASC, id ASC`),
      shipMatrixId,
    );
    const bestByMedia = new Map<string, Row>();
    for (const row of rows.map(convertBigIntToNumber)) {
      const url = String(row.url ?? '');
      if (!isGalleryImageUrl(url)) continue;
      const key = galleryMediaKey(url);
      const existing = bestByMedia.get(key);
      if (!existing || galleryImageRank(row) > galleryImageRank(existing)) {
        bestByMedia.set(key, { ...row, source: gallerySource(url, String(row.kind ?? '')) });
      }
    }
    return [...bestByMedia.values()].sort((left, right) => {
      const leftSource = gallerySource(String(left.url ?? ''), String(left.kind ?? ''));
      const rightSource = gallerySource(String(right.url ?? ''), String(right.kind ?? ''));
      return (
        GALLERY_SOURCE_ORDER[leftSource] - GALLERY_SOURCE_ORDER[rightSource] || Number(left.position ?? 0) - Number(right.position ?? 0)
      );
    });
  }

  async getShipBuyLocations(ship: Row | string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const resolved = typeof ship === 'string' ? await this.getShipByUuid(ship, env) : ship;
    if (!resolved) return [];
    const uuid = String(resolved.uuid);
    // Ship buy/rent prices come from UEX (game.uex_*), not the P4K shop inventory:
    // the in-game economy is server-authoritative and absent from the game files.
    // One row per dealer terminal, combining its buy + rent offer for this ship.
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT
              t.uex_id AS shop_id,
              t.name AS shop_name,
              t.city AS location,
              t.star_system AS system,
              t.city,
              COALESCE(t.moon, t.planet) AS planet_moon,
              t.company_name AS shop_type,
              t.code AS terminal,
              'uex'::text AS source,
              'uex'::text AS match_type,
              'ship'::text AS inventory_kind,
              MAX(CASE WHEN p.price_kind = 'buy' THEN p.price END) AS base_price,
              NULL::numeric AS sell_price,
              NULL::numeric AS current_inventory,
              NULL::numeric AS max_inventory,
              MAX(CASE WHEN p.price_kind = 'rent' THEN p.price END) AS rental_price_1d,
              NULL::numeric AS rental_price_3d,
              NULL::numeric AS rental_price_7d,
              NULL::numeric AS rental_price_30d,
              NULL::numeric AS confidence,
              MAX(p.date_modified) AS updated_at
       FROM game.uex_vehicle_prices p
       JOIN game.uex_terminals t ON t.uex_id = p.terminal_uex_id AND t.env = p.env
       WHERE p.env = ? AND p.ship_uuid = ?
       GROUP BY t.uex_id, t.name, t.city, t.star_system, COALESCE(t.moon, t.planet), t.company_name, t.code
       ORDER BY base_price NULLS LAST, rental_price_1d NULLS LAST`),
      env,
      uuid,
    );
    return convertBigIntToNumber(rows);
  }

  async getShipFilters(env = 'live', category?: string): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const catWhere = category ? `AND s.vehicle_category = '${category.replace(/'/g, '')}'` : '';
    const catWhereNoAlias = category ? `AND vehicle_category = '${category.replace(/'/g, '')}'` : '';
    const includeShipMatrixOnly = !category || ['ship', 'ground', 'gravlev'].includes(category);
    const manufacturerSql = includeShipMatrixOnly
      ? `WITH manufacturer_counts AS (
           SELECT s.manufacturer_code as value, COALESCE(m.name, s.manufacturer_code) as label, COUNT(s.uuid) as count
           FROM game.ships s LEFT JOIN game.manufacturers m ON s.manufacturer_code = m.code
           WHERE s.env = ? AND s.manufacturer_code IS NOT NULL AND s.manufacturer_code != '' ${catWhere}
           GROUP BY s.manufacturer_code, m.name
           UNION ALL
           SELECT sm2.manufacturer_code as value, COALESCE(sm2.manufacturer_name, sm2.manufacturer_code) as label, COUNT(*) as count
           FROM rsi.ship_matrix sm2
           WHERE ${SHIP_MATRIX_UPCOMING_SQL}
             AND sm2.manufacturer_code IS NOT NULL
             AND sm2.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL AND env = ?)
             ${category ? `AND ${SHIP_MATRIX_CATEGORY_SQL} = '${category.replace(/'/g, '')}'` : ''}
           GROUP BY sm2.manufacturer_code, sm2.manufacturer_name
         )
         SELECT value, MAX(label) as label, SUM(count) as count
         FROM manufacturer_counts
         GROUP BY value
         ORDER BY label`
      : `SELECT s.manufacturer_code as value, COALESCE(m.name, s.manufacturer_code) as label, COUNT(s.uuid) as count
         FROM game.ships s LEFT JOIN game.manufacturers m ON s.manufacturer_code = m.code
         WHERE s.env = ? AND s.manufacturer_code IS NOT NULL AND s.manufacturer_code != '' ${catWhere}
         GROUP BY s.manufacturer_code, m.name ORDER BY label`;
    const manufacturerParams = includeShipMatrixOnly ? [env, env] : [env];

    const categorySql = includeShipMatrixOnly
      ? `WITH category_counts AS (
           SELECT COALESCE(vehicle_category, 'ship') as value, COUNT(*) as count
           FROM game.ships
           WHERE env = ?
           GROUP BY vehicle_category
           UNION ALL
           SELECT ${SHIP_MATRIX_CATEGORY_SQL} as value, COUNT(*) as count
           FROM rsi.ship_matrix sm2
           WHERE ${SHIP_MATRIX_UPCOMING_SQL}
             AND sm2.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL AND env = ?)
           GROUP BY ${SHIP_MATRIX_CATEGORY_SQL}
         )
         SELECT value, SUM(count) as count
         FROM category_counts
         GROUP BY value
         ORDER BY value`
      : "SELECT COALESCE(vehicle_category, 'ship') as value, COUNT(*) as count FROM game.ships WHERE env = ? GROUP BY vehicle_category ORDER BY value";
    const categoryParams = includeShipMatrixOnly ? [env, env] : [env];
    const statusGameCategoryWhere = category ? `s.vehicle_category = '${category.replace(/'/g, '')}'` : "s.vehicle_category = 'ship'";

    const statusSql = includeShipMatrixOnly
      ? `WITH status_counts AS (
           SELECT COALESCE(sm.production_status, 'in-game-only') as value, COUNT(*) as count
           FROM game.ships s LEFT JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id
           WHERE s.env = ? AND ${statusGameCategoryWhere}
           GROUP BY COALESCE(sm.production_status, 'in-game-only')
           UNION ALL
           SELECT sm2.production_status as value, COUNT(*) as count
           FROM rsi.ship_matrix sm2
           WHERE ${SHIP_MATRIX_UPCOMING_SQL}
             AND sm2.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL AND env = ?)
             ${category ? `AND ${SHIP_MATRIX_CATEGORY_SQL} = '${category.replace(/'/g, '')}'` : ''}
           GROUP BY sm2.production_status
         )
         SELECT value, SUM(count) as count
         FROM status_counts
         WHERE value IS NOT NULL AND value != ''
         GROUP BY value
         ORDER BY CASE value
           WHEN 'flight-ready' THEN 1
           WHEN 'in-production' THEN 2
           WHEN 'in-development' THEN 3
           WHEN 'in-concept' THEN 4
           WHEN 'in-game-only' THEN 5
           ELSE 9
         END, value`
      : `SELECT COALESCE(sm.production_status, 'in-game-only') as value, COUNT(*) as count
         FROM game.ships s LEFT JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id
         WHERE s.env = ? ${catWhere}
         GROUP BY COALESCE(sm.production_status, 'in-game-only')
         ORDER BY value`;
    const statusParams = includeShipMatrixOnly ? [env, env] : [env];

    const [mfgRows, roleRows, careerRows, variantRows, categoryRows, statusRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(toPostgres(manufacturerSql), ...manufacturerParams),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT DISTINCT role as value FROM game.ships WHERE env = ? AND role IS NOT NULL AND role != '' ${catWhereNoAlias} ORDER BY role`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT DISTINCT career as value FROM game.ships WHERE env = ? AND career IS NOT NULL AND career != '' ${catWhereNoAlias} ORDER BY career`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT DISTINCT variant_type as value FROM game.ships WHERE env = ? AND variant_type IS NOT NULL AND variant_type != '' AND variant_type != 'npc' ${catWhereNoAlias} ORDER BY variant_type`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(toPostgres(categorySql), ...categoryParams),
      prisma.$queryRawUnsafe<Row[]>(toPostgres(statusSql), ...statusParams),
    ]);
    return {
      filters: {
        manufacturer: mfgRows.map((r) => ({ value: String(r.value), label: String(r.label), count: Number(r.count) })),
        role: roleRows.map((r) => ({ value: String(r.value), label: String(r.value) })),
        career: careerRows.map((r) => ({ value: String(r.value), label: String(r.value) })),
        variant_type: variantRows.map((r) => ({ value: String(r.value), label: String(r.value) })),
        vehicle_category: categoryRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
        status: statusRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
      },
    };
  }

  async getAllManufacturers(env = 'live', onlyWithData = true): Promise<Row[]> {
    const prisma = this.getClient(env);
    const where = onlyWithData ? 'WHERE COALESCE(s.cnt, 0) > 0 OR COALESCE(c.cnt, 0) > 0 OR COALESCE(i.cnt, 0) > 0' : '';
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT m.*,
              COALESCE(s.cnt, 0) as ship_count,
              COALESCE(c.cnt, 0) as component_count,
              COALESCE(i.cnt, 0) as item_count
       FROM game.manufacturers m
       LEFT JOIN (SELECT manufacturer_code, COUNT(uuid) cnt FROM game.ships WHERE env = ? GROUP BY manufacturer_code) s ON s.manufacturer_code = m.code
       LEFT JOIN (SELECT manufacturer_code, COUNT(uuid) cnt FROM game.components WHERE env = ? GROUP BY manufacturer_code) c ON c.manufacturer_code = m.code
       LEFT JOIN (SELECT manufacturer_code, COUNT(uuid) cnt FROM game.items WHERE env = ? GROUP BY manufacturer_code) i ON i.manufacturer_code = m.code
       ${where} ORDER BY m.name`),
      env,
      env,
      env,
    );
    return rows.map((r) => ({
      ...r,
      ship_count: Number(r.ship_count),
      component_count: Number(r.component_count),
      item_count: Number(r.item_count),
    }));
  }

  async getShipManufacturers(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT m.code, m.name, COUNT(s.uuid) as ship_count
       FROM game.manufacturers m INNER JOIN game.ships s ON m.code = s.manufacturer_code AND s.env = ?
       GROUP BY m.code, m.name ORDER BY m.name`),
      env,
    );
    return rows.map((r) => ({ ...r, ship_count: Number(r.ship_count) }));
  }

  async getShipCoverageAudit(env = 'live'): Promise<Row> {
    const prisma = this.getClient(env);
    const [summaryRows, unlinkedGameShips, matrixOnlyShips, duplicateClassNames] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT
          (SELECT COUNT(*) FROM game.ships WHERE env = ?) AS game_ships,
          (SELECT COUNT(*) FROM game.ships WHERE env = ? AND ship_matrix_id IS NOT NULL) AS linked_game_ships,
          (SELECT COUNT(*) FROM game.ships WHERE env = ? AND ship_matrix_id IS NULL) AS unlinked_game_ships,
          (SELECT COUNT(*) FROM rsi.ship_matrix) AS ship_matrix_entries,
          (SELECT COUNT(*) FROM rsi.ship_matrix sm
             WHERE sm.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL AND env = ?)
          ) AS matrix_only_entries,
          (SELECT COUNT(*) FROM rsi.ship_matrix sm
             WHERE sm.production_status IN ('in-concept', 'in-production', 'in-development')
               AND sm.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL AND env = ?)
          ) AS concept_only_entries`),
        env,
        env,
        env,
        env,
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT s.uuid, s.class_name, s.name, s.manufacturer_code, s.vehicle_category, s.variant_type
          FROM game.ships s
          WHERE s.env = ? AND s.ship_matrix_id IS NULL
          ORDER BY s.manufacturer_code NULLS LAST, s.name
          LIMIT 200`),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT sm.id, sm.name, sm.manufacturer_code, sm.manufacturer_name, sm.production_status, sm.type, sm.url
          FROM rsi.ship_matrix sm
          WHERE sm.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL AND env = ?)
          ORDER BY sm.production_status, sm.manufacturer_name, sm.name
          LIMIT 300`),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT class_name, COUNT(*) AS count, ARRAY_AGG(env ORDER BY env) AS envs
          FROM game.ships
          WHERE env = ?
          GROUP BY class_name
          HAVING COUNT(*) > 1
          ORDER BY count DESC, class_name
          LIMIT 100`),
        env,
      ),
    ]);
    const summary = convertBigIntToNumber(summaryRows[0] ?? {});
    return {
      env,
      summary: {
        game_ships: Number(summary.game_ships ?? 0),
        linked_game_ships: Number(summary.linked_game_ships ?? 0),
        unlinked_game_ships: Number(summary.unlinked_game_ships ?? 0),
        ship_matrix_entries: Number(summary.ship_matrix_entries ?? 0),
        matrix_only_entries: Number(summary.matrix_only_entries ?? 0),
        concept_only_entries: Number(summary.concept_only_entries ?? 0),
      },
      unlinked_game_ships: unlinkedGameShips.map(convertBigIntToNumber),
      matrix_only_entries: matrixOnlyShips.map(convertBigIntToNumber),
      duplicate_class_names: duplicateClassNames.map(convertBigIntToNumber),
    };
  }

  async getManufacturerByCode(code: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT m.*,
              COALESCE(s.cnt, 0) as ship_count,
              COALESCE(c.cnt, 0) as component_count,
              COALESCE(i.cnt, 0) as item_count
       FROM game.manufacturers m
       LEFT JOIN (SELECT manufacturer_code, COUNT(uuid) cnt FROM game.ships WHERE manufacturer_code = ? AND env = ? GROUP BY manufacturer_code) s ON s.manufacturer_code = m.code
       LEFT JOIN (SELECT manufacturer_code, COUNT(uuid) cnt FROM game.components WHERE manufacturer_code = ? AND env = ? GROUP BY manufacturer_code) c ON c.manufacturer_code = m.code
       LEFT JOIN (SELECT manufacturer_code, COUNT(uuid) cnt FROM game.items WHERE manufacturer_code = ? AND env = ? GROUP BY manufacturer_code) i ON i.manufacturer_code = m.code
       WHERE m.code = ?`),
      code.toUpperCase(),
      env,
      code.toUpperCase(),
      env,
      code.toUpperCase(),
      env,
      code.toUpperCase(),
    );
    const raw = rows[0];
    if (!raw) return null;
    return { ...raw, ship_count: Number(raw.ship_count), component_count: Number(raw.component_count), item_count: Number(raw.item_count) };
  }

  async getManufacturerShips(code: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}
       WHERE s.env = ? AND s.manufacturer_code = ? AND (s.variant_type IS NULL OR s.variant_type NOT IN ('tutorial','enemy_ai','arena_ai','competition'))
       ORDER BY s.name`),
      env,
      code.toUpperCase(),
    );
    return rows.map(convertBigIntToNumber);
  }

  async getManufacturerComponents(code: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT c.uuid, c.class_name, c.name, c.type, c.sub_type, c.size, c.grade, c.manufacturer_code,
              m.name as manufacturer_name
       FROM game.components c LEFT JOIN game.manufacturers m ON c.manufacturer_code = m.code
       WHERE c.env = ? AND c.manufacturer_code = ? ORDER BY c.type, c.size, c.name`),
      env,
      code.toUpperCase(),
    );
    return rows;
  }

  async searchShipsAutocomplete(q: string, limit = 10, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const t = `%${q}%`;
    const cappedLimit = Number(Math.min(limit, 20));
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT * FROM (
        SELECT s.uuid, COALESCE(sm.name, s.name) as name, s.class_name, s.manufacturer_code,
                m.name as manufacturer_name,
                COALESCE(ship_thumb.thumbnail_url, sm.media_store_small) as thumbnail,
                COALESCE(ship_thumb.url, sm.media_store_large) as thumbnail_large,
                s.vehicle_category, sm.production_status, FALSE as is_concept_only
         ${SHIP_JOINS}
         WHERE s.env = ? AND (s.name ILIKE ? OR s.class_name ILIKE ? OR s.short_name ILIKE ? OR sm.name ILIKE ?)
           AND (s.variant_type IS NULL OR s.variant_type NOT IN ('tutorial','enemy_ai','arena_ai','competition'))
        UNION ALL
        SELECT 'concept-' || sm2.id::text as uuid, sm2.name,
                LOWER(REPLACE(REPLACE(sm2.name, ' ', '_'), '''', '')) as class_name,
                sm2.manufacturer_code, sm2.manufacturer_name,
                sm2.media_store_small as thumbnail, sm2.media_store_large as thumbnail_large,
                ${SHIP_MATRIX_CATEGORY_SQL} as vehicle_category, sm2.production_status, TRUE as is_concept_only
         FROM rsi.ship_matrix sm2
         WHERE sm2.production_status IN ('in-concept', 'in-production', 'in-development')
           AND sm2.id NOT IN (SELECT ship_matrix_id FROM game.ships WHERE ship_matrix_id IS NOT NULL AND env = ?)
           AND (sm2.name ILIKE ? OR sm2.manufacturer_name ILIKE ? OR sm2.focus ILIKE ?)
      ) rows
       ORDER BY is_concept_only, name
       LIMIT ${cappedLimit}`),
      env,
      t,
      t,
      t,
      t,
      env,
      t,
      t,
      t,
    );
    return rows.map(convertBigIntToNumber);
  }

  async getRandomShip(env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const countRows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres("SELECT COUNT(*) as total FROM game.ships WHERE env = ? AND variant_type IS NULL AND vehicle_category = 'ship'"),
      env,
    );
    const total = Number(countRows[0]?.total) || 0;
    if (total === 0) return null;
    const offset = Math.floor(Math.random() * total);

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}
       WHERE s.env = ? AND s.variant_type IS NULL AND s.vehicle_category = 'ship'
       LIMIT 1 OFFSET ${offset}`),
      env,
    );
    if (!rows[0]) return null;
    return convertBigIntToNumber(rows[0]);
  }

  async getSimilarShips(uuid: string, limit = 5, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const shipRows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres('SELECT role, vehicle_category, manufacturer_code FROM game.ships WHERE uuid = ? AND env = ?'),
      uuid,
      env,
    );
    if (!shipRows[0]) return [];
    const ship = shipRows[0];

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}
       WHERE s.env = ? AND s.uuid != ? AND s.variant_type IS NULL
         AND s.vehicle_category = ?
         AND (s.role = ? OR s.manufacturer_code = ?)
       ORDER BY (s.role = ?) DESC, s.name
       LIMIT ${Number(Math.min(limit, 10))}`),
      env,
      uuid,
      ship.vehicle_category,
      ship.role,
      ship.manufacturer_code,
      ship.role,
    );
    return rows.map(convertBigIntToNumber);
  }

  async getShipVariants(uuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const shipRows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres('SELECT chassis_id FROM game.ships WHERE uuid = ? AND env = ?'),
      uuid,
      env,
    );
    const chassisId = shipRows[0]?.chassis_id;
    if (!chassisId) return [];

    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}
       WHERE s.env = ? AND s.chassis_id = ? AND s.uuid != ?
       ORDER BY COALESCE(sm.name, s.name)`),
      env,
      chassisId,
      uuid,
    );
    return rows.map(convertBigIntToNumber);
  }

  async getVariantSummary(chassisId: number, currentUuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT s.uuid, COALESCE(sm.name, s.name) as name, s.class_name,
              COALESCE(ship_thumb.thumbnail_url, sm.media_store_small) as thumbnail, s.variant_type
       FROM game.ships s
       LEFT JOIN rsi.ship_matrix sm ON s.ship_matrix_id = sm.id
       LEFT JOIN LATERAL (
         SELECT g.url, COALESCE(g.thumbnail_url, g.url) as thumbnail_url
         FROM rsi.ship_galleries g
         WHERE g.ship_matrix_id = sm.id
           AND g.url LIKE '%robertsspaceindustries.com/i/%'
           AND g.url ~* '\\.(webp|png|jpe?g)(\\?.*)?$'
         ORDER BY g.position ASC, g.id ASC
         LIMIT 1
       ) ship_thumb ON TRUE
       WHERE s.env = ? AND s.chassis_id = ? AND s.uuid != ?
       ORDER BY COALESCE(sm.name, s.name)`),
      env,
      chassisId,
      currentUuid,
    );
    return rows.map(convertBigIntToNumber);
  }
}
