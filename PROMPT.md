# Starvis — Prompt exécutif projet

> Base de données Star Citizen avec API REST, interface web, bot Discord et pipeline d'extraction de données de jeu.

## Architecture globale

```
┌────────────────────────────────────────────────────────────────────┐
│                     Star Citizen (P4K file)                        │
│                            ↓                                       │
│  ┌───────────┐   extractor   ┌────────┐   api     ┌───────────┐  │
│  │ Data.p4k  │──────────────→│ MySQL  │←─────────→│ Express   │  │
│  │ DataForge │  (9 modules)  │ 8.0    │  Prisma   │ REST API  │  │
│  └───────────┘               │ 3 DBs  │           └─────┬─────┘  │
│                              └────────┘             ↗    │    ↘   │
│                              ┌────────┐        Redis   Traefik    │
│                              │ RSI    │        (cache)  (TLS)     │
│                              │ Matrix │──sync──→ ↓        ↓       │
│                              │ API    │     ┌────────┐ ┌───────┐  │
│                              └────────┘     │ Next.js│ │Discord│  │
│                                             │  IHM   │ │  Bot  │  │
│                                             └────────┘ └───────┘  │
└────────────────────────────────────────────────────────────────────┘
```

## Stack technique

| Couche        | Tech                     | Version  |
|---------------|--------------------------|----------|
| **API**       | Express + TypeScript     | ESM      |
| **ORM**       | Prisma Client            | 6.19+    |
| **BDD**       | MySQL 8.0 (3 bases)      | live/ptu/starvis |
| **Cache**     | Redis 7 (ioredis)        | LRU 32MB |
| **Frontend**  | Next.js 15 + React 19    | App Router, standalone |
| **UI**        | Tailwind CSS + Framer Motion + Recharts + Lucide |  |
| **Data fetch**| TanStack React Query     | v5       |
| **Bot**       | discord.js               | v14      |
| **Extractor** | TypeScript CLI (commander + mysql2 + fzstd) |  |
| **Lint**      | Biome                    | 2.4.9    |
| **Tests**     | Vitest + Playwright      |          |
| **CI/CD**     | GitHub Actions → Docker → GHCR → VPS via SSH |  |
| **Proxy**     | Traefik (reverse proxy, TLS Let's Encrypt) |  |
| **Monitoring**| Prometheus (prom-client)  |          |

## Base de données (Prisma schema)

3 bases MySQL : `starvis` (métadonnées), `live` (jeu live), `ptu` (test universe). Toutes utilisent le même schéma Prisma.

### Modèles principaux

| Modèle | Description | Relations clés |
|--------|-------------|----------------|
| **Ship** | Vaisseaux (uuid PK, stats vol/combat/cargo/fuel) | → loadouts, modules, paints |
| **ShipMatrix** | Données RSI officielles (sync 24h) | → Ship (shipMatrixId) |
| **Component** | Équipements (armes, boucliers, moteurs, quantum, radar, mining…) | → loadouts, shopInventory |
| **ShipLoadout** | Hardpoints/ports (hiérarchie parent/child) | → Ship, Component |
| **ShipModule** | Modules internes (tier 0-3) | → Ship |
| **ShipPaint** | Skins/livrées | → Ship |
| **Item** | Équipement FPS (armes, armures, consommables) | |
| **Commodity** | Marchandises commerciales | → prices |
| **Shop** | Vendeurs PNJ (location/système) | → inventory, prices |
| **ShopInventory** | Stock des boutiques | → Shop, Component |
| **CommodityPrice** | Historique prix (buy/sell) | → Commodity, Shop |
| **CraftingRecipe** | Recettes de craft | → ingredients, modifiers |
| **CraftingIngredient** | Ingrédients (qty, scu, qualité min) | → Recipe |
| **CraftingSlotModifier** | Modificateurs qualité 0-1000 | → Recipe |
| **MiningElement** | Minerais (instabilité, résistance, fenêtre optimale) | → compositionParts |
| **MiningComposition** | Types de roches/dépôts | → parts |
| **Mission** | Templates de missions (récompenses, faction, légalité) | |
| **Manufacturer** | Fabricants (code PK) | |
| **ExtractionLog** | Audit des imports (hash, version, compteurs) | → changelogs |
| **Changelog** | Suivi field-level des changements | → ExtractionLog |

## API REST — Endpoints (60+)

Base URL : `/api/v1`

| Module | Préfixe | Endpoints clés |
|--------|---------|----------------|
| **Ships** | `/ships` | list, search, random, filters, ranking, `:uuid` (détail, loadout, modules, paints, stats, hardpoints, similar, variants, compare) |
| **Ship Matrix** | `/ship-matrix` | stats, list, `:id` |
| **Components** | `/components` | list, types, filters, compatible, `:uuid` (détail, buy-locations, ships) |
| **Items** | `/items` | list, types, filters, `:uuid` (détail, buy-locations) |
| **Commodities** | `/commodities` | list, types, `:uuid` |
| **Mining** | `/mining` | elements, compositions, solver, stats, lasers |
| **Missions** | `/missions` | list, types, factions, systems, categories, `:uuid` |
| **Crafting** | `/crafting` | categories, station-types, recipes, resources, `:uuid` |
| **Trade** | `/trade` | locations, systems, prices, routes (calculateur), report price (POST) |
| **Shops** | `/shops` | list, `:id/inventory` |
| **Paints** | `/paints` | list |
| **Search** | `/search` | Recherche unifiée (ships, components, items, commodities, missions, recipes) |
| **Calculate** | `/calculate` | fps-damage (POST), mining-yield (POST) |
| **Loadout** | `/loadout` | calculate (POST, swaps de composants) |
| **System** | `/changelog`, `/stats`, `/version` | Changelog, stats globales, version d'extraction |
| **Admin** | `/admin` | sync-ship-matrix, stats, extraction-log (auth X-API-Key) |
| **Health** | `/health` | live, ready, metrics (Prometheus) |

**Features transversales** : ETag caching, CSV export (`?format=csv`), multi-env (`?env=live\|ptu`), pagination, rate limiting (200/15min + burst 60/min).

## Frontend (IHM) — 25 pages

| Route | Page | Description |
|-------|------|-------------|
| `/` | HomePage | Dashboard/accueil |
| `/ships` | ShipsPage | Navigateur de vaisseaux |
| `/ships/:uuid` | ShipDetailPage | Fiche vaisseau (stats, loadout, paints) |
| `/compare` | ComparePage | Comparaison de vaisseaux |
| `/ranking` | RankingPage | Classement par stat |
| `/outfitter` | OutfitterPage | Simulateur de loadout |
| `/mining` | MiningPage | Calculateur de minage |
| `/minerals` | MineralsLibraryPage | Bibliothèque de minerais |
| `/fps-gear` | ItemsPage | Équipement FPS |
| `/fps-calculator` | FpsCalculatorPage | Calculateur dégâts FPS |
| `/other-items` | ItemsPage | Items divers |
| `/industrial` | CommoditiesPage | Commodités/commerce |
| `/trade` | TradePage | Routes commerciales |
| `/missions` | MissionsPage | Navigateur de missions |
| `/crafting` | CraftingPage | Recettes de craft |
| `/paints` | PaintsPage | Skins de vaisseaux |
| `/components` | ComponentsPage | Navigateur de composants |
| `/components/:uuid` | ComponentDetailPage | Fiche composant |
| `/items/:uuid` | ItemDetailPage | Fiche item |
| `/commodities/:uuid` | CommodityDetailPage | Fiche commodité |
| `/manufacturers` | ManufacturersPage | Répertoire fabricants |
| `/shops` | ShopsPage | Localisation des boutiques |
| `/search` | SearchResultsPage | Résultats de recherche |
| `/changelog` | ChangelogPage | Historique des changements |

**Composants** : 26 composants réutilisables (ui/ 11, ship/ 6, mining/ 6, layout/ 3).
**State** : EnvContext (live/ptu), useListQueryState (pagination+search), useDebounce.

## Bot Discord — 5 commandes

| Commande | Description |
|----------|-------------|
| `/ship` | Recherche et affiche un vaisseau |
| `/search` | Recherche unifiée |
| `/commodity` | Info sur une commodité |
| `/trade` | Meilleures routes commerciales |
| `/status` | Health check de l'API |

## Extractor — Pipeline de données

CLI TypeScript qui lit `Data.p4k` (fichier Star Citizen), parse le format DataForge/CryXML et insère en MySQL.

```bash
npx tsx extract.ts --env live --modules ships,components,items
```

**9 modules** : ships, components, items, commodities, mining, missions, crafting, paints, shops.
**Auto-détection** : chemins P4K pour Windows, WSL et macOS.
**Mapping BDD** : live→`live`, ptu→`ptu`, eptu→`ptu`.

## Infrastructure Docker

### Production (docker-compose.prod.yml)
| Service | Image | Port | Mémoire |
|---------|-------|------|---------|
| mysql | mysql:8.0 | 127.0.0.1:3306 | 512M |
| redis | redis:7-alpine | interne | 64M |
| api | ghcr.io/ampynjord/starvis-api | interne (3000) | 256M |
| ihm | ghcr.io/ampynjord/starvis-ihm | interne (8080) | 256M |
| bot | build local ./bot | — | 128M |

**Réseau** : traefik-network (externe) pour IHM + API. Traefik gère TLS (Let's Encrypt) et routage sur `starvis.ampynjord.bzh`. `/api-docs` routé directement vers l'API (priorité 100).

### CI/CD (GitHub Actions)
1. **Lint** : TypeCheck + Biome (api, extractor, ihm, bot) + docker-compose validation
2. **Test** : Vitest (unit + coverage) + Playwright (e2e) sur MySQL/Redis de service
3. **Build** : Docker images → GHCR (API + IHM)
4. **Deploy** : SSH → VPS, git pull, docker compose pull & up

## Conventions

- **Monorepo** : `api/`, `ihm/`, `extractor/`, `bot/`, `db/`, `scripts/`
- **ESM** partout (type: module)
- **Biome** 2.4.9 : lineWidth 140, single quotes, format + lint
- **TypeScript strict** dans tous les packages
- **Prisma** pour le schéma et les migrations (db push)
- **Zod** pour la validation des query params API
- **ETag + Redis** pour le cache API
- **Prometheus** pour les métriques (HTTP, cache)
- **Multi-environnement** : tous les endpoints acceptent `?env=live|ptu`
- **Changelog automatique** : l'extracteur trace chaque changement field-level entre deux extractions

## Secrets et accès

| Variable | Usage |
|----------|-------|
| `DB_USER` / `DB_PASSWORD` | MySQL |
| `ADMIN_API_KEY` | Routes admin (header X-API-Key) |
| `DISCORD_TOKEN` / `DISCORD_CLIENT_ID` | Bot Discord |
| `CORS_ORIGIN` | Domaine autorisé (prod: `https://starvis.ampynjord.bzh`) |
| `VPS_HOST` / `VPS_SSH_KEY` | Déploiement CI→VPS |
| `GHCR_PAT` | Pull images privées GHCR |
| `CODECOV_TOKEN` | Couverture de code |

## Données en production

| Entité | Volume |
|--------|--------|
| Ships | ~250 |
| Components | ~3000 |
| Items | ~5400 |
| Commodities | ~200 |
| Manufacturers | ~50 |
| Loadout ports | ~15000 |
| Missions | ~600 |
| Crafting recipes | ~1100 |
| Crafting ingredients | ~2600 |
| Quality modifiers | ~3900 |
| Mining elements | ~30 |
| Mining compositions | ~50 |
| Shops | ~200 |

---

*Dernière mise à jour : mars 2026 — Star Citizen 4.0+*
