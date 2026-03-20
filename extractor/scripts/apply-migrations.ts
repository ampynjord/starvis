#!/usr/bin/env node
/**
 * apply-migrations.ts
 * Applies pending SQL migration files from db/migrations/ in alphabetical order.
 * Tracks applied migrations in a `schema_migrations` table — idempotent & safe to re-run.
 *
 * Usage:
 *   npm run migrate
 *   DB_HOST=127.0.0.1 DB_PORT=13306 npm run migrate
 */
import { config } from 'dotenv';

config({ path: '.env.extractor' });

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'mysql2/promise';
import logger from '../src/logger.js';

const MIGRATIONS_DIR = join(fileURLToPath(new URL('../../db/migrations', import.meta.url)));

async function main(): Promise<void> {
  const conn = await createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  try {
    // Ensure tracking table exists
    await conn.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    VARCHAR(255) PRIMARY KEY,
        applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    const [rows] = await conn.execute<{ filename: string }[]>('SELECT filename FROM schema_migrations ORDER BY filename');
    const applied = new Set(rows.map((r) => r.filename));

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        logger.info(`[skip]  ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      logger.info(`[apply] ${file} …`);
      await conn.query(sql);
      await conn.execute('INSERT INTO schema_migrations (filename) VALUES (?)', [file]);
      count++;
    }

    logger.info(`Done — ${count} migration(s) applied, ${files.length - count} skipped.`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
