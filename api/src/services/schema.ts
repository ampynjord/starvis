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
}
