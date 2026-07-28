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
