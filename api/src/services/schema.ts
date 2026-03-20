/**
 * STARVIS - Schema initialization
 * Executes db/schema.sql on startup (CREATE IF NOT EXISTS — idempotent).
 * Prisma db push handles subsequent schema changes.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function initializeSchema(prisma: PrismaClient): Promise<void> {
  const candidate1 = path.join(__dirname, '..', '..', 'db', 'schema.sql');
  const candidate2 = path.join(__dirname, '..', '..', '..', 'db', 'schema.sql');
  const schemaPath = existsSync(candidate1) ? candidate1 : candidate2;
  logger.info(`Loading schema from: ${schemaPath}`, { module: 'schema' });
  const schema = readFileSync(schemaPath, 'utf-8');

  // Split on semicolons, respecting single-quoted strings
  // (naive split(';') breaks on COMMENTs like 'text; more text')
  const noLineComments = schema.replace(/--[^\n]*$/gm, '');
  const statements: string[] = [];
  let cur = '';
  let inStr = false;
  for (const ch of noLineComments) {
    if (ch === "'") {
      inStr = !inStr;
      cur += ch;
    } else if (ch === ';' && !inStr) {
      const s = cur.trim();
      if (s.length > 10) statements.push(s);
      cur = '';
    } else {
      cur += ch;
    }
  }
  const lastStmt = cur.trim();
  if (lastStmt.length > 10) statements.push(lastStmt);

  logger.info(`Found ${statements.length} SQL statements to execute`, { module: 'schema' });

  for (const sql of statements) {
    try {
      const preview = sql.substring(0, 60).replace(/\s+/g, ' ');
      logger.debug(`Executing: ${preview}...`, { module: 'schema' });
      await prisma.$executeRawUnsafe(sql);
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
}
