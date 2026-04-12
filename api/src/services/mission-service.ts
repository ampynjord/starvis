/**
 * MissionService — Mission / contract template queries
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { formatEnumLabel } from '../normalizers/labels.js';
import { convertBigIntToNumber, type FiltersResult, type PaginatedResult, type Row, toPostgres } from './shared.js';

const MISSION_COLS = `m.uuid, m.class_name, m.title, m.description, m.mission_type,
  m.can_be_shared, m.only_owner_complete, m.is_legal,
  m.completion_time_s,
  m.reward_min, m.reward_max, m.reward_currency,
  m.faction, m.mission_giver,
  m.location_system, m.location_planet, m.location_name,
  m.danger_level, m.required_reputation, m.reputation_reward,
  m.base_xp, m.category, m.is_unique, m.has_blueprint_reward, m.blueprint_reward_uuid,
  m.buy_in_amount, m.not_for_release, m.work_in_progress`;

function normalizeMissionRow(row: Row): Row {
  return {
    ...row,
    display_mission_type: formatEnumLabel(String(row.mission_type ?? '')),
    display_category: formatEnumLabel(String(row.category ?? '')),
  };
}

export class MissionService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getMissionTypes(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT DISTINCT mission_type
       FROM game.missions
       WHERE env = ? AND not_for_release = false AND work_in_progress = false
         AND mission_type IS NOT NULL
       ORDER BY mission_type`),
      env,
    );
    return rows.map((r) => String(r.mission_type));
  }

  async getFactions(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT DISTINCT faction
       FROM game.missions
       WHERE env = ? AND not_for_release = false AND work_in_progress = false
         AND faction IS NOT NULL AND faction != ''
       ORDER BY faction`),
      env,
    );
    return rows.map((r) => String(r.faction));
  }

  async getSystems(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT DISTINCT location_system
       FROM game.missions
       WHERE env = ? AND not_for_release = false AND work_in_progress = false
         AND location_system IS NOT NULL AND location_system != ''
       ORDER BY location_system`),
      env,
    );
    return rows.map((r) => String(r.location_system));
  }

  async getCategories(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT DISTINCT category
       FROM game.missions
       WHERE env = ? AND not_for_release = false AND work_in_progress = false
         AND category IS NOT NULL AND category != ''
       ORDER BY category`),
      env,
    );
    return rows.map((r) => String(r.category));
  }

  async getMissions(opts: {
    env?: string;
    type?: string;
    legal?: string;
    shared?: string;
    faction?: string;
    system?: string;
    category?: string;
    unique?: string;
    minReward?: number;
    maxReward?: number;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const {
      env = 'live',
      type,
      legal,
      shared,
      faction,
      system,
      category,
      unique,
      minReward,
      maxReward,
      search,
      page = 1,
      limit = 50,
    } = opts;
    const prisma = this.getClient(env);
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const offset = (page - 1) * safeLimit;

    const where: string[] = ['m.env = ?', 'm.not_for_release = false', 'm.work_in_progress = false'];
    const params: (string | number)[] = [env];

    if (type) {
      where.push('m.mission_type = ?');
      params.push(type);
    }
    if (legal === 'true') where.push('m.is_legal = true');
    if (legal === 'false') where.push('m.is_legal = false');
    if (shared === 'true') where.push('m.can_be_shared = true');
    if (faction) {
      where.push('m.faction = ?');
      params.push(faction);
    }
    if (system) {
      where.push('m.location_system = ?');
      params.push(system);
    }
    if (category) {
      where.push('m.category = ?');
      params.push(category);
    }
    if (unique === 'true') where.push('m.is_unique = true');
    if (unique === 'false') where.push('m.is_unique = false');
    if (minReward != null && minReward > 0) {
      where.push('m.reward_max >= ?');
      params.push(minReward);
    }
    if (maxReward != null && maxReward > 0) {
      where.push('(m.reward_max <= ? OR m.reward_min <= ?)');
      params.push(maxReward, maxReward);
    }
    if (search) {
      where.push('(m.title ILIKE ? OR m.class_name ILIKE ? OR m.description ILIKE ?)');
      const q = `%${search.replace(/[%_]/g, '\\$&')}%`;
      params.push(q, q, q);
    }

    const whereClause = where.join(' AND ');

    const [countRow] = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT COUNT(*) as total FROM game.missions m WHERE ${whereClause}`),
      ...params,
    );
    const total = Number(countRow?.total ?? 0);

    const data = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ${MISSION_COLS}
       FROM game.missions m
       WHERE ${whereClause}
       ORDER BY m.mission_type ASC, m.title ASC
       LIMIT ? OFFSET ?`),
      ...params,
      safeLimit,
      offset,
    );

    return {
      data: convertBigIntToNumber(data).map(normalizeMissionRow),
      total,
      page,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    };
  }

  async getMissionByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ${MISSION_COLS},
              r.name as blueprint_name,
              r.output_item_name as blueprint_output
       FROM game.missions m
       LEFT JOIN game.crafting_recipes r ON m.blueprint_reward_uuid = r.uuid AND r.env = m.env
       WHERE m.env = ? AND m.uuid = ?`),
      env,
      uuid,
    );
    return rows.length ? normalizeMissionRow(convertBigIntToNumber(rows[0])) : null;
  }

  async getMissionFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const baseWhere = 'WHERE env = ? AND not_for_release = false AND work_in_progress = false';
    const [typeRows, factionRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT mission_type as value, COUNT(*) as count FROM game.missions ${baseWhere} AND mission_type IS NOT NULL GROUP BY mission_type ORDER BY mission_type`),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT faction as value, COUNT(*) as count FROM game.missions ${baseWhere} AND faction IS NOT NULL AND faction != '' GROUP BY faction ORDER BY faction`),
        env,
      ),
    ]);
    return {
      filters: {
        mission_type: typeRows.map((r) => ({ value: String(r.value), label: formatEnumLabel(String(r.value)), count: Number(r.count) })),
        faction: factionRows.map((r) => ({ value: String(r.value), label: String(r.value), count: Number(r.count) })),
      },
    };
  }
}
