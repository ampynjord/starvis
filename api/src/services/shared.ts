/**
 * Shared types, helpers and constants for game-data sub-services
 */
import type { PrismaLike as PrismaClient } from '@starvis/db';

// ── Types ─────────────────────────────────────────────────

/** A single row returned by Prisma raw queries */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export interface PaginatedResult {
  data: Row[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ── Numeric helpers ───────────────────────────────────────

/**
 * Convert BigInt and Decimal to Number recursively in object/array
 * Prisma raw queries return:
 * - COUNT/SUM as BigInt (cannot be JSON serialized)
 * - DECIMAL/NUMERIC columns as Decimal objects with shape {s, e, d} (also cannot be JSON serialized)
 */
export function convertBigIntToNumber<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj) as T;

  // Detect Prisma Decimal: object with shape { s: number, e: number, d: number[] }
  if (
    typeof obj === 'object' &&
    !Array.isArray(obj) &&
    's' in obj &&
    'e' in obj &&
    'd' in obj &&
    typeof (obj as any).s === 'number' &&
    Array.isArray((obj as any).d)
  ) {
    // Convert Decimal to number using scientific notation
    const decimal = obj as any;
    const sign = decimal.s === 1 ? 1 : -1;
    const mantissa = decimal.d.join('');
    const exponent = decimal.e;
    return (sign * parseFloat(`${mantissa}e${exponent - mantissa.length + 1}`)) as T;
  }

  if (Array.isArray(obj)) return obj.map(convertBigIntToNumber) as T;
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = convertBigIntToNumber(value);
    }
    return result as T;
  }
  return obj;
}

export const num = (v: unknown): number => parseFloat(String(v)) || 0;
export const int = (v: unknown): number => parseInt(String(v), 10) || 0;
export const r1 = (v: number): number => Math.round(v * 10) / 10;
export const r2 = (v: number): number => Math.round(v * 100) / 100;
export const r4 = (v: number): number => Math.round(v * 10000) / 10000;
export const r6 = (v: number): number => Math.round(v * 1000000) / 1000000;

// ── Internal-field stripping ──────────────────────────────

const INTERNAL_FIELDS = new Set([
  'canonical_component_key',
  'canonical_item_key',
  'canonical_commodity_key',
  'canonical_shop_key',
  'canonical_location_key',
  'normalized_name',
]);

/** Remove internal/metadata columns that should not be exposed via the API */
export function stripInternal(row: Row): Row {
  const result: Row = {};
  for (const [key, value] of Object.entries(row)) {
    if (!INTERNAL_FIELDS.has(key)) result[key] = value;
  }
  return result;
}

// ── Include helper ────────────────────────────────────────

/**
 * Parse a comma-separated `include` query param into a Set of relation names.
 * e.g. "manufacturer,paints,matrix" → Set { 'manufacturer', 'paints', 'matrix' }
 */
export function parseIncludes(include?: string): Set<string> {
  if (!include) return new Set();
  return new Set(
    include
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

// ── Filters helper ────────────────────────────────────────

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

/** Uniform filter response shape: { filters: { fieldName: FilterOption[] } } */
export type FiltersResult = { filters: Record<string, FilterOption[]> };

/** Convert a plain string array to FilterOption[] (value === label, no count) */
export function toFilterOptions(values: string[]): FilterOption[] {
  return values.map((v) => ({ value: v, label: v }));
}

/** Convert rows with { value, label?, count? } shape to FilterOption[] */
export function rowsToFilterOptions(rows: Row[], valueKey: string, labelKey?: string, countKey?: string): FilterOption[] {
  return rows.map((r) => ({
    value: String(r[valueKey] ?? ''),
    label: String(r[labelKey ?? valueKey] ?? r[valueKey] ?? ''),
    ...(countKey ? { count: Number(r[countKey]) } : {}),
  }));
}

// ── PostgreSQL helper ─────────────────────────────────────

/**
 * Convert MySQL-style `?` positional placeholders to PostgreSQL-style `$1, $2, …`
 * Call this on every raw SQL string before passing it to `$queryRawUnsafe`.
 */
export function toPostgres(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ── Pagination helper ─────────────────────────────────────

export async function paginate(
  prisma: PrismaClient,
  baseSql: string,
  countSql: string,
  params: (string | number)[],
  opts: { sort?: string; order?: string; page?: number; limit?: number },
  sortCols: Set<string>,
  alias: string,
  /** Optional map of dot-notation sort keys (e.g. "game_data.scm_speed") to SQL expressions */
  jsonSortMap?: Record<string, string>,
): Promise<PaginatedResult> {
  const countRows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(countSql), ...params);
  const total = countRows[0]?.total ?? countRows[0]?.count ?? 0;

  const order = opts.order === 'desc' ? 'DESC' : 'ASC';
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(200, Math.max(1, opts.limit || 50));
  const offset = (page - 1) * limit;

  let orderExpr: string;
  const sortKey = opts.sort || '';
  if (jsonSortMap && jsonSortMap[sortKey]) {
    orderExpr = `${jsonSortMap[sortKey]} ${order}`;
  } else {
    const sortCol = sortCols.has(sortKey) ? sortKey : 'name';
    orderExpr = `${alias}.${sortCol} ${order}`;
  }

  const sql = `${baseSql} ORDER BY ${orderExpr} LIMIT ${Number(limit)} OFFSET ${Number(offset)}`;
  const rows = await prisma.$queryRawUnsafe<Row[]>(toPostgres(sql), ...params);
  return { data: rows.map(stripInternal), total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) };
}
