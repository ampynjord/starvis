/**
 * CraftingService — Crafting recipe queries
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';
import { cleanItemName, cleanPropertyName, cleanRecipeName } from '../normalizers/crafting.js';
import { formatEnumLabel } from '../normalizers/labels.js';
import { convertBigIntToNumber, type PaginatedResult, type Row, toPostgres } from './shared.js';

function normalizeRecipeRow(row: Row): Row {
  return {
    ...row,
    display_name: cleanRecipeName(String(row.name ?? row.class_name ?? '')),
    display_output_item_name: cleanItemName(String(row.output_item_name ?? row.name ?? row.class_name ?? '')),
    display_category: formatEnumLabel(String(row.category ?? '')),
    display_station_type: formatEnumLabel(String(row.station_type ?? '')),
  };
}

function normalizeIngredientRow(row: Row): Row {
  return {
    ...row,
    display_item_name: cleanItemName(String(row.item_name ?? '')),
    display_slot_name: row.slot_name ? cleanItemName(String(row.slot_name)) : null,
  };
}

function normalizeModifierRow(row: Row): Row {
  return {
    ...row,
    display_property_name: cleanPropertyName(String(row.property_name ?? '')),
  };
}

function normalizeResourceRow(row: Row): Row {
  return {
    ...row,
    display_item_name: cleanItemName(String(row.item_name ?? '')),
  };
}

export class CraftingService {
  constructor(private getClient: (env: string) => PrismaClient) {}

  async getCategories(env = 'live'): Promise<{ category: string; count: number }[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT category, COUNT(*) as count
       FROM game.crafting_recipes
       WHERE env = ? AND category IS NOT NULL
       GROUP BY category
       ORDER BY category`),
      env,
    );
    return convertBigIntToNumber(rows).map((r) => ({
      category: String(r.category),
      count: Number(r.count),
      display_category: formatEnumLabel(String(r.category ?? '')),
    }));
  }

  async getStationTypes(env = 'live'): Promise<string[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT DISTINCT station_type FROM game.crafting_recipes WHERE env = ? AND station_type IS NOT NULL AND station_type != '' ORDER BY station_type`,
      ),
      env,
    );
    return rows.map((r) => String(r.station_type));
  }

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

    const where: string[] = ['r.env = ?'];
    const params: (string | number)[] = [env];

    if (category) {
      where.push('r.category = ?');
      params.push(category);
    }
    if (search) {
      where.push('(r.name ILIKE ? OR r.class_name ILIKE ? OR COALESCE(oi.name, r.output_item_name) ILIKE ?)');
      const q = `%${search.replace(/[%_]/g, '\\$&')}%`;
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

    const [countRow] = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(
        `SELECT COUNT(*) as total FROM game.crafting_recipes r LEFT JOIN game.items oi ON oi.uuid = r.output_item_uuid AND oi.env = r.env WHERE ${whereClause}`,
      ),
      ...params,
    );
    const total = Number(countRow?.total ?? 0);

    const data = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT r.uuid, r.class_name, r.name, r.category,
              COALESCE(oi.name, r.output_item_name) AS output_item_name,
              r.output_item_uuid, r.output_quantity,
              r.crafting_time_s, r.station_type, r.skill_level,
              (SELECT COUNT(DISTINCT sub_m.uuid) FROM (
                SELECT uuid FROM game.missions WHERE blueprint_reward_uuid = r.uuid AND env = r.env
                UNION ALL
                SELECT mission_uuid FROM game.mission_blueprint_rewards WHERE blueprint_uuid = r.uuid AND blueprint_env = r.env
              ) sub_m) AS missions_count
       FROM game.crafting_recipes r
       LEFT JOIN game.items oi ON oi.uuid = r.output_item_uuid AND oi.env = r.env
       WHERE ${whereClause}
       ORDER BY r.category ASC, r.name ASC
       LIMIT ? OFFSET ?`),
      ...params,
      safeLimit,
      offset,
    );

    return {
      data: convertBigIntToNumber(data).map(normalizeRecipeRow),
      total,
      page,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    };
  }

  async getResources(env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT COALESCE(i.name, ci.item_name) AS item_name, ci.item_uuid,
              COUNT(DISTINCT ci.recipe_uuid) AS recipe_count,
              SUM(ci.quantity) AS total_quantity,
              SUM(ci.scu) AS total_scu
       FROM game.crafting_ingredients ci
       LEFT JOIN game.items i ON i.uuid = ci.item_uuid AND i.env = ci.recipe_env
       WHERE ci.recipe_env = ?
       GROUP BY ci.item_uuid, i.name, ci.item_name
       ORDER BY recipe_count DESC, item_name`),
      env,
    );
    return convertBigIntToNumber(rows).map(normalizeResourceRow);
  }

  async getRecipesByResource(itemName: string, env = 'live'): Promise<Row[]> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT r.uuid, r.class_name, r.name, r.category,
              COALESCE(oi.name, r.output_item_name) AS output_item_name,
              r.output_item_uuid, r.output_quantity,
              r.crafting_time_s, r.station_type, r.skill_level,
              ci.quantity, ci.scu, ci.slot_name
       FROM game.crafting_recipes r
       JOIN game.crafting_ingredients ci ON ci.recipe_uuid = r.uuid AND ci.recipe_env = r.env
       LEFT JOIN game.items oi ON oi.uuid = r.output_item_uuid AND oi.env = r.env
       WHERE r.env = ? AND (ci.item_name = ? OR ci.item_uuid IN (SELECT uuid FROM game.items WHERE env = ? AND name = ?))
       ORDER BY r.category ASC, r.name ASC`),
      env,
      itemName,
      env,
      itemName,
    );
    return convertBigIntToNumber(rows).map((row) => normalizeRecipeRow(normalizeIngredientRow(row)));
  }

  async getRecipeByUuid(uuid: string, env = 'live'): Promise<Row | null> {
    const prisma = this.getClient(env);
    const rows = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT r.uuid, r.class_name, r.name, r.category,
              COALESCE(oi.name, r.output_item_name) AS output_item_name,
              r.output_item_uuid, r.output_quantity,
              r.crafting_time_s, r.station_type, r.skill_level
       FROM game.crafting_recipes r
       LEFT JOIN game.items oi ON oi.uuid = r.output_item_uuid AND oi.env = r.env
       WHERE r.env = ? AND r.uuid = ?`),
      env,
      uuid,
    );
    if (!rows.length) return null;

    const recipe = normalizeRecipeRow(convertBigIntToNumber(rows[0]));

    const ingredients = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT ci.id, COALESCE(i.name, ci.item_name) AS item_name, ci.item_uuid,
              ci.quantity, ci.is_optional, ci.scu, ci.min_quality, ci.slot_name
       FROM game.crafting_ingredients ci
       LEFT JOIN game.items i ON i.uuid = ci.item_uuid AND i.env = ci.recipe_env
       WHERE ci.recipe_env = ? AND ci.recipe_uuid = ?
       ORDER BY item_name`),
      env,
      uuid,
    );
    recipe.ingredients = convertBigIntToNumber(ingredients).map(normalizeIngredientRow);

    const modifiers = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT id, slot_name, property_name, property_uuid, unit_format,
              start_quality, end_quality, modifier_at_start, modifier_at_end
       FROM game.crafting_slot_modifiers
       WHERE recipe_env = ? AND recipe_uuid = ?
       ORDER BY slot_name, property_name`),
      env,
      uuid,
    );
    recipe.modifiers = convertBigIntToNumber(modifiers).map(normalizeModifierRow);

    const unlockMissions = await prisma.$queryRawUnsafe<Row[]>(
      toPostgres(`SELECT DISTINCT m.uuid, m.class_name, m.title, m.mission_type, m.faction, m.mission_giver,
              m.reward_min, m.reward_max, m.reward_currency, m.is_legal
       FROM game.missions m
       WHERE m.env = ? AND m.blueprint_reward_uuid = ?
       UNION
       SELECT DISTINCT m.uuid, m.class_name, m.title, m.mission_type, m.faction, m.mission_giver,
              m.reward_min, m.reward_max, m.reward_currency, m.is_legal
       FROM game.missions m
       JOIN game.mission_blueprint_rewards mbr ON mbr.mission_uuid = m.uuid AND mbr.mission_env = m.env
       WHERE m.env = ? AND mbr.blueprint_uuid = ?
       ORDER BY title ASC`),
      env,
      uuid,
      env,
      uuid,
    );
    recipe.unlock_missions = convertBigIntToNumber(unlockMissions);

    return recipe;
  }
}
