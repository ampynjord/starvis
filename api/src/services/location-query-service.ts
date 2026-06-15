/**
 * LocationQueryService — Navigable locations from the Star Citizen universe
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { annotateWithAffiliation } from '../data/location-affiliations.js';
import {
  convertBigIntToNumber,
  type FiltersResult,
  type PaginatedResult,
  paginate,
  type Row,
  stripInternal,
  toPostgres,
} from './shared.js';

const LOCATION_SORT = new Set(['name', 'class_name', 'type', 'system_code', 'is_scannable']);

export class LocationQueryService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getLocationTypes(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<{ type: string }[]>(
      toPostgres('SELECT DISTINCT type FROM game.locations WHERE env = ? ORDER BY type ASC'),
      env,
    );
    return rows.map((r) => r.type);
  }

  async getLocationSystems(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<{ system_code: string }[]>(
      toPostgres('SELECT DISTINCT system_code FROM game.locations WHERE env = ? AND system_code IS NOT NULL ORDER BY system_code ASC'),
      env,
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
    const where: string[] = ['l.env = ?'];
    const params: (string | number)[] = [env];

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

    if (!filters?.type && !filters?.types) {
      where.push("l.type NOT IN ('mining_claim')");
    }

    if (filters?.search) {
      where.push('l.name ILIKE ?');
      params.push(`%${filters.search}%`);
    }

    if (filters?.hideInStarmap === 'false') {
      where.push('l.hide_in_starmap = false');
    } else if (filters?.hideInStarmap === 'true') {
      where.push('l.hide_in_starmap = true');
    }

    const w = ` WHERE ${where.join(' AND ')}`;

    const baseSql = `SELECT l.uuid, l.class_name, l.name, l.type, l.system_code, l.parent_uuid, l.rsi_starmap_location_id,
      l.starmap_match_method, l.starmap_match_score, l.starmap_match_confidence, l.loc_key,
      l.coordinates, l.p4k_path, l.is_scannable, l.hide_in_starmap,
      CASE WHEN sl.id IS NULL THEN NULL ELSE json_build_object(
        'id', sl.id,
        'rsi_id', sl.rsi_id,
        'name', sl.name,
        'type', sl.type,
        'system_code', sl.system_code,
        'system_name', sl.system_name,
        'status', sl.status,
        'faction_name', sl.faction_name,
        'description', sl.description,
        'web_url', sl.web_url,
        'coordinates', sl.coordinates
      ) END as rsi_starmap
      FROM game.locations l
      LEFT JOIN rsi.starmap_locations sl ON sl.id = l.rsi_starmap_location_id${w}`;
    const countSql = `SELECT COUNT(*) as total FROM game.locations l${w}`;

    const result = await paginate(prisma, baseSql, countSql, params, filters || {}, LOCATION_SORT, 'l');
    return { ...result, data: result.data.map(annotateWithAffiliation) };
  }

  async getLocation(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT l.uuid, l.class_name, l.name, l.type, l.system_code, l.parent_uuid,
              l.rsi_starmap_location_id, l.starmap_match_method, l.starmap_match_score, l.starmap_match_confidence,
              l.loc_key, l.description, l.coordinates, l.p4k_path, l.raw_json,
              l.is_scannable, l.hide_in_starmap, l.extracted_at,
              CASE WHEN sl.id IS NULL THEN NULL ELSE json_build_object(
                'id', sl.id,
                'rsi_id', sl.rsi_id,
                'name', sl.name,
                'type', sl.type,
                'system_code', sl.system_code,
                'system_name', sl.system_name,
                'status', sl.status,
                'star_type', sl.star_type,
                'faction_name', sl.faction_name,
                'affiliations', sl.affiliations,
                'thumbnail', sl.thumbnail,
                'description', sl.description,
                'web_url', sl.web_url,
                'coordinates', sl.coordinates,
                'aggregated', sl.aggregated,
                'size', sl.size,
                'population', sl.population,
                'economy', sl.economy,
                'danger', sl.danger,
                'jump_points', sl.jump_points,
                'source_updated_at', sl.source_updated_at
              ) END as rsi_starmap
       FROM game.locations l
       LEFT JOIN rsi.starmap_locations sl ON sl.id = l.rsi_starmap_location_id
       WHERE l.env = ? AND l.uuid = ?
       LIMIT 1`),
      env,
      uuid,
    );
    if (!rows.length) return null;
    return annotateWithAffiliation(convertBigIntToNumber(stripInternal(rows[0])));
  }

  async getAll(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT l.uuid, l.class_name, l.name, l.type, l.system_code, l.parent_uuid, l.rsi_starmap_location_id,
          l.starmap_match_method, l.starmap_match_score, l.starmap_match_confidence,
          l.loc_key, l.coordinates, l.p4k_path, l.is_scannable, l.hide_in_starmap,
          CASE WHEN sl.id IS NULL THEN NULL ELSE json_build_object(
            'id', sl.id,
            'rsi_id', sl.rsi_id,
            'name', sl.name,
            'type', sl.type,
            'system_code', sl.system_code,
            'system_name', sl.system_name,
            'status', sl.status,
            'faction_name', sl.faction_name,
            'web_url', sl.web_url,
            'coordinates', sl.coordinates
          ) END as rsi_starmap
         FROM game.locations l
         LEFT JOIN rsi.starmap_locations sl ON sl.id = l.rsi_starmap_location_id
         WHERE l.env = ? ORDER BY l.name ASC`,
      ),
      env,
    );
    return rows.map(convertBigIntToNumber).map(stripInternal).map(annotateWithAffiliation);
  }

  async getLocationFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const [typeRows, systemRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT type as value, COUNT(*) as count FROM game.locations WHERE env = ? GROUP BY type ORDER BY type`),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT DISTINCT system_code as value FROM game.locations WHERE env = ? AND system_code IS NOT NULL ORDER BY system_code`,
        ),
        env,
      ),
    ]);
    return {
      filters: {
        type: typeRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
        system: systemRows.map((r) => ({ value: String(r.value), label: String(r.value) })),
      },
    };
  }

  async getLocationChildren(uuid: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT l.uuid, l.class_name, l.name, l.type, l.system_code, l.parent_uuid,
              l.rsi_starmap_location_id, l.starmap_match_method, l.starmap_match_score, l.starmap_match_confidence,
              l.coordinates, l.p4k_path, l.is_scannable, l.hide_in_starmap,
              CASE WHEN sl.id IS NULL THEN NULL ELSE json_build_object(
                'id', sl.id,
                'rsi_id', sl.rsi_id,
                'name', sl.name,
                'type', sl.type,
                'system_code', sl.system_code,
                'system_name', sl.system_name,
                'status', sl.status,
                'faction_name', sl.faction_name,
                'web_url', sl.web_url,
                'coordinates', sl.coordinates
              ) END as rsi_starmap
       FROM game.locations l
       LEFT JOIN rsi.starmap_locations sl ON sl.id = l.rsi_starmap_location_id
       WHERE l.env = ? AND l.parent_uuid = ?
         AND l.type NOT IN ('mining_claim')
       ORDER BY l.type ASC, l.name ASC`),
      env,
      uuid,
    );
    return rows.map(convertBigIntToNumber).map(stripInternal).map(annotateWithAffiliation);
  }
}
