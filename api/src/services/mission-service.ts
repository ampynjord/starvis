/**
 * MissionService — Mission / contract template queries
 */
import type { PrismaClient } from '@prisma/client';
import { convertBigIntToNumber, type PaginatedResult, type Row } from './shared.js';

export class MissionService {
  constructor(private prisma: PrismaClient) {}

  /** List all distinct mission types for a given env */
  async getMissionTypes(env = 'live'): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT DISTINCT mission_type
       FROM missions
       WHERE game_env = ? AND not_for_release = 0 AND work_in_progress = 0
         AND mission_type IS NOT NULL
       ORDER BY mission_type`,
      env,
    );
    return rows.map((r) => String(r.mission_type));
  }

  /** Paginated mission list with filters */
  async getMissions(opts: {
    env?: string;
    type?: string;
    legal?: string;
    shared?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<PaginatedResult> {
    const { env = 'live', type, legal, shared, search, page = 1, limit = 50 } = opts;
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const offset = (page - 1) * safeLimit;

    const where: string[] = ['m.game_env = ?', 'm.not_for_release = 0', 'm.work_in_progress = 0'];
    const params: (string | number)[] = [env];

    if (type) {
      where.push('m.mission_type = ?');
      params.push(type);
    }
    if (legal === 'true') where.push('m.is_legal = 1');
    if (legal === 'false') where.push('m.is_legal = 0');
    if (shared === 'true') where.push('m.can_be_shared = 1');
    if (search) {
      where.push('m.title LIKE ?');
      params.push(`%${search.replace(/[%_\\]/g, '\\$&')}%`);
    }

    const whereClause = where.join(' AND ');

    const [countRow] = await this.prisma.$queryRawUnsafe<Row[]>(`SELECT COUNT(*) as total FROM missions m WHERE ${whereClause}`, ...params);
    const total = Number(countRow?.total ?? 0);

    const data = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT m.uuid, m.class_name, m.title, m.description, m.mission_type,
              m.can_be_shared, m.only_owner_complete, m.is_legal,
              m.completion_time_s, m.game_env
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
  async getMissionByUuid(uuid: string): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT uuid, class_name, title, description, mission_type,
              can_be_shared, only_owner_complete, is_legal,
              completion_time_s, game_env
       FROM missions
       WHERE uuid = ?`,
      uuid,
    );
    return rows.length ? convertBigIntToNumber(rows[0]) : null;
  }
}
