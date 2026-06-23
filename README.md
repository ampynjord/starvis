# STARVIS

[![CI/CD](https://github.com/ampynjord/starvis/actions/workflows/ci.yml/badge.svg)](https://github.com/ampynjord/starvis/actions/workflows/ci.yml)
[![Node v22](https://img.shields.io/badge/node-v22-green)](https://nodejs.org)
[![License: Proprietary](https://img.shields.io/badge/License-Proprietary-red.svg)](LICENSE)

Starvis - Star Citizen Database & Toolset is an unofficial Star Citizen data platform in active development: game data extraction, REST API, web interface, Discord bot, AI assistant, corporation tools, and database tooling.
STARVIS is an independent community project and is not affiliated with, endorsed by, sponsored by, or officially
connected to Cloud Imperium Games, Cloud Imperium Rights LLC, Roberts Space Industries Corp. or their affiliates.

- Production: [starvis.ampynjord.bzh](https://starvis.ampynjord.bzh)
- API docs: [starvis.ampynjord.bzh/api-docs](https://starvis.ampynjord.bzh/api-docs)
- OpenAPI source: [`api/openapi.json`](api/openapi.json)

## Project Positioning

Starvis aims to reduce the fragmentation of Star Citizen tooling. Instead of jumping between many disconnected
websites, spreadsheets, Discord snippets and partial calculators, players and organizations can use one coherent
platform backed by extracted and normalized game data.

The project focuses on:

- a searchable Star Citizen database for ships, components, FPS gear, commodities, missions, locations, lore and manufacturers;
- practical tools and calculators for combat, loadouts, FPS, mining, crafting, trade and corporation workflows;
- an authenticated external API for third-party tools, Discord bots, dashboards, audits and community projects;
- a Starvis AI assistant that uses database tools before answering, instead of producing generic unsupported replies;
- a Discord bot connected to the same API and AI layer.

The data and product surface are still evolving. Some fields may be incomplete, outdated or corrected over time while
the extractor, validation rules, quality audits and UI flows improve.

---

## Monorepo

| Directory | Role |
|---|---|
| `api/` | Express REST API, Swagger/OpenAPI, auth, admin, corporation and data routes. |
| `ihm/` | Next.js 15 web interface, API route proxies, UI tests and Playwright tests. |
| `bot/` | Discord bot with slash commands. |
| `extractor/` | Local CLI that extracts P4K/DataForge and RSI website data into PostgreSQL. |
| `db/` | Prisma 7 schema modules, shared Prisma client, PostgreSQL init and backup scripts. |
| `extensions/rsi-hangar-sync/` | Chrome/Firefox extension used by the Fleet Manager to sync the user's RSI hangar from their own browser session. |
| `quality/` | Fast contract, API/data and UI flow audits. |

Notable internal modules:

- `ihm/src/components/holo/` centralizes shared 3D holoviewer code: fleet/tactics types, holographic constants and CTM geometry caching.
- `ihm/src/components/ship/ShipHoloViewer.tsx` is the dedicated ship-detail holoviewer; fleet and tactics use `ihm/src/components/holo/FleetTacticsHoloViewer.tsx`.
- `ihm/src/views/UniverseExplorerPage.tsx` is the shared universe explorer used directly by the Locations and Starmap route entries, with small HUD/detail panels in `ihm/src/views/universe-explorer-panels.tsx`.
- `api/src/services/chat/` contains focused support modules for the Starvis AI service, including the SQL safety guard.

The monorepo uses npm workspaces and one root `package-lock.json`. Do not add nested lockfiles in workspaces.

---

## Requirements

- Node.js 22+
- Docker Desktop or Docker Engine with Compose v2
- Git
- Star Citizen installed locally only when running P4K extraction

---

## Local Development

### 1. Install

```bash
git clone https://github.com/ampynjord/starvis.git
cd starvis
npm install
```

`npm install` installs every workspace and generates the Prisma client through the `@starvis/db` postinstall script.

### 2. Configure

```bash
cp .env.dev.example .env.dev
```

Minimum values to set in `.env.dev`:

| Variable | Required | Description |
|---|---|---|
| `DB_PASSWORD` | yes | PostgreSQL password for local dev. |
| `JWT_SECRET` | yes | JWT signing secret, at least 32 characters. |
| `TWO_FACTOR_ENCRYPTION_KEY` | recommended | Dedicated key for encrypting TOTP 2FA secrets. Falls back to `JWT_SECRET` if omitted. |
| `ADMIN_API_KEY` | yes | API key used by server-side admin operations. |
| `SERVER_API_KEY` | yes | Internal server-to-server key used by the IHM proxy and CI audits for `/api/v1`; keep it distinct from `ADMIN_API_KEY`. |
| `MISTRAL_API_KEY` | optional | Enables the AI chat assistant. |
| `CHAT_TOOL_MODEL` | optional | Model used for AI tool selection. Defaults to `mistral-small-latest`. |
| `CHAT_RESPONSE_MODEL` | optional | Model used for final AI answers. Defaults to `mistral-large-latest`. |
| `CHAT_MAX_ITER` | optional | Max AI tool-use iterations. Defaults to `3`. |
| `DISCORD_TOKEN` | optional | Enables the Discord bot. |
| `DISCORD_DEFAULT_MEMBER_ROLE_NAME` / `DISCORD_DEFAULT_MEMBER_ROLE_ID` | optional | Assigns a default Discord role to new server members. Defaults to the `Member` role by name. |
| `SMTP_HOST` | optional | Enables email verification and password reset emails. |
| `CONTACT_EMAIL` | optional | Admin notification recipient for server-side support emails. Not exposed by the IHM. |
| `LEGAL_*` | yes in prod | Publisher, hosting, and public contact method displayed on `/legal`. |

All supported variables and defaults are documented in `.env.dev.example`.

### 3. Start the stack

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev up
```

On first start, PostgreSQL is initialized with the `game`, `rsi`, and `meta` schemas. The API uses the Prisma schema from `db/prisma/schema/`.
The IHM container keeps its `.next` cache in a Docker volume so the Next.js dev server does not reuse host-generated Windows build artifacts.

| Service | URL / Port |
|---|---|
| IHM, Next.js dev server | http://localhost:5173 |
| API, Express dev server | http://localhost:3000 |
| Swagger UI | http://localhost:3000/api-docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

The Discord bot container is started in dev, but it remains inactive when `DISCORD_TOKEN` is empty.

### 4. Create an admin account

Register from the UI, then promote the user with the admin API key:

```bash
curl -X PUT http://localhost:3000/admin/users/1/role \
  -H "X-Api-Key: <ADMIN_API_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"role":"admin"}'
```

### 5. Load game data

The database starts empty. To populate it from your local Star Citizen install:

```bash
cp extractor/.env.extractor.example extractor/.env.dev
# Set DB_PASSWORD to match .env.dev

npx tsx extractor/extract.ts --env live
```

Useful variants:

```bash
# Force a visible game version label
npx tsx extractor/extract.ts --env live --game-version 4.7.2

# Extract only network-backed RSI modules, no Data.p4k required
npx tsx extractor/extract.ts --modules ship-matrix,ship-galleries,galactapedia,comm-links,starmap

# Check configuration without extracting
npx tsx extractor/extract.ts --check-config
```

See [`extractor/README.md`](extractor/README.md) for CLI options, module names, production extraction, logging, and troubleshooting.

---

## Data

STARVIS combines local game data and public RSI data.

| Source | Content | Update path |
|---|---|---|
| P4K / DataForge | Ships, components, FPS items, commodities, extracted shop locations/franchises, real `Data/Scripts/ShopInventories` inventory rows, missions, mining, crafting, locations, paints and extended game insights for loot, reputation, factions, navigation, environments, services, medical data, FPS details, ammo and inventory containers. Shop inventory rows expose item kind, buy/sell prices, stock metadata, `source` and `confidence`; rental prices are stored when the game files expose them. P4K locations are correlated with RSI Starmap records through `rsi_starmap_location_id` plus `starmap_match_method`, `starmap_match_score` and `starmap_match_confidence`; manual/semi-automatic overrides can be stored in `game.starmap_location_aliases`. The IHM consumes normalized insight data through page-named API routes such as factions, ammo, armor, utility and blueprints. | `extractor/` CLI. |
| RSI Ship Matrix | RSI marketing ship data. | Extractor network module and API startup sync. |
| RSI website | Galactapedia, Comm-links, Starmap, CTM metadata and official ship galleries scraped from RSI pledge pages. | Extractor network modules. |

LIVE and PTU data share the same PostgreSQL database and are separated by `env = 'live'` or `env = 'ptu'` in the `game` schema.

Location completeness can be audited with `npm run audit:locations --workspace=@starvis/extractor -- --env live`. The
audit verifies parent links, attached shops, real shop inventory rows and locations that still have no imported shops, so
missing stations, hospitals or city shops are visible instead of silently disappearing.

---

## Database

The database workspace is intentionally split by domain:

| Path | Role |
|---|---|
| `db/prisma/schema/00-base.prisma` | Prisma generator and datasource declaration. |
| `db/prisma/schema/10-meta.prisma` | Users, roles, corporations, bug reports, changelog and extraction logs. |
| `db/prisma/schema/20-rsi.prisma` | Ship Matrix, Galactapedia, Comm-links and Starmap. |
| `db/prisma/schema/30-game.prisma` | P4K/DataForge game data. |
| `db/src/` | Shared Prisma client and database helpers exposed as `@starvis/db`. |
| `db/scripts/` | PostgreSQL init and backup scripts. |

Common commands:

```bash
npm run db:generate
npm run db:push                                  # dev only — prod/CI use migrations
npm run migrate --workspace=@starvis/db          # create a migration from schema changes
npm run migrate:deploy --workspace=@starvis/db   # apply pending migrations
npm run db:studio
npm run typecheck --workspace=@starvis/db
```

Schema changes must ship with a versioned migration in `db/prisma/migrations/` — CI rejects drift between the schema and the migration history, and production deploys apply `migrate:deploy` (never `db push --accept-data-loss`).

See [`db/README.md`](db/README.md) before adding or moving database models.

---

## Architecture

```text
Local developer machine

Star Citizen Data.p4k
  -> extractor CLI
  -> PostgreSQL game schema
  -> game.game_insights discovery table
  -> normalized insight tables: game.factions, game.reputation_*, game.loot_*, game.blueprint_rewards, game.ammo, game.inventory_containers
  -> page-named API routes: /factions, /ammo, /armor, /utility, /blueprints

RSI website modules
  -> extractor CLI
  -> PostgreSQL rsi schema
```

```text
Docker / production

Traefik HTTPS
  -> IHM, Next.js
      -> /api/* route handlers for auth, admin and corporation browser flows
      -> /api/public/v1/* server-side public IHM data proxy
  -> API, Express
      -> /api/v1/* external API, JWT/API-token required
      -> PostgreSQL
      -> Redis

Discord bot
  -> API
```

Production Traefik routes `/api/v1`, `/api-docs` and `/health` directly to Express. `/api/v1` is the external API surface and rejects anonymous requests: clients must send a Bearer JWT generated by a Starvis user session or API token. The public web interface does not call that route directly; it uses the Next.js `/api/public/v1/*` proxy, which injects the server-side key internally without exposing it to browsers. Browser admin/auth/corporation flows use the IHM route handlers under `/api/*`, which proxy to Express internally. Shop inventory data comes from real game `ShopInventories` JSON files; the extractor refreshes those rows and linked commodity prices for the selected environment.

---

## API

Swagger is the source of truth:

- Local UI: http://localhost:3000/api-docs
- Production UI: https://starvis.ampynjord.bzh/api-docs
- Spec file: [`api/openapi.json`](api/openapi.json)

External `/api/v1` requests require authentication. Use `Authorization: Bearer <token>` with a token generated from a Starvis user account; anonymous visitors should use the public web interface instead of calling `/api/v1` directly.
The `/developer` page is restricted to signed-in accounts. Standard users can submit a motivated external API access
request from that page; admins review pending requests in the Users admin screen, and approval promotes the account to
the `developer` role so it can access Swagger and generate API tokens.

The external API is a first-class platform surface. It is meant for external projects that need reliable Starvis data
without rebuilding the extraction stack: Discord bots, overlays, corporation dashboards, public tools, quality audits,
data exports and AI workflows. The IHM keeps public browsing separated from external API traffic through server-side
proxies, so monitoring can distinguish anonymous web usage from token/JWT-based integrations.

Main route families:

| Family | Prefixes |
|---|---|
| Enriched object details | `/api/v1/objects/{type}/{id}` |
| Public game data | `/api/v1/ships`, `/api/v1/components`, `/api/v1/items`, `/api/v1/commodities`, `/api/v1/shops`, `/api/v1/trade` |
| Gameplay tools | `/api/v1/calculate`, `/api/v1/loadout`, `/api/v1/mining`, `/api/v1/crafting` |
| World and lore | `/api/v1/locations`, `/api/v1/missions`, `/api/v1/factions`, `/api/v1/starmap`, `/api/v1/galactapedia`, `/api/v1/comm-links` |
| RSI and media | `/api/v1/ship-matrix`, `/api/v1/comm-link-images`, `/api/v1/manufacturers`, `/api/v1/paints` |
| Search and system | `/api/v1/search`, `/api/v1/stats`, `/api/v1/version`, `/api/v1/game-versions`, `/api/v1/changelog` |
| AI chat | `/api/v1/chat`, `/api/v1/chat/ask` |
| Auth | `/auth/*` |
| User reports | `/api/v1/bug-reports` |
| Corporations | `/corporations`, `/rsi-orgs`, `/corp/*` |
| Admin | `/admin/*` |
| Health | `/health`, `/health/live`, `/health/ready`, `/health/metrics`, `/health/cache/stats` |

Most list endpoints support pagination and filtering parameters such as `page`, `limit`, `search`, `sort`, `order`, and `env`.
Use `/api/v1/objects/{type}/{id}` when a client needs one object with its most useful relations in a single request. It resolves ships, components, items, commodities, shops and locations, and returns a normalized `{ type, id, env, data, related, meta }` payload. Ship details include manufacturer, stock loadout, modules, hardpoints, variants, similar ships, purchase/rental locations and official RSI gallery media by default. The `include` query parameter can narrow or disable related data with `include=none`.
Use `/api/v1/locations/tree` to consume the full galactic hierarchy with shops already attached, and
`/api/v1/locations/{uuid}/shops` when a client only needs the shops/inventories available at one city, station, outpost or
other location. `/api/v1/shops/{id}` returns the shop metadata, while `/api/v1/shops/{id}/inventory` returns its priced
inventory rows.

When adding, changing, or deleting an API route, update [`api/openapi.json`](api/openapi.json) in the same change. The API test suite compares mounted Express routes with the OpenAPI paths so undocumented routes are caught during CI.

### HTTP error conventions

All error responses use `{ "success": false, "error": "Human-readable message" }`.

| Code | Meaning |
|---|---|
| 400 | Bad request — missing or invalid query/body parameter |
| 401 | Unauthorized — missing or invalid auth token |
| 403 | Forbidden — account lacks the required role |
| 404 | Not found — requested resource does not exist |
| 409 | Conflict — duplicate resource or incompatible state |
| 503 | Service unavailable — game data not yet loaded |
| 500 | Internal server error — unexpected server failure |

503 is used specifically when a route requires game data and the in-memory dataset has not been populated yet (e.g. API starts before the extractor has run). The response body still follows the `{ success, error }` format.

### Adding a new route

1. Create `api/src/routes/<domain>.ts` and export `mount<Domain>Routes(router: Router, deps: RouteDependencies): void`.
2. Import the mount function in `api/src/routes/index.ts` and add it to the `routeMounts` array.
3. Document all new paths in `api/openapi.json`.
4. Run `npm run openapi:lint --workspace=@starvis/api` to validate the spec locally.

---

## Discord Bot

The Discord bot exposes STARVIS through focused slash commands plus the AI assistant:

| Area | Commands |
|---|---|
| Ships and equipment | `/ship`, `/compare`, `/loadout`, `/component`, `/item`, `/commodity`, `/paint`, `/top` |
| Economy and operations | `/trade`, `/shop`, `/mining`, `/crafting`, `/mission` |
| Universe knowledge | `/location`, `/faction`, `/lore`, `/manufacturers`, `/search` |
| Platform and AI | `/starvis`, `/intel`, `/version`, `/changelog`, `/status` |

`/intel` lists the bot capabilities and dataset counters directly in Discord. `/starvis` uses the STARVIS AI endpoint for free-form questions and suggests a specialized command when structured data is a better fit. `/shop` searches extracted shop locations, inventory files and purchasable entries with source/confidence metadata when exposed by the API.

Deploy or refresh Discord slash commands with:

```bash
npm run deploy-commands --workspace=@starvis/bot
```

The bot remains disabled when `DISCORD_TOKEN` is not set.

---

## IHM

The web app is a Next.js 15 application in `ihm/`.

Important route groups:

| Area | Examples |
|---|---|
| Public data | `/ships`, `/components`, `/items`, `/commodities`, `/locations`, `/missions`, `/starmap` |
| Tools | `/compare`, `/loadout-manager`, `/fps-calculator`, `/mining-calculator`, `/trade-calculator`, `/crafting-calculator`, `/outfitter` |
| RSI content | `/galactapedia`, `/comm-links`, `/manufacturers`, `/paints`, `/factions` |
| Platform | `/about`, `/ai`, `/developer`, `/discord`, `/roadmap` |
| Account | `/login`, `/register`, `/profile`, `/my-reports`, `/report-bug` |
| Corporation | `/corp`, `/corp/fleet`, `/corp/tactics`, `/corp/bank` |
| Admin | `/admin`, `/admin/corporations`, `/admin/bug-reports`, `/admin/monitoring` |
| Legal | `/legal` |

The browser uses same-origin `/api/*` calls. Server-side route handlers use `API_URL` to reach the Express API.
The `/about` page presents Starvis as an active, unofficial Star Citizen Database & Toolset with a strong focus on the
external API and the AI data assistant.
The `/ai` page presents the AI assistant as a transversal data layer across web tools, Discord and external API workflows. The `/roadmap` page separates stable surfaces, early-access tools, validation work and upcoming platform improvements without presenting non-existent partnerships. Extracted shops are integrated into the Starmap/locations hierarchy under their real galactic parent instead of being presented as a separate IHM section.

Manufacturers exposes a catalogue-first view with global ship/component/FPS item counters, searchable manufacturer cards, and detail tabs for the selected manufacturer's ships, components and inventory items. The Starmap follows the RSI parent hierarchy more closely, uses real extracted coordinates when available, avoids duplicate system/star suns, detangles dense galaxy/system layouts, and presents a darker ARK-style holographic map for browsing systems, planets, stations, jump points, zones, cities, bases, outposts, shops, hospitals, rentals and services.

Calculators use normalized game data from the API: FPS combines real weapon stats with extracted attachment modifiers, mining computes per-composition yields with environment-scoped mineral data and normalized risk values, crafting exposes recipe ingredients/modifiers, and trade routes require populated commodity price reports.

Corporation tools include the 3D Fleet Manager, Corp Bank and corporation-owned Tactics board. Fleet Manager lays spawned ships side by side by default, persists their grid positions from the first spawn, and lets each owner decide whether their corporation ship is available for tactical planning. Corp Bank lets members declare shared components, items, commodities and custom entries; API responses enrich declarations with `itemName` when the object exists in extracted game data, so the IHM can display human names instead of internal identifiers. Owners and corporation leaders can edit or remove entries. Admins can delete a corporation without deleting users or their personal fleet managers; only corporation-scoped memberships, fleet and bank data are removed. Tactics reuses the same 3D holographic viewer to place only corporation ships made available by their owners, save corporation strategies, build reusable mixed-ship formations with availability warnings, add 3D objectives/obstacles/points of interest, and draw flat movement vectors directly from selected ships or squadrons.

Fleet Manager also supports RSI hangar synchronization through the Starvis browser extension in `extensions/rsi-hangar-sync/`. The web UI creates a short-lived sync token, the extension reads `robertsspaceindustries.com/account/pledges` in the user's own logged-in browser session, and the API mirrors only `source = rsi_hangar` fleet entries. Manually declared ships are preserved. The production install menu links to Chrome Web Store and Firefox Add-ons via `NEXT_PUBLIC_STARVIS_EXTENSION_CHROME_STORE_URL` and `NEXT_PUBLIC_STARVIS_EXTENSION_FIREFOX_STORE_URL`; store submission zips such as `starvis-browser-extension-chrome.zip` are produced by `npm run build --workspace=@starvis/rsi-hangar-sync-extension` under `extensions/rsi-hangar-sync/dist/store/` and uploaded by CI as the `starvis-browser-extension-store-packages` artifact.

The Discord Bot page exposes the Starvis community Discord server, the generated bot invitation link and slash-command help for AI, ships, loadouts, trade, shops, mining, crafting, missions, lore, status and changelog commands. The bot rotates a rich presence with useful prompts such as `/starvis`, `/intel`, API/data status and server count. Configure `NEXT_PUBLIC_DISCORD_CLIENT_ID` or `DISCORD_CLIENT_ID` to enable the bot invitation link. Configure `NEXT_PUBLIC_DISCORD_SERVER_INVITE_URL` or `DISCORD_SERVER_INVITE_URL` to show the community server invite. `NEXT_PUBLIC_DISCORD_GUILD_ID`/`DISCORD_GUILD_ID` identify the Starvis community server (`931662690101895198` by default). `DISCORD_DEFAULT_MEMBER_ROLE_NAME`/`DISCORD_DEFAULT_MEMBER_ROLE_ID` let the bot assign the default `Member` role to new arrivals.

Discord role intent: `Member` is the default community role. `Developer` means access to Starvis developer tools and external API capabilities, not project contribution status. Use `Contributor` or `Core Team` for people contributing to the project itself.

The global AI widget receives page context from the IHM, suggests prompts based on the current route and can be opened
from presentation/API surfaces with prefilled questions. This makes the assistant a transversal platform helper instead
of a separate chat zone.

Admin Monitoring combines service health, Prometheus traffic metrics, cache/runtime stats, Discord bot configuration, top routes and the latest in-memory API request logs. It also supervises the external `/api/v1` surface with active users, connected projects, generated token status, recent external API calls, server-key traffic and token usage counters. Internal IHM proxies are tagged separately and excluded from the external API counters, so public browsing does not get mixed with third-party API usage. Request logs show the authenticated username, role, auth method, client type, internal IHM marker and API token/project name when available; otherwise the actor stays anonymous. Logs are kept only since the API process started and deliberately exclude request bodies, query values, emails and the request-log/supervision viewer endpoints themselves.

---

## Roles

| Role | Access |
|---|---|
| `user` | Public web interface, account features and authenticated API requests. |
| `developer` | API documentation, developer tools and API token generation. |
| `admin` | Admin UI, user management, user/corporation fleet and bank management, corporation moderation, monitoring and full operational access. |

Roles are managed through the admin UI or `PUT /admin/users/:id/role`. Standard users can request developer/API access
from `/developer`; admins approve or reject those requests from the Users admin screen.

---

## Commands

### Whole project

```bash
npm run dev
npm run build
npm run test
npm run typecheck
npm run lint:ci
```

### Intelligent quality audits

```bash
npm run quality:audit:contracts  # OpenAPI/proxy/IHM type surface contract audit
npm run quality:audit:static-data # DB/P4K static data coverage audit
npm run quality:audit:data       # real API/data coherence audit against localhost:3000
npm run quality:audit:data:prod  # strict audit against production
npm run quality:audit:ui         # critical Playwright user flows with deterministic API fixtures
npm run quality:audit            # contract audit + static data audit + data audit + UI critical flows
```

The contract audit checks OpenAPI structure, operation identifiers, the public API proxy and the broad IHM type surface. The static data audit checks database completeness and optional P4K/DataForge coverage. The data audit checks health, version metadata, core list/detail endpoints, search, duplicate identifiers, numeric sanity and placeholder-like values. See [`quality/README.md`](quality/README.md).

### Workspace checks

```bash
npm run test --workspace=@starvis/api
npm run test --workspace=starvis-ihm
npm run test --workspace=@starvis/extractor

npm run typecheck --workspace=@starvis/api
npm run typecheck --workspace=starvis-ihm
npm run typecheck --workspace=@starvis/extractor
npm run typecheck --workspace=@starvis/bot
npm run typecheck --workspace=@starvis/db
npm run typecheck --workspace=@starvis/rsi-hangar-sync-extension

npm run test:e2e --workspace=starvis-ihm
```

Playwright starts its own Next.js server on `http://127.0.0.1:5180` by default so it does not accidentally reuse the regular `5173` development server. Override with `PLAYWRIGHT_PORT` only when needed.

### Config validation

```bash
docker compose -f docker-compose.dev.yml --env-file .env.dev.example config --quiet
docker compose -f docker-compose.prod.yml --env-file .env.prod.example config --quiet
```

### API docs

```bash
npm run openapi:lint --workspace=@starvis/api
```

---

## Antigravity IDE Integration & Notebooks

This project contains native workspace integrations for developers using Antigravity IDE:

### 1. Agent Customizations (`.agents/`)
Custom instructions and agent skills are defined in the `.agents/` customization root:
- [Workspace Rules](file:///.agents/AGENTS.md): Preserves design instructions, verification commands, and production VPS rules.
- [Dev Skill](file:///.agents/skills/starvis-dev/SKILL.md): Teaches AI agents how to manage Docker containers, run Prisma migrations, load game data, and run verification audits.

### 2. Database Explorer Notebook
An interactive Jupyter Notebook is provided at [`notebooks/db_explorer.ipynb`](file:///notebooks/db_explorer.ipynb) to explore and visualize PostgreSQL data (ship, component, item counts, and category distributions).
To run it, set up a Python virtual environment and install dependencies:
```bash
cd notebooks
python -m venv .venv
.venv\Scripts\Activate.ps1   # Windows (Powershell)
# or: source .venv/bin/activate # Unix/macOS
pip install -r requirements.txt
```

---

## CI/CD

GitHub Actions runs on pushes to any branch and pull requests to `main`.

The pipeline is split into independent jobs so lint, typechecks, tests, browser checks,
builds and configuration guards can run in parallel instead of waiting on a shared
install job. Each job installs dependencies with the npm cache and only waits for the
final quality gate when an ordering constraint is required.

Main jobs:

| Job | What it checks |
|---|---|
| Dependency Audit | Critical npm audit. |
| Dockerfile Lint | API, IHM and bot Dockerfiles in parallel. |
| Config, Schema & Docs | OpenAPI validation, API contract audit, Prisma validation, compose validation, shell script syntax and env contract. |
| Lint | Biome CI. |
| Typecheck | API, IHM, extractor, bot and DB TypeScript checks in parallel. |
| Tests API | API Vitest suite with PostgreSQL and Redis services. |
| Tests Workspace | IHM and extractor Vitest suites in parallel. |
| Tests E2E | Full Playwright Chromium suite, including critical UI flows. |
| Build App | IHM and bot application builds on branches and pull requests. |
| Quality Gate | Requires every verification job to pass before deployment work starts. |
| Build Images | API, IHM and bot images pushed to GHCR on `main`. |
| Deploy | VPS deployment on `main` after images are built. |
| Production Data Audit | Strict API/data coherence audit after production deployment. |

Before pushing, run the checks for every touched workspace, plus lint and typecheck. Run Playwright when a change affects UI, routing, rendering or browser interaction. After pushing, verify the GitHub CI run and fix it if it fails.

---

## Production

Production uses prebuilt GHCR images and `.env.prod` on the VPS. The production compose keeps the same service model as dev: PostgreSQL, Redis, API, IHM and bot. Differences are limited to image source, Traefik routing, resource limits and safer host bindings.

Configuration update without rebuilding:

```bash
ssh -i ~/.ssh/starvis_vps debian@ampynjord.bzh
cd /home/debian/starvis
# edit .env.prod
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps --force-recreate <service>
```

Deployment from CI:

1. Pull latest `main` on the VPS.
2. Pull fresh API, IHM and bot images from GHCR.
3. Ensure PostgreSQL and Redis are running.
4. Run `npm run migrate:deploy --workspace=@starvis/db` from the API image.
5. Restart the API first and wait for its healthcheck.
6. Restart IHM and bot after the API is healthy.
7. Check API and IHM health.
8. Run runtime smoke tests.

---

## Documentation Maintenance

- Update this README when project structure, commands, deployment, local setup or developer workflow changes.
- Update workspace READMEs when changing a workspace-specific workflow.
- Update [`api/openapi.json`](api/openapi.json) whenever API routes are added, changed or removed.
- Keep `.env.*.example` files aligned with compose variables.

---

## Legal and Compliance

### Community project

STARVIS is an unofficial, independent, community-driven, non-profit project. It is not affiliated with, endorsed by,
sponsored by, or officially connected to Cloud Imperium Games Corporation, Cloud Imperium Rights LLC,
Roberts Space Industries Corp. or their affiliates.

### Credits and intellectual property

Star Citizen and all game data, including ship names, components, items and lore, are the property of Cloud Imperium Games Corporation and/or Roberts Space Industries Corp.

Copyright 2012-2025 Cloud Imperium Rights LLC. All rights reserved.

The data displayed by STARVIS is used in a strictly non-commercial community context, in accordance with CIG's community licensing policy. STARVIS claims no ownership over CIG/RSI content.

### Source code license

The STARVIS source code is proprietary and all rights are reserved. See [`LICENSE`](LICENSE).

This code license covers only STARVIS source code owned by ampynjord. It does not apply to data, trademarks, media or content owned by CIG/RSI.

### GDPR / data protection

The public legal and privacy policy is maintained at `/legal`. Production deployments expose `LEGAL_*`;
keep these values accurate in `.env.prod`. The production template uses the public STARVIS domain,
a public contact method, and OVH SAS hosting details.

Personal data handled by the project may include:

- account data: email, username, role, avatar URL, timestamps and email verification state;
- security data: bcrypt password hash, hashed email verification/password reset tokens, encrypted 2FA secret, JWT sessions and hashed generated API tokens with usage metadata;
- user content: bug reports, corporation memberships, ranks and fleet notes;
- technical data: logs and request metadata needed for security, diagnostics and abuse prevention;
- optional AI/Discord data: prompts/messages sent to the STARVIS assistant or Discord bot.

No payment data, no advertising cookies, and no sale of personal data are used by STARVIS.

The AI assistant is optional and requires `MISTRAL_API_KEY`. When enabled, prompts are sent to the configured chat
provider (`CHAT_PROVIDER_BASE_URL`, Mistral by default). Users must not send passwords, API tokens, private keys,
confidential information or third-party personal data in AI prompts or Discord bot commands.

GDPR contact: configure `LEGAL_CONTACT_METHOD` in the deployment environment.

Full policy: [starvis.ampynjord.bzh/legal](https://starvis.ampynjord.bzh/legal)
