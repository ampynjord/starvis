# STARVIS

[![CI/CD](https://github.com/ampynjord/starvis/actions/workflows/ci.yml/badge.svg)](https://github.com/ampynjord/starvis/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/ampynjord/starvis/branch/main/graph/badge.svg)](https://codecov.io/gh/ampynjord/starvis)
[![Node v22](https://img.shields.io/badge/node-v22-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**REST API + Web Interface for Star Citizen game data**

Monorepo with 4 modules:

- **api/** — Express.js + TypeScript + Prisma + MySQL backend (deployed on VPS)
- **extractor/** — Commander.js CLI for P4K/DataForge extraction (runs locally)
- **db/** — Database initialization & backup scripts
- **ihm/** — React 18.3 + TanStack Query + Tailwind CSS web interface

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
├── biome.json                  # Linter/formatter (Biome)
├── docker-compose.dev.yml      # Dev orchestration (mysql, api, ihm with hot-reload)
├── docker-compose.prod.yml     # Prod override (Traefik, pre-built GHCR images)
├── api/
│   ├── Dockerfile              # Multi-stage (base → deps → build → production)
│   ├── server.ts               # Entry point (helmet, rate limiting, Swagger)
│   ├── openapi.json            # OpenAPI 3.0 spec (~79 endpoints)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── playwright.config.ts    # E2E test config
│   ├── prisma/
│   │   └── schema.prisma       # Database schema (18 models)
│   └── src/
│       ├── routes.ts           # Routes barrel
│       ├── schemas.ts          # Zod validation schemas
│       ├── db/
│       │   └── index.ts        # Prisma client
│       ├── middleware/
│       │   ├── auth.ts         # X-API-Key auth (timing-safe)
│       │   ├── prometheus.ts   # HTTP metrics middleware
│       │   └── index.ts
│       ├── routes/
│       │   ├── index.ts        # Route mounting
│       │   ├── ships.ts        # Ships CRUD + compare + loadout
│       │   ├── components.ts   # Components + filters
│       │   ├── items.ts        # FPS items
│       │   ├── commodities.ts  # Commodities
│       │   ├── shops.ts        # Shops + inventory
│       │   ├── trade.ts        # Trade prices + routes
│       │   ├── ship-matrix.ts  # RSI Ship Matrix
│       │   ├── manufacturers.ts
│       │   ├── paints.ts       # Ship paints
│       │   ├── search.ts       # Global search
│       │   ├── admin.ts        # Admin endpoints (sync, extraction)
│       │   ├── health.ts       # Health checks (live/ready/metrics)
│       │   ├── system.ts       # System info
│       │   └── types.ts        # Route dependency types
│       ├── services/
│       │   ├── ship-matrix-service.ts      # RSI API → ship_matrix
│       │   ├── game-data-service.ts        # Read-only facade → REST API
│       │   ├── ship-query-service.ts       # Ship queries
│       │   ├── component-query-service.ts  # Component queries
│       │   ├── item-query-service.ts       # FPS item queries
│       │   ├── commodity-query-service.ts  # Commodity queries
│       │   ├── loadout-service.ts          # Loadout + module queries
│       │   ├── shop-service.ts             # Shop queries
│       │   ├── prometheus.ts               # Prometheus metrics
│       │   ├── redis.ts                    # Redis cache (graceful fallback)
│       │   ├── schema.ts                   # DB init + auto-migrations
│       │   └── shared.ts                   # Shared query helpers
│       └── utils/
│           ├── config.ts       # Environment config
│           ├── logger.ts       # Winston logger
│           └── index.ts
├── extractor/
│   ├── extract.ts              # CLI entry point (Commander.js)
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── scripts/
│   │   └── apply-migrations.ts
│   └── src/
│       ├── extraction-service.ts   # Main extraction orchestrator
│       ├── p4k-provider.ts         # P4K archive reader
│       ├── dataforge-parser.ts     # DataForge binary parser
│       ├── dataforge-service.ts    # DataForge record queries
│       ├── dataforge-utils.ts      # DataForge helpers
│       ├── cryxml-parser.ts        # CryXML binary parser
│       ├── component-extractor.ts  # Component extraction
│       ├── item-extractor.ts       # FPS item extraction
│       ├── shop-paint-extractor.ts # Shop + paint extraction
│       ├── loadout-parser.ts       # Ship loadout parser
│       ├── crossref.ts             # Ship ↔ Ship Matrix linking
│       ├── localization-service.ts # In-game text localization
│       └── logger.ts               # Winston logger
├── db/
│   ├── init.sh                 # MySQL user/privileges init
│   └── backup.sh               # mysqldump + gzip + retention
└── ihm/
    ├── Dockerfile              # Multi-stage (build → nginx)
    ├── nginx.conf              # Nginx config (rate limiting, security)
    ├── index.html
    ├── package.json
    ├── vite.config.ts
    ├── vitest.config.ts
    ├── tailwind.config.js
    └── src/
        ├── App.tsx             # Root (ErrorBoundary, routing)
        ├── main.tsx            # React entry point
        ├── index.css           # Tailwind + custom styles
        ├── components/
        │   ├── layout/         # AppShell, Sidebar, TopBar
        │   ├── ship/           # ShipCard, ShipLoadout, LoadoutTree, CargoGrid, ShipStatsBanner
        │   ├── mining/         # Mining solver components (laser, composition, yield, risk)
        │   └── ui/             # Reusable UI (ErrorBoundary, Pagination, FilterPanel, HoloCard…)
        ├── pages/
        │   ├── ShipsPage.tsx           # Ship browser
        │   ├── ShipDetailPage.tsx      # Ship detail + loadout
        │   ├── ComparePage.tsx         # Ship comparison
        │   ├── RankingPage.tsx         # Ship ranking
        │   ├── ComponentsPage.tsx      # Component browser
        │   ├── ComponentDetailPage.tsx # Component detail
        │   ├── ItemsPage.tsx           # FPS item browser
        │   ├── ItemDetailPage.tsx      # Item detail
        │   ├── CommoditiesPage.tsx     # Commodity browser
        │   ├── CommodityDetailPage.tsx # Commodity detail
        │   ├── TradePage.tsx           # Trade route finder
        │   ├── MissionsPage.tsx        # Mission browser
        │   ├── CraftingPage.tsx        # Crafting recipes
        │   ├── MiningPage.tsx          # Mining solver
        │   ├── MineralsLibraryPage.tsx # Mineral library
        │   ├── ShopsPage.tsx           # Shop browser
        │   ├── PaintsPage.tsx          # Paint browser
        │   ├── ManufacturersPage.tsx   # Manufacturer browser
        │   ├── EquipmentPage.tsx       # Equipment browser
        │   ├── OutfitterPage.tsx       # Ship outfitter
        │   ├── FpsCalculatorPage.tsx   # FPS damage calculator
        │   ├── ChangelogPage.tsx       # Extraction changelog
        │   ├── SearchResultsPage.tsx   # Global search results
        │   ├── HomePage.tsx            # Landing page
        │   └── NotFoundPage.tsx        # 404 page
        ├── hooks/
        │   └── useDebounce.ts
        ├── services/
        │   └── api.ts          # API client (fetch wrapper, pagination support)
        ├── types/
        │   ├── api.ts          # API response types
        │   └── mining.ts       # Mining types
        ├── router/
        │   └── index.tsx       # React Router config
        └── utils/
```

---

## Quick Start

### Prerequisites

- Node.js 22+
- Docker & Docker Compose
- Star Citizen installation (for extraction only)

### Environment Setup

Copy the example `.env` file and adjust values:

```bash
cp .env.dev.example .env.dev
```

### Development (Docker)

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up
```

This starts:
- **MySQL** on port 3306
- **Redis** on port 6379
- **API** on port 3000 (hot-reload via tsx watch)
- **IHM** on port 5173 (Vite HMR)

### Development (local)

```bash
# API
cd api && npm install && npm run dev

# IHM (separate terminal)
cd ihm && npm install && npm run dev
```

### Data Extraction

Run the extractor locally to populate the database with game data:

```bash
cd extractor && npm install
npx tsx extract.ts --p4k "C:/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k"
```

CLI options:

| Option | Description |
|--------|-------------|
| `-p, --p4k <path>` | Path to Data.p4k (required) |
| `-e, --env <path>` | Path to .env file (default: `../.env.extractor`) |
| `-m, --modules <list>` | Comma-separated modules to extract (e.g. `ships,components`) |
| `--dry-run` | Initialize DataForge without writing to DB |
| `-V, --version` | Print version |
| `-h, --help` | Show help |

---

## Environment Variables

All configuration is done through `.env` files at the project root.

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
```

All GET endpoints read from MySQL (no direct P4K/RSI access).
DB writes only happen at startup or via admin POST endpoints.

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
