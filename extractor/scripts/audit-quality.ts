#!/usr/bin/env node
import { resolve } from 'node:path';
import { config } from 'dotenv';
import type { RowDataPacket } from 'mysql2/promise';
import * as mysql from 'mysql2/promise';

config({ path: resolve(import.meta.dirname, '..', '..', '.env.extractor') });

type GameEnv = 'live' | 'ptu' | 'eptu';

interface CountRow extends RowDataPacket {
  total: number;
}
interface BadRow extends RowDataPacket {
  bad_rows: number;
}

function parseEnvArg(): GameEnv {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--env' || args[i] === '-e') && args[i + 1]) {
      const v = args[++i].toLowerCase() as GameEnv;
      if (['live', 'ptu', 'eptu'].includes(v)) return v;
      console.error(`Invalid --env value: ${v}. Expected live|ptu|eptu`);
      process.exit(1);
    }
  }
  return 'live';
}

const GAME_DB_MAP: Record<string, string> = { live: 'live', ptu: 'ptu', eptu: 'ptu' };

async function queryCount(pool: mysql.Pool, sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await pool.query<CountRow[]>(sql, params);
  return Number(rows[0]?.total ?? 0);
}

async function queryBad(pool: mysql.Pool, sql: string, params: unknown[] = []): Promise<number> {
  const [rows] = await pool.query<BadRow[]>(sql, params);
  return Number(rows[0]?.bad_rows ?? 0);
}

async function main() {
  const targetEnv = parseEnvArg();
  const gameDatabaseName = GAME_DB_MAP[targetEnv] || 'live';

  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || '',
    password: process.env.DB_PASSWORD || '',
    database: gameDatabaseName,
    waitForConnections: true,
    connectionLimit: 2,
    enableKeepAlive: true,
    keepAliveInitialDelay: 5000,
  };

  if (!dbConfig.user || !dbConfig.password) {
    console.error('Missing DB credentials. Set DB_USER, DB_PASSWORD in .env.extractor');
    process.exit(1);
  }

  const pool = mysql.createPool(dbConfig);
  const failures: string[] = [];

  try {
    console.log('== STARVIS Data Quality Audit ==');
    console.log(`Target env: ${targetEnv} → database: ${gameDatabaseName}`);
    console.log(`Database: ${dbConfig.host}:${dbConfig.port}/${gameDatabaseName}`);

    // Presence checks
    const presenceQueries: Array<{ label: string; sql: string }> = [
      { label: 'ships', sql: 'SELECT COUNT(*) AS total FROM ships' },
      { label: 'components', sql: 'SELECT COUNT(*) AS total FROM components' },
      { label: 'items', sql: 'SELECT COUNT(*) AS total FROM items' },
      { label: 'commodities', sql: 'SELECT COUNT(*) AS total FROM commodities' },
      { label: 'missions', sql: 'SELECT COUNT(*) AS total FROM missions' },
      { label: 'mining_elements', sql: 'SELECT COUNT(*) AS total FROM mining_elements' },
      { label: 'mining_compositions', sql: 'SELECT COUNT(*) AS total FROM mining_compositions' },
      { label: 'ship_paints', sql: 'SELECT COUNT(*) AS total FROM ship_paints' },
      { label: 'shops', sql: 'SELECT COUNT(*) AS total FROM shops' },
      { label: 'ship_loadouts', sql: 'SELECT COUNT(*) AS total FROM ship_loadouts' },
      { label: 'ship_modules', sql: 'SELECT COUNT(*) AS total FROM ship_modules' },
    ];

    console.log('\n-- Presence --');
    for (const q of presenceQueries) {
      const count = await queryCount(pool, q.sql);
      console.log(`${q.label.padEnd(40)} ${count}`);
      if (count <= 0 && q.label !== 'ship_modules') {
        failures.push(`${q.label} has no rows`);
      }
    }

    // Human-readable parsing checks
    const badQueries: Array<{ label: string; sql: string }> = [
      { label: 'ships_bad_name', sql: "SELECT SUM(name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%') AS bad_rows FROM ships" },
      {
        label: 'components_bad_name',
        sql: "SELECT SUM(name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%') AS bad_rows FROM components",
      },
      { label: 'items_bad_name', sql: "SELECT SUM(name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%') AS bad_rows FROM items" },
      { label: 'commodities_bad_name', sql: "SELECT SUM(name IS NULL OR TRIM(name)='' OR name LIKE '@%') AS bad_rows FROM commodities" },
      { label: 'missions_bad_title', sql: "SELECT SUM(title IS NULL OR TRIM(title)='' OR title LIKE '@%') AS bad_rows FROM missions" },
      {
        label: 'mining_elements_bad_name',
        sql: "SELECT SUM(name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%') AS bad_rows FROM mining_elements",
      },
      {
        label: 'mining_compositions_bad_name',
        sql: "SELECT SUM(deposit_name IS NULL OR TRIM(deposit_name)='' OR deposit_name LIKE '@%') AS bad_rows FROM mining_compositions",
      },
      {
        label: 'ship_paints_bad_name',
        sql: "SELECT SUM(paint_name IS NULL OR TRIM(paint_name)='' OR paint_uuid IS NULL OR TRIM(paint_uuid)='' OR paint_name LIKE '@%') AS bad_rows FROM ship_paints",
      },
      { label: 'shops_bad_name', sql: "SELECT SUM(name IS NULL OR TRIM(name)='' OR name LIKE '@%') AS bad_rows FROM shops" },
    ];

    console.log('\n-- Human Parsing Quality --');
    for (const q of badQueries) {
      const bad = await queryBad(pool, q.sql);
      console.log(`${q.label.padEnd(40)} ${bad}`);
      if (bad > 0) failures.push(`${q.label}=${bad}`);
    }

    // Referential integrity checks
    const refQueries: Array<{ label: string; sql: string }> = [
      {
        label: 'orphan_paints_ship',
        sql: `SELECT SUM(s.uuid IS NULL) AS bad_rows
              FROM ship_paints p
              LEFT JOIN ships s ON s.uuid = p.ship_uuid`,
      },
      {
        label: 'orphan_loadouts_ship',
        sql: `SELECT SUM(s.uuid IS NULL) AS bad_rows
              FROM ship_loadouts sl
              LEFT JOIN ships s ON s.uuid = sl.ship_uuid`,
      },
      {
        label: 'orphan_loadouts_component',
        sql: `SELECT SUM(sl.component_uuid IS NOT NULL AND c.uuid IS NULL) AS bad_rows
              FROM ship_loadouts sl
              LEFT JOIN components c ON c.uuid = sl.component_uuid`,
      },
      {
        label: 'orphan_modules_ship',
        sql: `SELECT SUM(s.uuid IS NULL) AS bad_rows
              FROM ship_modules sm
              LEFT JOIN ships s ON s.uuid = sm.ship_uuid`,
      },
      {
        label: 'orphan_mining_part_element',
        sql: `SELECT SUM(me.uuid IS NULL) AS bad_rows
              FROM mining_composition_parts mcp
              LEFT JOIN mining_elements me ON me.uuid = mcp.element_uuid`,
      },
      {
        label: 'orphan_mining_part_composition',
        sql: `SELECT SUM(mc.uuid IS NULL) AS bad_rows
              FROM mining_composition_parts mcp
              LEFT JOIN mining_compositions mc ON mc.uuid = mcp.composition_uuid`,
      },
    ];

    console.log('\n-- Referential Integrity --');
    for (const q of refQueries) {
      const bad = await queryBad(pool, q.sql);
      console.log(`${q.label.padEnd(40)} ${bad}`);
      if (bad > 0) failures.push(`${q.label}=${bad}`);
    }

    // Ship Matrix coverage visibility (non-blocking)
    const [coverageRows] = await pool.query<RowDataPacket[]>(
      `SELECT SUM(ship_matrix_id IS NOT NULL) AS linked_rows,
              COUNT(*) AS total_rows,
              ROUND(100 * SUM(ship_matrix_id IS NOT NULL) / COUNT(*), 2) AS pct_linked
       FROM ships`,
    );

    console.log('\n-- Ship Matrix Coverage (info) --');
    for (const row of coverageRows) {
      console.log(`${targetEnv}: ${row.linked_rows}/${row.total_rows} (${row.pct_linked}%)`);
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
