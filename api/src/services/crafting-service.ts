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
    ingredient_count: Number(row.ingredient_count ?? 0),
    optional_ingredient_count: Number(row.optional_ingredient_count ?? 0),
    modifier_count: Number(row.modifier_count ?? 0),
    total_scu: row.total_scu == null ? null : Number(row.total_scu),
    min_quality_required: row.min_quality_required == null ? null : Number(row.min_quality_required),
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

  private async getInsightPage(
    table: 'game.blueprint_rewards' | 'game.loot_tables',
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
    outputItemUuid?: string;
  }): Promise<PaginatedResult> {
    const { env = 'live', category, search, page = 1, limit = 50, skillLevel, stationType, outputItemUuid } = opts;
    const prisma = this.getClient(env);
    const safeLimit = Math.min(Math.max(1, limit), 1500);
    const offset = (page - 1) * safeLimit;

    const where: string[] = ['r.env = ?'];
    const params: (string | number)[] = [env];

    if (category) {
      where.push('r.category = ?');
      params.push(category);
    }
    if (outputItemUuid) {
      where.push('r.output_item_uuid = ?');
      params.push(outputItemUuid);
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
              r.crafting_time_s, r.station_type, r.skill_level, r.p4k_path,
              COALESCE(ing.ingredient_count, 0) AS ingredient_count,
              COALESCE(ing.optional_ingredient_count, 0) AS optional_ingredient_count,
              COALESCE(mod.modifier_count, 0) AS modifier_count,
              ing.total_scu,
              ing.min_quality_required,
              (SELECT COUNT(DISTINCT sub_m.uuid) FROM (
                SELECT uuid FROM game.missions WHERE blueprint_reward_uuid = r.uuid AND env = r.env
                UNION ALL
                SELECT mission_uuid FROM game.mission_blueprint_rewards WHERE blueprint_uuid = r.uuid AND blueprint_env = r.env
              ) sub_m) AS missions_count
       FROM game.crafting_recipes r
       LEFT JOIN game.items oi ON oi.uuid = r.output_item_uuid AND oi.env = r.env
       LEFT JOIN (
         SELECT recipe_uuid, recipe_env,
                COUNT(*) AS ingredient_count,
                COUNT(*) FILTER (WHERE is_optional = true) AS optional_ingredient_count,
                SUM(NULLIF(scu, 0)) AS total_scu,
                MAX(NULLIF(min_quality, 0)) AS min_quality_required
         FROM game.crafting_ingredients
         GROUP BY recipe_uuid, recipe_env
       ) ing ON ing.recipe_uuid = r.uuid AND ing.recipe_env = r.env
       LEFT JOIN (
         SELECT recipe_uuid, recipe_env, COUNT(*) AS modifier_count
         FROM game.crafting_slot_modifiers
         GROUP BY recipe_uuid, recipe_env
       ) mod ON mod.recipe_uuid = r.uuid AND mod.recipe_env = r.env
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

  async getBlueprintRewards(opts: { env?: string; search?: string; page?: number; limit?: number }): Promise<PaginatedResult> {
    return this.getInsightPage(
      'game.blueprint_rewards',
      opts,
      ['pool_class_name', 'blueprint_class_name'],
      'COALESCE(pool_class_name, blueprint_class_name) ASC, reward_index ASC',
    );
  }

  async getLootTables(opts: { env?: string; search?: string; page?: number; limit?: number }): Promise<PaginatedResult> {
    return this.getInsightPage('game.loot_tables', opts, ['name', 'class_name'], 'COALESCE(name, class_name) ASC');
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
              r.crafting_time_s, r.station_type, r.skill_level, r.p4k_path,
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
              r.crafting_time_s, r.station_type, r.skill_level, r.p4k_path, r.raw_json,
              COALESCE(ing.ingredient_count, 0) AS ingredient_count,
              COALESCE(ing.optional_ingredient_count, 0) AS optional_ingredient_count,
              COALESCE(mod.modifier_count, 0) AS modifier_count,
              ing.total_scu,
              ing.min_quality_required
       FROM game.crafting_recipes r
       LEFT JOIN game.items oi ON oi.uuid = r.output_item_uuid AND oi.env = r.env
       LEFT JOIN (
         SELECT recipe_uuid, recipe_env,
                COUNT(*) AS ingredient_count,
                COUNT(*) FILTER (WHERE is_optional = true) AS optional_ingredient_count,
                SUM(NULLIF(scu, 0)) AS total_scu,
                MAX(NULLIF(min_quality, 0)) AS min_quality_required
         FROM game.crafting_ingredients
         GROUP BY recipe_uuid, recipe_env
       ) ing ON ing.recipe_uuid = r.uuid AND ing.recipe_env = r.env
       LEFT JOIN (
         SELECT recipe_uuid, recipe_env, COUNT(*) AS modifier_count
         FROM game.crafting_slot_modifiers
         GROUP BY recipe_uuid, recipe_env
       ) mod ON mod.recipe_uuid = r.uuid AND mod.recipe_env = r.env
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
              start_quality, end_quality, modifier_at_start, modifier_at_end, modifier_type
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
