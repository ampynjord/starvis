#!/usr/bin/env node
import { config } from 'dotenv';
import * as mysql from 'mysql2/promise';

config({ path: '.env.extractor' });

type GameEnv = 'live' | 'ptu' | 'eptu' | 'custom' | 'all';

type CountRow = { game_env: string; total: number };
type CollisionRow = { game_env: string; collision_groups: number; collided_rows: number };

type EntityDef = {
  name: string;
  table: string;
  canonicalKeyCol: string;
  normalizedCol: string;
  sourceTypeCol: string;
  sourceNameCol: string;
};

const ENTITIES: EntityDef[] = [
  {
    name: 'components',
    table: 'components',
    canonicalKeyCol: 'canonical_component_key',
    normalizedCol: 'normalized_name',
    sourceTypeCol: 'source_type',
    sourceNameCol: 'source_name',
  },
  {
    name: 'items',
    table: 'items',
    canonicalKeyCol: 'canonical_item_key',
    normalizedCol: 'normalized_name',
    sourceTypeCol: 'source_type',
    sourceNameCol: 'source_name',
  },
  {
    name: 'commodities',
    table: 'commodities',
    canonicalKeyCol: 'canonical_commodity_key',
    normalizedCol: 'normalized_name',
    sourceTypeCol: 'source_type',
    sourceNameCol: 'source_name',
  },
  {
    name: 'shops',
    table: 'shops',
    canonicalKeyCol: 'canonical_shop_key',
    normalizedCol: 'normalized_name',
    sourceTypeCol: 'source_type',
    sourceNameCol: 'source_name',
  },
];

function parseArgs(): { env: GameEnv; strict: boolean } {
  const args = process.argv.slice(2);
  let env: GameEnv = 'all';
  let strict = false;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--env' || args[i] === '-e') && args[i + 1]) {
      const v = args[++i].toLowerCase() as GameEnv;
      if (!['live', 'ptu', 'eptu', 'custom', 'all'].includes(v)) {
        console.error(`Invalid --env value: ${v}. Expected live|ptu|eptu|custom|all`);
        process.exit(1);
      }
      env = v;
      continue;
    }

    if (args[i] === '--strict') {
      strict = true;
      continue;
    }
  }

  return { env, strict };
}

function printMap(label: string, m: Map<string, number>): void {
  const entries = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const formatted = entries.map(([env, n]) => `${env}:${n}`).join(' | ');
  console.log(`${label.padEnd(42)} ${formatted || 'none'}`);
}

function envWhere(alias: string, targetEnv: GameEnv): { clause: string; params: unknown[] } {
  if (targetEnv === 'all') return { clause: '', params: [] };
  return { clause: `WHERE ${alias}.game_env = ?`, params: [targetEnv] };
}

async function queryCountByEnv(conn: mysql.Pool, sql: string, params: unknown[]): Promise<Map<string, number>> {
  const [rows] = await conn.query<CountRow[]>(sql, params);
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.game_env, Number(r.total));
  return m;
}

async function queryCollisionsByEnv(conn: mysql.Pool, sql: string, params: unknown[]): Promise<Map<string, { groups: number; rows: number }>> {
  const [rows] = await conn.query<CollisionRow[]>(sql, params);
  const m = new Map<string, { groups: number; rows: number }>();
  for (const r of rows) {
    m.set(r.game_env, {
      groups: Number(r.collision_groups),
      rows: Number(r.collided_rows),
    });
  }
  return m;
}

async function main() {
  const { env, strict } = parseArgs();

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || '',
    waitForConnections: true,
    connectionLimit: 2,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5000,
  };

  if (!dbConfig.user || !dbConfig.password || !dbConfig.database) {
    console.error('Missing DB credentials. Set DB_USER, DB_PASSWORD, DB_NAME in .env.extractor');
    process.exit(1);
  }

  const pool = mysql.createPool(dbConfig);
  const failures: string[] = [];

  try {
    console.log('== STARVIS Canonical Audit ==');
    console.log(`Target env: ${env}`);
    console.log(`Strict mode: ${strict ? 'on' : 'off'}`);
    console.log(`Database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

    for (const entity of ENTITIES) {
      const { clause, params } = envWhere('t', env);

      console.log(`\n-- ${entity.name} --`);

      const totals = await queryCountByEnv(
        pool,
        `SELECT t.game_env, COUNT(*) AS total
         FROM ${entity.table} t
         ${clause}
         GROUP BY t.game_env`,
        params,
      );
      printMap('rows', totals);

      const withCanonical = await queryCountByEnv(
        pool,
        `SELECT t.game_env, COUNT(*) AS total
         FROM ${entity.table} t
         ${clause ? `${clause} AND` : 'WHERE'} t.${entity.canonicalKeyCol} IS NOT NULL AND TRIM(t.${entity.canonicalKeyCol}) != ''
         GROUP BY t.game_env`,
        params,
      );
      printMap('with canonical key', withCanonical);

      const withNormalized = await queryCountByEnv(
        pool,
        `SELECT t.game_env, COUNT(*) AS total
         FROM ${entity.table} t
         ${clause ? `${clause} AND` : 'WHERE'} t.${entity.normalizedCol} IS NOT NULL AND TRIM(t.${entity.normalizedCol}) != ''
         GROUP BY t.game_env`,
        params,
      );
      printMap('with normalized name', withNormalized);

      const withSource = await queryCountByEnv(
        pool,
        `SELECT t.game_env, COUNT(*) AS total
         FROM ${entity.table} t
         ${clause ? `${clause} AND` : 'WHERE'}
           t.${entity.sourceTypeCol} IS NOT NULL AND TRIM(t.${entity.sourceTypeCol}) != ''
           AND t.${entity.sourceNameCol} IS NOT NULL AND TRIM(t.${entity.sourceNameCol}) != ''
         GROUP BY t.game_env`,
        params,
      );
      printMap('with source metadata', withSource);

      const collisions = await queryCollisionsByEnv(
        pool,
        `SELECT x.game_env,
                COUNT(*) AS collision_groups,
                SUM(x.cnt) AS collided_rows
         FROM (
           SELECT t.game_env, t.${entity.canonicalKeyCol}, COUNT(*) AS cnt
           FROM ${entity.table} t
           ${clause ? `${clause} AND` : 'WHERE'} t.${entity.canonicalKeyCol} IS NOT NULL AND TRIM(t.${entity.canonicalKeyCol}) != ''
           GROUP BY t.game_env, t.${entity.canonicalKeyCol}
           HAVING COUNT(*) > 1
         ) x
         GROUP BY x.game_env`,
        params,
      );

      const collisionGroupsMap = new Map<string, number>();
      const collisionRowsMap = new Map<string, number>();
      for (const [k, v] of collisions) {
        collisionGroupsMap.set(k, v.groups);
        collisionRowsMap.set(k, v.rows);
      }

      printMap('collision groups', collisionGroupsMap);
      printMap('collided rows', collisionRowsMap);

      for (const [envKey, total] of totals) {
        const keyCount = withCanonical.get(envKey) ?? 0;
        const normCount = withNormalized.get(envKey) ?? 0;
        const sourceCount = withSource.get(envKey) ?? 0;
        const collisionGroups = collisionGroupsMap.get(envKey) ?? 0;

        if (total > 0 && keyCount !== total) {
          failures.push(`${entity.name}: canonical coverage ${keyCount}/${total} on env=${envKey}`);
        }
        if (total > 0 && normCount !== total) {
          failures.push(`${entity.name}: normalized coverage ${normCount}/${total} on env=${envKey}`);
        }
        if (total > 0 && sourceCount !== total) {
          failures.push(`${entity.name}: source coverage ${sourceCount}/${total} on env=${envKey}`);
        }

        // In non-strict mode, keep shops collisions informational because multiple class_name can map to same canonical place/name.
        const isShop = entity.name === 'shops';
        if (collisionGroups > 0 && (strict || !isShop)) {
          failures.push(`${entity.name}: ${collisionGroups} canonical collision groups on env=${envKey}`);
        }
      }

      // Print top collisions for visibility.
      const [topRows] = await pool.query<Array<{ game_env: string; canonical_key: string; cnt: number }>>(
        `SELECT t.game_env, t.${entity.canonicalKeyCol} AS canonical_key, COUNT(*) AS cnt
         FROM ${entity.table} t
         ${clause ? `${clause} AND` : 'WHERE'} t.${entity.canonicalKeyCol} IS NOT NULL AND TRIM(t.${entity.canonicalKeyCol}) != ''
         GROUP BY t.game_env, t.${entity.canonicalKeyCol}
         HAVING COUNT(*) > 1
         ORDER BY cnt DESC, canonical_key ASC
         LIMIT 5`,
        params,
      );

      if (topRows.length) {
        console.log('top collisions:');
        for (const row of topRows) {
          console.log(`  - env=${row.game_env} count=${row.cnt} key=${row.canonical_key}`);
        }
      }
    }

    if (failures.length) {
      console.log('\nRESULT: FAIL');
      for (const f of failures) console.log(`- ${f}`);
      process.exitCode = 1;
      return;
    }

    console.log('\nRESULT: PASS');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(`Fatal: ${(e as Error).message}`);
  process.exit(1);
});
