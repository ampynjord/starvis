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

  // Migration: add weapon_damage_total column if missing
  try {
    const [cols] = await conn.execute<any[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ships' AND COLUMN_NAME = 'weapon_damage_total'",
    );
    if (cols.length === 0) {
      logger.info('Adding weapon_damage_total column to ships', { module: 'schema' });
      await conn.execute(
        "ALTER TABLE ships ADD COLUMN weapon_damage_total DECIMAL(10,2) COMMENT 'Sum of all default weapon DPS (WeaponGun)' AFTER missile_damage_total",
      );
    }
  } catch (e: any) {
    logger.debug(`Migration weapon_damage_total skip: ${e.message}`, { module: 'schema' });
  }

  // Migration: add variant_type column if missing
  try {
    const [cols2] = await conn.execute<any[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ships' AND COLUMN_NAME = 'variant_type'",
    );
    if (cols2.length === 0) {
      logger.info('Adding variant_type column to ships', { module: 'schema' });
      await conn.execute(
        "ALTER TABLE ships ADD COLUMN variant_type VARCHAR(20) COMMENT 'Non-playable variant tag' AFTER weapon_damage_total",
      );
    }
  } catch (e: any) {
    logger.debug(`Migration variant_type skip: ${e.message}`, { module: 'schema' });
  }

  // Migration: add missing indexes for common filter columns
  const desiredIndexes: [string, string, string][] = [
    ['ships', 'idx_role', 'role'],
    ['ships', 'idx_career', 'career'],
    ['ships', 'idx_vehicle_category', 'vehicle_category'],
  ];
  for (const [table, idxName, col] of desiredIndexes) {
    try {
      const [existing] = await conn.execute<any[]>(
        'SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?',
        [table, idxName],
      );
      if (existing.length === 0) {
        logger.info(`Adding index ${idxName} on ${table}.${col}`, { module: 'schema' });
        await conn.execute(`ALTER TABLE ${table} ADD INDEX ${idxName} (${col})`);
      }
    } catch (e: any) {
      logger.debug(`Migration index ${idxName} skip: ${e.message}`, { module: 'schema' });
    }
  }

  // Migration: add UNIQUE constraint on shop_inventory (shop_id, component_class_name)
  try {
    const [existing] = await conn.execute<any[]>(
      "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shop_inventory' AND INDEX_NAME = 'uk_shop_component'",
    );
    if (existing.length === 0) {
      // Remove duplicates first (keep latest by id)
      await conn.execute(
        `DELETE si FROM shop_inventory si
         INNER JOIN (
           SELECT shop_id, component_class_name, MAX(id) as keep_id
           FROM shop_inventory GROUP BY shop_id, component_class_name HAVING COUNT(*) > 1
         ) dups ON si.shop_id = dups.shop_id AND si.component_class_name = dups.component_class_name AND si.id != dups.keep_id`,
      );
      logger.info('Adding UNIQUE constraint uk_shop_component on shop_inventory', { module: 'schema' });
      await conn.execute('ALTER TABLE shop_inventory ADD UNIQUE KEY uk_shop_component (shop_id, component_class_name)');
    }
  } catch (e: any) {
    logger.debug(`Migration uk_shop_component skip: ${e.message}`, { module: 'schema' });
  }

  // ── Versioned migrations from db/migrations/*.sql ──
  await runVersionedMigrations(conn);
}

/**
 * Run versioned SQL migrations from db/migrations/ directory.
 * Each file is named NNN_description.sql and tracked in a `schema_migrations` table.
 */
async function runVersionedMigrations(conn: PoolConnection): Promise<void> {
  // Ensure migrations tracking table exists
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Find migrations directory
  const candidate1 = path.join(__dirname, '..', '..', 'db', 'migrations');
  const candidate2 = path.join(__dirname, '..', '..', '..', 'db', 'migrations');
  const migrationsDir = existsSync(candidate1) ? candidate1 : existsSync(candidate2) ? candidate2 : null;

  if (!migrationsDir) {
    logger.debug('No migrations directory found, skipping versioned migrations', { module: 'schema' });
    return;
  }

  // Get already-applied migrations
  const [applied] = await conn.execute<any[]>('SELECT version FROM schema_migrations');
  const appliedSet = new Set(applied.map((r: any) => r.version));

  // Read and sort migration files
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.replace('.sql', '');
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

    await conn.execute('INSERT INTO schema_migrations (version) VALUES (?)', [version]);
    logger.info(`Migration ${file} applied`, { module: 'schema' });
  }
}
