/**
 * STARVIS - Schema initialization
 * Reads and executes db/schema.sql
 */
import { existsSync, readFileSync } from "fs";
import type { PoolConnection } from "mysql2/promise";
import path from "path";
import { fileURLToPath } from "url";
import logger from "../utils/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initializeSchema(conn: PoolConnection): Promise<void> {
  // Docker: db/ is at ../../db (same level as src/)
  // Monorepo CI/local: db/ is at ../../../db (one level above api/)
  const candidate1 = path.join(__dirname, "..", "..", "db", "schema.sql");
  const candidate2 = path.join(__dirname, "..", "..", "..", "db", "schema.sql");
  const schemaPath = existsSync(candidate1) ? candidate1 : candidate2;
  logger.info(`Loading schema from: ${schemaPath}`, { module: 'schema' });
  const schema = readFileSync(schemaPath, "utf-8");

  // Migration: rename ships_default_loadouts → ships_loadouts if needed
  try {
    const [tables] = await conn.execute<any[]>(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ships_default_loadouts'"
    );
    if (tables.length > 0) {
      logger.info('Renaming ships_default_loadouts → ships_loadouts', { module: 'schema' });
      await conn.execute("RENAME TABLE ships_default_loadouts TO ships_loadouts");
    }
  } catch (e: any) {
    logger.debug(`Migration skip: ${e.message}`, { module: 'schema' });
  }

  // Remove comments and split on semicolons
  const cleaned = schema.replace(/--.*$/gm, "").replace(/\n\s*\n/g, "\n");
  const statements = cleaned
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 10);

  logger.info(`Found ${statements.length} SQL statements to execute`, { module: 'schema' });

  for (const sql of statements) {
    try {
      const preview = sql.substring(0, 60).replace(/\s+/g, " ");
      logger.debug(`Executing: ${preview}...`, { module: 'schema' });
      await conn.execute(sql);
    } catch (e: any) {
      // Ignore "already exists" type errors
      if (e.code === "ER_TABLE_EXISTS_ERROR" || e.code === "ER_DUP_KEYNAME") {
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
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ships' AND COLUMN_NAME = 'weapon_damage_total'"
    );
    if (cols.length === 0) {
      logger.info('Adding weapon_damage_total column to ships', { module: 'schema' });
      await conn.execute("ALTER TABLE ships ADD COLUMN weapon_damage_total DECIMAL(10,2) COMMENT 'Sum of all default weapon DPS (WeaponGun)' AFTER missile_damage_total");
    }
  } catch (e: any) {
    logger.debug(`Migration weapon_damage_total skip: ${e.message}`, { module: 'schema' });
  }

  // Migration: add variant_type column if missing
  try {
    const [cols2] = await conn.execute<any[]>(
      "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ships' AND COLUMN_NAME = 'variant_type'"
    );
    if (cols2.length === 0) {
      logger.info('Adding variant_type column to ships', { module: 'schema' });
      await conn.execute("ALTER TABLE ships ADD COLUMN variant_type VARCHAR(20) COMMENT 'Non-playable variant tag' AFTER weapon_damage_total");
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
        "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
        [table, idxName]
      );
      if (existing.length === 0) {
        logger.info(`Adding index ${idxName} on ${table}.${col}`, { module: 'schema' });
        await conn.execute(`ALTER TABLE ${table} ADD INDEX ${idxName} (${col})`);
      }
    } catch (e: any) {
      logger.debug(`Migration index ${idxName} skip: ${e.message}`, { module: 'schema' });
    }
  }
}
