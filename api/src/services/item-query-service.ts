/**
 * ItemQueryService — FPS weapons, armor, clothing, attachments, gadgets, consumables
 */
import type { Pool } from "mysql2/promise";
import { type PaginatedResult, type Row, paginate } from "./shared.js";

const ITEM_SORT = new Set([
  "name", "class_name", "type", "sub_type", "size", "grade",
  "manufacturer_code", "mass", "hp",
  "weapon_damage", "weapon_fire_rate", "weapon_range", "weapon_dps",
  "armor_damage_reduction", "armor_temp_min", "armor_temp_max",
]);

export class ItemQueryService {
  constructor(private pool: Pool) {}

  async getAllItems(filters?: {
    type?: string; sub_type?: string; manufacturer?: string; search?: string;
    sort?: string; order?: string; page?: number; limit?: number;
  }): Promise<PaginatedResult> {
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.type) { where.push("i.type = ?"); params.push(filters.type); }
    if (filters?.sub_type) { where.push("i.sub_type = ?"); params.push(filters.sub_type); }
    if (filters?.manufacturer) { where.push("i.manufacturer_code = ?"); params.push(filters.manufacturer.toUpperCase()); }
    if (filters?.search) {
      where.push("(i.name LIKE ? OR i.class_name LIKE ?)");
      const t = `%${filters.search}%`;
      params.push(t, t);
    }

    const w = where.length ? ` WHERE ${where.join(" AND ")}` : "";
    const baseSql = `SELECT i.*, m.name as manufacturer_name FROM items i LEFT JOIN manufacturers m ON i.manufacturer_code = m.code${w}`;
    const countSql = `SELECT COUNT(*) as total FROM items i${w}`;

    return paginate(this.pool, baseSql, countSql, params, filters || {}, ITEM_SORT, "i");
  }

  async getItemByUuid(uuid: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>(
      "SELECT i.*, m.name as manufacturer_name FROM items i LEFT JOIN manufacturers m ON i.manufacturer_code = m.code WHERE i.uuid = ?",
      [uuid],
    );
    return rows[0] || null;
  }

  async getItemByClassName(className: string): Promise<Row | null> {
    const [rows] = await this.pool.execute<Row[]>(
      "SELECT i.*, m.name as manufacturer_name FROM items i LEFT JOIN manufacturers m ON i.manufacturer_code = m.code WHERE i.class_name = ?",
      [className],
    );
    return rows[0] || null;
  }

  async resolveItem(id: string): Promise<Row | null> {
    return id.length === 36
      ? this.getItemByUuid(id)
      : this.getItemByClassName(id);
  }

  async getItemFilters(): Promise<{ types: string[]; sub_types: string[]; manufacturers: string[] }> {
    const [typeRows] = await this.pool.execute<Row[]>("SELECT DISTINCT type FROM items WHERE type IS NOT NULL ORDER BY type");
    const [subTypeRows] = await this.pool.execute<Row[]>("SELECT DISTINCT sub_type FROM items WHERE sub_type IS NOT NULL AND sub_type != '' ORDER BY sub_type");
    const [mfrRows] = await this.pool.execute<Row[]>("SELECT DISTINCT manufacturer_code FROM items WHERE manufacturer_code IS NOT NULL ORDER BY manufacturer_code");
    return {
      types: typeRows.map(r => String(r.type)),
      sub_types: subTypeRows.map(r => String(r.sub_type)),
      manufacturers: mfrRows.map(r => String(r.manufacturer_code)),
    };
  }

  async getItemTypes(): Promise<{ types: { type: string; count: number }[] }> {
    const [rows] = await this.pool.execute<Row[]>(
      "SELECT type, COUNT(*) as count FROM items GROUP BY type ORDER BY count DESC",
    );
    return { types: rows.map(r => ({ type: String(r.type), count: Number(r.count) })) };
  }
}
