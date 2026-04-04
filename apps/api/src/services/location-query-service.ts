/**
 * LocationQueryService — Navigable locations from the Star Citizen universe
 */
import type { PrismaClient } from '@prisma/client';
import { convertBigIntToNumber, type PaginatedResult, paginate, type Row, stripInternal } from './shared.js';

const LOCATION_SORT = new Set(['name', 'class_name', 'type', 'system_code', 'is_scannable']);

export class LocationQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getLocationTypes(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<{ type: string }[]>('SELECT DISTINCT type FROM locations ORDER BY type ASC');
    return rows.map((r) => r.type);
  }

  async getLocationSystems(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<{ system_code: string }[]>(
      'SELECT DISTINCT system_code FROM locations WHERE system_code IS NOT NULL ORDER BY system_code ASC',
    );
    return rows.map((r) => r.system_code);
  }

  async getLocations(filters?: {
    env?: string;
    type?: string;
    types?: string;
    system?: string;
    search?: string;
    hideInStarmap?: string;
    sort?: string;
    order?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const env = filters?.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = [];
    const params: (string | number)[] = [];

    if (filters?.types) {
      const typeList = filters.types
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      if (typeList.length === 1) {
        where.push('l.type = ?');
        params.push(typeList[0]);
      } else if (typeList.length > 1) {
        where.push(`l.type IN (${typeList.map(() => '?').join(',')})`);
        params.push(...typeList);
      }
    } else if (filters?.type) {
      where.push('l.type = ?');
      params.push(filters.type);
    }

    if (filters?.system) {
      where.push('l.system_code = ?');
      params.push(filters.system.toUpperCase());
    }

    // By default, omit mining claims from generic listing (too numerous)
    if (!filters?.type && !filters?.types) {
      where.push("l.type NOT IN ('mining_claim')");
    }

    if (filters?.search) {
      where.push('l.name LIKE ?');
      params.push(`%${filters.search}%`);
    }

    if (filters?.hideInStarmap === 'false') {
      where.push('l.hide_in_starmap = 0');
    } else if (filters?.hideInStarmap === 'true') {
      where.push('l.hide_in_starmap = 1');
    }

    const w = where.length ? ` WHERE ${where.join(' AND ')}` : '';

    const baseSql = `SELECT l.uuid, l.class_name, l.name, l.type, l.system_code, l.parent_uuid, l.loc_key, l.is_scannable, l.hide_in_starmap FROM locations l${w}`;
    const countSql = `SELECT COUNT(*) as total FROM locations l${w}`;

    return paginate(prisma, baseSql, countSql, params, filters || {}, LOCATION_SORT, 'l');
  }

  async getLocation(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT l.uuid, l.class_name, l.name, l.type, l.system_code, l.parent_uuid,
              l.loc_key, l.description, l.is_scannable, l.hide_in_starmap, l.extracted_at
       FROM locations l
       WHERE l.uuid = ?
       LIMIT 1`,
      uuid,
    );
    if (!rows.length) return null;
    return convertBigIntToNumber(stripInternal(rows[0]));
  }

  async getAll(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      'SELECT uuid, class_name, name, type, system_code, parent_uuid, loc_key, is_scannable, hide_in_starmap FROM locations ORDER BY name ASC',
    );
    return rows.map(convertBigIntToNumber).map(stripInternal);
  }

  async getLocationChildren(uuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT l.uuid, l.class_name, l.name, l.type, l.system_code, l.parent_uuid, l.is_scannable, l.hide_in_starmap
       FROM locations l
       WHERE l.parent_uuid = ?
         AND l.type NOT IN ('mining_claim')
       ORDER BY l.type ASC, l.name ASC`,
      uuid,
    );
    return rows.map(convertBigIntToNumber).map(stripInternal);
  }
}
