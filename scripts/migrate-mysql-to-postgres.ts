#!/usr/bin/env tsx
/**
 * MySQL → PostgreSQL data migration script
 *
 * Reads data from the 4 legacy MySQL databases and writes it into the single
 * PostgreSQL database (multi-schema: game / rsi / meta).
 *
 * MySQL source databases:
 *   starvis_live  — live game data  →  game.* tables with env='live'
 *   starvis_ptu   — PTU game data   →  game.* tables with env='ptu'
 *   starvis       — manufacturers, extraction_log, changelog  →  meta.*
 *   rsi_website   — ship_matrix, galactapedia, comm_links, starmap_locations  →  rsi.*
 *
 * Usage:
 *   npx tsx scripts/migrate-mysql-to-postgres.ts
 *
 * Required env vars (set in .env or export):
 *   MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD
 *   PG_DATABASE_URL  (or PG_HOST / PG_PORT / PG_USER / PG_PASSWORD / PG_DB)
 *
 * Options:
 *   --dry-run   Parse and count rows but don't write to PostgreSQL
 *   --skip-game Skip game tables (live/ptu) — migrate only rsi/meta
 *   --env live  Migrate only 'live' game data (default: both live+ptu)
 */

import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = typeof import.meta.dirname !== 'undefined'
  ? import.meta.dirname
  : resolve(fileURLToPath(import.meta.url), '..');

config({ path: resolve(__dirname, '..', '.env') });
config({ path: resolve(__dirname, '..', '.env.migration') });

import mysql from 'mysql2/promise';
import pg from 'pg';

const { Pool: PgPool } = pg;

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_GAME = process.argv.includes('--skip-game');
const ONLY_ENV = process.argv.includes('--env') ? process.argv[process.argv.indexOf('--env') + 1] : null;

const MYSQL = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: parseInt(process.env.MYSQL_PORT || '3306', 10),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
};

const pgConfig = process.env.PG_DATABASE_URL
  ? { connectionString: process.env.PG_DATABASE_URL }
  : {
      host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432', 10),
      user: process.env.PG_USER || process.env.DB_USER || '',
      password: process.env.PG_PASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.PG_DB || process.env.DB_NAME || 'starvis',
    };

const BATCH = 500;

// ── Helpers ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function toPostgres(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function mysqlQuery<T = any>(conn: mysql.Connection, sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await conn.execute(sql, params);
  return rows as T[];
}

/** Converts JS objects/arrays (mysql2 auto-parsed JSON) to JSON strings for pg JSONB columns */
function pgVal(v: unknown): unknown {
  if (v == null) return null;
  if (Array.isArray(v) || (typeof v === 'object' && !(v instanceof Date) && !(Buffer.isBuffer(v)))) {
    return JSON.stringify(v);
  }
  return v;
}

async function pgInsertBatch(
  client: pg.PoolClient,
  table: string,
  columns: string[],
  rows: any[][],
  conflictTarget: string | null,
  updateClause?: string,
) {
  if (!rows.length) return 0;
  let total = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const colList = columns.join(', ');
    const valPlaceholders = batch
      .map((_, ri) => `(${columns.map((_, ci) => `$${ri * columns.length + ci + 1}`).join(', ')})`)
      .join(', ');
    const params = batch.flat().map(pgVal);
    const conflict = conflictTarget && updateClause
      ? `ON CONFLICT ${conflictTarget} DO UPDATE SET ${updateClause}`
      : conflictTarget
        ? `ON CONFLICT ${conflictTarget} DO NOTHING`
        : '';
    const sql = `INSERT INTO ${table} (${colList}) VALUES ${valPlaceholders} ${conflict}`;
    const result = await client.query(sql, params);
    total += result.rowCount ?? batch.length;
  }
  return total;
}

// ── Game table migration (live / ptu) ─────────────────────────────────────────

async function migrateGameDb(mysqlConn: mysql.Connection, pgClient: pg.PoolClient, env: 'live' | 'ptu') {
  const db = env === 'live' ? 'live' : 'ptu';
  log(`  ── ${env.toUpperCase()} (${db}) ──`);

  // manufacturers (also in starvis DB, but game DBs may have some too)
  // We'll migrate from meta section instead.

  // ships
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.ships`);
    log(`    ships: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => {
        const row = cols.map((c) => (c === 'env' ? env : r[c] ?? null));
        return row;
      });
      const updated = cols.filter((c) => c !== 'uuid' && c !== 'env').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'game.ships', cols, data, '(uuid, env)', updated);
    }
  }

  // components
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.components`);
    log(`    components: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      const updated = cols.filter((c) => c !== 'uuid' && c !== 'env').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'game.components', cols, data, '(uuid, env)', updated);
    }
  }

  // items
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.items`);
    log(`    items: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      const updated = cols.filter((c) => c !== 'uuid' && c !== 'env').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'game.items', cols, data, '(uuid, env)', updated);
    }
  }

  // commodities
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.commodities`);
    log(`    commodities: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      const updated = cols.filter((c) => c !== 'uuid' && c !== 'env').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'game.commodities', cols, data, '(uuid, env)', updated);
    }
  }

  // ship_loadouts
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.ship_loadouts`);
    log(`    ship_loadouts: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      // ship_loadouts PK is (id, env) — but id is auto-increment so conflicts on (ship_uuid, port_name, parent_id, env)
      // Simpler: delete all for env and re-insert
      await pgClient.query('DELETE FROM game.ship_loadouts WHERE env = $1', [env]);
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      for (let i = 0; i < data.length; i += BATCH) {
        const batch = data.slice(i, i + BATCH);
        const colList = cols.join(', ');
        const valPlaceholders = batch
          .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`)
          .join(', ');
        await pgClient.query(`INSERT INTO game.ship_loadouts (${colList}) VALUES ${valPlaceholders}`, batch.flat().map(pgVal));
      }
    }
  }

  // ship_modules
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.ship_modules`);
    log(`    ship_modules: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      await pgClient.query('DELETE FROM game.ship_modules WHERE env = $1', [env]);
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      for (let i = 0; i < data.length; i += BATCH) {
        const batch = data.slice(i, i + BATCH);
        const colList = cols.join(', ');
        const valPlaceholders = batch
          .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`)
          .join(', ');
        await pgClient.query(`INSERT INTO game.ship_modules (${colList}) VALUES ${valPlaceholders}`, batch.flat().map(pgVal));
      }
    }
  }

  // ship_paints
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.ship_paints`);
    log(`    ship_paints: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      await pgClient.query('DELETE FROM game.ship_paints WHERE env = $1', [env]);
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      for (let i = 0; i < data.length; i += BATCH) {
        const batch = data.slice(i, i + BATCH);
        const colList = cols.join(', ');
        const valPlaceholders = batch
          .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`)
          .join(', ');
        await pgClient.query(`INSERT INTO game.ship_paints (${colList}) VALUES ${valPlaceholders}`, batch.flat().map(pgVal));
      }
    }
  }

  // shops
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.shops`);
    log(`    shops: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      await pgClient.query('DELETE FROM game.shops WHERE env = $1', [env]);
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      await pgInsertBatch(pgClient, 'game.shops', cols, data, null);
    }
  }

  // shop_inventory (no uuid PK — delete+reinsert per env)
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.shop_inventory`);
    log(`    shop_inventory: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      await pgClient.query('DELETE FROM game.shop_inventory WHERE env = $1', [env]);
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      for (let i = 0; i < data.length; i += BATCH) {
        const batch = data.slice(i, i + BATCH);
        const colList = cols.join(', ');
        const valPlaceholders = batch
          .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`)
          .join(', ');
        await pgClient.query(`INSERT INTO game.shop_inventory (${colList}) VALUES ${valPlaceholders}`, batch.flat().map(pgVal));
      }
    }
  }

  // commodity_prices
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.commodity_prices`);
    log(`    commodity_prices: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      await pgClient.query('DELETE FROM game.commodity_prices WHERE env = $1', [env]);
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      for (let i = 0; i < data.length; i += BATCH) {
        const batch = data.slice(i, i + BATCH);
        const colList = cols.join(', ');
        const valPlaceholders = batch
          .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`)
          .join(', ');
        await pgClient.query(`INSERT INTO game.commodity_prices (${colList}) VALUES ${valPlaceholders}`, batch.flat().map(pgVal));
      }
    }
  }

  // locations
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.locations`);
    log(`    locations: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      const updated = cols.filter((c) => c !== 'uuid' && c !== 'env').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'game.locations', cols, data, '(uuid, env)', updated);
    }
  }

  // mining_elements
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.mining_elements`);
    log(`    mining_elements: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      const updated = cols.filter((c) => c !== 'uuid' && c !== 'env').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'game.mining_elements', cols, data, '(uuid, env)', updated);
    }
  }

  // mining_compositions
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.mining_compositions`);
    log(`    mining_compositions: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      const updated = cols.filter((c) => c !== 'uuid' && c !== 'env').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'game.mining_compositions', cols, data, '(uuid, env)', updated);
    }
  }

  // mining_composition_parts — MySQL has no env col; PG has composition_env + element_env
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.mining_composition_parts`);
    log(`    mining_composition_parts: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      await pgClient.query('DELETE FROM game.mining_composition_parts WHERE composition_env = $1', [env]);
      const mysqlCols = Object.keys(rows[0]).filter((c) => c !== 'id' && c !== 'env');
      const cols = [...mysqlCols, 'composition_env', 'element_env'];
      const data = rows.map((r) => [...mysqlCols.map((c) => r[c] ?? null), env, env]);
      for (let i = 0; i < data.length; i += BATCH) {
        const batch = data.slice(i, i + BATCH);
        const colList = cols.join(', ');
        const valPlaceholders = batch
          .map((_, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(', ')})`)
          .join(', ');
        await pgClient.query(`INSERT INTO game.mining_composition_parts (${colList}) VALUES ${valPlaceholders}`, batch.flat().map(pgVal));
      }
    }
  }

  // missions
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.missions`);
    log(`    missions: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      const updated = cols.filter((c) => c !== 'uuid' && c !== 'env').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'game.missions', cols, data, '(uuid, env)', updated);
    }
  }

  // crafting_recipes
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.crafting_recipes`);
    log(`    crafting_recipes: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      if (!cols.includes('env')) cols.push('env');
      const data = rows.map((r) => cols.map((c) => (c === 'env' ? env : r[c] ?? null)));
      const updated = cols.filter((c) => c !== 'uuid' && c !== 'env').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'game.crafting_recipes', cols, data, '(uuid, env)', updated);
    }
  }

  // crafting_ingredients — MySQL has no env col; PG has recipe_env
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.crafting_ingredients`);
    log(`    crafting_ingredients: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      await pgClient.query('DELETE FROM game.crafting_ingredients WHERE recipe_env = $1', [env]);
      const mysqlCols = Object.keys(rows[0]).filter((c) => c !== 'id' && c !== 'env');
      const cols = [...mysqlCols, 'recipe_env'];
      const data = rows.map((r) => [...mysqlCols.map((c) => r[c] ?? null), env]);
      await pgInsertBatch(pgClient, 'game.crafting_ingredients', cols, data, null);
    }
  }

  // crafting_slot_modifiers — MySQL has no env col; PG has recipe_env
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.crafting_slot_modifiers`);
    log(`    crafting_slot_modifiers: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      await pgClient.query('DELETE FROM game.crafting_slot_modifiers WHERE recipe_env = $1', [env]);
      const mysqlCols = Object.keys(rows[0]).filter((c) => c !== 'id' && c !== 'env');
      const cols = [...mysqlCols, 'recipe_env'];
      const data = rows.map((r) => [...mysqlCols.map((c) => r[c] ?? null), env]);
      await pgInsertBatch(pgClient, 'game.crafting_slot_modifiers', cols, data, null);
    }
  }

  // mission_blueprint_rewards — MySQL has no env col; PG has mission_env + blueprint_env
  {
    const rows = await mysqlQuery(mysqlConn, `SELECT * FROM ${db}.mission_blueprint_rewards`);
    log(`    mission_blueprint_rewards: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      await pgClient.query('DELETE FROM game.mission_blueprint_rewards WHERE mission_env = $1', [env]);
      const mysqlCols = Object.keys(rows[0]).filter((c) => c !== 'id' && c !== 'env');
      const cols = [...mysqlCols, 'mission_env', 'blueprint_env'];
      const data = rows.map((r) => [...mysqlCols.map((c) => r[c] ?? null), env, env]);
      await pgInsertBatch(pgClient, 'game.mission_blueprint_rewards', cols, data, null);
    }
  }
}

// ── Meta tables (starvis DB → meta schema) ────────────────────────────────────

async function migrateMetaDb(mysqlConn: mysql.Connection, pgClient: pg.PoolClient) {
  log('  ── meta (starvis DB) ──');

  // manufacturers
  {
    const rows = await mysqlQuery(mysqlConn, 'SELECT * FROM starvis.manufacturers');
    log(`    manufacturers: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      const data = rows.map((r) => cols.map((c) => r[c] ?? null));
      const updated = cols.filter((c) => c !== 'code').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'meta.manufacturers', cols, data, '(code)', updated);
    }
  }

  // extraction_log — map old columns to new names
  {
    const rows = await mysqlQuery(mysqlConn, 'SELECT * FROM starvis.extraction_log');
    log(`    extraction_log: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      // Old columns: id, extraction_hash, game_version, game_env, ships, components, items, commodities,
      //              manufacturers, loadout_ports, shops, duration_ms, status, created_at
      // New columns: ships_count, components_count, items_count, commodities_count, manufacturers_count,
      //              loadout_ports_count, shops_count
      // Include original id to preserve FK references from changelog
      const cols = [
        'id', 'extraction_hash', 'game_version', 'game_env',
        'ships_count', 'components_count', 'items_count', 'commodities_count',
        'manufacturers_count', 'loadout_ports_count', 'shops_count', 'recipes_count',
        'duration_ms', 'status', 'error_message', 'extracted_at',
      ];
      const data = rows.map((r) => [
        r.id,
        r.extraction_hash,
        r.game_version,
        r.game_env,
        r.ships ?? r.ships_count ?? 0,
        r.components ?? r.components_count ?? 0,
        r.items ?? r.items_count ?? 0,
        r.commodities ?? r.commodities_count ?? 0,
        r.manufacturers ?? r.manufacturers_count ?? 0,
        r.loadout_ports ?? r.loadout_ports_count ?? 0,
        r.shops ?? r.shops_count ?? 0,
        r.recipes ?? r.recipes_count ?? 0,
        r.duration_ms ?? null,
        r.status ?? 'success',
        r.error_message ?? null,
        r.extracted_at ?? r.created_at ?? new Date(),
      ]);
      await pgInsertBatch(pgClient, 'meta.extraction_log', cols, data, null);
      // Reset sequence to max id so next inserts don't collide
      const maxId = Math.max(...rows.map((r) => r.id));
      await pgClient.query(`SELECT setval(pg_get_serial_sequence('meta.extraction_log', 'id'), $1)`, [maxId]);
    }
  }

  // changelog
  {
    const rows = await mysqlQuery(mysqlConn, 'SELECT * FROM starvis.changelog');
    log(`    changelog: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]).filter((c) => c !== 'id');
      const data = rows.map((r) => cols.map((c) => r[c] ?? null));
      await pgInsertBatch(pgClient, 'meta.changelog', cols, data, null);
    }
  }
}

// ── RSI tables (rsi_website DB → rsi schema) ──────────────────────────────────

async function migrateRsiDb(mysqlConn: mysql.Connection, pgClient: pg.PoolClient) {
  log('  ── rsi (rsi_website DB) ──');

  // ship_matrix
  {
    const rows = await mysqlQuery(mysqlConn, 'SELECT * FROM rsi_website.ship_matrix');
    log(`    ship_matrix: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]);
      const data = rows.map((r) => cols.map((c) => r[c] ?? null));
      const updated = cols.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'rsi.ship_matrix', cols, data, '(id)', updated);
    }
  }

  // galactapedia
  {
    const rows = await mysqlQuery(mysqlConn, 'SELECT * FROM rsi_website.galactapedia');
    log(`    galactapedia: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      // MySQL stores JSON as strings; PostgreSQL JSONB needs valid JSON
      const JSON_COLS = new Set(['categories', 'tags']);
      const cols = Object.keys(rows[0]);
      const data = rows.map((r) =>
        cols.map((c) => {
          const v = r[c];
          if (JSON_COLS.has(c)) {
            if (v == null) return null;
            // mysql2 may already parse JSON columns → re-stringify for pg JSONB
            if (typeof v !== 'string') return JSON.stringify(v);
            try { JSON.parse(v); return v; } catch { return null; }
          }
          return v ?? null;
        }),
      );
      const updated = cols.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'rsi.galactapedia', cols, data, '(id)', updated);
    }
  }

  // comm_links
  {
    const rows = await mysqlQuery(mysqlConn, 'SELECT * FROM rsi_website.comm_links');
    log(`    comm_links: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const cols = Object.keys(rows[0]);
      const data = rows.map((r) => cols.map((c) => r[c] ?? null));
      const updated = cols.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'rsi.comm_links', cols, data, '(id)', updated);
    }
  }

  // starmap_locations
  {
    const rows = await mysqlQuery(mysqlConn, 'SELECT * FROM rsi_website.starmap_locations');
    log(`    starmap_locations: ${rows.length} rows`);
    if (!DRY_RUN && rows.length) {
      const JSON_COLS = new Set(['affiliations', 'coordinates', 'jump_points']);
      const cols = Object.keys(rows[0]);
      const data = rows.map((r) =>
        cols.map((c) => {
          const v = r[c];
          if (JSON_COLS.has(c)) {
            if (v == null) return null;
            if (typeof v !== 'string') return JSON.stringify(v);
            try { JSON.parse(v); return v; } catch { return null; }
          }
          return v ?? null;
        }),
      );
      const updated = cols.filter((c) => c !== 'id').map((c) => `${c} = EXCLUDED.${c}`).join(', ');
      await pgInsertBatch(pgClient, 'rsi.starmap_locations', cols, data, '(id)', updated);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log('╔══════════════════════════════════════════════════════╗');
  log('║   MySQL → PostgreSQL Data Migration                  ║');
  log(`║   Mode: ${DRY_RUN ? 'DRY RUN (no writes)              ' : 'LIVE (writing to PostgreSQL)          '}║`);
  log('╚══════════════════════════════════════════════════════╝');

  // Create MySQL connection (cross-database queries using database.table notation)
  const mysqlConn = await mysql.createConnection({
    ...MYSQL,
    multipleStatements: true,
    // No database specified — we use db.table notation in queries
  });
  log('✅ MySQL connected');

  const pgPool = new PgPool(pgConfig);
  const pgClient = await pgPool.connect();
  log('✅ PostgreSQL connected');

  try {
    if (!DRY_RUN) {
      await pgClient.query('BEGIN');
    }

    // 1. Meta tables
    await migrateMetaDb(mysqlConn, pgClient);

    // 2. RSI tables
    await migrateRsiDb(mysqlConn, pgClient);

    // 3. Game tables (live + ptu)
    if (!SKIP_GAME) {
      const envsToMigrate: ('live' | 'ptu')[] = ONLY_ENV === 'ptu' ? ['ptu'] : ONLY_ENV === 'live' ? ['live'] : ['live', 'ptu'];
      for (const env of envsToMigrate) {
        await migrateGameDb(mysqlConn, pgClient, env);
      }
    }

    if (!DRY_RUN) {
      await pgClient.query('COMMIT');
      log('✅ Transaction committed');
    } else {
      log('✅ Dry run complete — no data written');
    }
  } catch (e) {
    if (!DRY_RUN) {
      await pgClient.query('ROLLBACK');
      log('❌ Transaction rolled back');
    }
    throw e;
  } finally {
    pgClient.release();
    await pgPool.end();
    await mysqlConn.end();
  }
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
