# STARVIS

[![CI/CD](https://github.com/ampynjord/starvis/actions/workflows/ci.yml/badge.svg)](https://github.com/ampynjord/starvis/actions/workflows/ci.yml)
[![Node v22](https://img.shields.io/badge/node-v22-green)](https://nodejs.org)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

Star Citizen data platform

- **Production**: [starvis.ampynjord.bzh](https://starvis.ampynjord.bzh)
- **API Docs**: [starvis.ampynjord.bzh/api-docs](https://starvis.ampynjord.bzh/api-docs)

---

## Monorepo structure

| Directory | Role |
|---|---|
| `api/` | Express.js REST API + Prisma (deployed on VPS) |
| `ihm/` | Next.js + Tailwind CSS web interface |
| `bot/` | Discord bot with slash commands |
| `extractor/` | P4K → PostgreSQL extraction CLI (runs locally) |
| `db/` | Prisma schemas, PostgreSQL init, backup script |

---

## Local install

### Prerequisites

- [Node.js 22+](https://nodejs.org)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- Git

### 1 — Clone and install dependencies

```bash
git clone https://github.com/ampynjord/starvis.git
cd starvis
npm install        # installs all workspaces (api, ihm, bot, extractor, db)
```

The monorepo uses the root `package-lock.json` as the single dependency lockfile. Workspace packages should not keep nested lockfiles. The extractor keeps `extractor/extract.ts` as its stable command wrapper; implementation code lives under `extractor/src/`.

### 2 — Configure the environment

```bash
cp .env.dev.example .env.dev
```

Open `.env.dev` and set at minimum:

| Variable | Required | Description |
|---|---|---|
| `DB_PASSWORD` | yes | PostgreSQL password (any string in dev) |
| `JWT_SECRET` | yes | Random secret for JWT signing (≥ 32 chars) |
| `ADMIN_API_KEY` | yes | API key for admin endpoints |
| `MISTRAL_API_KEY` | optional | Enables the AI chat assistant |
| `DISCORD_TOKEN` | optional | Discord bot (can skip for UI-only dev) |
| `SMTP_HOST` | optional | Outgoing email for password reset / verification |

All variables and their defaults are documented in `.env.dev.example`.

### 3 — Start the stack

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up
```

On first start Docker creates the PostgreSQL database and the three schemas (`game`, `rsi`, `meta`).
The API then runs `prisma db push` automatically to create all tables before serving requests.

| Service | URL / Port |
|---|---|
| **IHM** (Next.js, hot reload) | http://localhost:5173 |
| **API** (Express, hot reload) | http://localhost:3000 |
| **Swagger UI** | http://localhost:3000/api-docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

> The Discord bot starts automatically but does nothing if `DISCORD_TOKEN` is empty.

### 4 — Load game data (optional)

The database is empty on first start — the UI will show no ships or items.
To populate it, run the extractor with your local Star Citizen installation:

```bash
cp extractor/.env.extractor.example extractor/.env.dev
# Set DB_PASSWORD to match .env.dev

# Populate LIVE data (requires Data.p4k)
npx tsx extractor/extract.ts --env live --game-version 4.7.2

# Network-only modules (no Data.p4k needed)
npx tsx extractor/extract.ts --modules ship-matrix,galactapedia,starmap
```

See [`extractor/README.md`](extractor/README.md) for the full list of modules and options.

---

## API-only self-host

Use this mode when you only want the REST API, PostgreSQL, Redis and the local extractor workflow, without the Next.js UI or Discord bot.

```bash
cp .env.api-only.example .env.api-only
# Fill DB_PASSWORD, JWT_SECRET, ADMIN_API_KEY and CORS_ORIGIN

docker compose -f docker-compose.api-only.yml --env-file .env.api-only up -d
```

The stack starts PostgreSQL and Redis, runs a one-shot Prisma `db push`, then starts the API. Check it with:

```bash
curl http://127.0.0.1:3000/health/live
curl http://127.0.0.1:3000/health/ready
```

To populate data from the extractor running on the host, use the DB values from `.env.api-only`:

```bash
DB_HOST=127.0.0.1
DB_PORT=5432
DB_USER=starvis_user
DB_PASSWORD=<same as .env.api-only>
DB_NAME=starvis
```

### 5 — Create an admin account

Register via the UI at http://localhost:5173/register, then promote your account:

```bash
curl -X PUT http://localhost:3000/admin/users/1/role \
  -H "X-Api-Key: <ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}'
```

---

## Data sources

The application combines two complementary sources:

| Source | Content | Update |
|---|---|---|
| **P4K / DataForge** | Real in-game data (~350 ships, ~3,000 components across 22 types, ~10,000 FPS items…) | Via `extractor/` CLI |
| **RSI Ship Matrix** | Official marketing data (~246 ships) | Auto-synced at API startup |
| **RSI Website** | Galactapedia, Comm-links, Starmap, CTM | Via `extractor/` CLI |

P4K extraction runs locally — see [`extractor/README.md`](extractor/README.md).

---

## LIVE / PTU environments

LIVE and PTU data coexist in the same PostgreSQL database, separated by an `env` column (`'live'` or `'ptu'`) on each table in the `game` schema.

| Env | Current version | Description |
|---|---|---|
| `live` | 4.7.2 | Star Citizen production servers |
| `ptu` | 4.8.0 | Public Test Universe |

All API endpoints accept a `?env=live` (default) or `?env=ptu` parameter. The interface switches between them via a selector persisted in `localStorage`.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Local (developer)                                    │
│                                                      │
│  Star Citizen → P4K → extractor CLI → PostgreSQL VPS │
│  (LIVE & PTU, data separated by env column)          │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  VPS (Docker Compose)                                 │
│                                                      │
│  Traefik (HTTPS) → IHM (Next.js)                     │
│                  → API (Express)  → PostgreSQL        │
│                                   → Redis (cache)    │
│  Discord Bot      → API                              │
└──────────────────────────────────────────────────────┘
```

### Databases (PostgreSQL 16)

| Schema | Content |
|---|---|
| `game` | Ships, components, items, commodities, missions, crafting — `env = 'live'` or `'ptu'` columns |
| `rsi` | Ship Matrix, Galactapedia, Comm-links, Starmap |
| `meta` | User accounts & roles, extraction logs, auto-changelog |

---

## User roles

| Role | Access |
|---|---|
| `user` | All public data |
| `beta_tester` | Early access to tools in active development |
| `admin` | Full access + user management |

**Beta** tools (accessible to `beta_tester` and `admin` only):
- Loadout Manager (`/loadout-manager`)
- FPS Calculator (`/fps-calculator`)
- Mining Calculator (`/mining-calculator`)
- Trade Calculator (`/trade-calculator`)
- Crafting Calculator (`/crafting-calculator`)

Roles are assigned by an admin via `PUT /admin/users/:id/role`.

---

## API — Endpoints

Base: `/api/v1/`. All data endpoints accept `?env=live` (default) or `?env=ptu`.
Lists: `page`, `limit`, `search`, `sort`, `order`, `format=csv`. Full spec at `/api-docs`.

### Ships & vehicles

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/ships` | Ship list (paginated, filterable) |
| `GET` | `/ships/ranking` | Ranking by stat (`sort_by`) |
| `GET` | `/ships/search` | Autocomplete ≥ 2 characters |
| `GET` | `/ships/random` | Random ship |
| `GET` | `/ships/manufacturers` | Manufacturers with ships |
| `GET` | `/ships/filters` | Available filter values |
| `GET` | `/ships/:uuid` | Detail (includes `manufacturer`, `paints`, `similar` via `?include=`) |
| `GET` | `/ships/:uuid/loadout` | Recursive port tree (turret → gimbal → weapon) |
| `GET` | `/ships/:uuid/modules` | Optional modules (Retaliator, Apollo…) |
| `GET` | `/ships/:uuid/paints` | Ship paints |
| `GET` | `/ships/:uuid/stats` | Summary: weapons, shields, QD, coolers… |
| `GET` | `/ships/:uuid/hardpoints` | Flat hardpoint list |
| `GET` | `/ships/:uuid/similar` | Similar ships (same career/role) |
| `GET` | `/ships/:uuid/variants` | Variants of the same hull |
| `GET` | `/ships/:uuid/compare/:uuid2` | Side-by-side comparison with deltas |
| `GET` | `/ships/:uuid/model` | 3D model metadata (.ctm) |
| `GET` | `/ships/:uuid/model/file` | .ctm binary (RSI proxy with disk cache) |
| `GET` | `/ground-vehicles` | Ground vehicles (Cyclone, Ursa…) |
| `GET` | `/ground-vehicles/filters` | Ground vehicle filters |
| `GET` | `/gravlev` | Grav-lev vehicles (Nox, Dragonfly…) |
| `GET` | `/gravlev/filters` | Grav-lev filters |
| `GET` | `/ship-modules` | Ship modules (filterable by ship_uuid) |

### Components

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/components` | Paginated list (`type`, `size`, `grade`, `manufacturer`…) |
| `GET` | `/components/filters` | Filter values |
| `GET` | `/components/types` | Available types |
| `GET` | `/components/compatible` | Compatible components by type & size |
| `GET` | `/components/:uuid` | Full detail (all stats by type) |
| `GET` | `/components/:uuid/buy-locations` | Where to buy this component |
| `GET` | `/components/:uuid/ships` | Ships that equip it by default |

### FPS Items

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/items` | Paginated list (weapons, armor, gadgets, clothing…) |
| `GET` | `/items/filters` | Filter values |
| `GET` | `/items/types` | Item types |
| `GET` | `/items/sub-types` | Sub-types for a given type |
| `GET` | `/items/manufacturers` | Manufacturers for a given type |
| `GET` | `/items/categories` | Semantic categories with item count |
| `GET` | `/items/category/:slug` | Items in a category (weapons, helmet, core, arms, legs, backpack, undersuit, tools-medics, magazines, attachments, clothing, throwable, other) |
| `GET` | `/items/:uuid` | Item detail |
| `GET` | `/items/:uuid/buy-locations` | Where to buy this item |

### Commodities & Trade

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/commodities` | Paginated list |
| `GET` | `/commodities/filters` | Filters |
| `GET` | `/commodities/types` | Commodity types |
| `GET` | `/commodities/:uuid` | Commodity detail |
| `GET` | `/trade/locations` | Shops with price data |
| `GET` | `/trade/systems` | Systems with trade data |
| `GET` | `/trade/prices/:commodityUuid` | Prices for a commodity across all shops |
| `GET` | `/trade/location/:shopId/prices` | All prices at a shop |
| `GET` | `/trade/routes` | Best routes (`scu` param required) |
| `POST` | `/trade/prices` | Submit a price report |
| `GET` | `/shops` | Shop list |
| `GET` | `/shops/filters` | Shop filters |
| `GET` | `/shops/:id/inventory` | Shop inventory |

### Mining & Crafting

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/mining/elements` | Mineral elements |
| `GET` | `/mining/elements/:uuid` | Element detail + rocks containing it |
| `GET` | `/mining/compositions` | Rock compositions |
| `GET` | `/mining/compositions/:uuid` | Composition detail |
| `GET` | `/mining/solver` | Best targets for an element or composition |
| `GET` | `/mining/stats` | Global mining statistics |
| `GET` | `/mining/lasers` | Mining lasers and gadgets |
| `GET` | `/crafting/recipes` | Paginated recipes |
| `GET` | `/crafting/recipes/:uuid` | Recipe detail with ingredients |
| `GET` | `/crafting/categories` | Crafting categories |
| `GET` | `/crafting/station-types` | Station types |
| `GET` | `/crafting/resources` | Resources used as ingredients |
| `GET` | `/crafting/resources/:itemName/recipes` | Recipes using a resource |

### Calculators

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/calculate/fps-damage` | FPS weapon damage calculation (armor, hitbox, fire mode) |
| `POST` | `/calculate/mining-yield` | Mining yield calculation (composition, laser, gadgets) |
| `POST` | `/loadout/calculate` | Loadout calculation with component swaps |

### Missions & Locations _(beta_tester+)_

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/missions` | Paginated list (filters: type, faction, system…) |
| `GET` | `/missions/filters` | Mission filters |
| `GET` | `/missions/types` | Mission types |
| `GET` | `/missions/factions` | Factions |
| `GET` | `/missions/systems` | Systems |
| `GET` | `/missions/categories` | Categories |
| `GET` | `/missions/:uuid` | Mission detail |
| `GET` | `/locations` | Paginated list (**requires** `beta_tester` or `admin`) |
| `GET` | `/locations/filters` | Filters |
| `GET` | `/locations/types` | Location types |
| `GET` | `/locations/systems` | Systems with locations |
| `GET` | `/locations/all` | Full unpaginated list (for trees) |
| `GET` | `/locations/:uuid` | Location detail |
| `GET` | `/locations/:uuid/children` | Child locations |

### Manufacturers & Paints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/manufacturers` | Manufacturer list with data |
| `GET` | `/manufacturers/:code` | Manufacturer detail |
| `GET` | `/manufacturers/:code/ships` | Manufacturer's ships |
| `GET` | `/manufacturers/:code/components` | Manufacturer's components |
| `GET` | `/manufacturers/:code/items` | Manufacturer's FPS items |
| `GET` | `/paints` | Paint list |
| `GET` | `/paints/filters` | Paint filters |

### Ship Matrix & RSI Website

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/ship-matrix` | RSI Ship Matrix data (246 ships) |
| `GET` | `/ship-matrix/stats` | Aggregated statistics |
| `GET` | `/ship-matrix/:id` | Entry by ID or name |
| `GET` | `/galactapedia` | Galactapedia entries (paginated) |
| `GET` | `/galactapedia/:id` | Full article |
| `GET` | `/comm-links` | Comm-links (paginated, sorted by date) |
| `GET` | `/comm-links/categories` | Comm-link categories |
| `GET` | `/comm-links/:id` | Full article |
| `GET` | `/starmap/systems` | RSI stellar systems |
| `GET` | `/starmap/systems/:code` | System with celestial bodies |

### System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/search` | Unified search: ships, components, items, commodities, missions, recipes |
| `GET` | `/version` | Current extraction game version |
| `GET` | `/game-versions` | Extraction history |
| `GET` | `/game-versions/default` | Latest LIVE extraction |
| `GET` | `/stats/overview` | Counts: ships, components, items… |
| `GET` | `/changelog` | Data changelog (additions/removals/changes) |
| `GET` | `/changelog/summary` | Grouped changelog summary |

### AI Chat _(beta_tester+, requires MISTRAL_API_KEY)_

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/chat` | SSE streaming — Star Citizen AI assistant |
| `POST` | `/chat/ask` | Synchronous JSON response (Discord bot / external) |

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Create an account (sends a verification email) |
| `POST` | `/auth/login` | Log in → JWT 24h (or `requires2FA: true`) |
| `POST` | `/auth/verify-email` | Verify email with received token |
| `POST` | `/auth/forgot-password` | Request a password reset link |
| `POST` | `/auth/reset-password` | Reset password (token valid 1h) |
| `GET` | `/auth/me` | Logged-in user profile |
| `PUT` | `/auth/me` | Update profile (username, avatarUrl) |
| `DELETE` | `/auth/me` | Delete account |
| `POST` | `/auth/api-token` | Generate a long-lived token (1 year) — `beta_tester+` |
| `POST` | `/auth/2fa/setup` | Configure TOTP 2FA (generates secret + QR) |
| `POST` | `/auth/2fa/enable` | Enable 2FA with a TOTP code |
| `POST` | `/auth/2fa/disable` | Disable 2FA |
| `POST` | `/auth/2fa/verify` | Complete 2FA login (pendingToken + code) |

### Bug Reports

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/bug-reports` | Submit a report (authenticated user) |
| `GET` | `/api/v1/bug-reports` | List own reports |

### Admin _(admin only)_

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/stats` | Ship Matrix + game data statistics |
| `GET` | `/admin/extraction-log` | Extraction log |
| `GET` | `/admin/users` | User list |
| `POST` | `/admin/users` | Create a user |
| `PUT` | `/admin/users/:id` | Update a user |
| `PUT` | `/admin/users/:id/role` | Change role |
| `POST` | `/admin/users/:id/reset-password` | Reset password |
| `DELETE` | `/admin/users/:id` | Delete a user |
| `GET` | `/admin/bug-reports` | List all reports |
| `GET` | `/admin/bug-reports/:id` | Report detail |
| `PATCH` | `/admin/bug-reports/:id` | Update status |

### Health

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | DB connection + gameData state check |
| `GET` | `/health/live` | Liveness probe (Docker/K8s) |
| `GET` | `/health/ready` | Readiness probe (checks DB + Redis) |
| `GET` | `/health/metrics` | Prometheus metrics |
| `GET` | `/health/cache/stats` | Redis statistics |

---

## CI/CD

GitHub Actions pipeline on every push to `main`:

1. **Quality** — Lint (Biome), tests (Vitest), type-check (tsc)
2. **Build** — Docker images API + IHM + Bot → GHCR
3. **Deploy** — SSH to VPS → `docker compose up`

---

## Production

Deployment uses `.env.prod` on the VPS. To update configuration without rebuilding:

```bash
ssh -i ~/.ssh/starvis_vps debian@ampynjord.bzh
# Edit /home/debian/starvis/.env.prod
# Then restart the relevant service:
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps --force-recreate <service>
```

Production routing note: Traefik sends only backend public paths (`/api/v1`, `/api-docs`, `/health`) to the Express API. Other paths, including `/admin` pages and `/api/*` Next.js route handlers, stay on the IHM. Web admin calls use `/api/admin/*` route handlers, which proxy internally to Express `/admin/*`.

---

## Tests

```bash
npm run test                                           # All workspaces
npm run test --workspace=@starvis/api                  # API only
npm run typecheck                                      # Type-check all workspaces that expose it
npm run typecheck --workspace=@starvis/extractor       # Extractor type-check
npm run lint:ci                                        # Biome lint/check, CI-style
```

---

## Legal & Compliance

### Non-profit community project

STARVIS is an **independent, community-driven, non-profit project**. It is not affiliated with, endorsed by,
or officially connected to **Cloud Imperium Games Corporation** or **Roberts Space Industries Corp.**

### Credits — Intellectual property

**Star Citizen®** and all game data (ship names, components, items, lore, etc.)
are the property of **Cloud Imperium Games Corporation** and/or **Roberts Space Industries Corp.**

> © 2012–2025 Cloud Imperium Rights LLC. All rights reserved.

The data displayed (extracted from P4K via DataForge, RSI Ship Matrix, and the RSI website) is used
in a strictly non-commercial, community context, in accordance with CIG's community licensing policy.
STARVIS claims no ownership over this content.

### Source code license

The STARVIS source code is proprietary and all rights are reserved (see [LICENSE](LICENSE)).
This code license covers only the STARVIS code owned by ampynjord; it does not apply to data or content owned by CIG/RSI.

### GDPR / Data protection

Data collected at registration: email, username, password hash, role, avatar.
No payment data, no advertising cookies, no transmission to third parties for commercial purposes.

GDPR contact: gwenvaelcaouissin@gmail.com  
Full policy available at [/legal](https://starvis.ampynjord.bzh/legal).
