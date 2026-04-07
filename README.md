# STARVIS

[![CI/CD](https://github.com/ampynjord/starvis/actions/workflows/ci.yml/badge.svg)](https://github.com/ampynjord/starvis/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ampynjord/starvis/branch/main/graph/badge.svg)](https://codecov.io/gh/ampynjord/starvis)
[![Node v22](https://img.shields.io/badge/node-v22-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**REST API + Web Interface for Star Citizen game data**

Monorepo with 5 modules:

- **api/** — Express.js + TypeScript + Prisma + MySQL backend (deployed on VPS)
- **extractor/** — Commander.js CLI for P4K/DataForge extraction (runs locally)
- **db/** — Database initialization & backup scripts
- **ihm/** — React 18.3 + TanStack Query + Tailwind CSS web interface
- **bot/** — Discord bot with slash commands (ship lookup, trade routes, search)

Two complementary data sources:

- **RSI Ship Matrix** — Official marketing data (~246 ships), synced by the API at startup
- **P4K DataForge** — Actual in-game data (~515 ships, ~6 087 components, ~10 624 FPS items, ~474 commodities, ~58 845 loadout ports, ~828 missions), extracted locally by the CLI

Production: **[starvis.ampynjord.bzh](https://starvis.ampynjord.bzh)**
Public API: **[starvis.ampynjord.bzh/api-docs](https://starvis.ampynjord.bzh/api-docs)**

---

## Features

- **Ship Matrix**: ~246 ships from the RSI API (marketing data, official specs)
- **Game Data**: ~515 playable ships extracted from P4K/DataForge (filtered, no duplicates/tests)
- **Components**: ~6 087 components across 22 types (weapons, shields, power plants, coolers, quantum drives, missiles, thrusters, radars, countermeasures, fuel tanks, intakes, life support, gimbals, turrets, missile racks, mining arms, salvage heads, tractor beams, self-destruct, armor, gravity, ping)
- **Paints**: ship paints/liveries extracted and linked to ships
- **Items**: ~10 624 FPS items across 15 types (FPS weapons, armor, undersuits, clothing, attachments, magazines, consumables, gadgets, tools, grenades, knives…)
- **Commodities**: ~474 tradeable commodities (metals, gas, minerals, food, vices, consumer goods…)
- **Missions**: ~828 missions with rewards, factions, legality, and location data
- **Crafting**: crafting recipes with ingredients, output items, and station types
- **Mining**: mineral elements, compositions, deposit data, and mining laser parameters
- **Trade**: commodity prices per shop with buy/sell spreads and location data
- **Shops & Prices**: in-game shops with inventory and buy/rental prices
- **Loadout Simulator**: aggregated stats (total DPS, shields, power, thermal) with component swapping
- **Modular Ships**: automatic module detection (Retaliator, Apollo, etc.)
- **Manufacturers**: ~55 manufacturers (vehicles + components)
- **Loadouts**: ~58 845 default equipment ports with parent/child hierarchy
- **Cross-reference**: automatic ship ↔ ship_matrix linking via alias + fuzzy matching
- **Pagination** on all list endpoints (page, limit, total, pages)
- **Dynamic filters**: types, sub-types, sizes, and grades fetched from DB
- **CSV Export** on all list endpoints (`?format=csv`)
- **ETag / Cache** HTTP with `Cache-Control` and `If-None-Match` (304)
- **Comparison**: side-by-side ship comparison with numeric deltas
- **Ranking**: ship ranking by various metrics
- **Calculators**: FPS damage and mining yield calculators
- **Swagger / OpenAPI 3.0**: ~79 documented endpoints at `/api-docs`
- **Extraction versioning** with extraction log and automatic changelog in the database
- **CI/CD** GitHub Actions (lint → tests → Docker build → SSH deploy)

### Security

- **Helmet**: security headers (XSS, clickjacking, MIME sniffing)
- **Multi-layer rate limiting**:
  - Burst (30 req/min) — hammering protection
  - SlowDown (after 100 req/15min, progressive +500ms delay, max 20s)
  - Hard limit (200 req/15min → 429)
  - Admin strict (20 req/15min)
- **Nginx hardening**: rate limiting (10 req/s API, 30 req/s static), 20 max connections/IP, security headers, exploit path blocking (`.env`, `.git`)
- **Admin auth**: API key via `X-API-Key` header (timing-safe comparison)
- **CORS** configurable, `trust proxy` for Traefik
- **Body size limit**: 1 MB (Express + nginx)

---

## Project Structure

```
starvis/
├── .env.dev.example            # Dev environment template (copy → .env.dev)
├── .env.prod.example           # Prod environment template (copy → .env.prod)
├── biome.json                  # Linter/formatter (Biome)
├── docker-compose.dev.yml      # Dev orchestration (hot-reload, all configurable via .env.dev)
├── docker-compose.prod.yml     # Prod (Traefik, GHCR images, all configurable via .env.prod)
├── bot/
│   ├── Dockerfile
│   ├── package.json
│   └── src/
│       ├── index.ts            # Bot entry point
│       ├── api.ts              # Starvis API client
│       ├── embeds.ts           # Discord embed builders
│       ├── deploy-commands.ts  # Slash command registration
│       └── commands/
│           ├── ship.ts         # /ship        — Fiche vaisseau complète
│           ├── compare.ts      # /compare     — Comparaison côte à côte
│           ├── loadout.ts      # /loadout     — Loadout par défaut
│           ├── component.ts    # /component   — Recherche composant
│           ├── item.ts         # /item        — Recherche item FPS
│           ├── commodity.ts    # /commodity   — Recherche commodité
│           ├── trade.ts        # /trade       — Meilleures routes commerciales
│           ├── mission.ts      # /mission     — Recherche missions
│           ├── search.ts       # /search      — Recherche unifiée
│           ├── manufacturers.ts# /manufacturers — Liste constructeurs
│           ├── changelog.ts    # /changelog   — Dernières modifications
│           ├── version.ts      # /version     — Version SC extraite
│           └── status.ts       # /status      — État de l'API
├── api/
│   ├── Dockerfile              # Multi-stage (dev → production)
│   ├── server.ts               # Entry point (helmet, rate limiting, Swagger)
│   ├── openapi.json            # OpenAPI 3.0 spec
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── routes/
│       │   ├── ships.ts, components.ts, items.ts, commodities.ts
│       │   ├── shops.ts, trade.ts, missions.ts, crafting.ts
│       │   ├── locations.ts, mining.ts, paints.ts, search.ts
│       │   ├── ship-matrix.ts, manufacturers.ts, rsi-website.ts
│       │   ├── admin.ts, health.ts, system.ts
│       │   └── types.ts        # RouteDependencies interface
│       ├── services/
│       │   ├── game-data-service.ts    # Read-only facade (ships, components…)
│       │   ├── ship-matrix-service.ts  # RSI Ship Matrix sync
│       │   ├── rsi-website-service.ts  # Galactapedia, comm-links, starmap
│       │   ├── redis.ts                # Cache (graceful fallback)
│       │   └── shared.ts               # PrismaLike type, stripInternal
│       └── utils/
│           └── config.ts       # SCHEMA_DB_MAP, RATE_LIMITS, buildDatabaseUrl
├── extractor/
│   ├── .env.example            # Env template (copy → .env.dev ou .env.prod)
│   ├── extract.ts              # CLI entry point (Commander.js)
│   ├── package.json
│   └── src/
│       ├── extraction-service.ts   # Main orchestrator (P4K modules)
│       ├── rsi-sync-service.ts     # RSI/SC Wiki sync (galactapedia, comm-links, starmap)
│       ├── canonical-source.ts     # Canonical key derivation (dedup)
│       ├── source-adapters.ts      # External override loader
│       └── …                       # Parsers, extractors, localization
├── db/
│   ├── prisma/
│   │   ├── game.prisma         # live/ptu — ships, components, items, etc.
│   │   ├── starvis.prisma      # starvis  — extraction_log, changelog
│   │   └── rsi.prisma          # rsi_website — ship_matrix, galactapedia, comm_links, starmap
│   ├── generated/              # Generated Prisma clients (gitignored, rebuilt on install)
│   ├── init.sh                 # MySQL user/privileges init (4 databases)
│   └── backup.sh               # mysqldump + gzip + retention
└── ihm/
    ├── Dockerfile              # Multi-stage (Vite build → nginx)
    └── src/
        ├── components/         # layout/, ship/, mining/, ui/
        ├── views/              # 25+ page components
        ├── services/api.ts     # Typed API client
        └── types/api.ts        # API response types
```

### Databases

| Database | Schema | Content |
|---|---|---|
| `live` | `game.prisma` | Ships, components, items, shops, missions, crafting (LIVE) |
| `ptu` | `game.prisma` | Same schema — PTU branch data |
| `starvis` | `starvis.prisma` | Extraction logs, changelog |
| `rsi_website` | `rsi.prisma` | Ship Matrix, Galactapedia, Comm-links, Starmap |

---

## Quick Start

### Prerequisites

- Node.js 22+
- Docker & Docker Compose
- Star Citizen installation (for P4K extraction only)

### Environment Setup

```bash
# Développement
cp .env.dev.example .env.dev
# Éditez .env.dev : DB_PASSWORD, ADMIN_API_KEY, DISCORD_TOKEN (optionnel)

# Extractor (outil séparé)
cp extractor/.env.example extractor/.env.dev
# Éditez extractor/.env.dev : DB_PASSWORD, P4K_PATH
```

### Development (Docker)

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up
```

This starts:
- **MySQL** on `:${DB_EXTERNAL_PORT:-3306}` (4 databases auto-created)
- **Redis** on `:${REDIS_EXTERNAL_PORT:-6379}`
- **API** on `:${API_PORT:-3000}` (hot-reload via tsx watch)
- **IHM** on `:${IHM_DEV_PORT:-5173}` (Vite HMR)
- **Bot** (Discord slash commands, optional token)

### Development (local)

```bash
# API
cd api && npm install && npm run dev

# IHM (separate terminal)
cd ihm && npm install && npm run dev
```

### Discord Bot

1. Create a Discord application at [discord.com/developers](https://discord.com/developers/applications)
2. Enable the **Bot** feature and copy the token
3. Invite the bot to your server with the `applications.commands` scope
4. Add the env vars to your `.env`:

```bash
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DISCORD_GUILD_ID=your_server_id    # optional: deploy commands to one server (instant), omit for global (up to 1h)
```

5. Deploy slash commands and start:

```bash
cd bot && npm install
npm run deploy-commands
npm run dev
```

**Available commands (13 slash commands):**

| Command | Description |
|---------|-------------|
| `/ship <nom>` | Fiche vaisseau complète (stats, vitesses, équipage, cargo…) |
| `/compare <v1> <v2>` | Comparaison côte à côte avec highlight du gagnant |
| `/loadout <nom>` | Loadout par défaut (ports d'équipement) |
| `/component <nom>` | Recherche composant (arme, bouclier, moteur…) |
| `/item <nom>` | Recherche item FPS (armure, arme, gadget…) |
| `/commodity <nom>` | Recherche commodité avec type |
| `/trade [scu]` | Meilleures routes commerciales (défaut: 100 SCU) |
| `/mission [terme] [type]` | Recherche missions par titre, type, légalité |
| `/search <terme>` | Recherche unifiée (vaisseaux, composants, items, commodités) |
| `/manufacturers` | Liste de tous les constructeurs avec leur spécialité |
| `/changelog [limite]` | Dernières modifications de la base (ajouts/suppressions/modifs) |
| `/version [env]` | Version SC extraite + stats de la base |
| `/status` | État de l'API et statistiques de la base |

### Data Extraction

Run the extractor locally to populate the database with game data:

```bash
cd extractor && npm install
npx tsx extract.ts --p4k "C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k"
```

CLI options:

| Option | Description |
|--------|-------------|
| `-p, --p4k <path>` | Path to Data.p4k (required for P4K modules) |
| `--prod-db` | Load `extractor/.env.prod` instead of `extractor/.env.dev` |
| `-m, --modules <list>` | Comma-separated modules to extract (e.g. `ships,components`) |
| `--dry-run` | Initialize DataForge without writing to DB |
| `-V, --version` | Print version |
| `-h, --help` | Show help |

Available modules: `ships`, `components`, `items`, `commodities`, `shops`, `missions`, `crafting`, `mining`, `paints`, `galactapedia`, `comm-links`, `starmap`, `ship-matrix`, `ctm`.

> **Note:** The `ctm` module does **not** require the P4K file — it only scrapes the RSI website. Run it standalone with `-m ctm` after ships have been extracted and cross-referenced with the Ship Matrix.

---

## Environment Variables

Configuration via `.env` files. See `.env.dev.example`, `.env.prod.example`, and `extractor/.env.example` for all options.

| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL user | — |
| `DB_PASSWORD` | MySQL password | — |
| `DB_NAME` | MySQL database name | `starvis` |
| `MYSQL_ROOT_PASSWORD` | MySQL root password (Docker) | — |
| `DATABASE_URL` | Prisma connection URL | — |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `PORT` | API listen port | `3000` |
| `ADMIN_API_KEY` | Admin API key | — |
| `LOG_LEVEL` | Winston log level | `info` |
| `CORS_ORIGIN` | Allowed CORS origins | `*` |
| `RATE_LIMIT_MAX` | Hard rate limit (req/15min) | `200` |
| `RATE_LIMIT_BURST` | Burst rate limit (req/min) | `30` |
| `NODE_ENV` | Environment | `development` |

---

## API Endpoints

Base URL: `/api/v1`

### Ships

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ships` | List ships (paginated, filterable) |
| GET | `/ships/autocomplete` | Ship name autocomplete |
| GET | `/ships/filters` | Available ship filter values |
| GET | `/ships/ranking` | Ship ranking by metric |
| GET | `/ships/:id` | Ship detail |
| GET | `/ships/:id/loadout` | Ship default loadout (hierarchical) |
| GET | `/ships/:id/compare/:otherId` | Compare two ships |
| GET | `/ships/:id/model` | 3D model metadata (CTM URL + proxy URL) |
| GET | `/ships/:id/model/file` | 3D model binary file (.ctm), served with disk cache |

### Ship Matrix

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/ship-matrix` | List RSI Ship Matrix entries |
| GET | `/ship-matrix/search` | Search by name |
| GET | `/ship-matrix/stats` | Ship Matrix statistics |
| GET | `/ship-matrix/:id` | Ship Matrix entry detail |

### Components

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/components` | List components (paginated, filterable) |
| GET | `/components/autocomplete` | Component name autocomplete |
| GET | `/components/filters` | Available filter values |
| GET | `/components/:id` | Component detail |

### Items (FPS)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/items` | List FPS items (paginated, filterable) |
| GET | `/items/autocomplete` | Item name autocomplete |
| GET | `/items/filters` | Available filter values |
| GET | `/items/:id` | Item detail |

### Commodities

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/commodities` | List commodities (paginated) |
| GET | `/commodities/autocomplete` | Commodity name autocomplete |
| GET | `/commodities/filters` | Available filter values |
| GET | `/commodities/:id` | Commodity detail |
| GET | `/commodities/:id/prices` | Commodity prices across shops |

### Shops

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/shops` | List shops (paginated) |
| GET | `/shops/:id` | Shop detail with inventory |

### Trade

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/trade/prices` | All commodity prices |
| GET | `/trade/location/:locationKey` | Prices at a location |
| GET | `/trade/systems` | Available trade systems |

### Crafting

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/crafting/recipes` | List crafting recipes |
| GET | `/crafting/recipes/:id` | Recipe detail with ingredients |
| GET | `/crafting/categories` | Available categories |
| GET | `/crafting/search` | Search recipes |

### Mining

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/mining/lasers` | Mining laser components |

### Missions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/missions` | List missions (paginated, filterable) |
| GET | `/missions/factions` | Mission factions |
| GET | `/missions/systems` | Mission systems |
| GET | `/missions/:id` | Mission detail |

### Manufacturers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/manufacturers` | List manufacturers |
| GET | `/manufacturers/:code` | Manufacturer detail with ships/components |

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/paints` | List ship paints |
| GET | `/search` | Global search |
| GET | `/system/changelog` | Extraction changelog |
| GET | `/system/stats` | System statistics |
| GET | `/calculate/fps-damage` | FPS damage calculator |
| GET | `/calculate/mining-yield` | Mining yield calculator |

### Admin (requires `X-API-Key`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/admin/sync-ship-matrix` | Sync RSI Ship Matrix |
| GET | `/admin/extraction-log` | Extraction history |

### Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Overall health status |
| GET | `/health/live` | Liveness probe |
| GET | `/health/ready` | Readiness probe (DB + Redis) |
| GET | `/metrics` | Prometheus metrics |

Full OpenAPI spec available at `/api-docs`.

---

## Database Schema

Managed by **Prisma 6** (`api/prisma/schema.prisma`). 18 models across 18 tables:

| Table | Description | Key |
|-------|-------------|-----|
| `ship_matrix` | RSI official ship data | `id` (int) |
| `manufacturers` | Ship & component manufacturers | `code` (varchar) |
| `ships` | P4K game ships | `(uuid, game_env)` |
| `components` | Ship components (22 types) | `(uuid, game_env)` |
| `ship_loadouts` | Default equipment ports | `id` (auto) |
| `ship_modules` | Modular ship configurations | `id` (auto) |
| `ship_paints` | Ship paint/liveries | `id` (auto) |
| `items` | FPS items (15 types) | `(uuid, game_env)` |
| `commodities` | Tradeable commodities | `(uuid, game_env)` |
| `commodity_prices` | Buy/sell prices per shop | `id` (auto) |
| `shops` | In-game shops | `id` (auto) |
| `shop_inventory` | Shop component inventory | `id` (auto) |
| `missions` | In-game missions | `(uuid, game_env)` |
| `crafting_recipes` | Crafting recipes | `(uuid, game_env)` |
| `crafting_ingredients` | Recipe ingredients | `id` (auto) |
| `mining_elements` | Mining mineral elements | `(uuid, game_env)` |
| `mining_compositions` | Deposit compositions | `(uuid, game_env)` |
| `mining_composition_parts` | Composition breakdown | `id` (auto) |
| `extraction_log` | Extraction history + stats | `id` (auto) |
| `changelog` | Automatic change tracking | `id` (auto) |

### Manufacturer Codes

#### Ships (RSI Ship Matrix)

| Code | Name |
|------|------|
| AEGS | Aegis Dynamics |
| ANVL | Anvil Aerospace |
| ARGO | Argo Astronautics |
| BANU | Banu |
| CNOU | Consolidated Outland |
| CRSD | Crusader Industries |
| DRAK | Drake Interplanetary |
| ESPR | Esperia |
| GAMA | Gatac Manufacture |
| GRIN | Greycat Industrial |
| KRIG | Kruger Intergalactic |
| MISC | Musashi Industrial & Starflight Concern |
| MRAI | Mirai |
| ORIG | Origin Jumpworks |
| RSI | Roberts Space Industries |
| TMBL | Tumbril Land Systems |
| VNCL | Vanduul |
| XIAN / XNAA | Aopoa |

#### Components (P4K only)

| Code | Name |
|------|------|
| AMRS | Amon & Reese Co. |
| APAR | Apocalypse Arms |
| BEHR | Behring Applied Technology |
| GATS | Gallenson Tactical Systems |
| HRST | Hurston Dynamics |
| JOKR | Joker Engineering |
| KBAR | KnightBridge Arms |
| KLWE | Klaus & Werner |
| KRON | Kroneg |
| MXOX | MaxOx |
| NOVP | Nova Pyrotechnik |
| PRAR | Preacher Armaments |
| TOAG | Thermyte Concern |

---

## Architecture

### Data Pipeline

```
VPS (API — always running):
  1. Init DB (18 tables via Prisma) + auto-migrations
  2. ShipMatrixService.sync()        → ~246 ships in ship_matrix
  3. GameDataService(prisma)         → Read-only queries for REST API
  4. Mount routes, listen :3000

Local PC (Extractor — manual run):
  npx tsx extract.ts --p4k "C:/StarCitizen/LIVE/Data.p4k"
  ├── Parse P4K + DataForge (Game2.dcb)
  ├── saveManufacturers()            → ~55 manufacturers
  ├── saveComponents()               → ~6 087 components (batch INSERT, 22 types)
  ├── saveShips() + loadouts         → ~515 ships + ~58 845 ports
  ├── detectAndSaveModules()         → config-driven modules (Retaliator×6, Apollo×6) + generic fallback
  ├── savePaints()                   → ship paints/liveries
  ├── saveItems()                    → ~10 624 FPS items (15 types)
  ├── saveCommodities()              → ~474 tradeable commodities
  ├── saveShops()                    → shops + inventory
  ├── saveMissions()                 → ~828 missions
  ├── saveCraftingRecipes()          → crafting recipes + ingredients
  ├── saveMiningData()               → elements + compositions
  ├── crossReferenceShipMatrix()     → ship ↔ ship_matrix linking
  └── INSERT extraction_log          → SHA-256 hash + stats + duration

Local PC (CTM scraping — separate run, no P4K required):
  npx tsx extract.ts -m ctm
  └── saveShipCtmModels()            → Playwright (Chromium, headful) scrapes RSI ship
                                       pledge pages, intercepts .ctm network responses,
                                       updates ships.ctm_url for each matched ship

VPS (API — serving 3D models):
  GET /api/v1/ships/:uuid/model       → returns ctm_url + proxy_url from DB
  GET /api/v1/ships/:uuid/model/file  → proxies the .ctm binary from RSI, with
                                        disk cache (CTM_CACHE_DIR) + ETag support;
                                        sidecar .url file detects URL changes
```

All GET endpoints read from MySQL (no direct P4K/RSI access).
DB writes only happen at startup or via admin POST endpoints.

### CTM — 3D Ship Models

**CTM** (OpenCTM format) is the 3D model format used by the RSI website for its interactive ship viewer. STARVIS harvests these models and re-exposes them through its own API with caching.

#### Full pipeline

```
1. Extractor (local PC, no P4K needed)
   npx tsx extract.ts -m ctm
   └── extractor/src/ctm-scraper.ts
       ├── For each ship that has a ship_matrix RSI URL:
       │     • Launches Chromium in headful mode (required for RSI's 3D viewer — WebGL is often disabled in headless mode)
       │     • Navigates to the RSI pledge page (e.g. /pledge/ships/anvil-arrow/Arrow)
       │     • Dismisses cookie consent banners if present
       │     • Reloads with networkidle, scrolls to the 3D viewer, interacts with the
       │       canvas (zoom + rotate) to trigger model streaming
       │     • Intercepts all network responses and captures any URL containing ".ctm"
       │       (excluding /static/ctm/ thumbnails and *man.ctm LOD-marker meshes)
       │     • Waits 15 seconds for the full model to stream
       └── Writes the captured URL to ships.ctm_url (MySQL column VARCHAR 500)

2. Database
   ships.ctm_url  VARCHAR(500) NULL
   ├── Populated by the extractor `ctm` module
   ├── Preserved across full re-extractions (backed up before DELETE, restored after
   │   INSERT) so CTM URLs survive a complete game data re-extraction
   └── Used by the API to serve/proxy the 3D model

3. API (VPS)
   GET /api/v1/ships/:uuid/model
   └── Returns metadata: { uuid, name, format: "ctm", url, proxy_url }

   GET /api/v1/ships/:uuid/model/file          (binary proxy with disk cache)
   ├── First request  → downloads from RSI, streams to client, saves to
   │                    CTM_CACHE_DIR/{uuid}.ctm + sidecar {uuid}.url
   ├── Later requests → served directly from disk (X-CTM-Cache: HIT)
   ├── Cache-Control: public, max-age=86400 + ETag (MD5 of ctm_url — URL-based,
   │                    so a silent RSI model update without URL change won't bust the cache)
   └── If ctm_url changes in DB (new extraction), the sidecar mismatch auto-invalidates
       the cached file and triggers a fresh download

4. Frontend (IHM)
   ihm/src/components/ship/HoloViewer.tsx
   ├── Fetches /api/v1/ships/:uuid/model/file via CTMLoader
   ├── CTMLoader (ihm/src/lib/CTMLoader.ts) — port of the Three.js r92 CTMLoader
   │   Supports RAW, MG1, and MG2 (LZMA-compressed) streams
   └── Renders in a Three.js scene with OrbitControls, holographic cyan material,
       auto-rotation, and a grid floor — styled to match the RSI holoviewer aesthetic
```

#### Key files

| File | Role |
|------|------|
| `extractor/src/ctm-scraper.ts` | Playwright scraper — discovers CTM URLs from RSI |
| `extractor/src/extraction-service.ts` → `saveShipCtmModels()` | Orchestrates scraping + DB update |
| `extractor/scripts/test-ctm-scraper.ts` | Quick test script for 3 ships |
| `api/src/routes/ships.ts` → `/model` + `/model/file` | API endpoints |
| `api/src/utils/config.ts` → `CTM_CACHE_DIR` | Cache directory (default: `/tmp/ctm-cache`) |
| `ihm/src/lib/CTMLoader.ts` | OpenCTM binary parser (LZMA, MG1, MG2) |
| `ihm/src/components/ship/HoloViewer.tsx` | React 3D viewer component |

#### Running CTM scraping

```bash
# Standalone CTM scrape (after full extraction + cross-reference)
cd extractor
npx tsx extract.ts -m ctm

# Test on 3 known ships (no DB write unless DB_HOST is set)
npx tsx scripts/test-ctm-scraper.ts
```

> **Requirement:** A display must be available (headful Chromium). On a headless server, use `Xvfb` or run the scraper on a local machine and push the results to the remote DB.

### Tech Stack

| Component | Technology |
|-----------|------------|
| **Runtime** | Node.js 22+ with TypeScript (tsx) |
| **API** | Express.js, express-rate-limit, express-slow-down, helmet |
| **Validation** | Zod 4 |
| **Documentation** | OpenAPI 3.0 (pre-generated spec + swagger-ui-express) |
| **Database** | MySQL 8.0 (utf8mb4_unicode_ci) |
| **ORM** | Prisma 6 |
| **Cache** | Redis 7 (ioredis, graceful fallback) |
| **Monitoring** | Prometheus (prom-client 15, HTTP/DB/cache metrics) |
| **Frontend** | React 18.3, React Router v6, TanStack Query v5 |
| **UI** | Tailwind CSS v3, Lucide React, Recharts, Framer Motion |
| **Build** | Vite 5 |
| **Linting** | Biome (lint + format, unified for entire monorepo) |
| **Tests API** | Vitest (unit) + Playwright (E2E) |
| **Tests IHM** | Vitest + Testing Library |
| **Quality** | Husky + lint-staged (pre-commit hooks) |
| **Containers** | Docker multi-stage + Docker Compose |
| **Reverse proxy** | Traefik (Let's Encrypt, automatic HTTPS) |
| **CI/CD** | GitHub Actions (4 jobs + 1 manual job, Codecov coverage) |
| **Registry** | ghcr.io (GitHub Container Registry) |
| **Logging** | Winston (module tags, durations, filtering) |
| **Backup** | mysqldump + gzip, daily cron, 7-day retention |
| **CLI** | Commander.js 13 (extractor) |

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`) with 4 standard jobs + 1 manual:

| Job | Description | Trigger |
|-----|-------------|---------|
| **Lint** | TypeScript type-check (`tsc --noEmit`) API + Extractor + IHM build + `npm audit` + Biome | push/PR on `main` |
| **Safe smoke prod** | Production API health checks with pacing + retries (`smoke-prod-safe.mjs`) | `workflow_dispatch` (opt-in) |
| **Test** | Vitest unit tests (API + Extractor + IHM) + Playwright E2E + Codecov upload | after Lint |
| **Build** | Docker build + push to ghcr.io (API + IHM) | push on `main` only |
| **Deploy** | SSH to VPS: `git pull`, `docker compose pull/up`, health check | after Test + Build |

### Manual Inputs (workflow_dispatch)

- `run_full_pipeline`: run lint/test/build on manual dispatch (disabled by default)
- `run_safe_smoke_prod`: activate production smoke test
- `safe_smoke_base_url`: base URL for the smoke test
- `safe_smoke_pace_ms`: delay between requests to avoid throttling
- `safe_smoke_max_retries`: retries on 429/5xx
- `safe_smoke_include_frontend`: also smoke test IHM routes
- `safe_smoke_frontend_base_url`: base URL for IHM routes

### E2E Tests (Playwright)

- Health checks (live/ready/metrics/cache)
- Ship Matrix API (list/search/stats/ETag)
- Ships API (pagination/filters/autocomplete/loadout)

### Coverage

- Thresholds configured: 30% lines, 40% functions, 13% branches
- Automatic upload to Codecov on every commit
- HTML reports generated locally with `npm run test:coverage`

### Deployment

Deploys via SSH (`appleboy/ssh-action@v1`) with:
- `git reset --hard HEAD` before pull (avoids conflicts from local edits)
- Pull pre-built GHCR images
- Post-deployment API health check (DB + Redis)
- Cleanup of obsolete Docker images

---

## Docker

### Multi-stage Build (API)

```
Stage 1: base         → node:22-alpine, WORKDIR /app
Stage 2: deps         → npm ci (all dependencies)
Stage 3: build        → TypeScript type-check (tsc --noEmit)
Stage 4: production   → npm ci --omit=dev, non-root user, healthcheck
```

### Resource Limits

| Service | Memory |
|---------|--------|
| MySQL | 512 MB |
| API | 256 MB |
| IHM (nginx) | 128 MB |

### Production (VPS + Traefik)

`docker-compose.prod.yml` overrides the dev config:
- Pre-built GHCR images (`ghcr.io/ampynjord/starvis-api`, `ghcr.io/ampynjord/starvis-ihm`)
- Single domain `starvis.ampynjord.bzh` — IHM serves frontend + nginx proxies `/api`, `/health`, `/admin`, `/api-docs` to the API
- Ports not exposed (Traefik handles TLS routing to IHM, nginx routes internally)
- MySQL port closed (Docker internal access only)
- External `traefik-network` (IHM only)

---

## Tests

### Unit Tests (Vitest)

```bash
# API — unit tests
cd api && npx vitest run

# Extractor — tests (classifyPort, dataforge helpers)
cd extractor && npx vitest run

# IHM — component/hook/page tests (Vitest + Testing Library)
cd ihm && npm run test:run
```

### E2E Tests (API)

```bash
# Requires the API to be running
cd api && npm run test:e2e
```

---

## Backup

Automated MySQL backup with `db/backup.sh`:

- **mysqldump** with `--single-transaction`, `--routines`, `--triggers`
- **gzip** compression
- **7-day** retention (automatic cleanup of old backups)
- **Cron**: daily at 3:00 UTC

```bash
# Cron configured on VPS
0 3 * * * /home/debian/starvis/db/backup.sh >> /home/debian/starvis/backups/backup.log 2>&1

# Manual backup
bash /home/debian/starvis/db/backup.sh

# Restore
gunzip < /home/debian/starvis/backups/starvis_YYYY-MM-DD_HHMM.sql.gz | \
  docker exec -i starvis-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" starvis
```

---

## Examples

### List Aegis fighters

```bash
curl 'https://starvis.ampynjord.bzh/api/v1/ships?manufacturer=AEGS&role=combat' | jq '.data[] | {name, mass, scm_speed}'
```

### View Gladius loadout

```bash
curl 'https://starvis.ampynjord.bzh/api/v1/ships/AEGS_Gladius/loadout' | jq
```

### List S3+ weapons by DPS

```bash
curl 'https://starvis.ampynjord.bzh/api/v1/components?type=WeaponGun&size=3&sort=weapon_dps&order=desc' | jq
```

### Compare two ships

```bash
curl 'https://starvis.ampynjord.bzh/api/v1/ships/AEGS_Gladius/compare/AEGS_Sabre' | jq '.data.comparison'
```

### Export components to CSV

```bash
curl 'https://starvis.ampynjord.bzh/api/v1/components?type=WeaponGun&format=csv' -o weapons.csv
```

### Admin

```bash
# Sync Ship Matrix
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" https://starvis.ampynjord.bzh/admin/sync-ship-matrix | jq

# Extract game data (local PC with Star Citizen)
cd extractor && npx tsx extract.ts --p4k "/path/to/Data.p4k"
```

---

## Development

```bash
# Dev mode with hot-reload (API)
cd api && npm run dev

# Dev mode (IHM — http://localhost:5173)
cd ihm && npm run dev

# Docker logs (real-time)
docker compose -f docker-compose.dev.yml logs -f api

# Full rebuild (reset DB)
docker compose -f docker-compose.dev.yml down -v && docker compose -f docker-compose.dev.yml up --build -d
```

---

## Data Sources

| Source | Description | Tables |
|--------|-------------|--------|
| [RSI Ship Matrix API](https://robertsspaceindustries.com/ship-matrix/index) | Official ship list (marketing) | `ship_matrix` |
| P4K / DataForge (Game2.dcb) | Actual in-game data | `ships`, `components`, `items`, `commodities`, `missions`, `crafting_recipes`, `mining_elements`, `ship_loadouts`, `manufacturers`, `ship_modules`, `ship_paints`, `shops`, `shop_inventory`, `commodity_prices` |

---

## Troubleshooting

### MySQL health check fails in CI/CD

**Symptom**: Container `starvis-mysql` unhealthy, deployment fails with "dependency failed to start"

**Cause**: Health check `mysqladmin ping -h localhost` fails when MySQL requires password authentication

**Solution**: Authenticated health check in `docker-compose.dev.yml`:
```yaml
healthcheck:
  test: ["CMD-SHELL", "mysqladmin ping -h localhost -u root -p$$MYSQL_ROOT_PASSWORD || exit 1"]
```
Note: `$$MYSQL_ROOT_PASSWORD` with double `$$` (Compose escapes it to a single `$`)

### Extractor cannot connect to production MySQL

**Symptom**: `Access denied for user 'starvis_user'@'172.18.0.1' (using password: YES)`

**Cause**: Docker MySQL creates the user with `localhost` host only. External connections come from a different IP.

**Solution**: `db/init.sh` creates the user with `'%'` (all hosts):
```bash
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON ${MYSQL_DATABASE}.* TO '${MYSQL_USER}'@'%';
```

### CD deploy fails: "cannot fast-forward"

**Symptom**: `git pull --ff-only` fails because local files were modified on the VPS

**Cause**: Manual operations (chmod, edits) modified tracked files

**Solution**: The deploy script runs `git reset --hard HEAD` before pull. If the problem persists:
```bash
cd /home/debian/starvis
git reset --hard HEAD
git pull origin main
```

### Rate limiting too strict / too lenient

Rate limiting is configurable at multiple levels:

| Layer | Parameter | Default | Location |
|-------|-----------|---------|----------|
| Burst | 30 req/min | `server.ts` | API |
| SlowDown | Delay after 100 req, +500ms/req | `server.ts` | API |
| Hard limit | `RATE_LIMIT_MAX` env var | 200 req/15min | API |
| Admin | 20 req/15min | `server.ts` | API |
| Nginx API | 10 req/s, burst 20 | `nginx.conf` | IHM |
| Nginx static | 30 req/s, burst 50 | `nginx.conf` | IHM |
| Nginx connections | 20 simultaneous/IP | `nginx.conf` | IHM |

---

## Disclaimer

This is an **unofficial** fan-made project and is not affiliated with, endorsed, or sponsored by Cloud Imperium Games (CIG) or Roberts Space Industries (RSI). *Star Citizen*, the Star Citizen logo, and all related marks, logos, ships, and assets are trademarks and/or copyrights of Cloud Imperium Rights LLC and Cloud Imperium Rights Ltd. All game data, ship specifications, and related content extracted or displayed by this project remain the property of Cloud Imperium Games.

---
