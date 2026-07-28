import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { EXTRACTION_MODULES, MODULE_DELETIONS } from '../src/module-registry.js';
import { cleanStaleGameData } from '../src/services/extraction-state.js';

/**
 * `MODULE_DELETIONS` dit ce qu'une extraction efface. Le nettoyage l'execute et
 * `--plan` l'affiche : si la declaration ment, le plan ment aussi, et c'est
 * exactement la promesse qu'on ne peut pas se permettre de rompre.
 *
 * Ces controles sont hors-ligne : ils lisent le schema Prisma, pas la base.
 */
const schemaSql = ['30-game.prisma', '20-rsi.prisma', '10-meta.prisma']
  .map((file) => readFileSync(resolve(import.meta.dirname, '../../db/prisma/schema', file), 'utf-8'))
  .join('\n');

/** Le corps de chaque modele, indexe par son nom physique `schema.table`. */
function modelsByTable(): Map<string, string> {
  const models = new Map<string, string>();
  for (const block of schemaSql.split(/^model\s+/m).slice(1)) {
    const modelName = block.match(/^(\w+)/)?.[1];
    const schema = block.match(/@@schema\("([^"]+)"\)/)?.[1];
    if (!modelName || !schema) continue;
    const mapped = block.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName;
    models.set(`${schema}.${mapped}`, block);
  }
  return models;
}

/** Les colonnes physiques d'un modele : le nom du champ, ou son `@map`. */
function columnsOf(block: string): Set<string> {
  const columns = new Set<string>();
  for (const line of block.split('\n')) {
    const field = line.match(/^\s{2}(\w+)\s+\S/);
    if (!field) continue;
    columns.add(line.match(/@map\("([^"]+)"\)/)?.[1] ?? field[1]);
  }
  return columns;
}

describe('MODULE_DELETIONS', () => {
  const models = modelsByTable();

  it('ne nomme que des tables qui existent dans le schema', () => {
    const unknown = MODULE_DELETIONS.filter((deletion) => !models.has(deletion.table)).map((deletion) => deletion.table);
    expect(unknown).toEqual([]);
  });

  it('ne nomme que des modules qui existent dans le registre', () => {
    const known = new Set<string>(EXTRACTION_MODULES);
    const unknown = MODULE_DELETIONS.flatMap((deletion) => deletion.modules).filter((moduleName) => !known.has(moduleName));
    expect(unknown).toEqual([]);
  });

  it('ne declare jamais deux fois la meme table', () => {
    const counts = new Map<string, number>();
    for (const deletion of MODULE_DELETIONS) counts.set(deletion.table, (counts.get(deletion.table) ?? 0) + 1);
    expect([...counts.entries()].filter(([, n]) => n > 1).map(([table]) => table)).toEqual([]);
  });

  it('filtre sur une colonne que la table porte vraiment', () => {
    // Les tables filles heritent de l'env de leur parent sous un autre nom.
    // Filtrer sur `env` y renverrait zero ligne : le plan annoncerait une
    // suppression sans effet la ou elle en a un, et le nettoyage laisserait des
    // orphelins derriere lui.
    for (const deletion of MODULE_DELETIONS) {
      const block = models.get(deletion.table);
      expect(block, `${deletion.table} absente du schema`).toBeDefined();
      expect(columnsOf(block as string), `${deletion.table}.${deletion.envColumn}`).toContain(deletion.envColumn);
    }
  });

  it('supprime les tables filles avant leurs parents', () => {
    // L'ordre de la declaration est celui des cles etrangeres. Inverser une
    // paire ferait echouer la suppression sur une violation de contrainte, et
    // l'extraction entiere avec elle.
    const position = (table: string): number => MODULE_DELETIONS.findIndex((deletion) => deletion.table === table);
    const childBeforeParent: [string, string][] = [
      ['game.ship_loadouts', 'game.ships'],
      ['game.ship_modules', 'game.ships'],
      ['game.mining_composition_parts', 'game.mining_compositions'],
      ['game.mining_compositions', 'game.mining_elements'],
      ['game.mission_blueprint_rewards', 'game.missions'],
      ['game.crafting_ingredients', 'game.crafting_recipes'],
      ['game.crafting_slot_modifiers', 'game.crafting_recipes'],
      ['game.loot_table_entries', 'game.loot_tables'],
    ];
    for (const [child, parent] of childBeforeParent) {
      expect(position(child), `${child} doit preceder ${parent}`).toBeLessThan(position(parent));
    }
  });
});

/**
 * La sequence exacte que produisait `cleanStaleGameData` avant que les
 * suppressions ne deviennent une declaration. Recopiee depuis la version
 * precedente du fichier : c'est le temoin, pas une reformulation.
 */
const LEGACY_ALL_DELETES = [
  'DELETE FROM game.ship_modules WHERE env = $1',
  'DELETE FROM game.ship_loadouts WHERE env = $1',
  'DELETE FROM game.ships WHERE env = $1',
  'DELETE FROM game.components WHERE env = $1',
  'DELETE FROM game.items WHERE env = $1',
  'DELETE FROM game.commodities WHERE env = $1',
  'DELETE FROM game.mining_composition_parts WHERE composition_env = $1',
  'DELETE FROM game.mining_compositions WHERE env = $1',
  'DELETE FROM game.mining_elements WHERE env = $1',
  'DELETE FROM game.mission_blueprint_rewards WHERE mission_env = $1',
  'DELETE FROM game.missions WHERE env = $1',
  'DELETE FROM game.crafting_ingredients WHERE recipe_env = $1',
  'DELETE FROM game.crafting_slot_modifiers WHERE recipe_env = $1',
  'DELETE FROM game.crafting_recipes WHERE env = $1',
  'DELETE FROM game.locations WHERE env = $1',
  'DELETE FROM game.blueprint_rewards WHERE env = $1',
  'DELETE FROM game.loot_table_entries WHERE env = $1',
  'DELETE FROM game.loot_tables WHERE env = $1',
  'DELETE FROM game.loot_archetypes WHERE env = $1',
  'DELETE FROM game.reputation_scopes WHERE env = $1',
  'DELETE FROM game.reputation_standings WHERE env = $1',
  'DELETE FROM game.factions WHERE env = $1',
  'DELETE FROM game.ammo WHERE env = $1',
  'DELETE FROM game.inventory_containers WHERE env = $1',
  'DELETE FROM game.game_insights WHERE env = $1',
];

function recordingConn(): { conn: PoolClient; deletes: string[] } {
  const deletes: string[] = [];
  const conn = {
    query: (sql: string) => {
      if (sql.trimStart().toUpperCase().startsWith('DELETE')) deletes.push(sql);
      return Promise.resolve({ rows: [] });
    },
  } as unknown as PoolClient;
  return { conn, deletes };
}

describe('cleanStaleGameData', () => {
  it('emet exactement les suppressions de la version imperative', async () => {
    const { conn, deletes } = recordingConn();
    await cleanStaleGameData(conn, 'live', () => true);
    expect(deletes).toEqual(LEGACY_ALL_DELETES);
  });

  it('ne touche que les tables du module choisi', async () => {
    const { conn, deletes } = recordingConn();
    await cleanStaleGameData(conn, 'live', (moduleName) => moduleName === 'mining');
    expect(deletes).toEqual(LEGACY_ALL_DELETES.filter((sql) => sql.includes('mining_')));
  });

  it('efface items et commodities ensemble, quel que soit celui demande', async () => {
    // Les deux sortent du meme extracteur : n'en effacer qu'un laisserait
    // l'autre desynchronise.
    for (const chosen of ['items', 'commodities'] as const) {
      const { conn, deletes } = recordingConn();
      await cleanStaleGameData(conn, 'live', (moduleName) => moduleName === chosen);
      expect(deletes, chosen).toEqual(['DELETE FROM game.items WHERE env = $1', 'DELETE FROM game.commodities WHERE env = $1']);
    }
  });
});
