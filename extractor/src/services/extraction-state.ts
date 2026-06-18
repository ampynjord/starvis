import type { PoolClient } from 'pg';
import type { ExtractionModule, GameEnv } from '../module-registry.js';

export type ModuleRunner = (moduleName: ExtractionModule) => boolean;

export interface ExtractionSnapshot {
  oldShipsRaw: any[];
  oldCompsRaw: any[];
  oldItemsRaw: any[];
  oldCommoditiesRaw: any[];
  oldShips: Map<string, any>;
  oldComps: Map<string, any>;
  oldItems: Map<string, any>;
  oldCommodities: Map<string, any>;
}

export interface SavedCtmUrl {
  className: string;
  ctmUrl: string;
}

export async function captureExtractionSnapshot(conn: PoolClient, env: GameEnv): Promise<ExtractionSnapshot> {
  const { rows: oldShipsRaw } = await conn.query<any>(
    'SELECT uuid, class_name, name, manufacturer_code, role, career, mass, scm_speed, max_speed, total_hp, shield_hp, cargo_capacity, missile_damage_total, weapon_damage_total, crew_size FROM game.ships WHERE env = $1',
    [env],
  );
  const { rows: oldCompsRaw } = await conn.query<any>(
    'SELECT uuid, class_name, name, type, sub_type, size, grade, component_class, manufacturer_code FROM game.components WHERE env = $1',
    [env],
  );
  const { rows: oldItemsRaw } = await conn.query<any>(
    'SELECT uuid, class_name, name, type, sub_type, manufacturer_code FROM game.items WHERE env = $1',
    [env],
  );
  const { rows: oldCommoditiesRaw } = await conn.query<any>('SELECT uuid, class_name, name, type FROM game.commodities WHERE env = $1', [
    env,
  ]);

  return {
    oldShipsRaw,
    oldCompsRaw,
    oldItemsRaw,
    oldCommoditiesRaw,
    oldShips: new Map(oldShipsRaw.map((ship: any) => [ship.class_name, ship])),
    oldComps: new Map(oldCompsRaw.map((component: any) => [component.class_name, component])),
    oldItems: new Map(oldItemsRaw.map((item: any) => [item.class_name, item])),
    oldCommodities: new Map(oldCommoditiesRaw.map((commodity: any) => [commodity.class_name, commodity])),
  };
}

export async function cleanStaleGameData(conn: PoolClient, env: GameEnv, run: ModuleRunner): Promise<SavedCtmUrl[]> {
  let savedCtmUrls: SavedCtmUrl[] = [];

  if (run('ships')) {
    const { rows: ctmRows } = await conn.query<any>('SELECT class_name, ctm_url FROM game.ships WHERE ctm_url IS NOT NULL AND env = $1', [
      env,
    ]);
    savedCtmUrls = ctmRows.map((row: any) => ({ className: row.class_name, ctmUrl: row.ctm_url }));
    await conn.query('DELETE FROM game.ship_modules WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.ship_loadouts WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.ships WHERE env = $1', [env]);
  }

  if (run('components')) await conn.query('DELETE FROM game.components WHERE env = $1', [env]);
  if (run('items') || run('commodities')) {
    await conn.query('DELETE FROM game.items WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.commodities WHERE env = $1', [env]);
  }
  if (run('mining')) {
    await conn.query('DELETE FROM game.mining_composition_parts WHERE composition_env = $1', [env]);
    await conn.query('DELETE FROM game.mining_compositions WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.mining_elements WHERE env = $1', [env]);
  }
  if (run('missions')) {
    await conn.query('DELETE FROM game.mission_blueprint_rewards WHERE mission_env = $1', [env]);
    await conn.query('DELETE FROM game.missions WHERE env = $1', [env]);
  }
  if (run('crafting')) {
    await conn.query('DELETE FROM game.crafting_ingredients WHERE recipe_env = $1', [env]);
    await conn.query('DELETE FROM game.crafting_slot_modifiers WHERE recipe_env = $1', [env]);
    await conn.query('DELETE FROM game.crafting_recipes WHERE env = $1', [env]);
  }
  if (run('locations')) await conn.query('DELETE FROM game.locations WHERE env = $1', [env]);
  if (run('game-insights')) {
    await conn.query('DELETE FROM game.blueprint_rewards WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.loot_table_entries WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.loot_tables WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.loot_archetypes WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.reputation_scopes WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.reputation_standings WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.factions WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.ammo WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.inventory_containers WHERE env = $1', [env]);
    await conn.query('DELETE FROM game.game_insights WHERE env = $1', [env]);
  }

  return savedCtmUrls;
}

export async function restoreCtmUrls(conn: PoolClient, env: GameEnv, savedCtmUrls: SavedCtmUrl[]): Promise<number> {
  if (!savedCtmUrls.length) return 0;

  const values: unknown[] = [env];
  const rows = savedCtmUrls.map(({ className, ctmUrl }, index) => {
    const classNameParam = index * 2 + 2;
    const ctmUrlParam = index * 2 + 3;
    values.push(className, ctmUrl);
    return `($${classNameParam}::text, $${ctmUrlParam}::text)`;
  });

  await conn.query(
    `
    UPDATE game.ships AS ships
    SET ctm_url = saved.ctm_url
    FROM (VALUES ${rows.join(', ')}) AS saved(class_name, ctm_url)
    WHERE ships.env = $1 AND ships.class_name = saved.class_name
    `,
    values,
  );

  return savedCtmUrls.length;
}
