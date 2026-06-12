# STARVIS DB

Database workspace for Prisma, PostgreSQL bootstrap scripts, and the shared Prisma client.

## Structure

| Path | Role |
|---|---|
| `prisma/schema/00-base.prisma` | Prisma generator and datasource. |
| `prisma/schema/10-meta.prisma` | Users, corporations, fleet/tactical metadata, bug reports, extraction logs and changelog. |
| `prisma/schema/20-rsi.prisma` | RSI website data: ship matrix, Galactapedia, comm-links, starmap. |
| `prisma/schema/30-game.prisma` | P4K/DataForge game data: ships, components, items, commodities, shops, missions, crafting. |
| `src/client/` | Prisma singleton client. |
| `src/env/` | Shared database environment helpers. |
| `src/types/` | Public Prisma helper types. |
| `src/legacy.ts` | Deprecated compatibility exports kept for existing imports. |
| `scripts/` | PostgreSQL init and backup shell scripts. |

`src/index.ts` is the public entrypoint consumed as `@starvis/db`.

Corporation fleet entries include `availableForTactics`, which records whether the
ship owner made that corporation ship usable on tactical boards.

## Commands

```bash
npm run generate --workspace=@starvis/db
npm run push --workspace=@starvis/db            # dev only: sync schema without a migration
npm run migrate --workspace=@starvis/db         # create a migration from schema changes
npm run migrate:deploy --workspace=@starvis/db  # apply pending migrations (CI / production)
npm run studio --workspace=@starvis/db
```

The schema is a folder. Keep new models in the domain file that owns the table, and keep datasource URLs in `prisma.config.ts`.

## Migrations

Production and CI apply the schema exclusively through versioned migrations in `prisma/migrations/` — never `db push --accept-data-loss`.

Workflow when changing the schema:

1. Edit the relevant `prisma/schema/*.prisma` file.
2. Run `npm run migrate --workspace=@starvis/db` against your dev database and commit the generated migration folder.
3. CI fails on drift: the "Check schema/migrations drift" step compares `prisma/migrations` to `prisma/schema` and rejects schema changes that ship without a migration.

`migrate:deploy` runs `scripts/migrate-deploy.mjs`, which baselines databases originally created with `db push` (marks `0_init` as applied on Prisma error P3005) before applying pending migrations. This makes the first deployment on the existing production database safe and automatic.
