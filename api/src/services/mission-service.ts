/**
 * MissionService — Mission / contract template queries
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { formatEnumLabel } from '../normalizers/labels.js';
import { convertBigIntToNumber, type FiltersResult, type PaginatedResult, type Row, toPostgres } from './shared.js';

type MissionSort = 'default' | 'reward_desc' | 'reward_asc' | 'danger_desc';

const MISSION_COLS = `m.uuid, m.class_name, m.title, m.description, m.mission_type,
  m.can_be_shared, m.only_owner_complete, m.is_legal,
  m.completion_time_s,
  m.reward_min, m.reward_max, m.reward_currency,
  m.faction, m.mission_giver,
  m.location_system, m.location_planet, m.location_name,
  m.danger_level, m.required_reputation, m.reputation_reward,
  m.base_xp, m.category, m.is_unique, m.has_blueprint_reward, m.blueprint_reward_uuid,
  m.buy_in_amount, m.not_for_release, m.work_in_progress, m.p4k_path, m.raw_json`;

function normalizeMissionRow(row: Row): Row {
  return {
    ...row,
    display_mission_type: formatEnumLabel(String(row.mission_type ?? '')),
    display_category: formatEnumLabel(String(row.category ?? '')),
  };
}

function getMissionOrderBy(sort?: string): string {
  switch (sort as MissionSort | undefined) {
    case 'reward_desc':
      return 'COALESCE(m.reward_max, m.reward_min, 0) DESC, m.title ASC';
    case 'reward_asc':
      return 'COALESCE(m.reward_max, m.reward_min, 0) ASC, m.title ASC';
    case 'danger_desc':
      return 'COALESCE(m.danger_level, 0) DESC, m.title ASC';
    default:
      return 'm.mission_type ASC, m.title ASC';
  }
}

export interface MissionListResult extends PaginatedResult {
  summary: {
    blueprintRewards: number;
    averageReward: number | null;
    legalMissions: number;
    illegalMissions: number;
    shareableMissions: number;
    uniqueMissions: number;
    averageDanger: number | null;
  };
}

export class MissionService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  private async getInsightPage(
    table: 'game.factions' | 'game.reputation_standings' | 'game.reputation_scopes',
    opts: { env?: string; search?: string; page?: number; limit?: number },
    searchColumns: string[],
    orderBy: string,
  ): Promise<PaginatedResult> {
    const { env = 'live', search, page = 1, limit = 50 } = opts;
    const prisma = this.getClient(env);
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const offset = (page - 1) * safeLimit;
    const where = ['env = ?'];
    const params: (string | number)[] = [env];

    if (search) {
      const q = `%${search.replace(/[%_]/g, '\\$&')}%`;
      where.push(`(${searchColumns.map((column) => `${column} ILIKE ?`).join(' OR ')})`);
      params.push(...searchColumns.map(() => q));
    }

    const whereClause = where.join(' AND ');
    const [countRows, rows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(toPostgres(`SELECT COUNT(*) as total FROM ${table} WHERE ${whereClause}`), ...params),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT * FROM ${table} WHERE ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`),
        ...params,
        safeLimit,
        offset,
      ),
    ]);
    const total = Number(countRows[0]?.total ?? 0);
    return { data: convertBigIntToNumber(rows), total, page, limit: safeLimit, pages: Math.ceil(total / safeLimit) };
  }

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

  async getFactionDetails(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const [missionRows, registryRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT
          faction as name,
          COUNT(*) as mission_count,
          COUNT(*) FILTER (WHERE is_legal = true) as legal_missions,
          COUNT(*) FILTER (WHERE is_legal = false) as illegal_missions,
          COUNT(*) FILTER (WHERE can_be_shared = true) as shareable_missions,
          COUNT(*) FILTER (WHERE has_blueprint_reward = true) as blueprint_reward_missions,
          MIN(COALESCE(reward_min, reward_max)) as reward_min,
          MAX(COALESCE(reward_max, reward_min)) as reward_max,
          ROUND(AVG(COALESCE(reward_max, reward_min)) FILTER (WHERE COALESCE(reward_max, reward_min) IS NOT NULL)) as reward_average,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT mission_giver), NULL) as mission_givers,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT location_system), NULL) as systems,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT category), NULL) as categories,
          ARRAY_REMOVE(ARRAY_AGG(DISTINCT mission_type), NULL) as mission_types
       FROM game.missions
       WHERE env = ? AND not_for_release = false AND work_in_progress = false
         AND faction IS NOT NULL AND faction != ''
       GROUP BY faction
       ORDER BY faction`),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT uuid as game_faction_uuid, class_name as game_faction_class_name, name as game_faction_name,
            description as game_faction_description, faction_type, default_reaction, able_to_arrest, no_legal_rights,
            polices_criminality, polices_lawful_trespass, faction_reputation_uuid, allies, enemies, organization_tags
         FROM game.factions
         WHERE env = ?
         ORDER BY COALESCE(name, class_name)`),
        env,
      ),
    ]);

    const registryByName = new Map<string, Row>();
    for (const row of convertBigIntToNumber(registryRows)) {
      for (const value of [row.game_faction_name, row.game_faction_class_name]) {
        if (value) registryByName.set(String(value).toLowerCase(), row);
      }
    }

    return convertBigIntToNumber(missionRows).map((row) => ({
      ...row,
      ...(registryByName.get(String(row.name).toLowerCase()) ?? {}),
    }));
  }

  async getFactionRegistry(opts: { env?: string; search?: string; page?: number; limit?: number }): Promise<PaginatedResult> {
    return this.getInsightPage(
      'game.factions',
      opts,
      ['name', 'class_name', 'faction_type', 'default_reaction'],
      'COALESCE(name, class_name) ASC',
    );
  }

  async getReputationStandings(opts: { env?: string; search?: string; page?: number; limit?: number }): Promise<PaginatedResult> {
    return this.getInsightPage(
      'game.reputation_standings',
      opts,
      ['name', 'display_name', 'class_name', 'description'],
      'COALESCE(min_reputation, 0) ASC, COALESCE(display_name, name, class_name) ASC',
    );
  }

  async getReputationScopes(opts: { env?: string; search?: string; page?: number; limit?: number }): Promise<PaginatedResult> {
    return this.getInsightPage(
      'game.reputation_scopes',
      opts,
      ['scope_name', 'display_name', 'class_name', 'description'],
      'COALESCE(display_name, scope_name, class_name) ASC',
    );
  }

  async getFactionDetail(faction: string, env = 'live'): Promise<Row | null> {
    const all = await this.getFactionDetails(env);
    const found = all.find((row) => String(row.name).toLowerCase() === faction.toLowerCase());
    if (!found) return null;
    const missions = await this.getMissions({ env, faction: String(found.name), limit: 20, sort: 'reward_desc' });
    return { ...found, missions: missions.data, missions_total: missions.total };
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
    blueprintReward?: string;
    minReward?: number;
    maxReward?: number;
    search?: string;
    sort?: MissionSort | string;
    page?: number;
    limit?: number;
  }): Promise<MissionListResult> {
    const {
      env = 'live',
      type,
      legal,
      shared,
      faction,
      system,
      category,
      unique,
      blueprintReward,
      minReward,
      maxReward,
      search,
      sort,
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
    if (shared === 'false') where.push('m.can_be_shared = false');
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
    if (blueprintReward === 'true') where.push('m.has_blueprint_reward = true');
    if (blueprintReward === 'false') where.push('m.has_blueprint_reward = false');
    if (minReward != null && minReward > 0) {
      where.push('m.reward_max >= ?');
      params.push(minReward);
    }
    if (maxReward != null && maxReward > 0) {
      where.push('(m.reward_max <= ? OR m.reward_min <= ?)');
      params.push(maxReward, maxReward);
    }
    if (search) {
      where.push('(m.title ILIKE ? OR m.class_name ILIKE ? OR m.description ILIKE ? OR m.faction ILIKE ? OR m.mission_giver ILIKE ?)');
      const q = `%${search.replace(/[%_]/g, '\\$&')}%`;
      params.push(q, q, q, q, q);
    }

    const whereClause = where.join(' AND ');

    const [countRows, summaryRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(toPostgres(`SELECT COUNT(*) as total FROM game.missions m WHERE ${whereClause}`), ...params),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(`SELECT
          COUNT(*) FILTER (WHERE m.has_blueprint_reward = true) as blueprint_rewards,
          ROUND(AVG(COALESCE(m.reward_max, m.reward_min)) FILTER (WHERE COALESCE(m.reward_max, m.reward_min) IS NOT NULL)) as average_reward,
          COUNT(*) FILTER (WHERE m.is_legal = true) as legal_missions,
          COUNT(*) FILTER (WHERE m.is_legal = false) as illegal_missions,
          COUNT(*) FILTER (WHERE m.can_be_shared = true) as shareable_missions,
          COUNT(*) FILTER (WHERE m.is_unique = true) as unique_missions,
          ROUND(AVG(m.danger_level) FILTER (WHERE m.danger_level IS NOT NULL), 1) as average_danger
         FROM game.missions m
         WHERE ${whereClause}`),
        ...params,
      ),
    ]);
    const total = Number(countRows[0]?.total ?? 0);

    const data = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ${MISSION_COLS},
              COALESCE(blueprints.blueprint_reward_count, 0) AS blueprint_reward_count
       FROM game.missions m
       LEFT JOIN (
         SELECT mission_uuid, mission_env, COUNT(DISTINCT blueprint_uuid) AS blueprint_reward_count
         FROM game.mission_blueprint_rewards
         GROUP BY mission_uuid, mission_env
       ) blueprints ON blueprints.mission_uuid = m.uuid AND blueprints.mission_env = m.env
       WHERE ${whereClause}
       ORDER BY ${getMissionOrderBy(sort)}
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
      summary: {
        blueprintRewards: Number(summaryRows[0]?.blueprint_rewards ?? 0),
        averageReward: summaryRows[0]?.average_reward == null ? null : Number(summaryRows[0].average_reward),
        legalMissions: Number(summaryRows[0]?.legal_missions ?? 0),
        illegalMissions: Number(summaryRows[0]?.illegal_missions ?? 0),
        shareableMissions: Number(summaryRows[0]?.shareable_missions ?? 0),
        uniqueMissions: Number(summaryRows[0]?.unique_missions ?? 0),
        averageDanger: summaryRows[0]?.average_danger == null ? null : Number(summaryRows[0].average_danger),
      },
    };
  }

  async getMissionByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ${MISSION_COLS},
              r.name as blueprint_name,
              r.output_item_name as blueprint_output,
              COALESCE(blueprints.blueprint_reward_count, 0) AS blueprint_reward_count
       FROM game.missions m
       LEFT JOIN game.crafting_recipes r ON m.blueprint_reward_uuid = r.uuid AND r.env = m.env
       LEFT JOIN (
         SELECT mission_uuid, mission_env, COUNT(DISTINCT blueprint_uuid) AS blueprint_reward_count
         FROM game.mission_blueprint_rewards
         GROUP BY mission_uuid, mission_env
       ) blueprints ON blueprints.mission_uuid = m.uuid AND blueprints.mission_env = m.env
       WHERE m.env = ? AND m.uuid = ?`),
      env,
      uuid,
    );
    if (!rows.length) return null;

    const mission = normalizeMissionRow(convertBigIntToNumber(rows[0]));
    const blueprintRewards = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT DISTINCT r.uuid, r.env AS game_env, r.class_name, r.name, r.category,
              COALESCE(i.name, r.output_item_name) AS output_item_name,
              r.output_item_uuid, r.output_quantity, r.crafting_time_s, r.station_type, r.skill_level
       FROM game.crafting_recipes r
       LEFT JOIN game.items i ON i.uuid = r.output_item_uuid AND i.env = r.env
       WHERE r.env = ? AND r.uuid = ?
       UNION
       SELECT DISTINCT r.uuid, r.env AS game_env, r.class_name, r.name, r.category,
              COALESCE(i.name, r.output_item_name) AS output_item_name,
              r.output_item_uuid, r.output_quantity, r.crafting_time_s, r.station_type, r.skill_level
       FROM game.mission_blueprint_rewards mbr
       JOIN game.crafting_recipes r ON r.uuid = mbr.blueprint_uuid AND r.env = mbr.blueprint_env
       LEFT JOIN game.items i ON i.uuid = r.output_item_uuid AND i.env = r.env
       WHERE mbr.mission_env = ? AND mbr.mission_uuid = ?
       ORDER BY name ASC`),
      env,
      String(mission.blueprint_reward_uuid ?? '00000000-0000-0000-0000-000000000000'),
      env,
      uuid,
    );
    mission.blueprint_rewards = convertBigIntToNumber(blueprintRewards);
    mission.blueprint_reward_count = mission.blueprint_rewards.length;
    mission.has_blueprint_reward = Boolean(mission.has_blueprint_reward || mission.blueprint_rewards.length > 0);
    return mission;
  }

  async getMissionFilters(env = 'live'): Promise<FiltersResult> {
    const prisma = this.getClient(env);
    const baseWhere = 'WHERE env = ? AND not_for_release = false AND work_in_progress = false';
    const [typeRows, factionRows] = await Promise.all([
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT mission_type as value, COUNT(*) as count FROM game.missions ${baseWhere} AND mission_type IS NOT NULL GROUP BY mission_type ORDER BY mission_type`,
        ),
        env,
      ),
      prisma.$queryRawUnsafe<Row[]>(
        toPostgres(
          `SELECT faction as value, COUNT(*) as count FROM game.missions ${baseWhere} AND faction IS NOT NULL AND faction != '' GROUP BY faction ORDER BY faction`,
        ),
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
