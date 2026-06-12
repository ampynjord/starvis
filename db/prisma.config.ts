import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema',
  migrations: {
    // Explicit path required: Prisma 7 defaults to <schemaDir>/migrations when
    // schema is a directory, but our migrations live next to it at prisma/migrations.
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    // Used by `migrate diff --from-migrations` (CI drift check) and `migrate dev`.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
