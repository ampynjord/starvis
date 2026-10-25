import type { PoolClient } from 'pg';
import { type ExtractionModule, type GameEnv, MODULE_DELETIONS } from '../module-registry.js';

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

  // Les URL de modele 3D viennent d'un scraping lent et ne sont pas dans le
  // P4K : elles se releveraient perdues a chaque extraction de vaisseaux. On
  // les met de cote avant la suppression, `restoreCtmUrls` les repose apres.
  if (run('ships')) {
    const { rows: ctmRows } = await conn.query<any>('SELECT class_name, ctm_url FROM game.ships WHERE ctm_url IS NOT NULL AND env = $1', [
      env,
    ]);
    savedCtmUrls = ctmRows.map((row: any) => ({ className: row.class_name, ctmUrl: row.ctm_url }));
  }

  // Suit `MODULE_DELETIONS` dans l'ordre, qui est celui des dependances de cles
  // etrangeres. C'est la meme table que lit `--plan` : ce qui est annonce est
  // donc exactement ce qui est efface.
  for (const deletion of MODULE_DELETIONS) {
    if (!deletion.modules.some(run)) continue;
    await conn.query(`DELETE FROM ${deletion.table} WHERE ${deletion.envColumn} = $1`, [env]);
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

const SNAPSHOT_TABLES: ReadonlyArray<{
  table: string;
  envCols: readonly string[];
}> = [
  { table: 'ships', envCols: ['env'] },
  { table: 'ship_modules', envCols: ['env'] },
  { table: 'ship_paints', envCols: ['env'] },
  { table: 'components', envCols: ['env'] },
  { table: 'items', envCols: ['env'] },
  { table: 'commodities', envCols: ['env'] },
  { table: 'mining_elements', envCols: ['env'] },
  { table: 'mining_compositions', envCols: ['env'] },
  { table: 'mining_composition_parts', envCols: ['composition_env', 'element_env'] },
  { table: 'crafting_recipes', envCols: ['env'] },
  { table: 'crafting_ingredients', envCols: ['recipe_env'] },
  { table: 'crafting_slot_modifiers', envCols: ['recipe_env'] },
  { table: 'missions', envCols: ['env', 'blueprint_reward_env'] },
  { table: 'mission_brokers', envCols: ['env'] },
  { table: 'locations', envCols: ['env'] },
  { table: 'location_amenity_types', envCols: ['env'] },
  { table: 'location_amenities', envCols: ['env'] },
  { table: 'game_insights', envCols: ['env'] },
  { table: 'factions', envCols: ['env'] },
  { table: 'reputation_standings', envCols: ['env'] },
  { table: 'reputation_scopes', envCols: ['env'] },
  { table: 'loot_tables', envCols: ['env'] },
  { table: 'loot_table_entries', envCols: ['env'] },
  { table: 'loot_archetypes', envCols: ['env'] },
  { table: 'blueprint_rewards', envCols: ['env'] },
  { table: 'ammo', envCols: ['env'] },
  { table: 'inventory_containers', envCols: ['env'] },
  { table: 'uex_terminals', envCols: ['env'] },
  { table: 'uex_vehicle_prices', envCols: ['env'] },
  { table: 'uex_market_prices', envCols: ['env'] },
];

/**
 * Archive an immutable/queryable snapshot of `sourceEnv` under `env = versionTag`
 * (e.g. `4.7.2`) so historical patches remain queryable via `?env=4.7.2` or `?version=4.7.2`.
 */
export async function archiveVersionSnapshot(
  conn: PoolClient,
  sourceEnv: GameEnv,
  rawVersion: string | null | undefined,
  onProgress?: (msg: string) => void,
): Promise<string | null> {
  if (!rawVersion) return null;
  const match = rawVersion.trim().match(/^(\d+\.\d+(?:\.\d+)?)/);
  const versionEnv = match?.[1]?.toLowerCase() ?? null;
  if (!versionEnv || versionEnv === sourceEnv || versionEnv.length > 10) return null;

  await conn.query('SAVEPOINT archive_version_snapshot');
  try {
    onProgress?.(`Archiving patch snapshot [${sourceEnv} → ${versionEnv}]…`);

    for (let i = SNAPSHOT_TABLES.length - 1; i >= 0; i--) {
      const { table, envCols } = SNAPSHOT_TABLES[i];
      await conn.query(`DELETE FROM game.${table} WHERE ${envCols[0]} = $1`, [versionEnv]);
    }

    for (const { table, envCols } of SNAPSHOT_TABLES) {
      const { rows: cols } = await conn.query<{ column_name: string; column_default: string | null }>(
        `SELECT column_name, column_default
         FROM information_schema.columns
         WHERE table_schema = 'game' AND table_name = $1
         ORDER BY ordinal_position`,
        [table],
      );
      if (!cols.length) continue;

      const insertCols = cols.filter((c) => !(c.column_name === 'id' && c.column_default?.startsWith('nextval'))).map((c) => c.column_name);
      const selectExprs = insertCols.map((col) => {
        if (envCols.includes(col)) {
          return col === 'blueprint_reward_env' ? `CASE WHEN blueprint_reward_uuid IS NOT NULL THEN $2 ELSE NULL END` : '$2';
        }
        return `"${col}"`;
      });

      await conn.query(
        `INSERT INTO game.${table} (${insertCols.map((c) => `"${c}"`).join(', ')})
         SELECT ${selectExprs.join(', ')}
         FROM game.${table}
         WHERE "${envCols[0]}" = $1
         ON CONFLICT DO NOTHING`,
        [sourceEnv, versionEnv],
      );
    }

    await conn.query('RELEASE SAVEPOINT archive_version_snapshot');
    onProgress?.(`✅ Archived patch snapshot for version ${versionEnv}`);
    return versionEnv;
  } catch (err) {
    await conn.query('ROLLBACK TO SAVEPOINT archive_version_snapshot').catch(() => undefined);
    onProgress?.(`⚠️ Patch snapshot skipped (${versionEnv}): ${(err as Error).message}`);
    return null;
  }
}
