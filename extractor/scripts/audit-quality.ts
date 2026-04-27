#!/usr/bin/env node
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Pool } from 'pg';

config({ path: resolve(import.meta.dirname, '..', '..', '.env.extractor.dev') });

type GameEnv = 'live' | 'ptu' | 'eptu';

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

async function queryCount(pool: Pool, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query(sql, params);
  return Number(rows[0]?.total ?? 0);
}

async function queryBad(pool: Pool, sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await pool.query(sql, params);
  return Number(rows[0]?.bad_rows ?? 0);
}

async function main() {
  const targetEnv = parseEnvArg();

  const pgConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, max: 2 }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        user: process.env.DB_USER || '',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'starvis',
        max: 2,
      };

  if (!process.env.DATABASE_URL && (!process.env.DB_USER || !process.env.DB_PASSWORD)) {
    console.error('Missing DB credentials. Set DB_USER, DB_PASSWORD (or DATABASE_URL) in .env.extractor.dev');
    process.exit(1);
  }

  const pool = new Pool(pgConfig);
  const failures: string[] = [];

  try {
    console.log('== STARVIS Data Quality Audit ==');
    console.log(`Target env: ${targetEnv}`);
    console.log(
      `Database: ${process.env.DATABASE_URL ? '(DATABASE_URL)' : `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'starvis'}`}`,
    );

    // Presence checks
    const presenceQueries: Array<{ label: string; sql: string }> = [
      { label: 'ships', sql: 'SELECT COUNT(*) AS total FROM game.ships WHERE env = $1' },
      { label: 'components', sql: 'SELECT COUNT(*) AS total FROM game.components WHERE env = $1' },
      { label: 'items', sql: 'SELECT COUNT(*) AS total FROM game.items WHERE env = $1' },
      { label: 'commodities', sql: 'SELECT COUNT(*) AS total FROM game.commodities WHERE env = $1' },
      { label: 'missions', sql: 'SELECT COUNT(*) AS total FROM game.missions WHERE env = $1' },
      { label: 'mining_elements', sql: 'SELECT COUNT(*) AS total FROM game.mining_elements WHERE env = $1' },
      { label: 'mining_compositions', sql: 'SELECT COUNT(*) AS total FROM game.mining_compositions WHERE env = $1' },
      { label: 'ship_paints', sql: 'SELECT COUNT(*) AS total FROM game.ship_paints WHERE env = $1' },
      { label: 'shops', sql: 'SELECT COUNT(*) AS total FROM game.shops WHERE env = $1' },
      { label: 'ship_loadouts', sql: 'SELECT COUNT(*) AS total FROM game.ship_loadouts WHERE env = $1' },
      { label: 'ship_modules', sql: 'SELECT COUNT(*) AS total FROM game.ship_modules WHERE env = $1' },
    ];

    console.log('\n-- Presence --');
    for (const q of presenceQueries) {
      const count = await queryCount(pool, q.sql, [targetEnv]);
      console.log(`${q.label.padEnd(40)} ${count}`);
      if (count <= 0 && q.label !== 'ship_modules') {
        failures.push(`${q.label} has no rows`);
      }
    }

    // Human-readable parsing checks
    const badQueries: Array<{ label: string; sql: string }> = [
      {
        label: 'ships_bad_name',
        sql: "SELECT SUM(CASE WHEN name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%' THEN 1 ELSE 0 END) AS bad_rows FROM game.ships WHERE env = $1",
      },
      {
        label: 'components_bad_name',
        sql: "SELECT SUM(CASE WHEN name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%' THEN 1 ELSE 0 END) AS bad_rows FROM game.components WHERE env = $1",
      },
      {
        label: 'items_bad_name',
        sql: "SELECT SUM(CASE WHEN name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%' THEN 1 ELSE 0 END) AS bad_rows FROM game.items WHERE env = $1",
      },
      {
        label: 'commodities_bad_name',
        sql: "SELECT SUM(CASE WHEN name IS NULL OR TRIM(name)='' OR name LIKE '@%' THEN 1 ELSE 0 END) AS bad_rows FROM game.commodities WHERE env = $1",
      },
      {
        label: 'missions_bad_title',
        sql: "SELECT SUM(CASE WHEN title IS NULL OR TRIM(title)='' OR title LIKE '@%' THEN 1 ELSE 0 END) AS bad_rows FROM game.missions WHERE env = $1",
      },
      {
        label: 'mining_elements_bad_name',
        sql: "SELECT SUM(CASE WHEN name IS NULL OR TRIM(name)='' OR name='—' OR name LIKE '@%' THEN 1 ELSE 0 END) AS bad_rows FROM game.mining_elements WHERE env = $1",
      },
      {
        label: 'mining_compositions_bad_name',
        sql: "SELECT SUM(CASE WHEN deposit_name IS NULL OR TRIM(deposit_name)='' OR deposit_name LIKE '@%' THEN 1 ELSE 0 END) AS bad_rows FROM game.mining_compositions WHERE env = $1",
      },
      {
        label: 'ship_paints_bad_name',
        sql: "SELECT SUM(CASE WHEN paint_name IS NULL OR TRIM(paint_name)='' OR paint_uuid IS NULL OR TRIM(paint_uuid)='' OR paint_name LIKE '@%' THEN 1 ELSE 0 END) AS bad_rows FROM game.ship_paints WHERE env = $1",
      },
      {
        label: 'shops_bad_name',
        sql: "SELECT SUM(CASE WHEN name IS NULL OR TRIM(name)='' OR name LIKE '@%' THEN 1 ELSE 0 END) AS bad_rows FROM game.shops WHERE env = $1",
      },
    ];

    console.log('\n-- Human Parsing Quality --');
    for (const q of badQueries) {
      const bad = await queryBad(pool, q.sql, [targetEnv]);
      console.log(`${q.label.padEnd(40)} ${bad}`);
      if (bad > 0) failures.push(`${q.label}=${bad}`);
    }

    // Referential integrity checks
    const refQueries: Array<{ label: string; sql: string }> = [
      {
        label: 'orphan_paints_ship',
        sql: `SELECT SUM(CASE WHEN s.uuid IS NULL THEN 1 ELSE 0 END) AS bad_rows
              FROM game.ship_paints p
              LEFT JOIN game.ships s ON s.uuid = p.ship_uuid AND s.env = p.env
              WHERE p.env = $1`,
      },
      {
        label: 'orphan_loadouts_ship',
        sql: `SELECT SUM(CASE WHEN s.uuid IS NULL THEN 1 ELSE 0 END) AS bad_rows
              FROM game.ship_loadouts sl
              LEFT JOIN game.ships s ON s.uuid = sl.ship_uuid AND s.env = sl.env
              WHERE sl.env = $1`,
      },
      {
        label: 'orphan_loadouts_component',
        sql: `SELECT SUM(CASE WHEN sl.component_uuid IS NOT NULL AND c.uuid IS NULL THEN 1 ELSE 0 END) AS bad_rows
              FROM game.ship_loadouts sl
              LEFT JOIN game.components c ON c.uuid = sl.component_uuid AND c.env = sl.env
              WHERE sl.env = $1`,
      },
      {
        label: 'orphan_modules_ship',
        sql: `SELECT SUM(CASE WHEN s.uuid IS NULL THEN 1 ELSE 0 END) AS bad_rows
              FROM game.ship_modules sm
              LEFT JOIN game.ships s ON s.uuid = sm.ship_uuid AND s.env = sm.env
              WHERE sm.env = $1`,
      },
      {
        label: 'orphan_mining_part_element',
        sql: `SELECT SUM(CASE WHEN me.uuid IS NULL THEN 1 ELSE 0 END) AS bad_rows
              FROM game.mining_composition_parts mcp
              LEFT JOIN game.mining_elements me ON me.uuid = mcp.element_uuid AND me.env = mcp.env
              WHERE mcp.env = $1`,
      },
      {
        label: 'orphan_mining_part_composition',
        sql: `SELECT SUM(CASE WHEN mc.uuid IS NULL THEN 1 ELSE 0 END) AS bad_rows
              FROM game.mining_composition_parts mcp
              LEFT JOIN game.mining_compositions mc ON mc.uuid = mcp.composition_uuid AND mc.env = mcp.env
              WHERE mcp.env = $1`,
      },
    ];

    console.log('\n-- Referential Integrity --');
    for (const q of refQueries) {
      const bad = await queryBad(pool, q.sql, [targetEnv]);
      console.log(`${q.label.padEnd(40)} ${bad}`);
      if (bad > 0) failures.push(`${q.label}=${bad}`);
    }

    // Ship Matrix coverage visibility (non-blocking)
    const { rows: coverageRows } = await pool.query(
      `SELECT SUM(CASE WHEN ship_matrix_id IS NOT NULL THEN 1 ELSE 0 END) AS linked_rows,
              COUNT(*) AS total_rows,
              ROUND(100.0 * SUM(CASE WHEN ship_matrix_id IS NOT NULL THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 2) AS pct_linked
       FROM game.ships
       WHERE env = $1`,
      [targetEnv],
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
