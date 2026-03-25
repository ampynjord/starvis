#!/usr/bin/env node
import { config } from 'dotenv';
import { resolve } from 'node:path';
import * as mysql from 'mysql2/promise';

config({ path: resolve(import.meta.dirname, '..', '..', '.env.extractor') });

type GameEnv = 'live' | 'ptu' | 'eptu' | 'custom' | 'all';

type CountRow = { game_env: string; total: number };
type BadRow = { game_env: string; bad_rows: number };

function parseEnvArg(): GameEnv {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--env' || args[i] === '-e') && args[i + 1]) {
      const v = args[++i].toLowerCase() as GameEnv;
      if (['live', 'ptu', 'eptu', 'custom', 'all'].includes(v)) return v;
      console.error(`Invalid --env value: ${v}. Expected live|ptu|eptu|custom|all`);
      process.exit(1);
    }
  }
  return 'all';
}

function envWhere(targetEnv: GameEnv): { clause: string; params: string[] } {
  if (targetEnv === 'all') return { clause: '', params: [] };
  return { clause: 'WHERE game_env = ?', params: [targetEnv] };
}

async function queryByEnv(conn: mysql.Pool, sql: string, params: unknown[] = []): Promise<Map<string, number>> {
  const [rows] = await conn.query<CountRow[]>(sql, params);
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.game_env, Number(r.total));
  return out;
}

async function queryBadByEnv(conn: mysql.Pool, sql: string, params: unknown[] = []): Promise<Map<string, number>> {
  const [rows] = await conn.query<BadRow[]>(sql, params);
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.game_env, Number(r.bad_rows));
  return out;
}

function printMap(label: string, m: Map<string, number>): void {
  const entries = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const formatted = entries.map(([env, n]) => `${env}:${n}`).join(' | ');
  console.log(`${label.padEnd(40)} ${formatted || 'none'}`);
}

async function main() {
  const targetEnv = parseEnvArg();

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
    const { clause, params } = envWhere(targetEnv);
    const activeEnvs = new Set<string>();

    console.log('== STARVIS Data Quality Audit ==');
    console.log(`Target env: ${targetEnv}`);
    console.log(`Database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

    // Presence checks
    const presenceQueries: Array<{ label: string; sql: string }> = [
      { label: 'ships', sql: `SELECT game_env, COUNT(*) AS total FROM ships ${clause} GROUP BY game_env` },
      { label: 'components', sql: `SELECT game_env, COUNT(*) AS total FROM components ${clause} GROUP BY game_env` },
      { label: 'items', sql: `SELECT game_env, COUNT(*) AS total FROM items ${clause} GROUP BY game_env` },
      { label: 'commodities', sql: `SELECT game_env, COUNT(*) AS total FROM commodities ${clause} GROUP BY game_env` },
      { label: 'missions', sql: `SELECT game_env, COUNT(*) AS total FROM missions ${clause} GROUP BY game_env` },
      { label: 'mining_elements', sql: `SELECT game_env, COUNT(*) AS total FROM mining_elements ${clause} GROUP BY game_env` },
      { label: 'mining_compositions', sql: `SELECT game_env, COUNT(*) AS total FROM mining_compositions ${clause} GROUP BY game_env` },
      { label: 'ship_paints', sql: `SELECT game_env, COUNT(*) AS total FROM ship_paints ${clause} GROUP BY game_env` },
      { label: 'shops', sql: `SELECT game_env, COUNT(*) AS total FROM shops ${clause} GROUP BY game_env` },
      { label: 'ship_loadouts', sql: `SELECT game_env, COUNT(*) AS total FROM ship_loadouts ${clause} GROUP BY game_env` },
      { label: 'ship_modules', sql: `SELECT game_env, COUNT(*) AS total FROM ship_modules ${clause} GROUP BY game_env` },
    ];

    console.log('\n-- Presence --');
    for (const q of presenceQueries) {
      const result = await queryByEnv(pool, q.sql, params);
      printMap(q.label, result);

      if (q.label === 'ships') {
        for (const env of result.keys()) activeEnvs.add(env);
      }

      for (const [env, n] of result) {
        if (n <= 0 && q.label !== 'ship_modules') {
          failures.push(`${q.label} has no rows for env=${env}`);
        }
      }

      // In all-env audits, ensure every active env has rows in every core table.
      if (targetEnv === 'all' && q.label !== 'ship_modules' && q.label !== 'ship_matrix') {
        for (const env of activeEnvs) {
          if (!result.has(env)) {
            failures.push(`${q.label} missing env partition: ${env}`);
          }
        }
      }
    }

    // Human-readable parsing checks
    const badQueries: Array<{ label: string; sql: string }> = [
      {
        label: 'ships_bad_name',
        sql: `SELECT game_env, SUM(name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%') AS bad_rows FROM ships ${clause} GROUP BY game_env`,
      },
      {
        label: 'components_bad_name',
        sql: `SELECT game_env, SUM(name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%') AS bad_rows FROM components ${clause} GROUP BY game_env`,
      },
      {
        label: 'items_bad_name',
        sql: `SELECT game_env, SUM(name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%') AS bad_rows FROM items ${clause} GROUP BY game_env`,
      },
      {
        label: 'commodities_bad_name',
        sql: `SELECT game_env, SUM(name IS NULL OR TRIM(name)='' OR name LIKE '@%') AS bad_rows FROM commodities ${clause} GROUP BY game_env`,
      },
      {
        label: 'missions_bad_title',
        sql: `SELECT game_env, SUM(title IS NULL OR TRIM(title)='' OR title LIKE '@%') AS bad_rows FROM missions ${clause} GROUP BY game_env`,
      },
      {
        label: 'mining_elements_bad_name',
        sql: `SELECT game_env, SUM(name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%') AS bad_rows FROM mining_elements ${clause} GROUP BY game_env`,
      },
      {
        label: 'mining_compositions_bad_name',
        sql: `SELECT game_env, SUM(deposit_name IS NULL OR TRIM(deposit_name)='' OR deposit_name LIKE '@%') AS bad_rows FROM mining_compositions ${clause} GROUP BY game_env`,
      },
      {
        label: 'ship_paints_bad_name',
        sql: `SELECT game_env, SUM(paint_name IS NULL OR TRIM(paint_name)='' OR paint_uuid IS NULL OR TRIM(paint_uuid)='' OR paint_name LIKE '@%') AS bad_rows FROM ship_paints ${clause} GROUP BY game_env`,
      },
      {
        label: 'shops_bad_name',
        sql: `SELECT game_env, SUM(name IS NULL OR TRIM(name)='' OR name LIKE '@%') AS bad_rows FROM shops ${clause} GROUP BY game_env`,
      },
    ];

    console.log('\n-- Human Parsing Quality --');
    for (const q of badQueries) {
      const result = await queryBadByEnv(pool, q.sql, params);
      printMap(q.label, result);
      for (const [env, n] of result) {
        if (n > 0) failures.push(`${q.label}=${n} for env=${env}`);
      }
    }

    // Referential integrity checks
    const refQueries: Array<{ label: string; sql: string; params?: unknown[] }> = [
      {
        label: 'orphan_paints_ship',
        sql: `SELECT p.game_env, SUM(s.uuid IS NULL) AS bad_rows
              FROM ship_paints p
              LEFT JOIN ships s ON s.uuid = p.ship_uuid AND s.game_env = p.game_env
              ${targetEnv === 'all' ? '' : 'WHERE p.game_env = ?'}
              GROUP BY p.game_env`,
        params,
      },
      {
        label: 'orphan_loadouts_ship',
        sql: `SELECT sl.game_env, SUM(s.uuid IS NULL) AS bad_rows
              FROM ship_loadouts sl
              LEFT JOIN ships s ON s.uuid = sl.ship_uuid AND s.game_env = sl.game_env
              ${targetEnv === 'all' ? '' : 'WHERE sl.game_env = ?'}
              GROUP BY sl.game_env`,
        params,
      },
      {
        label: 'orphan_loadouts_component',
        sql: `SELECT sl.game_env, SUM(sl.component_uuid IS NOT NULL AND c.uuid IS NULL) AS bad_rows
              FROM ship_loadouts sl
              LEFT JOIN components c ON c.uuid = sl.component_uuid AND c.game_env = sl.game_env
              ${targetEnv === 'all' ? '' : 'WHERE sl.game_env = ?'}
              GROUP BY sl.game_env`,
        params,
      },
      {
        label: 'orphan_modules_ship',
        sql: `SELECT sm.game_env, SUM(s.uuid IS NULL) AS bad_rows
              FROM ship_modules sm
              LEFT JOIN ships s ON s.uuid = sm.ship_uuid AND s.game_env = sm.game_env
              ${targetEnv === 'all' ? '' : 'WHERE sm.game_env = ?'}
              GROUP BY sm.game_env`,
        params,
      },
      {
        label: 'orphan_mining_part_element',
        sql: `SELECT mcp.game_env, SUM(me.uuid IS NULL) AS bad_rows
              FROM mining_composition_parts mcp
              LEFT JOIN mining_elements me ON me.uuid = mcp.element_uuid AND me.game_env = mcp.game_env
              ${targetEnv === 'all' ? '' : 'WHERE mcp.game_env = ?'}
              GROUP BY mcp.game_env`,
        params,
      },
      {
        label: 'orphan_mining_part_composition',
        sql: `SELECT mcp.game_env, SUM(mc.uuid IS NULL) AS bad_rows
              FROM mining_composition_parts mcp
              LEFT JOIN mining_compositions mc ON mc.uuid = mcp.composition_uuid AND mc.game_env = mcp.game_env
              ${targetEnv === 'all' ? '' : 'WHERE mcp.game_env = ?'}
              GROUP BY mcp.game_env`,
        params,
      },
    ];

    console.log('\n-- Referential Integrity --');
    for (const q of refQueries) {
      const result = await queryBadByEnv(pool, q.sql, q.params || []);
      printMap(q.label, result);
      for (const [env, n] of result) {
        if (n > 0) failures.push(`${q.label}=${n} for env=${env}`);
      }
    }

    // Ship Matrix coverage visibility (non-blocking)
    const [coverageRows] = await pool.query<{ game_env: string; linked_rows: number; total_rows: number; pct_linked: number }[]>(
      `SELECT game_env,
              SUM(ship_matrix_id IS NOT NULL) AS linked_rows,
              COUNT(*) AS total_rows,
              ROUND(100 * SUM(ship_matrix_id IS NOT NULL) / COUNT(*), 2) AS pct_linked
       FROM ships
       ${clause}
       GROUP BY game_env`,
      params,
    );

    console.log('\n-- Ship Matrix Coverage (info) --');
    for (const row of coverageRows) {
      console.log(`${row.game_env}: ${row.linked_rows}/${row.total_rows} (${row.pct_linked}%)`);
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

main().catch((err) => {
  console.error('Audit failed with exception:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
