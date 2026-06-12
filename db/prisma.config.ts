import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema',
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    // Used by `migrate diff --from-migrations` (CI drift check) and `migrate dev`.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
