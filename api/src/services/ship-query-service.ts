/**
 * ShipQueryService — Ship listing, search, filters, manufacturers
 */
import type { Pool } from "mysql2/promise";
import {
    type PaginatedResult, type Row,
    CONCEPT_SELECT, SHIP_JOINS, SHIP_SELECT, SHIP_SORT,
    num,
} from "./shared.js";

export class ShipQueryService {
  constructor(private pool: Pool) {}

  async getAllShips(filters?: {
    manufacturer?: string; role?: string; career?: string; status?: string;
    vehicle_category?: string; variant_type?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.manufacturer) { where.push("s.manufacturer_code = ?"); params.push(filters.manufacturer.toUpperCase()); }
    if (filters?.role) { where.push("s.role = ?"); params.push(filters.role); }
    if (filters?.career) { where.push("s.career = ?"); params.push(filters.career); }
    if (filters?.vehicle_category) { where.push("s.vehicle_category = ?"); params.push(filters.vehicle_category); }
    if (filters?.variant_type) {
      if (filters.variant_type === "none") { where.push("s.variant_type IS NULL"); }
      else { where.push("s.variant_type = ?"); params.push(filters.variant_type); }
    } else {
      where.push("(s.variant_type IS NULL OR s.variant_type NOT IN ('tutorial', 'enemy_ai', 'arena_ai', 'competition'))");
    }

    const wantConceptOnly = filters?.status === "in-concept";
    const wantInGameOnly = filters?.status === "in-game-only";
    const wantFlightReady = filters?.status === "flight-ready";
    const excludeConcept = wantInGameOnly || wantFlightReady;

    if (wantFlightReady) { where.push("sm.production_status = ?"); params.push("flight-ready"); }
    if (wantInGameOnly) { where.push("s.ship_matrix_id IS NULL"); }

    if (filters?.search) {
      where.push("(s.name LIKE ? OR s.class_name LIKE ? OR s.short_name LIKE ? OR sm.name LIKE ?)");
      const t = `%${filters.search}%`;
      params.push(t, t, t, t);
    }

    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const includeConceptShips = !excludeConcept && !filters?.vehicle_category;

    const conceptWhere: string[] = ["sm2.id NOT IN (SELECT ship_matrix_id FROM ships WHERE ship_matrix_id IS NOT NULL)"];
    const conceptParams: (string | number)[] = [];
    if (filters?.manufacturer) { conceptWhere.push("sm2.manufacturer_code = ?"); conceptParams.push(filters.manufacturer.toUpperCase()); }
    if (filters?.search) {
      conceptWhere.push("(sm2.name LIKE ? OR sm2.manufacturer_name LIKE ?)");
      const t = `%${filters.search}%`;
      conceptParams.push(t, t);
    }
    const cw = ` WHERE ${conceptWhere.join(" AND ")}`;

    let totalCount = 0;
    if (!wantConceptOnly) {
      const [countRows] = await this.pool.execute<Row[]>(`SELECT COUNT(*) as total FROM ships s LEFT JOIN ship_matrix sm ON s.ship_matrix_id = sm.id${w}`, params);
      totalCount += Number(countRows[0]?.total) || 0;
    }
    if (includeConceptShips || wantConceptOnly) {
      const [conceptCount] = await this.pool.execute<Row[]>(`SELECT COUNT(*) as total FROM ship_matrix sm2${cw}`, conceptParams);
      totalCount += Number(conceptCount[0]?.total) || 0;
    }

    const sortCol = SHIP_SORT.has(filters?.sort || "") ? filters!.sort! : "name";
    const order = filters?.order === "desc" ? "DESC" : "ASC";
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(200, Math.max(1, filters?.limit || 50));
    const offset = (page - 1) * limit;

    const nullSafeOrder = `${sortCol} IS NULL, ${sortCol} ${order}`;

    let sql: string;
    let allParams: (string | number)[];

    if (wantConceptOnly) {
      sql = `SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only FROM ship_matrix sm2${cw} ORDER BY ${nullSafeOrder} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...conceptParams];
    } else if (includeConceptShips) {
      sql = `(SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}${w}) UNION ALL (SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only FROM ship_matrix sm2${cw}) ORDER BY ${nullSafeOrder} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...params, ...conceptParams];
    } else {
      sql = `SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS}${w} ORDER BY ${sortCol} IS NULL, s.${sortCol} ${order} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
      allParams = [...params];
    }

    const [rows] = await this.pool.execute<Row[]>(sql, allParams);
    const data = rows.map(({ game_data, ...rest }) => rest as Row);
    return { data, total: totalCount, page, limit, pages: Math.ceil(totalCount / limit) };
  }

  async getShipByUuid(uuid: string): Promise<Row | null> {
    if (uuid.startsWith("concept-")) {
      const smId = uuid.replace("concept-", "");
      const [rows] = await this.pool.execute<Row[]>(
        `SELECT ${CONCEPT_SELECT}, TRUE as is_concept_only FROM ship_matrix sm2 WHERE sm2.id = ? AND sm2.id NOT IN (SELECT ship_matrix_id FROM ships WHERE ship_matrix_id IS NOT NULL)`,
        [smId],
      );
      return rows[0] || null;
    }
    const [rows] = await this.pool.execute<Row[]>(`SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS} WHERE s.uuid = ?`, [uuid]);
    if (!rows[0]) return null;
    const ship = rows[0];
    if (!ship.cross_section_x && !ship.cross_section_y && !ship.cross_section_z && ship.ship_matrix_id) {
      const [smRows] = await this.pool.execute<Row[]>("SELECT length, beam, height FROM ship_matrix WHERE id = ?", [ship.ship_matrix_id]);
      if (smRows.length) {
        ship.cross_section_x = num(smRows[0].length);
        ship.cross_section_y = num(smRows[0].beam);
        ship.cross_section_z = num(smRows[0].height);
      }
    }
    return ship;
  }

  async getShipByClassName(className: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>(`SELECT ${SHIP_SELECT}, FALSE as is_concept_only ${SHIP_JOINS} WHERE s.class_name = ?`, [className]);
    return rows[0] || null;
  }

  async getShipFilters(): Promise<{ roles: string[]; careers: string[]; variant_types: string[] }> {
    const [roleRows] = await this.pool.execute<Row[]>("SELECT DISTINCT role FROM ships WHERE role IS NOT NULL AND role != '' ORDER BY role");
    const [careerRows] = await this.pool.execute<Row[]>("SELECT DISTINCT career FROM ships WHERE career IS NOT NULL AND career != '' ORDER BY career");
    const [variantRows] = await this.pool.execute<Row[]>("SELECT DISTINCT variant_type FROM ships WHERE variant_type IS NOT NULL AND variant_type != '' ORDER BY variant_type");
    return {
      roles: roleRows.map((r) => String(r.role)),
      careers: careerRows.map((r) => String(r.career)),
      variant_types: variantRows.map((r) => String(r.variant_type)),
    };
  }

  async getAllManufacturers(): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT m.*, COUNT(DISTINCT c.uuid) as component_count, COUNT(DISTINCT s.uuid) as ship_count
       FROM manufacturers m LEFT JOIN components c ON m.code = c.manufacturer_code LEFT JOIN ships s ON m.code = s.manufacturer_code
       GROUP BY m.code ORDER BY m.name`,
    );
    return rows;
  }

  async getShipManufacturers(): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT m.code, m.name, COUNT(s.uuid) as ship_count
       FROM manufacturers m INNER JOIN ships s ON m.code = s.manufacturer_code
       GROUP BY m.code, m.name ORDER BY m.name`,
    );
    return rows;
  }
}
