const QUERY_DATABASE_MAX_ROWS = 50;

const QUERY_DATABASE_ALLOWED_TABLES = new Set([
  'game.ships',
  'game.components',
  'game.items',
  'game.missions',
  'game.locations',
  'game.commodities',
  'game.commodity_prices',
  'game.crafting_recipes',
  'game.crafting_ingredients',
  'game.crafting_modifiers',
  'game.ship_loadouts',
  'game.ship_modules',
  'game.ship_paints',
  'game.shops',
  'game.shop_inventory',
  'game.manufacturers',
  'game.mining_elements',
  'game.mining_compositions',
  'game.mining_composition_elements',
  'rsi.ship_matrix',
  'rsi.galactapedia',
  'rsi.comm_links',
  'rsi.starmap_locations',
]);

const QUERY_DATABASE_BLOCKED_KEYWORDS =
  /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|execute|do|vacuum|analyze|refresh|set|reset|listen|notify|lock|merge)\b/i;
const QUERY_DATABASE_BLOCKED_FUNCTIONS = /\b(pg_sleep|dblink|lo_import|lo_export|copy_to|copy_from)\b/i;

export interface SafeQueryDatabaseResult {
  ok: true;
  sql: string;
  params: Array<string | number | boolean>;
}

export interface UnsafeQueryDatabaseResult {
  ok: false;
  error: string;
}

export type QueryDatabaseValidationResult = SafeQueryDatabaseResult | UnsafeQueryDatabaseResult;

function normalizeSqlIdentifier(identifier: string): string {
  return identifier
    .split('.')
    .map((part) => part.trim().replace(/^"|"$/g, '').toLowerCase())
    .join('.');
}

function stripSqlStringLiterals(sql: string): string {
  return sql.replace(/'(?:''|[^'])*'/g, "''").replace(/"(?:""|[^"])*"/g, '""');
}

function referencedTables(sqlWithoutStrings: string): string[] {
  const tables = new Set<string>();
  const tablePattern = /\b(?:from|join)\s+((?:"?[a-zA-Z_][\w]*"?\.)?"?[a-zA-Z_][\w]*"?)/gi;
  for (const match of sqlWithoutStrings.matchAll(tablePattern)) {
    if (match[1]) tables.add(normalizeSqlIdentifier(match[1]));
  }
  return [...tables];
}

export function validateQueryDatabaseSql(sqlInput: unknown, paramsInput: unknown): QueryDatabaseValidationResult {
  if (typeof sqlInput !== 'string') return { ok: false, error: 'SQL query is required' };
  const sql = sqlInput.trim();

  if (!sql) return { ok: false, error: 'SQL query is empty' };
  if (!/^\s*select\b/i.test(sql)) return { ok: false, error: 'Only SELECT queries are allowed' };
  if (/[;]/.test(sql)) return { ok: false, error: 'Semicolons are not allowed in chat SQL queries' };
  if (/--|\/\*|\*\//.test(sql)) return { ok: false, error: 'SQL comments are not allowed in chat SQL queries' };

  const sqlWithoutStrings = stripSqlStringLiterals(sql);
  if (QUERY_DATABASE_BLOCKED_KEYWORDS.test(sqlWithoutStrings)) {
    return { ok: false, error: 'Only read-only SELECT queries are allowed' };
  }
  if (QUERY_DATABASE_BLOCKED_FUNCTIONS.test(sqlWithoutStrings)) {
    return { ok: false, error: 'This SQL function is not allowed in chat queries' };
  }
  if (/\bselect\s+\*/i.test(sqlWithoutStrings) || /(^|,)\s*\*\s*(,|\bfrom\b)/i.test(sqlWithoutStrings)) {
    return { ok: false, error: 'SELECT * is not allowed; request only the columns you need' };
  }

  const tables = referencedTables(sqlWithoutStrings);
  for (const table of tables) {
    if (!table.includes('.')) return { ok: false, error: `Table "${table}" must be schema-qualified` };
    if (!QUERY_DATABASE_ALLOWED_TABLES.has(table)) return { ok: false, error: `Table "${table}" is not available to the chat assistant` };
  }

  const params = Array.isArray(paramsInput) ? paramsInput : [];
  if (!params.every((param) => ['string', 'number', 'boolean'].includes(typeof param))) {
    return { ok: false, error: 'Query parameters must be strings, numbers or booleans' };
  }

  return {
    ok: true,
    sql: `SELECT * FROM (${sql}) AS starvis_chat_query LIMIT ${QUERY_DATABASE_MAX_ROWS}`,
    params: params as Array<string | number | boolean>,
  };
}
