# Prisma schema layout

The schema folder is split by ownership boundary:

- `00-base.prisma`: generator and datasource only.
- `10-meta.prisma`: Starvis application state (`meta.*`), including users, API tokens, corporations, reports, changelog and extraction logs.
- `20-rsi.prisma`: network/public-source data (`rsi.*`), including RSI Ship Matrix, galleries, Galactapedia, Comm-links and Starmap.
- `30-game.prisma`: extracted game facts (`game.*`) from P4K/DataForge, scoped by `env` when live/PTU can differ.

Keep new models in the domain that owns the source of truth. Prefer explicit cross-source IDs over duplicated data, such as `game.ships.ship_matrix_id` and `game.locations.rsi_starmap_location_id`.

Fleet declarations can carry optional provenance fields (`source`, `sourceExternalId`, `sourcePayload`, `sourceSyncedAt`). RSI hangar sync uses `source = rsi_hangar` plus a stable external id so sync jobs can upsert or remove only extension-managed entries while leaving manual fleet declarations untouched.

After schema or extractor changes, run:

```bash
npm run quality:audit:static-data -- --db-only
```

Use `--p4k <path>` when the raw P4K should be included in the coverage report.
