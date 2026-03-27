/**
 * CraftingService — Crafting recipe queries
 */
import type { PrismaClient } from '@prisma/client';
import { convertBigIntToNumber, type PaginatedResult, type Row } from './shared.js';

export class CraftingService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  /** List all distinct recipe categories for a given env */
  async getCategories(env = 'live'): Promise<{ category: string; count: number }[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT category, COUNT(*) as count
       FROM crafting_recipes
       WHERE category IS NOT NULL
       GROUP BY category
       ORDER BY category`,
    );
    return convertBigIntToNumber(rows).map((r) => ({
      category: String(r.category),
      count: Number(r.count),
    }));
  }

  /** List all distinct station types */
  async getStationTypes(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT DISTINCT station_type FROM crafting_recipes WHERE station_type IS NOT NULL AND station_type != '' ORDER BY station_type`,
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
    const prisma = this.getClient(env);
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const offset = (page - 1) * safeLimit;

    const where: string[] = [];
    const params: (string | number)[] = [];

    if (category) {
      where.push('r.category = ?');
      params.push(category);
    }
    if (search) {
      where.push('(r.name LIKE ? OR r.class_name LIKE ? OR COALESCE(oi.name, r.output_item_name) LIKE ?)');
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

    const whereClause = where.length ? where.join(' AND ') : '1=1';

    const [countRow] = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT COUNT(*) as total FROM crafting_recipes r LEFT JOIN items oi ON oi.uuid = r.output_item_uuid WHERE ${whereClause}`,
      ...params,
    );
    const total = Number(countRow?.total ?? 0);

    const data = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT r.uuid, r.class_name, r.name, r.category,
              COALESCE(oi.name, r.output_item_name) AS output_item_name,
              r.output_item_uuid, r.output_quantity,
              r.crafting_time_s, r.station_type, r.skill_level
       FROM crafting_recipes r
       LEFT JOIN items oi ON oi.uuid = r.output_item_uuid
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

  /** List all distinct resources with usage counts and total SCU */
  async getResources(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT COALESCE(i.name, ci.item_name) AS item_name, ci.item_uuid,
              COUNT(DISTINCT ci.recipe_uuid) AS recipe_count,
              SUM(ci.quantity) AS total_quantity,
              SUM(ci.scu) AS total_scu
       FROM crafting_ingredients ci
       LEFT JOIN items i ON i.uuid = ci.item_uuid
       GROUP BY ci.item_uuid, i.name, ci.item_name
       ORDER BY recipe_count DESC, item_name`,
    );
    return convertBigIntToNumber(rows);
  }

  /** List recipes that use a given resource (by item_name) */
  async getRecipesByResource(itemName: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT r.uuid, r.class_name, r.name, r.category,
              COALESCE(oi.name, r.output_item_name) AS output_item_name,
              r.output_item_uuid, r.output_quantity,
              r.crafting_time_s, r.station_type, r.skill_level,
              ci.quantity, ci.scu, ci.slot_name
       FROM crafting_recipes r
       JOIN crafting_ingredients ci ON ci.recipe_uuid = r.uuid
       LEFT JOIN items oi ON oi.uuid = r.output_item_uuid
       WHERE ci.item_name = ? OR ci.item_uuid IN (SELECT uuid FROM items WHERE name = ?)
       ORDER BY r.category ASC, r.name ASC`,
      itemName,
      itemName,
    );
    return convertBigIntToNumber(rows);
  }

  /** Single recipe by UUID with ingredients */
  async getRecipeByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT r.uuid, r.class_name, r.name, r.category,
              COALESCE(oi.name, r.output_item_name) AS output_item_name,
              r.output_item_uuid, r.output_quantity,
              r.crafting_time_s, r.station_type, r.skill_level
       FROM crafting_recipes r
       LEFT JOIN items oi ON oi.uuid = r.output_item_uuid
       WHERE r.uuid = ?`,
      uuid,
    );
    if (!rows.length) return null;

    const recipe = convertBigIntToNumber(rows[0]);

    const ingredients = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT ci.id, COALESCE(i.name, ci.item_name) AS item_name, ci.item_uuid,
              ci.quantity, ci.is_optional, ci.scu, ci.min_quality, ci.slot_name
       FROM crafting_ingredients ci
       LEFT JOIN items i ON i.uuid = ci.item_uuid
       WHERE ci.recipe_uuid = ?
       ORDER BY item_name`,
      uuid,
    );
    recipe.ingredients = convertBigIntToNumber(ingredients);

    const modifiers = await prisma.$queryRawUnsafe<Row[]>(
      `SELECT id, slot_name, property_name, property_uuid, unit_format,
              start_quality, end_quality, modifier_at_start, modifier_at_end
       FROM crafting_slot_modifiers
       WHERE recipe_uuid = ?
       ORDER BY slot_name, property_name`,
      uuid,
    );
    recipe.modifiers = convertBigIntToNumber(modifiers);

    return recipe;
  }
}
