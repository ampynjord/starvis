/**
 * STARVIS - Schema initialization & versioned migrations
 * Reads and executes db/schema.sql, then runs new migrations from db/migrations/
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolConnection } from 'mysql2/promise';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initializeSchema(conn: PoolConnection): Promise<void> {
  // Docker: db/ is at ../../db (same level as src/)
  // Monorepo CI/local: db/ is at ../../../db (one level above api/)
  const candidate1 = path.join(__dirname, '..', '..', 'db', 'schema.sql');
  const candidate2 = path.join(__dirname, '..', '..', '..', 'db', 'schema.sql');
  const schemaPath = existsSync(candidate1) ? candidate1 : candidate2;
  logger.info(`Loading schema from: ${schemaPath}`, { module: 'schema' });
  const schema = readFileSync(schemaPath, 'utf-8');

  // Migration: rename ships_default_loadouts → ships_loadouts if needed
  try {
    const [tables] = await conn.execute<any[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ships_default_loadouts'",
    );
    if (tables.length > 0) {
      logger.info('Renaming ships_default_loadouts → ships_loadouts', { module: 'schema' });
      await conn.execute('RENAME TABLE ships_default_loadouts TO ships_loadouts');
    }
  } catch (e: any) {
    logger.debug(`Migration skip: ${e.message}`, { module: 'schema' });
  }

  // Remove comments and split on semicolons
  const cleaned = schema.replace(/--.*$/gm, '').replace(/\n\s*\n/g, '\n');
  const statements = cleaned
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  logger.info(`Found ${statements.length} SQL statements to execute`, { module: 'schema' });

  for (const sql of statements) {
    try {
      const preview = sql.substring(0, 60).replace(/\s+/g, ' ');
      logger.debug(`Executing: ${preview}...`, { module: 'schema' });
      await conn.execute(sql);
    } catch (e: any) {
      // Ignore "already exists" type errors
      if (e.code === 'ER_TABLE_EXISTS_ERROR' || e.code === 'ER_DUP_KEYNAME') {
        logger.debug('Already exists, skipping', { module: 'schema' });
      } else {
        throw e;
      }
    }
  }

  logger.info('Schema initialized', { module: 'schema' });

  // ── Versioned migrations from db/migrations/*.sql ──
  await runVersionedMigrations(conn);
}

/**
 * Run versioned SQL migrations from db/migrations/ directory.
 * Each file is named NNN_description.sql and tracked in a `schema_migrations` table.
 */
async function runVersionedMigrations(conn: PoolConnection): Promise<void> {
  // Ensure migrations tracking table exists (column: filename WITH .sql extension)
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Handle older installations where the column was named 'version' instead of 'filename'
  try {
    await conn.execute(`ALTER TABLE schema_migrations CHANGE COLUMN version filename VARCHAR(255) NOT NULL`);
    logger.info('Migrated schema_migrations: renamed column version -> filename', { module: 'schema' });
  } catch (_) {
    // Column already named 'filename' — nothing to do
  }

  // Find migrations directory
  const candidate1 = path.join(__dirname, '..', '..', 'db', 'migrations');
  const candidate2 = path.join(__dirname, '..', '..', '..', 'db', 'migrations');
  const migrationsDir = existsSync(candidate1) ? candidate1 : existsSync(candidate2) ? candidate2 : null;

  if (!migrationsDir) {
    logger.debug('No migrations directory found, skipping versioned migrations', { module: 'schema' });
    return;
  }

  // Get already-applied migrations (stored as filename WITH .sql extension)
  const [applied] = await conn.execute<any[]>('SELECT filename FROM schema_migrations');
  const appliedSet = new Set(applied.map((r: any) => r.filename));

  // Read and sort migration files
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file; // keep .sql extension — consistent with extractor/scripts/apply-migrations.ts
    if (appliedSet.has(version)) continue;

    logger.info(`Running migration: ${file}`, { module: 'schema' });
    const sql = readFileSync(path.join(migrationsDir, file), 'utf-8');
    const statements = sql
      .replace(/--.*$/gm, '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 5);

    for (const stmt of statements) {
      try {
        await conn.execute(stmt);
      } catch (e: any) {
        // Skip benign errors (already exists, duplicate key, etc.)
        if (['ER_TABLE_EXISTS_ERROR', 'ER_DUP_KEYNAME', 'ER_DUP_FIELDNAME', 'ER_CANT_DROP_FIELD_OR_KEY'].includes(e.code)) {
          logger.debug(`Migration ${file}: ${e.message} (skipped)`, { module: 'schema' });
        } else {
          throw e;
        }
      }
    }

    await conn.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [version]);
    logger.info(`Migration ${file} applied`, { module: 'schema' });
  }
}
