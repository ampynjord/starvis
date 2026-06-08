import type { PrismaLike as PrismaClient } from '@starvis/db';
import { type PaginatedResult, type Row, toPostgres } from './shared.js';

export interface GameInsightQuery {
  env?: string;
  page?: number;
  limit?: number;
  category?: string;
  sourceType?: string;
  search?: string;
  faction?: string;
  relatedClass?: string;
}

export type GameInsightDatasetName =
  | 'factions'
  | 'reputation-standings'
  | 'reputation-scopes'
  | 'loot-tables'
  | 'loot-archetypes'
  | 'loot-table-entries'
  | 'blueprint-rewards'
  | 'ammo'
  | 'inventory-containers';

const DATASETS: Record<GameInsightDatasetName, { table: string; searchCols: string[]; order: string }> = {
  factions: {
    table: 'game.factions',
    searchCols: ['name', 'class_name', 'description', 'faction_type'],
    order: 'COALESCE(name, class_name)',
  },
  'reputation-standings': {
    table: 'game.reputation_standings',
    searchCols: ['name', 'display_name', 'class_name', 'description'],
    order: 'COALESCE(min_reputation, 0), COALESCE(display_name, name, class_name)',
  },
  'reputation-scopes': {
    table: 'game.reputation_scopes',
    searchCols: ['scope_name', 'display_name', 'class_name', 'description'],
    order: 'COALESCE(display_name, scope_name, class_name)',
  },
  'loot-tables': { table: 'game.loot_tables', searchCols: ['name', 'class_name'], order: 'COALESCE(name, class_name)' },
  'loot-archetypes': { table: 'game.loot_archetypes', searchCols: ['name', 'class_name'], order: 'COALESCE(name, class_name)' },
  'loot-table-entries': {
    table: 'game.loot_table_entries',
    searchCols: ['table_class_name', 'archetype_class_name'],
    order: 'table_class_name, entry_index',
  },
  'blueprint-rewards': {
    table: 'game.blueprint_rewards',
    searchCols: ['pool_class_name', 'blueprint_class_name'],
    order: 'pool_class_name, reward_index',
  },
  ammo: { table: 'game.ammo', searchCols: ['name', 'class_name', 'ammo_category'], order: 'COALESCE(name, class_name)' },
  'inventory-containers': {
    table: 'game.inventory_containers',
    searchCols: ['name', 'class_name', 'inventory_type'],
    order: 'COALESCE(name, class_name)',
  },
};

export class GameInsightService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getInsights(opts: GameInsightQuery): Promise<PaginatedResult> {
    const env = opts.env ?? 'live';
    const prisma = this.getClient(env);
    const where: string[] = ['env = ?'];
    const params: (string | number)[] = [env];

    if (opts.category) {
      where.push('category = ?');
      params.push(opts.category);
    }
    if (opts.sourceType) {
      where.push('source_type = ?');
      params.push(opts.sourceType);
    }
    if (opts.faction) {
      where.push('faction ILIKE ?');
      params.push(`%${opts.faction}%`);
    }
    if (opts.relatedClass) {
      where.push('related_class ILIKE ?');
      params.push(`%${opts.relatedClass}%`);
    }
    if (opts.search) {
      where.push('(name ILIKE ? OR class_name ILIKE ? OR value_text ILIKE ? OR p4k_path ILIKE ?)');
      const t = `%${opts.search}%`;
      params.push(t, t, t, t);
    }

    const w = ` WHERE ${where.join(' AND ')}`;
    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(200, Math.max(1, opts.limit || 50));
    const offset = (page - 1) * limit;

    const countRows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(`SELECT COUNT(*) as count FROM game.game_insights${w}`), ...params);
    const total = Number(countRows[0]?.count ?? 0);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT uuid, env, category, source_type, class_name, name, subtype,
             related_class, related_uuid, location_hint, faction, reputation_key,
             value_numeric, value_text, p4k_path, raw_json, extracted_at
       FROM game.game_insights${w}
       ORDER BY category, COALESCE(name, class_name, source_type)
       LIMIT ${Number(limit)} OFFSET ${Number(offset)}`),
      ...params,
    );

    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getCategories(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    return prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT category, COUNT(*) as count
       FROM game.game_insights
       WHERE env = ?
       GROUP BY category
       ORDER BY category`),
      env,
    );
  }

  async getInsight(uuid: string, category: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT *
       FROM game.game_insights
       WHERE env = ? AND uuid = ? AND category = ?
       LIMIT 1`),
      env,
      uuid,
      category,
    );
    return rows[0] ?? null;
  }

  async getDataset(
    name: GameInsightDatasetName,
    opts: { env?: string; page?: number; limit?: number; search?: string },
  ): Promise<PaginatedResult> {
    const dataset = DATASETS[name];
    const env = opts.env ?? 'live';
    const prisma = this.getClient(env);
    const params: (string | number)[] = [env];
    const where = ['env = ?'];

    if (opts.search) {
      const like = `%${opts.search}%`;
      where.push(`(${dataset.searchCols.map((col) => `${col} ILIKE ?`).join(' OR ')})`);
      params.push(...dataset.searchCols.map(() => like));
    }

    const page = Math.max(1, opts.page || 1);
    const limit = Math.min(200, Math.max(1, opts.limit || 50));
    const offset = (page - 1) * limit;
    const w = ` WHERE ${where.join(' AND ')}`;

    const countRows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(`SELECT COUNT(*) as count FROM ${dataset.table}${w}`), ...params);
    const total = Number(countRows[0]?.count ?? 0);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT * FROM ${dataset.table}${w} ORDER BY ${dataset.order} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`),
      ...params,
    );

    return { data: rows, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
