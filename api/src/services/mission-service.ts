/**
 * MissionService — Mission / contract template queries
 */
import type { PrismaClient } from '@prisma/client';
import { convertBigIntToNumber, type PaginatedResult, type Row } from './shared.js';

const MISSION_COLS = `m.uuid, m.class_name, m.title, m.description, m.mission_type,
  m.can_be_shared, m.only_owner_complete, m.is_legal,
  m.completion_time_s,
  m.reward_min, m.reward_max, m.reward_currency,
  m.faction, m.mission_giver,
  m.location_system, m.location_planet, m.location_name,
  m.danger_level, m.required_reputation, m.reputation_reward`;

export class MissionService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  /** List all distinct mission types for a given env */
  async getMissionTypes(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT DISTINCT mission_type
       FROM missions
       WHERE not_for_release = 0 AND work_in_progress = 0
         AND mission_type IS NOT NULL
       ORDER BY mission_type`,
    );
    return rows.map((r) => String(r.mission_type));
  }

  /** List all distinct factions */
  async getFactions(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT DISTINCT faction
       FROM missions
       WHERE not_for_release = 0 AND work_in_progress = 0
         AND faction IS NOT NULL AND faction != ''
       ORDER BY faction`,
    );
    return rows.map((r) => String(r.faction));
  }

  /** List all distinct location systems */
  async getSystems(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT DISTINCT location_system
       FROM missions
       WHERE not_for_release = 0 AND work_in_progress = 0
         AND location_system IS NOT NULL AND location_system != ''
       ORDER BY location_system`,
    );
    return rows.map((r) => String(r.location_system));
  }

  /** Paginated mission list with filters */
  async getMissions(opts: {
    env?: string;
    type?: string;
    legal?: string;
    shared?: string;
    faction?: string;
    system?: string;
    minReward?: number;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const { env = 'live', type, legal, shared, faction, system, minReward, search, page = 1, limit = 50 } = opts;
    const prisma = this.getClient(env);
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const offset = (page - 1) * safeLimit;

    const where: string[] = ['m.not_for_release = 0', 'm.work_in_progress = 0'];
    const params: (string | number)[] = [];

    if (type) {
      where.push('m.mission_type = ?');
      params.push(type);
    }
    if (legal === 'true') where.push('m.is_legal = 1');
    if (legal === 'false') where.push('m.is_legal = 0');
    if (shared === 'true') where.push('m.can_be_shared = 1');
    if (faction) {
      where.push('m.faction = ?');
      params.push(faction);
    }
    if (system) {
      where.push('m.location_system = ?');
      params.push(system);
    }
    if (minReward != null && minReward > 0) {
      where.push('m.reward_max >= ?');
      params.push(minReward);
    }
    if (search) {
      where.push('(m.title LIKE ? OR m.class_name LIKE ? OR m.description LIKE ?)');
      const q = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
      params.push(q, q, q);
    }

    const whereClause = where.length ? where.join(' AND ') : '1=1';

    const [countRow] = await prisma.$queryRawUnsafe<Row[]>(`SELECT COUNT(*) as total FROM missions m WHERE ${whereClause}`, ...params);
    const total = Number(countRow?.total ?? 0);

    const data = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${MISSION_COLS}
       FROM missions m
       WHERE ${whereClause}
       ORDER BY m.mission_type ASC, m.title ASC
       LIMIT ? OFFSET ?`,
      ...params,
      safeLimit,
      offset,
    );

    return {
      data: convertBigIntToNumber(data),
      total,
      page,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    };
  }

  /** Single mission by UUID */
  async getMissionByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT ${MISSION_COLS}
       FROM missions m
       WHERE m.uuid = ?`,
      uuid,
    );
    return rows.length ? convertBigIntToNumber(rows[0]) : null;
  }
}
