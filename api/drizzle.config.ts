import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  // TypeScript schema — source of truth
  schema: './src/db/schema.ts',

  // Migrations written to the same folder the runtime migrator already reads
  out: '../db/migrations',

  dialect: 'mysql',

  dbCredentials: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307', 10), // local dev tunnel port
    user: process.env.DB_USER || 'starvis_user',
    password: process.env.DB_PASSWORD || 'starvis_pass',
    database: process.env.DB_NAME || 'starvis',
  },

  // Verbosity
  verbose: true,
  strict: true,
});
