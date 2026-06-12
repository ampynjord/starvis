/**
 * Batch INSERT helper shared by all persisters.
 */
import type { PoolClient } from 'pg';

/** Default batch size for multi-row INSERT statements */
export const BATCH_SIZE = 50;

/**
 * Execute a multi-row INSERT … ON CONFLICT DO UPDATE in batches (PostgreSQL).
 * @param conn pg PoolClient
 * @param insertHead SQL before VALUES: "INSERT INTO schema.tbl (c1, c2)"
 * @param conflictClause ON CONFLICT clause: "(unique_col) DO UPDATE SET …" or "DO NOTHING"
 * @param colCount Number of columns per row
 * @param rows Array of flat parameter arrays (each length === colCount)
 * @param batchSize Rows per batch (default: BATCH_SIZE)
 * @returns Number of rows affected
 */
export async function batchUpsert(
  conn: PoolClient,
  insertHead: string,
  conflictClause: string,
  colCount: number,
  rows: (string | number | null | boolean)[][],
  batchSize = BATCH_SIZE,
): Promise<number> {
  if (!rows.length) return 0;
  let affected = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const params = batch.flat();
    let paramIdx = 0;
    const valuePlaceholders = batch.map(() => {
      const cols = Array.from({ length: colCount }, () => `$${++paramIdx}`);
      return `(${cols.join(',')})`;
    });
    const onConflict = conflictClause ? ` ON CONFLICT ${conflictClause}` : '';
    const sql = `${insertHead} VALUES ${valuePlaceholders.join(',')}${onConflict}`;
    const result = await conn.query(sql, params);
    affected += result.rowCount ?? batch.length;
  }

  return affected;
}
