/**
 * Configuration centralisée — toutes les valeurs viennent du .env
 */

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

export const DB_CONFIG = {
  host: requireEnv('DB_HOST'),
  port: parseInt(process.env.DB_PORT || '3306'),
  user: requireEnv('DB_USER'),
  password: requireEnv('DB_PASSWORD'),
  database: requireEnv('DB_NAME'),
  waitForConnections: true,
  connectionLimit: 10,
};
