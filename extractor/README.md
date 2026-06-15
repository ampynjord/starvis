# STARVIS Extractor

Local CLI that reads Star Citizen `Data.p4k` files and writes extracted data to the STARVIS PostgreSQL database.

The extractor runs outside Docker. It connects to the same PostgreSQL service used by the full STARVIS stack:

- dev: `docker-compose.dev.yml`, usually exposed on `127.0.0.1:5432` or `0.0.0.0:5432`;
- prod: `docker-compose.prod.yml`, exposed on VPS loopback and reached from your machine through an SSH tunnel.

It supports DataForge v6 for Star Citizen 4.7.x and older, and DataForge v8 for Star Citizen 4.8+.

---

## Installation

From the monorepo root:

```bash
npm install

cp extractor/.env.extractor.example extractor/.env.dev
# Fill DB_PASSWORD and P4K paths as needed.
```

The stable command entrypoint is `extractor/extract.ts`. CLI orchestration lives in `extractor/src/cli/main.ts`, option parsing in `extractor/src/cli/options.ts`, module selection in `extractor/src/cli/modules.ts`, and runtime resolution in `extractor/src/cli/resolve.ts`.

---

## Database Configuration

| Variable | Description |
|---|---|
| `DATABASE_URL` | Full PostgreSQL URL. Takes priority over individual `DB_*` variables. |
| `DB_HOST` | PostgreSQL host. Default: `127.0.0.1`. |
| `DB_PORT` | PostgreSQL port. Default: `5432`. |
| `DB_USER` | PostgreSQL user. Default: `starvis_user`. |
| `DB_PASSWORD` | PostgreSQL password. Required unless `DATABASE_URL` is set. |
| `DB_NAME` | Database name. Default: `starvis`. |

For local dev, start the full stack first:

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up -d postgres redis api
```

Then use matching DB values in `extractor/.env.dev`.

---

## P4K Configuration

| Variable | Description |
|---|---|
| `P4K_LIVE_PATH` | Path to the LIVE `Data.p4k`. Used with `--env live`. |
| `P4K_PTU_PATH` | Path to the PTU `Data.p4k`. Used with `--env ptu`. |
| `P4K_PATH` | Generic fallback path when channel-specific paths are empty. |
| `CTM_CACHE_DIR` | CTM model cache directory. Default: `./ctm-cache`. |
| `SHIP_GALLERY_INTER_SHIP_DELAY_MS` | Delay between official RSI ship gallery page loads. Default: `6000`. |
| `SHIP_GALLERY_RETRIES` | Network retries per official RSI ship gallery page. Default: `4`. |
| `SHIP_GALLERY_RETRY_BASE_DELAY_MS` | Base retry backoff for gallery scraping. Default: `8000`. |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error`, or `silent`. |

Typical Windows paths:

```text
C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Data.p4k
C:\Program Files\Roberts Space Industries\StarCitizen\PTU\Data.p4k
```

Typical WSL path:

```text
/mnt/c/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k
```

You can also pass a P4K path directly:

```bash
npx tsx extractor/extract.ts --env live --p4k "C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Data.p4k"
```

---

## Usage

```bash
npx tsx extractor/extract.ts [options]
```

| Option | Description | Default |
|---|---|---|
| `-e, --env <env>` | Target game environment: `live`, `ptu`, or `custom`. | `live` |
| `-m, --modules <list>` | Comma-separated modules to extract. | `all` |
| `-p, --p4k <path>` | Explicit `Data.p4k` path. Overrides env variables. | none |
| `--game-version <ver>` | Manual public game version label, for example `4.7.2`. | auto-detected |
| `--dry-run` | Parse and report without writing to DB. | false |
| `--prod-db` | Load production DB settings and use the production tunnel port. | false |
| `--gallery-delay-ms <n>` | Delay between official RSI ship gallery page loads. | `6000` |
| `--gallery-retries <n>` | Network retries per official RSI ship gallery page. | `4` |
| `--gallery-retry-delay-ms <n>` | Base retry backoff for gallery scraping. | `8000` |
| `--log-level <level>` | `debug`, `info`, `warn`, `error`, or `silent`. | `info` |
| `--verbose` | Shortcut for `--log-level debug`. | false |
| `--quiet` | Disable normal CLI logs. | false |
| `--json` | Emit JSON-lines logs. | false |
| `--no-color` | Disable ANSI colors. | false |
| `--list-modules` | Print available modules and exit. | false |
| `--check-config` | Validate P4K and DB configuration without extraction. | false |

The public game version is auto-detected from the installed P4K when possible. `--game-version` remains available as a manual override for hotfix builds or launcher cache gaps.

---

## Modules

P4K modules require `Data.p4k`:

| Module | Content |
|---|---|
| `ships` | Ships, vehicles, attributes and loadout ports. |
| `components` | Ship components: weapons, shields, quantum drives, coolers, power plants, missiles, turrets, mining, tractor, salvage and utility components. |
| `items` | FPS items: weapons, armor, clothing, gadgets, consumables and attachments. |
| `commodities` | Trade commodities, raw materials, gases and food. |
| `mining` | Mining elements, deposits, compositions, lasers and gadgets. |
| `missions` | Contracts, rewards, factions, legality and blueprint rewards. |
| `crafting` | Recipes, ingredients, modifiers and station requirements. |
| `paints` | Ship liveries and paints. |
| `shops` | Extracted in-game shop locations and franchises from Prefab XMLs and DataForge ShopFranchise records, plus real `Data/Scripts/ShopInventories/*.json` inventories. Purchasable ships, components, FPS items and commodities are matched to normalized tables where possible. Buy/sell prices, stock metadata, source and confidence are saved; rental prices are saved when the source file exposes rental offering prices. |
| `locations` | Systems, planets, moons, cities, stations and child locations. When `starmap` is available in the same run, extracted P4K locations are linked to RSI Starmap rows with a match method, score and confidence. Manual/semi-automatic overrides can be stored in `game.starmap_location_aliases`. |
| `game-insights` | Extended discovery records plus normalized tables for factions, reputation standings/scopes, loot tables/archetypes, blueprint rewards, ammo and inventory containers. |

Network modules do not require `Data.p4k`:

| Module | Content |
|---|---|
| `ship-matrix` | RSI Ship Matrix data. |
| `ship-galleries` | Official ship gallery images scraped from RSI pledge pages. Pledge Store carousel images are stored as `pledge-gallery`, RSI media CDN images are stored separately as `rsi-media`, and Ship Matrix media is kept as `ship-matrix-media` only when no pledge image is available. This keeps the main carousel and secondary media separate while ensuring every known ship keeps an API-visible image. Aliases: `gallery`, `galleries`, `ship-gallery`, `official-galleries`. |
| `galactapedia` | RSI encyclopedia entries. |
| `comm-links` | RSI Comm-Link articles and images. |
| `starmap` | RSI Starmap systems, locations and jump points. |
| `ctm` | CTM model metadata and cache. This can take around one hour. |

---

## Examples

```bash
# Full LIVE extraction, dev DB, version auto-detected
npx tsx extractor/extract.ts --env live

# Full LIVE extraction with a forced public version label
npx tsx extractor/extract.ts --env live --game-version 4.7.2

# PTU extraction
npx tsx extractor/extract.ts --env ptu

# Network-only RSI sync, no P4K needed
npx tsx extractor/extract.ts --modules ship-matrix,ship-galleries,galactapedia,comm-links,starmap

# Fast P4K extraction without CTM
npx tsx extractor/extract.ts --env live --modules ships,components,items,commodities,paints,mining,missions,crafting,locations,shops,game-insights

# Extended game data discovery only
npx tsx extractor/extract.ts --env live --modules game-insights

# Validate configuration without writing data
npx tsx extractor/extract.ts --check-config

# Dry-run parse without DB writes
npx tsx extractor/extract.ts --dry-run --env ptu

# Audit location/shop hierarchy completeness after an extraction
npm run audit:locations --workspace=@starvis/extractor -- --env live
npm run audit:locations --workspace=@starvis/extractor -- --env live --prod-db
```

`game-insights` writes the raw discovery layer to `game.game_insights` and the most useful normalized families to dedicated tables:

`audit:locations` checks that imported locations have valid parents, reports shops that could not be attached to a
location, summarizes real `ShopInventories` rows and highlights stations, landing zones, rest stops and outposts that do
not yet expose attached shops. Use it after `locations,shops` extraction when validating the galactic tree.

| Table family | Tables |
|---|---|
| Factions | `game.factions` |
| Reputation | `game.reputation_standings`, `game.reputation_scopes` |
| Loot and rewards | `game.loot_tables`, `game.loot_table_entries`, `game.loot_archetypes`, `game.blueprint_rewards` |
| FPS and inventory details | `game.ammo`, `game.inventory_containers` |

---

## Production Extraction

Production PostgreSQL is not exposed publicly. Open an SSH tunnel before running `--prod-db`.

The current production compose binds PostgreSQL to VPS loopback through `DB_BIND_HOST=127.0.0.1` and `DB_EXTERNAL_PORT=5432`. From your workstation, map that remote port to a local tunnel port, usually `5433`:

```bash
ssh -f -N -L 5433:127.0.0.1:5432 -i ~/.ssh/starvis_vps -o IdentitiesOnly=yes debian@ampynjord.bzh
```

Then run:

```bash
npx tsx extractor/extract.ts --env live --prod-db
npx tsx extractor/extract.ts --env ptu --prod-db
```

Close the tunnel when finished:

```bash
pkill -f "ssh.*5433:127.0.0.1:5432"
```

LIVE and PTU share the same production database. Data is separated by the `env` column in `game` schema tables.

---

## Internal Execution Order

A full extraction runs in this order:

```text
1. Reference pre-sync -> rsi schema
   Ship Matrix is synced before ship cross-reference. RSI Starmap is synced before location extraction when both
   `starmap` and `locations` are selected, so P4K locations can be linked to fresh RSI rows.

2. Atomic transaction for the selected env
   - snapshot previous data for changelog generation
   - clean old data for current env only
   - manufacturers
   - components, items and commodities
   - ships and loadout ports
   - mining, missions, crafting and locations
   - shops, real shop inventory rows and linked commodity prices for the selected env
   - Ship Matrix cross-reference
   - RSI Starmap location cross-reference with alias/manual match support and confidence metadata
   - variant tagging and excluded variant cleanup
   - optional CTM scraping
   - changelog generation
   - commit

3. Galactapedia, Comm-links and any non-pre-synced Starmap work -> rsi schema
   These network modules run outside the P4K transaction.
```

If an extraction fails or a sanity check detects a large regression, the transaction is rolled back and existing data remains available.

---

## Utility Scripts

```bash
# DataForge 4.8+ diagnostic
npx tsx extractor/scripts/diagnose-48.ts

# Extracted data quality audit
npx tsx extractor/scripts/audit-quality.ts

# Missing locations audit
npx tsx extractor/scripts/audit-locations.ts

# CTM scraper dry-run
npx tsx extractor/scripts/test-ctm-scraper.ts

# Source adapter dry-run
npx tsx extractor/scripts/dry-run-adapters.ts
```

---

## Verification

```bash
npm run test --workspace=@starvis/extractor
npm run typecheck --workspace=@starvis/extractor
```

After publishing data to production, run the platform-level data audit:

```bash
npm run quality:audit:data:prod
```
