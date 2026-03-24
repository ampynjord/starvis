/**
 * CraftingService — Crafting recipe queries
 */
import type { PrismaClient } from '@prisma/client';
import { convertBigIntToNumber, type PaginatedResult, type Row } from './shared.js';

export class CraftingService {
  constructor(private prisma: PrismaClient) {}

  /** List all distinct recipe categories for a given env */
  async getCategories(env = 'live'): Promise<{ category: string; count: number }[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT category, COUNT(*) as count
       FROM crafting_recipes
       WHERE game_env = ? AND category IS NOT NULL
       GROUP BY category
       ORDER BY category`,
      env,
    );
    return convertBigIntToNumber(rows).map((r) => ({
      category: String(r.category),
      count: Number(r.count),
    }));
  }

  /** List all distinct station types */
  async getStationTypes(env = 'live'): Promise<string[]> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT DISTINCT station_type FROM crafting_recipes WHERE game_env = ? AND station_type IS NOT NULL AND station_type != '' ORDER BY station_type`,
      env,
    );
    return rows.map((r) => String(r.station_type));
  }

  /** Paginated recipe list with filters */
  async getRecipes(opts: {
    env?: string;
    category?: string;
    search?: string;
    page?: number;
    limit?: number;
    skillLevel?: number;
    stationType?: string;
  }): Promise<PaginatedResult> {
    const { env = 'live', category, search, page = 1, limit = 50, skillLevel, stationType } = opts;
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const offset = (page - 1) * safeLimit;

    const where: string[] = ['r.game_env = ?'];
    const params: (string | number)[] = [env];

    if (category) {
      where.push('r.category = ?');
      params.push(category);
    }
    if (search) {
      where.push('(r.name LIKE ? OR r.class_name LIKE ? OR r.output_item_name LIKE ?)');
      const q = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
      params.push(q, q, q);
    }
    if (skillLevel != null) {
      where.push('r.skill_level <= ?');
      params.push(skillLevel);
    }
    if (stationType) {
      where.push('r.station_type = ?');
      params.push(stationType);
    }

    const whereClause = where.join(' AND ');

    const [countRow] = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT COUNT(*) as total FROM crafting_recipes r WHERE ${whereClause}`,
      ...params,
    );
    const total = Number(countRow?.total ?? 0);

    const data = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT r.uuid, r.class_name, r.name, r.category,
              r.output_item_name, r.output_item_uuid, r.output_quantity,
              r.crafting_time_s, r.station_type, r.skill_level, r.game_env
       FROM crafting_recipes r
       WHERE ${whereClause}
       ORDER BY r.category ASC, r.name ASC
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

  /** Single recipe by UUID with ingredients */
  async getRecipeByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const rows = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT uuid, class_name, name, category,
              output_item_name, output_item_uuid, output_quantity,
              crafting_time_s, station_type, skill_level, game_env
       FROM crafting_recipes
       WHERE uuid = ? AND game_env = ?`,
      uuid,
      env,
    );
    if (!rows.length) return null;

    const recipe = convertBigIntToNumber(rows[0]);

    const ingredients = await this.prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, item_name, item_uuid, quantity, is_optional
       FROM crafting_ingredients
       WHERE recipe_uuid = ? AND game_env = ?
       ORDER BY item_name`,
      uuid,
      env,
    );
    recipe.ingredients = convertBigIntToNumber(ingredients);
    return recipe;
  }
}
