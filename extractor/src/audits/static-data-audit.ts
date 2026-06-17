import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { Client } from 'pg';
import { DataForgeService } from '../dataforge-service.js';
import { DEFAULT_P4K_PATHS } from '../extractor-config.js';
import type { GameEnv } from '../module-registry.js';

type AuditStatus = 'ok' | 'warn' | 'fail' | 'skipped';

interface AuditCheck {
  id: string;
  status: AuditStatus;
  message: string;
  value?: unknown;
}

interface CountRow {
  schema: string;
  table: string;
  rows: number;
}

interface StaticAuditReport {
  generatedAt: string;
  env: string;
  strict: boolean;
  database?: {
    connected: boolean;
    counts: CountRow[];
    completeness: Record<string, unknown>;
  };
  p4k?: {
    path: string;
    loaded: boolean;
    stats?: unknown;
    structSummary?: unknown[];
    highValueUnmappedStructs?: unknown[];
    fileFamilies?: unknown[];
  };
  checks: AuditCheck[];
}

const HIGH_VALUE_STRUCT_KEYWORDS = [
  'vehicle',
  'ship',
  'item',
  'weapon',
  'armor',
  'shop',
  'commodity',
  'inventory',
  'mission',
  'contract',
  'reputation',
  'faction',
  'loot',
  'blueprint',
  'craft',
  'manufacturer',
  'starmap',
  'location',
  'zone',
  'quantum',
  'mining',
  'refinery',
  'fuel',
] as const;

const MAPPED_STRUCT_PATTERNS = [
  /EntityClassDefinition/i,
  /Vehicle/i,
  /SCItem/i,
  /Shop/i,
  /Commodity/i,
  /Contract/i,
  /Mission/i,
  /Reputation/i,
  /Faction/i,
  /Loot/i,
  /Blueprint/i,
  /Craft/i,
  /StarMap/i,
  /Location/i,
  /Manufacturer/i,
  /Inventory/i,
  /Ammo/i,
] as const;

const P4K_FILE_FAMILIES = [
  { family: 'dataforge', pattern: /(^|[\\/])Game2\.dcb$/i },
  { family: 'localization', pattern: /[\\/]global\.ini$/i },
  { family: 'shop-inventories', pattern: /ShopInventor(y|ies).*\.(json|xml)$/i },
  { family: 'prefabs', pattern: /[\\/]Prefabs[\\/].*\.xml$/i },
  { family: 'objects-containers', pattern: /[\\/]Objects[\\/].*\.(xml|json|socpak)$/i },
  { family: 'entities', pattern: /[\\/]Entities[\\/].*\.(xml|json)$/i },
  { family: 'libs-config', pattern: /[\\/]Libs[\\/]Config[\\/].*\.(xml|json|ini|cfg)$/i },
  { family: 'starmap-assets', pattern: /[\\/]Starmap[\\/].*\.(dds|png|jpg|json|xml)$/i },
  { family: 'ui-data', pattern: /[\\/]UI[\\/].*\.(json|xml|gfx|swf)$/i },
] as const;

function argValue(argv: string[], name: string): string | undefined {
  const prefix = `${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name);
}

function firstExisting(paths: readonly string[]): string | undefined {
  return paths.find((path) => existsSync(path));
}

function loadEnv(argv: string[]) {
  const envFile = hasFlag(argv, '--prod-db')
    ? firstExisting(['extractor/.env.extractor.prod', '.env.extractor.prod'])
    : firstExisting(['extractor/.env.extractor.dev', '.env.extractor.dev', '.env.dev']);
  if (envFile) dotenv.config({ path: envFile, override: true });
  dotenv.config();
}

function env(name: string, fallback?: string): string {
  return process.env[name] ?? fallback ?? '';
}

function numberEnv(name: string, fallback: number): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function addCheck(checks: AuditCheck[], id: string, status: AuditStatus, message: string, value?: unknown) {
  checks.push({ id, status, message, value });
}

async function tableExists(client: Client, schema: string, table: string): Promise<boolean> {
  const result = await client.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS "exists"`,
    [schema, table],
  );
  return result.rows[0]?.exists === true;
}

async function countTable(client: Client, schema: string, table: string, envName?: string): Promise<number | null> {
  if (!(await tableExists(client, schema, table))) return null;
  const columns = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  const hasEnv = columns.rows.some((row) => row.column_name === 'env');
  const sql =
    hasEnv && envName
      ? `SELECT COUNT(*)::int AS rows FROM ${schema}.${table} WHERE env = $1`
      : `SELECT COUNT(*)::int AS rows FROM ${schema}.${table}`;
  const result = await client.query<{ rows: number }>(sql, hasEnv && envName ? [envName] : []);
  return result.rows[0]?.rows ?? 0;
}

async function scalar<T>(client: Client, sql: string, params: unknown[] = []): Promise<T | null> {
  const result = await client.query<Record<string, T>>(sql, params);
  const first = result.rows[0];
  if (!first) return null;
  return Object.values(first)[0] ?? null;
}

async function collectDatabaseAudit(client: Client, envName: string, checks: AuditCheck[], strict: boolean) {
  const gameTables = [
    'manufacturers',
    'ships',
    'ship_loadouts',
    'ship_modules',
    'ship_paints',
    'components',
    'items',
    'commodities',
    'shops',
    'shop_inventory',
    'commodity_prices',
    'mining_elements',
    'mining_compositions',
    'missions',
    'crafting_recipes',
    'locations',
    'game_insights',
    'factions',
    'reputation_standings',
    'reputation_scopes',
    'loot_tables',
    'loot_table_entries',
    'loot_archetypes',
    'blueprint_rewards',
    'ammo',
    'inventory_containers',
  ];
  const rsiTables = ['ship_matrix', 'ship_galleries', 'galactapedia', 'comm_links', 'starmap_locations'];

  const counts: CountRow[] = [];
  for (const table of gameTables) {
    const rows = await countTable(client, 'game', table, envName);
    if (rows === null) {
      addCheck(checks, `db.game.${table}`, strict ? 'fail' : 'warn', `Missing game.${table}`);
      continue;
    }
    counts.push({ schema: 'game', table, rows });
  }
  for (const table of rsiTables) {
    const rows = await countTable(client, 'rsi', table);
    if (rows === null) {
      addCheck(checks, `db.rsi.${table}`, strict ? 'fail' : 'warn', `Missing rsi.${table}`);
      continue;
    }
    counts.push({ schema: 'rsi', table, rows });
  }

  const countMap = new Map(counts.map((row) => [`${row.schema}.${row.table}`, row.rows]));
  for (const required of ['game.ships', 'game.components', 'game.items', 'game.locations', 'rsi.ship_matrix', 'rsi.starmap_locations']) {
    const rows = countMap.get(required) ?? 0;
    if (rows === 0) addCheck(checks, `count.${required}`, strict ? 'fail' : 'warn', `${required} is empty`);
  }

  const completeness = {
    shipsWithoutMatrix: await scalar<number>(client, `SELECT COUNT(*)::int FROM game.ships WHERE env = $1 AND ship_matrix_id IS NULL`, [
      envName,
    ]),
    shipsWithoutLoadout: await scalar<number>(
      client,
      `SELECT COUNT(*)::int
       FROM game.ships s
       WHERE s.env = $1 AND NOT EXISTS (
         SELECT 1 FROM game.ship_loadouts l WHERE l.ship_uuid = s.uuid AND l.env = s.env
       )`,
      [envName],
    ),
    componentsWithoutCategory: await scalar<number>(
      client,
      `SELECT COUNT(*)::int FROM game.components
       WHERE env = $1 AND (game_component_category IS NULL OR game_component_category = '')`,
      [envName],
    ),
    itemsWithoutSubtype: await scalar<number>(
      client,
      `SELECT COUNT(*)::int FROM game.items WHERE env = $1 AND (sub_type IS NULL OR sub_type = '')`,
      [envName],
    ),
    shopsWithoutLocation: await scalar<number>(
      client,
      `SELECT COUNT(*)::int FROM game.shops
       WHERE env = $1 AND location_uuid IS NULL AND canonical_location_key IS NULL`,
      [envName],
    ),
    inventoryWithoutResolvedTarget: await scalar<number>(
      client,
      `SELECT COUNT(*)::int FROM game.shop_inventory
       WHERE component_uuid IS NULL AND (component_class_name IS NULL OR component_class_name = '')`,
    ),
    commodityPricesWithoutPrice: await scalar<number>(
      client,
      `SELECT COUNT(*)::int FROM game.commodity_prices
       WHERE buy_price IS NULL AND sell_price IS NULL`,
    ),
    locationsWithoutRsiLink: await scalar<number>(
      client,
      `SELECT COUNT(*)::int FROM game.locations WHERE env = $1 AND rsi_starmap_location_id IS NULL`,
      [envName],
    ),
    rsiStarmapUnlinked: await scalar<number>(
      client,
      `SELECT COUNT(*)::int
       FROM rsi.starmap_locations r
       WHERE NOT EXISTS (
         SELECT 1 FROM game.locations l WHERE l.env = $1 AND l.rsi_starmap_location_id = r.id
       )`,
      [envName],
    ),
  };

  for (const [key, value] of Object.entries(completeness)) {
    if (typeof value === 'number' && value > 0) {
      addCheck(checks, `completeness.${key}`, 'warn', `${key}: ${value}`, value);
    }
  }

  return { counts, completeness };
}

function resolveP4KPath(argv: string[], envName: GameEnv): string | null {
  const explicit = argValue(argv, '--p4k') ?? process.env.P4K_PATH;
  if (explicit) return explicit;
  const envSpecific = envName === 'ptu' ? process.env.P4K_PTU_PATH : process.env.P4K_LIVE_PATH;
  if (envSpecific) return envSpecific;
  return DEFAULT_P4K_PATHS[envName]?.find((path) => existsSync(path)) ?? null;
}

async function collectP4KAudit(p4kPath: string, checks: AuditCheck[]) {
  const df = new DataForgeService(p4kPath);
  await df.init();
  try {
    const info = await df.loadDataForge();
    const provider = df.getProvider();
    const stats = provider ? await provider.getStats() : null;
    const fileFamilies = provider ? await provider.getFamilyStats(P4K_FILE_FAMILIES) : [];
    const structSummary = df.getStructRecordSummary(3);
    const highValueUnmappedStructs = structSummary
      .filter((item) => item.records > 0)
      .filter((item) => HIGH_VALUE_STRUCT_KEYWORDS.some((keyword) => item.structName.toLowerCase().includes(keyword)))
      .filter((item) => !MAPPED_STRUCT_PATTERNS.some((pattern) => pattern.test(item.structName)))
      .slice(0, 50);

    if (highValueUnmappedStructs.length > 0) {
      addCheck(
        checks,
        'p4k.highValueUnmappedStructs',
        'warn',
        `${highValueUnmappedStructs.length} high-value DataForge structs may be unmapped`,
        {
          examples: highValueUnmappedStructs.slice(0, 10),
        },
      );
    }
    for (const family of fileFamilies) {
      if (family.count === 0 && ['dataforge', 'localization'].includes(family.family)) {
        addCheck(checks, `p4k.family.${family.family}`, 'fail', `${family.family} files were not found`);
      }
    }

    return {
      path: p4kPath,
      loaded: true,
      stats: { info, archive: stats },
      structSummary: structSummary.slice(0, 100),
      highValueUnmappedStructs,
      fileFamilies,
    };
  } finally {
    await df.close();
  }
}

export async function runStaticDataAudit(argv = process.argv.slice(2)): Promise<StaticAuditReport> {
  loadEnv(argv);
  const envName = (argValue(argv, '--env') ?? process.env.STARVIS_ENV ?? 'live') as GameEnv;
  const strict = hasFlag(argv, '--strict') || process.env.STARVIS_AUDIT_STRICT === 'true';
  const p4kOnly = hasFlag(argv, '--p4k-only');
  const dbOnly = hasFlag(argv, '--db-only');
  const checks: AuditCheck[] = [];

  const report: StaticAuditReport = {
    generatedAt: new Date().toISOString(),
    env: envName,
    strict,
    checks,
  };

  if (!p4kOnly) {
    const client = new Client({
      host: env('DB_HOST', '127.0.0.1'),
      port: numberEnv('DB_PORT', numberEnv('DB_EXTERNAL_PORT', 5432)),
      database: env('DB_NAME', 'starvis'),
      user: env('DB_USER', 'starvis_user'),
      password: env('DB_PASSWORD', 'starvis_pass'),
    });
    await client.connect();
    try {
      const db = await collectDatabaseAudit(client, envName, checks, strict);
      report.database = { connected: true, ...db };
    } finally {
      await client.end();
    }
  } else {
    addCheck(checks, 'db.skipped', 'skipped', 'Database audit skipped by --p4k-only');
  }

  if (!dbOnly) {
    const p4kPath = resolveP4KPath(argv, envName);
    if (!p4kPath) {
      addCheck(
        checks,
        'p4k.skipped',
        strict ? 'fail' : 'warn',
        'P4K path not found. Pass --p4k, set P4K_PATH/P4K_LIVE_PATH, or use --db-only.',
      );
    } else {
      report.p4k = await collectP4KAudit(p4kPath, checks);
    }
  } else {
    addCheck(checks, 'p4k.skipped', 'skipped', 'P4K audit skipped by --db-only');
  }

  const output = argValue(argv, '--output');
  if (output) await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return report;
}

export function printStaticDataAudit(report: StaticAuditReport) {
  const failures = report.checks.filter((check) => check.status === 'fail');
  const warnings = report.checks.filter((check) => check.status === 'warn');
  const skipped = report.checks.filter((check) => check.status === 'skipped');
  console.log(`STARVIS static data audit\nenv: ${report.env}\nstrict: ${report.strict}\n`);
  if (report.database) {
    const gameRows = report.database.counts.filter((row) => row.schema === 'game').reduce((sum, row) => sum + row.rows, 0);
    const rsiRows = report.database.counts.filter((row) => row.schema === 'rsi').reduce((sum, row) => sum + row.rows, 0);
    console.log(`Database: ${report.database.counts.length} tables checked (${gameRows} game rows, ${rsiRows} rsi rows)`);
  }
  if (report.p4k?.loaded) {
    console.log(`P4K: loaded ${report.p4k.path}`);
  }
  console.log(`Warnings: ${warnings.length}`);
  for (const warning of warnings.slice(0, 30)) console.warn(`WARN ${warning.message}`);
  if (warnings.length > 30) console.warn(`WARN ... ${warnings.length - 30} more warning(s) omitted`);
  console.log(`Skipped: ${skipped.length}`);
  console.log(`Failures: ${failures.length}`);
  for (const failure of failures) console.error(`FAIL ${failure.message}`);
}
