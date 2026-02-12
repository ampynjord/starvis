# STARVIS v1.0

**REST API + Web Interface for Star Citizen ship data**

3-part monorepo:
- **api/** — Backend Express.js + TypeScript + MySQL
- **db/** — SQL schema + initialization scripts
- **ihm/** — Frontend Vue 3 + Vite + Tailwind CSS

Two complementary data sources:
- **RSI Ship Matrix** — official marketing data (246 ships)
- **P4K DataForge** — actual game data (~353 ships, ~2700+ components, ~35,000 loadout ports)

---

## Features

- **Ship Matrix**: 246 ships from the RSI API (marketing data, official specs)
- **Game Data**: ~353 playable ships extracted from P4K/DataForge (filtered, no duplicates/tests)
- **Components**: ~2700+ components across 12 types (weapons, shields, power plants, coolers, quantum drives, missiles, thrusters, radars, countermeasures, fuel tanks, fuel intakes, life support)
- **Weapon Damage Breakdown**: detailed damage by type (physical, energy, distortion, thermal, biochemical, stun)
- **Burst / Sustained DPS**: instant DPS, burst (until overheat), and sustained (with cooling cycles)
- **Missile Damage Breakdown**: detailed missile damage by type (physical, energy, distortion)
- **Shops & Prices**: in-game shops with inventory and purchase/rental prices
- **Loadout Simulator**: aggregated stats calculation (total DPS, shields, power, thermal) with component swapping
- **Manufacturers**: ~55 manufacturers (vehicles + components)
- **Loadouts**: ~35,000 default equipment ports with parent/child hierarchy
- **Cross-reference**: automatic ships ↔ ship_matrix linking (~206 linked via aliases + fuzzy matching)
- **Pagination** on all list endpoints (page, limit, total, pages)
- **Filters & sorting** on ships, components, manufacturers, shops
- **CSV Export** on all list endpoints (`?format=csv`)
- **ETag / Cache** HTTP with `Cache-Control` and `If-None-Match` (304)
- **Rate limiting** configurable (200 req / 15 min per IP by default)
- **Comparison**: side-by-side ship comparison with numeric deltas
- **Swagger / OpenAPI** interactive docs at `/api-docs`
- **Extraction versioning** with extraction log in database
- **CI/CD** GitHub Actions (lint, tests, Docker build API + IHM, push ghcr.io)

---

## Project Structure

```
starvis/
├── docker-compose.yml     # Orchestrates 3 services (mysql, api, ihm)
├── .env                   # Configuration (see .env.example)
├── api/                   # Backend Express.js + TypeScript
│   ├── Dockerfile
│   ├── server.ts
│   ├── package.json
│   └── src/
├── db/                    # Database
│   ├── schema.sql
│   └── init.sh
├── ihm/                   # Frontend Vue 3 + Vite + Tailwind
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── package.json
│   └── src/
└── .github/workflows/     # CI/CD
```

---

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Star Citizen installed (for P4K data)

### Installation

```bash
git clone https://github.com/ampynjord/starvis
cd starvis
cp .env.example .env    # then edit passwords and paths
docker compose up -d
# API  → http://localhost:3003
# IHM  → http://localhost:8080
# MySQL → localhost:3306
curl http://localhost:3003/health
```

> First startup takes ~6 min (extracting ~353 ships from P4K).

### Environment Variables

All configuration is in `.env` (see `.env.example`).

| Variable | Description | Default |
|----------|-------------|---------|
| `API_PORT` | Port exposed on host | `3003` |
| `API_INTERNAL_PORT` | Internal container port | `3000` |
| `IHM_PORT` | Web interface port | `8080` |
| `NODE_ENV` | Environment (production/development) | `production` |
| `LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |
| `ADMIN_API_KEY` | Admin access key (**required**) | — |
| `CORS_ORIGIN` | CORS origin | `*` |
| `RATE_LIMIT_MAX` | Max requests / 15 min | `200` |
| `DB_HOST` | MySQL host | `mysql` |
| `DB_PORT` | Internal MySQL port (docker network) | `3306` |
| `DB_EXTERNAL_PORT` | MySQL port exposed on host | `3306` |
| `DB_USER` | MySQL user | — |
| `DB_PASSWORD` | MySQL password | — |
| `DB_NAME` | Database name | `starvis` |
| `MYSQL_ROOT_PASSWORD` | MySQL root password | — |
| `P4K_PATH` | Path to Data.p4k in container | `/game/Data.p4k` |
| `P4K_VOLUME` | Host path to Star Citizen LIVE folder | — |

---

## API Endpoints

### Ship Matrix (RSI)

Données officielles RSI Ship Matrix — 246 vaisseaux.

```bash
# Liste complète (ou avec recherche)
GET /api/v1/ship-matrix
GET /api/v1/ship-matrix?search=hornet

# Détails par ID RSI ou nom
GET /api/v1/ship-matrix/123
GET /api/v1/ship-matrix/Aurora%20MR

# Statistiques
GET /api/v1/ship-matrix/stats
```

### Ships (Game Data)

~353 playable ships extracted from P4K/DataForge with all actual game data.
Paginated responses by default (50 items/page, max 200).

```bash
# List with filters + pagination
GET /api/v1/ships
GET /api/v1/ships?manufacturer=AEGS&role=combat&sort=mass&order=desc
GET /api/v1/ships?page=2&limit=20
GET /api/v1/ships?format=csv

# Details (by UUID or class_name)
GET /api/v1/ships/:uuid
GET /api/v1/ships/AEGS_Gladius

# Default loadout (hierarchical)
GET /api/v1/ships/:uuid/loadout
GET /api/v1/ships/AEGS_Gladius/loadout

# Side-by-side comparison
GET /api/v1/ships/AEGS_Gladius/compare/AEGS_Sabre
```

#### Ship Fields

| Field | Description |
|-------|-------------|
| `uuid`, `class_name`, `name` | Identifiers |
| `manufacturer_code`, `career`, `role` | Classification |
| `mass`, `total_hp` | Mass (kg), total HP (sum of parts) |
| `scm_speed`, `max_speed` | SCM and max speed (m/s) |
| `boost_speed_forward/backward/left/right/up/down` | Directional boost speeds |
| `pitch_max`, `yaw_max`, `roll_max` | Max rotation (°/s) |
| `hydrogen_fuel`, `quantum_fuel` | Fuel capacities |
| `cargo_capacity` | Cargo capacity (SCU) |
| `armor_physical/energy/distortion` | Armor resistance |
| `armor_thermal/biochemical/stun` | Armor resistance (cont.) |
| `armor_signal_ir/em/cs` | Armor signatures |
| `cross_section_x/y/z` | Cross section |
| `short_name`, `description` | Short name and description |
| `ship_grade` | Ship grade |
| `shield_hp` | Cumulated shield HP |
| `missile_damage_total` | Total missile damage (default loadout) |
| `ship_matrix_id` | RSI Ship Matrix ID (if linked) |

#### Ship Filters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `manufacturer` | Manufacturer code | `AEGS`, `ANVL`, `RSI` |
| `role` | Role | `combat`, `transport` |
| `search` | Name/className search | `Gladius` |
| `sort` | Sort by | `name`, `mass`, `scm_speed`, `total_hp`, `boost_speed_forward`, `cargo_capacity`, `armor_physical`, `cross_section_x` |
| `order` | Order | `asc`, `desc` |
| `page` | Page (1-based) | `1`, `2`, `3` |
| `limit` | Items per page (max 200) | `10`, `50`, `200` |
| `format` | Output format | `json` (default), `csv` |

### Components (Game Data)

~1200+ interchangeable components extracted from DataForge, across 12 types.
Paginated responses by default.

```bash
# List with filters + pagination
GET /api/v1/components
GET /api/v1/components?type=WeaponGun&size=3&manufacturer=BEHR
GET /api/v1/components?page=2&limit=20
GET /api/v1/components?format=csv

# Details
GET /api/v1/components/:uuid
```

#### Component Types

| Type | Description | Examples |
|------|-------------|----------|
| `WeaponGun` | Weapons (cannons, gatlings, lasers, scatterguns) | Attrition, Mantis, Revenant |
| `Shield` | Shields | Castra, Sukoran, Fortifier |
| `PowerPlant` | Power plants | Genoa, Fierell |
| `Cooler` | Coolers | Bracer, NDB-28 |
| `QuantumDrive` | Quantum drives | Beacon, Atlas |
| `Missile` | Missiles | Dominator, Arrester, Rattler |
| `Thruster` | Thrusters (main + maneuvering) | — |
| `Radar` | Radars | — |
| `Countermeasure` | Countermeasures (flares, chaff) | — |
| `FuelTank` | Fuel tanks (hydrogen + quantum) | — |
| `FuelIntake` | Fuel intakes (scooping) | — |
| `LifeSupport` | Life support | — |

#### Component Filters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `type` | Component type | `WeaponGun`, `Shield`, `PowerPlant`, `QuantumDrive`, `Cooler`, `Missile` |
| `size` | Size (0-9) | `3` |
| `manufacturer` | Manufacturer code | `BEHR` |
| `search` | Name/className search | `Gatling` |
| `sort` | Sort by | `name`, `weapon_dps`, `weapon_burst_dps`, `weapon_sustained_dps`, `shield_hp`, `qd_speed`, `thruster_max_thrust`, `radar_range`, `fuel_capacity` |
| `page` | Page (1-based) | `1`, `2` |
| `limit` | Items per page (max 200) | `10`, `50` |
| `format` | Output format | `json`, `csv` |

### Manufacturers

~55 manufacturers (vehicles + components).

```bash
GET /api/v1/manufacturers
```

### Shops & Prices

In-game shops with location, inventory and prices.

```bash
# Shop list (paginated)
GET /api/v1/shops
GET /api/v1/shops?location=lorville&type=Weapons

# Shop inventory
GET /api/v1/shops/:id/inventory

# Where to buy a component (prices + shops)
GET /api/v1/components/:uuid/buy-locations
```

### Loadout Simulator

Aggregated stats calculator for a custom loadout.

```bash
# Default stats (no swap)
curl -X POST http://localhost:3003/api/v1/loadout/calculate \
  -H "Content-Type: application/json" \
  -d '{"shipUuid": "...", "swaps": []}'

# With component replacement
curl -X POST http://localhost:3003/api/v1/loadout/calculate \
  -H "Content-Type: application/json" \
  -d '{"shipUuid": "...", "swaps": [{"portName": "hardpoint_weapon_gun_left", "componentUuid": "..."}]}'
```

**Response**:
```json
{
  "stats": {
    "weapons": { "count": 3, "total_dps": 542.5, "total_burst_dps": 610.2, "total_sustained_dps": 480.1 },
    "shields": { "total_hp": 5000, "total_regen": 120 },
    "missiles": { "count": 4, "total_damage": 8400 },
    "power": { "total_draw": 3200, "total_output": 4500, "balance": 1300 },
    "thermal": { "total_heat_generation": 2800, "total_cooling_rate": 3500, "balance": 700 }
  }
}
```

### Version / Extraction

```bash
# Latest game data extraction
GET /api/v1/version
```

### Swagger / OpenAPI

```bash
# Interactive documentation
GET /api-docs
```

### Admin (requires X-API-Key)

```bash
# Sync RSI Ship Matrix
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/sync-ship-matrix

# Full P4K/DataForge extraction
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/extract-game-data

# DB statistics
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/stats

# Extraction log
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/extraction-log
```

### Health

```bash
GET /health
```

---

## Database

### Schema (7 tables)

```
┌────────────────────┐
│    ship_matrix     │  ← RSI Ship Matrix API (246 ships)
├────────────────────┤
│ id (PK)            │
│ name               │
│ manufacturer_code  │
│ focus, type, size  │
│ dimensions, specs  │
│ media URLs         │
│ compiled (JSON)    │
│ synced_at          │
└────────────────────┘
         ▲
         │ ship_matrix_id (FK)
┌────────────────────┐     ┌────────────────────┐
│      ships         │     │  manufacturers     │
├────────────────────┤     ├────────────────────┤
│ uuid (PK)          │     │ code (PK)          │
│ class_name         │     │ name               │
│ name               │     │ description        │
│ manufacturer_code ─┼────►│ known_for          │
│ career, role       │     └────────────────────┘
│ mass, total_hp     │
│ scm/max/boost speed│
│ pitch/yaw/roll_max │
│ fuels, shield_hp   │
│ cargo_capacity     │
│ missile_damage     │
│ insurance          │
│ armor, cross_section│
│ game_data (JSON)   │
└────────┬───────────┘
         │ ship_uuid (FK)
┌────────────────────────────┐     ┌────────────────────┐
│     ships_loadouts         │     │    components       │
├────────────────────────────┤     ├────────────────────┤
│ id (PK)                    │     │ uuid (PK)          │
│ ship_uuid (FK) ────────────┤     │ class_name         │
│ port_name                  │     │ name, type, size   │
│ port_type                  │     │ weapon stats       │
│ component_class_name       │     │ shield stats       │
│ component_uuid (FK) ───────┼────►│ QD stats           │
│ parent_id (self-ref)       │     │ missile stats      │
└────────────────────────────┘     │ power, thermal     │
                                   └────────────────────┘
┌─────────────────────┐     ┌─────────────────────────┐
│       shops         │     │   shop_inventory        │
├─────────────────────┤     ├─────────────────────────┤
│ id (PK)             │     │ id (PK)                 │
│ name                │◄────┤ shop_id (FK)            │
│ location            │     │ component_uuid (FK) ─────┼──► components
│ parent_location     │     │ component_class_name    │
│ shop_type           │     │ base_price              │
│ class_name (UNIQUE) │     │ rental_price_1d/3d/7d.. │
└─────────────────────┘     └─────────────────────────┘
```

### Current Data

| Table | Entries |
|-------|---------|
| `ship_matrix` | 246 |
| `ships` | ~353 (playable ships, filtered) |
| `components` | ~2700+ (12 types, 62 columns incl. damage breakdown) |
| `manufacturers` | ~55 |
| `ships_loadouts` | ~35,000 ports |
| `shops` | Variable (per extraction) |
| `shop_inventory` | Variable (purchase/rental prices) |
| Ships linked to Ship Matrix | ~206 |

### Main Manufacturers

#### Vehicles (Ship Matrix + P4K)

| Code | Nom |
|------|-----|
| AEGS | Aegis Dynamics |
| ANVL | Anvil Aerospace |
| ARGO | ARGO Astronautics |
| BANU | Banu |
| CNOU | Consolidated Outland |
| CRUS | Crusader Industries |
| DRAK | Drake Interplanetary |
| ESPR | Esperia |
| GAMA | Gatac Manufacture |
| GLSN / GREY | Grey's Market |
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

| Code | Nom |
|------|-----|
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

```
starvis/
├── server.ts                      # Express entry point
├── .github/
│   └── workflows/
│       └── ci.yml                 # CI/CD GitHub Actions (4 jobs)
├── db/
│   └── schema.sql                 # MySQL schema (5 tables + FK)
├── src/
│   ├── routes.ts                  # API v1.0 endpoints (pagination, ETag, CSV, compare)
│   ├── middleware/
│   │   └── auth.ts                # X-API-Key auth
│   ├── providers/
│   │   └── p4k-provider.ts        # P4K file reader (ZIP+AES)
│   ├── services/
│   │   ├── schema.ts              # DB schema init + migrations
│   │   ├── ship-matrix-service.ts # RSI API → ship_matrix
│   │   ├── dataforge-service.ts   # P4K/DCB parser (~2300 lines)
│   │   └── game-data-service.ts   # DataForge → ships/components/loadouts
│   └── utils/
│       ├── config.ts              # Centralized configuration
│       ├── cryxml-parser.ts       # Binary CryXML parser
│       └── logger.ts              # Winston logger
├── tests/
│   └── test-all.mjs               # 50+ API tests (endpoints + data quality)
├── docker-compose.yml
├── Dockerfile                     # Multi-stage (4 stages)
└── package.json
```

### Data Pipeline

```
On startup:
  1. Init DB + schema (5 tables) + migrations
  2. ShipMatrixService.sync()        → 246 ships in ship_matrix
  3. DataForgeService.init()         → Open P4K (284 MB, Game2.dcb)
  4. GameDataService.extractAll()    → In background:
     ├── saveManufacturersFromData() → ~50 manufacturers
     ├── saveComponents()            → ~1200+ components (12 types)
     ├── saveShips() + loadouts      → ~353 ships + ~35000 loadout ports
     ├── crossReferenceShipMatrix()  → ~205 ships linked (multi-pass + aliases)
     └── INSERT extraction_log       → SHA-256 hash + stats + duration
```

All GET endpoints read from MySQL (no direct P4K/RSI source access).
DB writes only occur at startup or via admin POST endpoints.

### Tech Stack

- **Runtime**: Node.js 20+ with TypeScript (tsx)
- **Framework**: Express.js + express-rate-limit
- **Documentation**: Swagger / OpenAPI 3.0 (swagger-jsdoc + swagger-ui-express)
- **Database**: MySQL 8.0
- **Containerization**: Docker multi-stage & Docker Compose
- **CI/CD**: GitHub Actions (lint → tests → build → deploy)
- **Registry**: ghcr.io (GitHub Container Registry)
- **Logging**: Winston (module tags, durations, filtering)

---

## CI/CD

GitHub Actions pipeline (`.github/workflows/ci.yml`) in 4 steps:

| Job | Description | Trigger |
|-----|-------------|---------|
| **Lint** | TypeScript type-check (`tsc --noEmit`) | push/PR on `main` |
| **Test** | API tests with MySQL (50+ tests) | after Lint |
| **Build** | Docker build + push ghcr.io | push on `main` only |
| **Deploy** | Notification (deployment placeholder) | after Test + Build |

Tests run **without P4K** in CI: game-data tests are automatically skipped (SKIP) when no extraction is available.

---

## Docker

### Multi-stage Architecture

```
Stage 1: base         → node:20-alpine, WORKDIR /app
Stage 2: deps         → npm ci (all deps)
Stage 3: build        → TypeScript type-check (tsc --noEmit)
Stage 4: production   → npm ci --omit=dev + tsx, non-root user, healthcheck
```

Ports are configurable via `.env` (`API_PORT` for host, `API_INTERNAL_PORT` for container).

---

## Tests

```bash
# Run tests (requires API to be running)
node tests/test-all.mjs

# Or with a custom URL
node tests/test-all.mjs http://localhost:3003
```

---

## Examples

### List Aegis fighters

```bash
curl 'http://localhost:3003/api/v1/ships?manufacturer=AEGS&role=combat' | jq '.data[] | {name, mass, scm_speed}'
```

### View the Gladius loadout

```bash
curl 'http://localhost:3003/api/v1/ships/AEGS_Gladius/loadout' | jq
```

### List S3+ weapons by DPS

```bash
curl 'http://localhost:3003/api/v1/components?type=WeaponGun&size=3&sort=weapon_dps&order=desc' | jq
```

### Compare two ships

```bash
curl 'http://localhost:3003/api/v1/ships/AEGS_Gladius/compare/AEGS_Sabre' | jq '.data.comparison'
```

### Export components to CSV

```bash
curl 'http://localhost:3003/api/v1/components?type=WeaponGun&format=csv' -o weapons.csv
```

### Resync admin

```bash
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/sync-ship-matrix | jq
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/extract-game-data | jq
```

---

## Development

```bash
# Dev mode with hot-reload
npm run dev

# Real-time Docker logs
docker compose logs -f api

# Full rebuild (reset DB)
docker compose down -v && docker compose up --build -d
```

---

## Data Sources

| Source | Description | Tables |
|--------|-------------|--------|
| [RSI Ship Matrix API](https://robertsspaceindustries.com/ship-matrix/index) | Official ship list (marketing) | `ship_matrix` |
| P4K / DataForge (Game2.dcb) | Actual game data | `ships`, `components`, `ships_loadouts`, `manufacturers` |

---

## License

MIT © [ampynjord](https://github.com/ampynjord)
