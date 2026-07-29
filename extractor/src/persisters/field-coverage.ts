/**
 * Le taux de remplissage de chaque colonne, relevé à chaque extraction.
 *
 * Le garde-fou existant compare des *nombres de lignes* : une extraction qui
 * perdrait la moitié des vaisseaux est rejetée. Il ne voit rien, en revanche,
 * quand une colonne se vide en gardant ses lignes.
 *
 * C'est pourtant le mode d'échec le plus courant ici. Deux exemples trouvés le
 * 29 juillet 2026 : la carte des franchises lisait `name` là où le jeu écrit
 * `localizedName`, et l'extraction des coordonnées cherchait un champ `position`
 * qui n'existe pas dans le `StarMapObject`. Dans les deux cas l'extraction
 * réussissait, le compte de lignes était juste, et la colonne était vide depuis
 * on ne sait quand.
 */
import type { PoolClient } from 'pg';
import logger from '../logger.js';
import type { GameEnv } from '../module-registry.js';

/**
 * Les tables surveillées.
 *
 * Celles dont l'extraction remplit les colonnes une par une, donc celles où un
 * champ renommé côté jeu passe inaperçu. Les tables de jointure n'y sont pas :
 * leurs colonnes sont des clés, elles ne se vident pas à moitié.
 */
const WATCHED_TABLES = [
  'game.ships',
  'game.components',
  'game.items',
  'game.commodities',
  'game.locations',
  'game.missions',
  'game.shops',
  'game.crafting_recipes',
  'game.mining_elements',
] as const;

/** En deçà, un pourcentage n'a pas de sens : trois lignes sur cinq ne dit rien. */
const MIN_ROWS = 20;

/**
 * Une chute de plus d'un quart du remplissage.
 *
 * Le seuil est volontairement large : il vise l'effondrement — un champ qui
 * passe de 100 % à 0 % parce que le jeu l'a renommé — pas la variation normale
 * d'un patch qui ajoute des entités incomplètes.
 */
const DROP_THRESHOLD = 0.25;

export interface CoverageDrop {
  table: string;
  column: string;
  before: number;
  after: number;
}

export interface CoverageReport {
  drops: CoverageDrop[];
  /**
   * Les colonnes vides depuis toujours.
   *
   * La comparaison entre deux relevés ne les voit pas : une colonne qui n'a
   * jamais rien porté ne chute pas. C'est pourtant le meme defaut vu
   * autrement — `game_insights` remplit trois valeurs numeriques sur 6 032
   * lignes parce que l'extracteur devine les noms de champs du jeu au lieu de
   * les observer.
   */
  alwaysEmpty: { table: string; column: string }[];
}

interface CoverageRow {
  table: string;
  column: string;
  rowCount: number;
  nonNull: number;
}

async function measure(conn: PoolClient, env: GameEnv): Promise<CoverageRow[]> {
  const rows: CoverageRow[] = [];

  for (const table of WATCHED_TABLES) {
    const [schema, name] = table.split('.');
    const { rows: cols } = await conn.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2 AND is_nullable = 'YES'
        ORDER BY ordinal_position`,
      [schema, name],
    );
    if (cols.length === 0) continue;

    // Un seul balayage par table : une requête par colonne ferait cent
    // parcours complets là où l'agrégat les fait tous en un.
    const projection = cols.map((c) => `count("${c.column_name}")::int AS "${c.column_name}"`).join(', ');
    const { rows: measured } = await conn.query<Record<string, number>>(
      `SELECT count(*)::int AS __rows, ${projection} FROM ${table} WHERE env = $1`,
      [env],
    );
    const total = measured[0].__rows;
    if (total < MIN_ROWS) continue;

    for (const col of cols) {
      rows.push({ table, column: col.column_name, rowCount: total, nonNull: measured[0][col.column_name] });
    }
  }

  return rows;
}

/**
 * Relève le remplissage, le compare au relevé précédent, et rend les chutes.
 *
 * Ne lève pas : une colonne effondrée doit être signalée fort, mais elle ne
 * justifie pas d'annuler une extraction par ailleurs valide — le garde-fou sur
 * les nombres de lignes garde ce rôle-là.
 */
export async function recordFieldCoverage(
  conn: PoolClient,
  env: GameEnv,
  extractionId: number | null,
  onProgress?: (msg: string) => void,
): Promise<CoverageReport> {
  const current = await measure(conn, env);
  if (current.length === 0) return { drops: [], alwaysEmpty: [] };

  const { rows: previous } = await conn.query<{ table_name: string; column_name: string; row_count: number; non_null_count: number }>(
    `SELECT DISTINCT ON (table_name, column_name) table_name, column_name, row_count, non_null_count
       FROM meta.field_coverage
      WHERE env = $1
      ORDER BY table_name, column_name, id DESC`,
    [env],
  );
  const before = new Map(previous.map((row) => [`${row.table_name}.${row.column_name}`, row]));

  const drops: CoverageDrop[] = [];
  for (const row of current) {
    const past = before.get(`${row.table}.${row.column}`);
    if (!past || past.row_count < MIN_ROWS) continue;
    const pastRate = past.non_null_count / past.row_count;
    const nowRate = row.nonNull / row.rowCount;
    if (pastRate - nowRate > DROP_THRESHOLD) {
      drops.push({ table: row.table, column: row.column, before: pastRate, after: nowRate });
    }
  }

  const values: unknown[] = [];
  const tuples = current.map((row, index) => {
    const base = index * 6;
    values.push(extractionId, env, row.table, row.column, row.rowCount, row.nonNull);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });
  await conn.query(
    `INSERT INTO meta.field_coverage (extraction_id, env, table_name, column_name, row_count, non_null_count)
     VALUES ${tuples.join(', ')}`,
    values,
  );

  const alwaysEmpty = current.filter((row) => row.nonNull === 0).map((row) => ({ table: row.table, column: row.column }));

  onProgress?.(`Field coverage: ${current.length} columns measured across ${WATCHED_TABLES.length} tables, ${alwaysEmpty.length} empty`);
  for (const drop of drops) {
    const message = `Field coverage collapsed: ${drop.table}.${drop.column} ${(drop.before * 100).toFixed(1)}% → ${(drop.after * 100).toFixed(1)}%`;
    logger.warn(message, { module: 'field-coverage' });
    onProgress?.(`⚠️ ${message}`);
  }
  if (alwaysEmpty.length > 0) {
    // Journalise sans alerter : une colonne vide est souvent un manque connu et
    // assume — `cooling_rate` chez les refroidisseurs — pas un incident. La
    // liste sert a ce qu'on ne l'oublie pas, pas a reveiller quelqu'un.
    logger.info(`Columns with no value at all: ${alwaysEmpty.map((c) => `${c.table}.${c.column}`).join(', ')}`, {
      module: 'field-coverage',
    });
  }

  return { drops, alwaysEmpty };
}
