/**
 * ComponentQueryService — Component listing, filters, buy locations, ships
 */
import type { Pool } from "mysql2/promise";
import { type PaginatedResult, type Row, COMP_SORT, paginate } from "./shared.js";

export class ComponentQueryService {
  constructor(private pool: Pool) {}

  async getAllComponents(filters?: {
    type?: string; sub_type?: string; size?: string; grade?: string;
    min_size?: string; max_size?: string;
    manufacturer?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.type) { where.push("c.type = ?"); params.push(filters.type); }
    if (filters?.sub_type) { where.push("c.sub_type = ?"); params.push(filters.sub_type); }
    if (filters?.size) { where.push("c.size = ?"); params.push(parseInt(filters.size)); }
    if (filters?.min_size) { where.push("c.size >= ?"); params.push(parseInt(filters.min_size)); }
    if (filters?.max_size) { where.push("c.size <= ?"); params.push(parseInt(filters.max_size)); }
    if (filters?.grade) { where.push("c.grade = ?"); params.push(filters.grade); }
    if (filters?.manufacturer) { where.push("c.manufacturer_code = ?"); params.push(filters.manufacturer.toUpperCase()); }
    if (filters?.search) {
      where.push("(c.name LIKE ? OR c.class_name LIKE ?)");
      const t = `%${filters.search}%`;
      params.push(t, t);
    }

    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const baseSql = `SELECT c.*, m.name as manufacturer_name FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM components c${w}`;

    return paginate(this.pool, baseSql, countSql, params, filters || {}, COMP_SORT, "c");
  }

  async getComponentByUuid(uuid: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>(
      "SELECT c.*, m.name as manufacturer_name FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code WHERE c.uuid = ?",
      [uuid],
    );
    return rows[0] || null;
  }

  async getComponentByClassName(className: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>(
      "SELECT c.*, m.name as manufacturer_name FROM components c LEFT JOIN manufacturers m ON c.manufacturer_code = m.code WHERE c.class_name = ?",
      [className],
    );
    return rows[0] || null;
  }

  /** Resolve UUID or class_name → component */
  async resolveComponent(id: string): Promise<Row | null> {
    return id.length === 36
      ? await this.getComponentByUuid(id)
      : await this.getComponentByClassName(id);
  }

  async getComponentFilters(): Promise<{ types: string[]; sub_types: string[]; sizes: number[]; grades: string[] }> {
    const [typeRows] = await this.pool.execute<Row[]>("SELECT DISTINCT type FROM components WHERE type IS NOT NULL AND type != '' ORDER BY type");
    const [subTypeRows] = await this.pool.execute<Row[]>("SELECT DISTINCT sub_type FROM components WHERE sub_type IS NOT NULL AND sub_type != '' ORDER BY sub_type");
    const [sizeRows] = await this.pool.execute<Row[]>("SELECT DISTINCT size FROM components ORDER BY size");
    const [gradeRows] = await this.pool.execute<Row[]>("SELECT DISTINCT grade FROM components WHERE grade IS NOT NULL AND grade != '' ORDER BY grade");
    return {
      types: typeRows.map((r) => String(r.type)),
      sub_types: subTypeRows.map((r) => String(r.sub_type)),
      sizes: sizeRows.map((r) => Number(r.size)),
      grades: gradeRows.map((r) => String(r.grade)),
    };
  }

  async getComponentBuyLocations(uuid: string): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT s.name as shop_name, s.location, s.parent_location, s.shop_type,
              si.base_price, si.rental_price_1d, si.rental_price_3d, si.rental_price_7d, si.rental_price_30d
       FROM shop_inventory si JOIN shops s ON si.shop_id = s.id
       WHERE si.component_uuid = ? ORDER BY si.base_price`,
      [uuid],
    );
    return rows;
  }

  async getComponentShips(uuid: string): Promise<Row[]> {
    const [rows] = await this.pool.execute<Row[]>(
      `SELECT DISTINCT s.uuid, s.name, s.class_name, s.manufacturer_code, s.manufacturer_name
       FROM ships_loadouts sl JOIN ships s ON sl.ship_uuid = s.uuid
       WHERE sl.component_uuid = ? ORDER BY s.name`,
      [uuid],
    );
    return rows;
  }

  async getComponentTypes(): Promise<{ types: { type: string; count: number }[] }> {
    const [rows] = await this.pool.execute<Row[]>(
      "SELECT type, COUNT(*) as count FROM components GROUP BY type ORDER BY count DESC",
    );
    return { types: rows.map(r => ({ type: String(r.type), count: Number(r.count) })) };
  }
}
