/**
 * Drizzle ORM client — wraps the existing mysql2 pool.
 *
 * Usage:
 *   import { db } from '@/db';
 *   import { ships, eq } from '@/db/schema';
 *
 *   const row = await db.select().from(ships).where(eq(ships.uuid, id));
 */

import type { MySql2Client, MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import * as schema from './schema.js';

let _db: MySql2Database<typeof schema> | null = null;

/**
 * Initialise the Drizzle client from an existing mysql2 pool.
 * Call this once at startup after the pool is created.
 */
export function initDrizzle(pool: MySql2Client) {
  _db = drizzle(pool, { schema, mode: 'default' });
  return _db;
}

/**
 * Returns the Drizzle DB instance.
 * Throws if initDrizzle() has not been called.
 */
export function getDb() {
  if (!_db) throw new Error('Drizzle not initialised — call initDrizzle(pool) first');
  return _db;
}

// Re-export drizzle operators so callers don't need a second import
export { and, asc, desc, eq, gte, ilike, inArray, isNotNull, isNull, like, lte, ne, or, sql } from 'drizzle-orm';
// Re-export schema symbols for convenience
export * from './schema.js';
