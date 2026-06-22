# STARVIS DB

Database workspace for Prisma, PostgreSQL bootstrap scripts, and the shared Prisma client.

## Structure

| Path | Role |
|---|---|
| `prisma/schema/00-base.prisma` | Prisma generator and datasource. |
| `prisma/schema/10-meta.prisma` | Users, generated API tokens, corporations, fleet/tactical metadata, bug reports, extraction logs and changelog. |
| `prisma/schema/20-rsi.prisma` | RSI website data: ship matrix, Galactapedia, comm-links, starmap. |
| `prisma/schema/30-game.prisma` | P4K/DataForge game data: ships, components, items, commodities, shops, missions, crafting, plus UEX crowd-sourced market data (`uex_terminals`, `uex_vehicle_prices`, `uex_market_prices`) and cross-source canonical correlation tables. |
| `src/client/` | Prisma singleton client. |
| `src/env/` | Shared database environment helpers. |
| `src/types/` | Public Prisma helper types. |
| `src/legacy.ts` | Deprecated compatibility exports kept for existing imports. |
| `scripts/` | PostgreSQL init and backup shell scripts. |

`src/index.ts` is the public entrypoint consumed as `@starvis/db`.

Corporation fleet entries include `availableForTactics`, which records whether the
ship owner made that corporation ship usable on tactical boards.

Generated external API tokens are stored in `meta.api_tokens` as SHA-256 hashes with
owner, project name, expiry, revocation and last-use metadata for admin monitoring.

## Commands

```bash
npm run generate --workspace=@starvis/db
npm run push --workspace=@starvis/db            # dev only: sync schema without a migration
npm run migrate --workspace=@starvis/db         # create a migration from schema changes
npm run migrate:deploy --workspace=@starvis/db  # apply pending migrations (CI / production)
npm run studio --workspace=@starvis/db
```

The schema is a folder. Keep new models in the domain file that owns the table, and keep datasource URLs in `prisma.config.ts`.

## Domain boundaries

The schema is split to keep extraction, application and public-source data from blending together:

| Schema file | Owns | Does not own |
|---|---|---|
| `10-meta.prisma` | Starvis application state: users, roles, API tokens, corporations, bug reports, extraction logs, changelog. | P4K game facts or RSI website rows. |
| `20-rsi.prisma` | Public/network source data: Ship Matrix, official galleries, Galactapedia, Comm-links, Starmap objects and assets. | Normalized in-game objects extracted from `Data.p4k`. |
| `30-game.prisma` | P4K/DataForge facts separated by `env`: ships, components, items, commodities, shops, inventory, missions, crafting, mining, locations and insight tables. | User state or raw RSI article/starmap source documents. |

Cross-source links should be explicit fields, not duplicated data. Current examples:

- `game.ships.ship_matrix_id` links extracted ships to `rsi.ship_matrix`.
- `game.locations.rsi_starmap_location_id` links P4K locations to `rsi.starmap_locations`.
- `game.starmap_location_aliases` stores manual/semi-automatic correlation help.
- `game.uex_vehicle_prices.ship_uuid` links UEX vehicle prices to `game.ships.uuid` (resolved by the extractor `uex` module).
- `game.uex_market_prices.entity_uuid` links UEX commodity/item/component prices to extracted entities when a name match is available. No DB-level foreign key is declared so externally-sourced rows survive even when a game item is missing or renamed.
- `game.canonical_entities` and `game.canonical_entity_links` provide the
  non-breaking identity layer for records that exist in P4K, RSI and UEX. They
  do not replace source primary keys; they let API clients see one Starvis
  canonical entity plus explicit source links.

Run the static data audit after extractor or schema changes:

```bash
npm run quality:audit:static-data -- --db-only
```

Use `--p4k <path>` when you want the audit to compare the database against raw P4K/DataForge coverage.

## Migrations

Production and CI apply the schema exclusively through versioned migrations in `prisma/migrations/` — never `db push --accept-data-loss`.

Workflow when changing the schema:

1. Edit the relevant `prisma/schema/*.prisma` file.
2. Run `npm run migrate --workspace=@starvis/db` against your dev database and commit the generated migration folder.
3. CI fails on drift: the "Check schema/migrations drift" step compares `prisma/migrations` to `prisma/schema` and rejects schema changes that ship without a migration.

`migrate:deploy` runs `scripts/migrate-deploy.mjs`, which now delegates strictly to `prisma migrate deploy`. It does not auto-baseline a non-empty database; any legacy database without `_prisma_migrations` must be baselined explicitly and reviewed before deployment.
