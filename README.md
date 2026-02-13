# STARVIS v1.0

**REST API + Web Interface for Star Citizen ship data**

Monorepo en 4 modules :
- **api/** — Backend Express.js + TypeScript + MySQL (déployé sur VPS)
- **extractor/** — CLI d'extraction P4K/DataForge (exécuté localement)
- **db/** — Schéma SQL, initialisation, backup
- **ihm/** — Frontend Vue 3 + Vite + Tailwind CSS (déployé sur VPS)

Deux sources de données complémentaires :
- **RSI Ship Matrix** — données marketing officielles (246 vaisseaux), synchronisées par l'API
- **P4K DataForge** — données réelles du jeu (~309 vaisseaux, ~2459 composants, ~33 957 ports de loadout), extraites localement par le CLI

Production : **[starvis.ampynjord.bzh](https://starvis.ampynjord.bzh)** (IHM) / **[starvis-api.ampynjord.bzh](https://starvis-api.ampynjord.bzh)** (API)

---

## Features

- **Ship Matrix** : 246 vaisseaux provenant de l'API RSI (données marketing, spécifications officielles)
- **Game Data** : ~309 vaisseaux jouables extraits de P4K/DataForge (filtrés, sans doublons/tests)
- **Components** : ~2459 composants répartis en 12 types (armes, boucliers, centrales, refroidisseurs, drives quantiques, missiles, propulseurs, radars, contre-mesures, réservoirs, intakes, support de vie)
- **Weapon Damage Breakdown** : dommages détaillés par type (physical, energy, distortion, thermal, biochemical, stun)
- **Burst / Sustained DPS** : DPS instantané, burst (jusqu'à surchauffe) et sustained (avec cycles de refroidissement)
- **Missile Damage Breakdown** : dommages de missiles détaillés par type
- **Shops & Prices** : magasins in-game avec inventaire et prix achat/location
- **Loadout Simulator** : calcul de stats agrégées (DPS total, boucliers, puissance, thermique) avec échange de composants
- **Manufacturers** : ~55 fabricants (véhicules + composants)
- **Loadouts** : ~33 957 ports d'équipement par défaut avec hiérarchie parent/enfant
- **Cross-reference** : liaison automatique ships ↔ ship_matrix (~206 liés via alias + fuzzy matching)
- **Pagination** sur tous les endpoints de liste (page, limit, total, pages)
- **Filtres & tri** sur ships, components, manufacturers, shops
- **CSV Export** sur tous les endpoints de liste (`?format=csv`)
- **ETag / Cache** HTTP avec `Cache-Control` et `If-None-Match` (304)
- **Comparison** : comparaison côte à côte de vaisseaux avec deltas numériques
- **Swagger / OpenAPI** docs interactives à `/api-docs`
- **Extraction versioning** avec log d'extraction en base de données
- **CI/CD** GitHub Actions (lint → tests → build Docker → deploy SSH)

### Sécurité

- **Helmet** : headers de sécurité (XSS, clickjacking, MIME sniffing)
- **Rate limiting multi-couche** :
  - Burst (30 req/min) → protection contre le hammering
  - SlowDown (après 100 req/15min, +500ms de délai progressif, max 20s)
  - Hard limit (200 req/15min → 429)
  - Admin strict (20 req/15min)
- **Nginx hardening** : rate limiting (10 req/s API, 30 req/s static), 20 connexions max/IP, headers de sécurité, blocage des chemins d'exploit (`.env`, `.git`)
- **Auth admin** : clé API via header `X-API-Key` (timing-safe comparison)
- **CORS** configurable, `trust proxy` pour Traefik
- **Body size limit** : 1 MB (Express + nginx)

---

## Project Structure

```
starvis/
├── docker-compose.yml          # Orchestration 3 services (mysql, api, ihm)
├── docker-compose.prod.yml     # Override prod (Traefik, images GHCR)
├── .env.example                # Template de configuration
├── api/                        # Backend Express.js + TypeScript (VPS)
│   ├── Dockerfile              # Multi-stage (4 étapes)
│   ├── server.ts               # Entry point (helmet, rate limiting, swagger)
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── routes.ts           # 25 endpoints (pagination, ETag, CSV)
│       ├── middleware/
│       │   ├── auth.ts         # X-API-Key auth (timing-safe)
│       │   └── index.ts
│       ├── services/
│       │   ├── schema.ts       # Init DB schema + auto-migrations
│       │   ├── ship-matrix-service.ts  # RSI API → ship_matrix
│       │   ├── game-data-service.ts    # Read-only queries → REST API
│       │   └── index.ts
│       └── utils/
│           ├── config.ts       # Configuration centralisée
│           ├── logger.ts       # Winston (module tags, durées)
│           ├── cryxml-parser.ts
│           └── index.ts
│   └── tests/
│       ├── schemas.test.ts     # 29 tests unitaires (Vitest)
│       └── test-all.mjs        # Tests e2e API
├── extractor/                  # CLI d'extraction P4K (PC local)
│   ├── extract.ts              # Point d'entrée CLI
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── extraction-service.ts   # Ships/components/loadouts → MySQL (batch INSERT)
│       ├── dataforge-service.ts    # DataForge DCB orchestrator
│       ├── dataforge-parser.ts     # Binary DataForge parser
│       ├── p4k-provider.ts         # P4K file reader (ZIP + AES)
│       ├── cryxml-parser.ts        # Binary CryXML parser
│       ├── localization-service.ts # Localisation du jeu
│       └── logger.ts
│   └── tests/
│       ├── classifyPort.test.ts       # 28 tests
│       └── dataforge-helpers.test.ts  # 16 tests
├── ihm/                        # Frontend Vue 3 + Vite + Tailwind CSS
│   ├── Dockerfile
│   ├── nginx.conf              # Nginx hardened (rate limiting, headers)
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.vue
│       ├── main.ts
│       ├── router/index.ts     # 11 routes
│       ├── services/api.ts     # Client HTTP API
│       ├── views/              # 12 vues (Ships, Components, Loadout, Compare, etc.)
│       └── components/         # AppNav, PaginationBar, StatBlock, LoadingState
├── db/
│   ├── schema.sql              # 11 tables MySQL + FK + index
│   ├── init.sh                 # Initialisation DB (permissions % host)
│   └── backup.sh               # Backup automatisé (mysqldump, gzip, 7j rétention)
└── .github/workflows/
    └── ci.yml                  # CI/CD complet (4 jobs)
```

---

## Quick Start

### Prérequis

- Docker & Docker Compose
- Star Citizen installé (pour l'extraction P4K locale)
- Node.js 22+ (pour l'extractor)

### Déploiement local (dev)

```bash
git clone https://github.com/ampynjord/starvis
cd starvis
cp .env.example .env    # éditer les mots de passe
docker compose up -d

# API  → http://localhost:3003
# IHM  → http://localhost:8080
curl http://localhost:3003/health
```

### Déploiement production (VPS + Traefik)

```bash
# Sur le VPS
git clone https://github.com/ampynjord/starvis /home/ubuntu/docker/starvis
cd /home/ubuntu/docker/starvis
cp .env.example .env    # configurer les secrets de production

# Démarrer avec l'override Traefik
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Vérifier
curl https://starvis-api.ampynjord.bzh/health
```

> En production, les ports ne sont pas exposés directement. Traefik gère le routage HTTPS avec certificats Let's Encrypt.

### Extraction locale (depuis un PC avec Star Citizen)

```bash
cd extractor
npm install
cp .env.example .env   # configurer DB_HOST, DB_USER, DB_PASSWORD
npx tsx extract.ts --p4k "/path/to/StarCitizen/LIVE/Data.p4k"
```

> L'extraction prend ~5-25 min et peuple la base MySQL avec ~309 vaisseaux, ~2459 composants, ~33 957 ports de loadout.

### Variables d'environnement

Toute la configuration est dans `.env` (voir `.env.example`).

| Variable | Description | Défaut |
|----------|-------------|--------|
| `API_PORT` | Port exposé sur l'hôte | `3003` |
| `API_INTERNAL_PORT` | Port interne du container | `3000` |
| `IHM_PORT` | Port de l'interface web | `8080` |
| `NODE_ENV` | Environnement | `production` |
| `LOG_LEVEL` | Niveau de log (debug/info/warn/error) | `info` |
| `ADMIN_API_KEY` | Clé admin (**obligatoire**) | — |
| `CORS_ORIGIN` | Origine CORS | `*` |
| `RATE_LIMIT_MAX` | Max requêtes / 15 min | `200` |
| `DB_HOST` | Hôte MySQL | `mysql` |
| `DB_PORT` | Port MySQL interne (réseau Docker) | `3306` |
| `DB_EXTERNAL_PORT` | Port MySQL exposé sur l'hôte | `3306` |
| `DB_USER` | Utilisateur MySQL | — |
| `DB_PASSWORD` | Mot de passe MySQL | — |
| `DB_NAME` | Nom de la base | `starvis` |
| `MYSQL_ROOT_PASSWORD` | Mot de passe root MySQL | — |

---

## API Endpoints

### Ship Matrix (RSI)

Données officielles RSI Ship Matrix — 246 vaisseaux.

```bash
GET /api/v1/ship-matrix                    # Liste (avec ?search=hornet)
GET /api/v1/ship-matrix/:id               # Détails par ID RSI ou nom
GET /api/v1/ship-matrix/stats             # Statistiques
```

### Ships (Game Data)

~309 vaisseaux jouables extraits de P4K/DataForge.
Réponses paginées par défaut (50 items/page, max 200).

```bash
GET /api/v1/ships                          # Liste avec filtres + pagination
GET /api/v1/ships?manufacturer=AEGS&role=combat&sort=mass&order=desc
GET /api/v1/ships?page=2&limit=20&format=csv

GET /api/v1/ships/:uuid                   # Détails (par UUID ou class_name)
GET /api/v1/ships/AEGS_Gladius

GET /api/v1/ships/:uuid/loadout           # Loadout par défaut (hiérarchique)
GET /api/v1/ships/:uuid/compare/:uuid2    # Comparaison côte à côte
```

#### Champs principaux

| Champ | Description |
|-------|-------------|
| `uuid`, `class_name`, `name` | Identifiants |
| `manufacturer_code`, `career`, `role` | Classification |
| `mass`, `total_hp` | Masse (kg), HP total |
| `scm_speed`, `max_speed` | Vitesse SCM et max (m/s) |
| `boost_speed_forward/backward/left/right/up/down` | Vitesses de boost directionnelles |
| `pitch_max`, `yaw_max`, `roll_max` | Rotation max (°/s) |
| `hydrogen_fuel`, `quantum_fuel` | Capacités de carburant |
| `cargo_capacity` | Capacité cargo (SCU) |
| `armor_physical/energy/distortion/thermal/biochemical/stun` | Résistances d'armure |
| `armor_signal_ir/em/cs` | Signatures |
| `cross_section_x/y/z` | Section transversale |
| `shield_hp` | HP bouclier cumulé |
| `missile_damage_total` | Dommages missile total (loadout par défaut) |
| `ship_matrix_id` | ID RSI Ship Matrix (si lié) |

#### Filtres

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `manufacturer` | Code fabricant | `AEGS`, `ANVL`, `RSI` |
| `role` | Rôle | `combat`, `transport` |
| `search` | Recherche nom/className | `Gladius` |
| `sort` | Tri par | `name`, `mass`, `scm_speed`, `total_hp`, `boost_speed_forward`, `cargo_capacity` |
| `order` | Ordre | `asc`, `desc` |
| `page` / `limit` | Pagination (max 200) | `1`, `50` |
| `format` | Format de sortie | `json` (défaut), `csv` |

### Components (Game Data)

~2459 composants répartis en 12 types. Réponses paginées.

```bash
GET /api/v1/components                     # Liste avec filtres + pagination
GET /api/v1/components?type=WeaponGun&size=3&manufacturer=BEHR
GET /api/v1/components?format=csv

GET /api/v1/components/:uuid              # Détails
GET /api/v1/components/:uuid/buy-locations # Où acheter (prix + magasins)
```

#### Types de composants

| Type | Description |
|------|-------------|
| `WeaponGun` | Armes (canons, gatlings, lasers, scatterguns) |
| `Shield` | Boucliers |
| `PowerPlant` | Centrales électriques |
| `Cooler` | Refroidisseurs |
| `QuantumDrive` | Drives quantiques |
| `Missile` | Missiles |
| `Thruster` | Propulseurs (principaux + manœuvre) |
| `Radar` | Radars |
| `Countermeasure` | Contre-mesures (flares, chaff) |
| `FuelTank` | Réservoirs de carburant (hydrogène + quantique) |
| `FuelIntake` | Prises de carburant (scooping) |
| `LifeSupport` | Support de vie |

#### Filtres composants

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `type` | Type de composant | `WeaponGun`, `Shield`, `QuantumDrive` |
| `size` | Taille (0-9) | `3` |
| `manufacturer` | Code fabricant | `BEHR` |
| `search` | Recherche nom | `Gatling` |
| `sort` | Tri par | `weapon_dps`, `weapon_burst_dps`, `shield_hp`, `qd_speed`, `thruster_max_thrust`, `radar_range` |
| `page` / `limit` | Pagination (max 200) | `1`, `50` |
| `format` | Format | `json`, `csv` |

### Manufacturers

~55 fabricants (véhicules + composants).

```bash
GET /api/v1/manufacturers
```

### Shops & Prices

Magasins in-game avec localisation, inventaire et prix.

```bash
GET /api/v1/shops                          # Liste (paginée)
GET /api/v1/shops?location=lorville&type=Weapons
GET /api/v1/shops/:id/inventory           # Inventaire d'un magasin
```

### Loadout Simulator

Calculateur de stats agrégées pour un loadout personnalisé.

```bash
# Stats par défaut (sans échange)
curl -X POST https://starvis-api.ampynjord.bzh/api/v1/loadout/calculate \
  -H "Content-Type: application/json" \
  -d '{"shipUuid": "...", "swaps": []}'

# Avec remplacement de composant
curl -X POST https://starvis-api.ampynjord.bzh/api/v1/loadout/calculate \
  -H "Content-Type: application/json" \
  -d '{"shipUuid": "...", "swaps": [{"portName": "hardpoint_weapon_gun_left", "componentUuid": "..."}]}'
```

**Réponse** :
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
GET /api/v1/version                       # Dernière extraction de données
```

### Swagger / OpenAPI

```bash
GET /api-docs                             # Documentation interactive
```

### Admin (requiert X-API-Key)

```bash
# Sync RSI Ship Matrix
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" https://starvis-api.ampynjord.bzh/admin/sync-ship-matrix

# Statistiques DB
curl -H "X-API-Key: $ADMIN_API_KEY" https://starvis-api.ampynjord.bzh/admin/stats

# Log d'extraction
curl -H "X-API-Key: $ADMIN_API_KEY" https://starvis-api.ampynjord.bzh/admin/extraction-log
```

### Health

```bash
GET /health
```

---

## Frontend (IHM)

Interface web Vue 3 avec 11 routes :

| Route | Vue | Description |
|-------|-----|-------------|
| `/` | HomeView | Page d'accueil |
| `/ships` | ShipsView | Liste des vaisseaux avec filtres et pagination |
| `/ships/:uuid` | ShipDetailView | Détails d'un vaisseau |
| `/components` | ComponentsView | Liste des composants avec filtres |
| `/components/:uuid` | ComponentDetailView | Détails d'un composant |
| `/compare` | CompareView | Comparaison côte à côte |
| `/shops` | ShopsView | Magasins in-game |
| `/manufacturers` | ManufacturersView | Liste des fabricants |
| `/loadout/:uuid?` | LoadoutView | Simulateur de loadout |
| `/hangar` | HangarView | Hangar personnel |
| `/changelog` | ChangelogView | Historique des changements |

Composants communs : `AppNav`, `PaginationBar`, `StatBlock`, `LoadingState`.

---

## Database

### Schéma (11 tables)

```
┌────────────────────┐
│    ship_matrix     │  ← RSI Ship Matrix API (246 vaisseaux)
├────────────────────┤
│ id (PK)            │
│ name, manufacturer │
│ focus, type, size  │
│ specs, media URLs  │
│ compiled (JSON)    │
│ synced_at          │
└────────┬───────────┘
         │ ship_matrix_id (FK)
         ▼
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
│ armor, cross_sect  │
│ missile_damage     │
│ game_data (JSON)   │
└──┬──────┬──────────┘
   │      │
   │      │ ship_uuid (FK)
   │  ┌───▼────────────────────────┐     ┌────────────────────┐
   │  │     ships_loadouts         │     │    components      │
   │  ├────────────────────────────┤     ├────────────────────┤
   │  │ id (PK)                    │     │ uuid (PK)          │
   │  │ ship_uuid (FK)             │     │ class_name         │
   │  │ port_name, port_type       │     │ name, type, size   │
   │  │ component_class_name       │     │ weapon stats       │
   │  │ component_uuid (FK) ───────┼────►│ shield stats       │
   │  │ parent_id (self-ref)       │     │ QD / missile stats │
   │  └────────────────────────────┘     │ power, thermal     │
   │                                     └────────────────────┘
   │ ship_uuid (FK)
   ├──────────────────────┐
   │                      │
┌──▼─────────────────┐ ┌──▼─────────────────┐
│   ship_modules     │ │   ship_paints      │
├────────────────────┤ ├────────────────────┤
│ id (PK)            │ │ id (PK)            │
│ ship_uuid (FK)     │ │ ship_uuid (FK)     │
│ module_name        │ │ paint_name         │
│ module_class_name  │ │ paint_class_name   │
└────────────────────┘ └────────────────────┘

┌─────────────────────┐     ┌─────────────────────────┐
│       shops         │     │   shop_inventory        │
├─────────────────────┤     ├─────────────────────────┤
│ id (PK)             │     │ id (PK)                 │
│ name                │◄────┤ shop_id (FK)            │
│ location            │     │ component_uuid (FK) ────┼──► components
│ parent_location     │     │ component_class_name    │
│ shop_type           │     │ base_price              │
│ class_name (UNIQUE) │     │ rental_price_1d/3d/7d   │
└─────────────────────┘     └─────────────────────────┘

┌────────────────────┐     ┌────────────────────┐
│  extraction_log    │     │    changelog       │
├────────────────────┤     ├────────────────────┤
│ id (PK)            │     │ id (PK)            │
│ sha256_hash        │     │ version            │
│ ships/components   │     │ date               │
│ duration_seconds   │     │ description (TEXT)  │
│ extracted_at       │     └────────────────────┘
└────────────────────┘
```

### Données actuelles (production)

| Table | Entrées |
|-------|---------|
| `ship_matrix` | 246 |
| `ships` | 309 |
| `components` | 2 459 |
| `manufacturers` | 55 |
| `ships_loadouts` | 33 957 |
| `ship_modules` | Variable |
| `ship_paints` | Variable |
| `shops` | Variable |
| `shop_inventory` | Variable |
| `extraction_log` | 1+ |
| `changelog` | Variable |
| Ships liés au Ship Matrix | ~206 |

### Principaux fabricants

#### Véhicules (Ship Matrix + P4K)

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
| GRIN | Greycat Industrial |
| KRIG | Kruger Intergalactic |
| MISC | Musashi Industrial & Starflight Concern |
| MRAI | Mirai |
| ORIG | Origin Jumpworks |
| RSI | Roberts Space Industries |
| TMBL | Tumbril Land Systems |
| VNCL | Vanduul |
| XIAN / XNAA | Aopoa |

#### Composants (P4K uniquement)

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

### Pipeline de données

```
VPS (API — toujours actif) :
  1. Init DB (11 tables) + auto-migrations
  2. ShipMatrixService.sync()        → 246 vaisseaux dans ship_matrix
  3. GameDataService(pool)           → Requêtes read-only pour l'API REST
  4. Mount routes, listen :3000

PC local (Extractor — exécution manuelle) :
  npx tsx extract.ts --p4k "C:/StarCitizen/LIVE/Data.p4k"
  ├── Parse P4K + DataForge (Game2.dcb)
  ├── saveManufacturers()            → ~55 fabricants
  ├── saveComponents()               → ~2459 composants (batch INSERT, 12 types)
  ├── saveShips() + loadouts         → ~309 vaisseaux + ~33957 ports
  ├── crossReferenceShipMatrix()     → ~206 vaisseaux liés
  └── INSERT extraction_log          → SHA-256 hash + stats + durée
```

Tous les endpoints GET lisent depuis MySQL (pas d'accès direct P4K/RSI).
Les écritures en DB ne se font qu'au démarrage ou via les endpoints admin POST.

### Stack technique

| Composant | Technologie |
|-----------|-------------|
| **Runtime** | Node.js 22+ avec TypeScript (tsx) |
| **API** | Express.js, express-rate-limit, express-slow-down, helmet |
| **Validation** | Zod 4 |
| **Documentation** | Swagger / OpenAPI 3.0 (swagger-jsdoc + swagger-ui-express) |
| **Base de données** | MySQL 8.0 (utf8mb4_unicode_ci) |
| **Frontend** | Vue 3, Vue Router, Tailwind CSS |
| **Build frontend** | Vite 6 |
| **Containerisation** | Docker multi-stage + Docker Compose |
| **Reverse proxy** | Traefik (Let's Encrypt, HTTPS automatique) |
| **CI/CD** | GitHub Actions (4 jobs) |
| **Registry** | ghcr.io (GitHub Container Registry) |
| **Logging** | Winston (module tags, durées, filtrage) |
| **Backup** | mysqldump + gzip, cron quotidien, 7 jours de rétention |

---

## CI/CD

Pipeline GitHub Actions (`.github/workflows/ci.yml`) en 4 jobs :

| Job | Description | Déclencheur |
|-----|-------------|-------------|
| **🔍 Lint** | Type-check TypeScript (`tsc --noEmit`) API + build IHM + `npm audit` | push/PR sur `main` |
| **🧪 Test** | Tests unitaires Vitest (29 tests) + tests e2e API avec MySQL | après Lint |
| **🐳 Build** | Build Docker + push sur ghcr.io (API + IHM) | push sur `main` uniquement |
| **🚀 Deploy** | SSH sur VPS : `git pull`, `docker compose pull/up`, health check | après Test + Build |

Le déploiement se fait via SSH (`appleboy/ssh-action@v1`) avec :
- `git reset --hard HEAD` avant pull (évite les conflits de fichiers modifiés localement)
- Pull des images GHCR pré-buildées
- Health check de l'API post-déploiement
- Nettoyage des images Docker obsolètes

Les tests game-data sont automatiquement skippés en CI quand aucune extraction n'est disponible.

---

## Docker

### Architecture multi-stage (API)

```
Stage 1: base         → node:22-alpine, WORKDIR /app
Stage 2: deps         → npm ci (toutes les dépendances)
Stage 3: build        → TypeScript type-check (tsc --noEmit)
Stage 4: production   → npm ci --omit=dev, utilisateur non-root, healthcheck
```

### Limites de ressources

| Service | Mémoire |
|---------|---------|
| MySQL | 512 MB |
| API | 256 MB |
| IHM (nginx) | 128 MB |

### Production (VPS + Traefik)

Le fichier `docker-compose.prod.yml` surcharge la config de base :
- Images GHCR pré-buildées (`ghcr.io/ampynjord/starvis-api`, `ghcr.io/ampynjord/starvis-ihm`)
- Ports non exposés (Traefik gère le routage)
- MySQL port fermé (accès interne Docker uniquement)
- Labels Traefik pour routage HTTPS automatique
- Réseau externe `traefik-network`

---

## Tests

### Tests unitaires (Vitest)

```bash
# API — 29 tests (schémas Zod, validation)
cd api && npx vitest run

# Extractor — 44 tests (classifyPort, dataforge helpers)
cd extractor && npx vitest run

# Total : 73 tests
```

### Tests e2e (API)

```bash
# Requiert que l'API soit démarrée
cd api && node tests/test-all.mjs http://localhost:3003
```

---

## Backup

Backup automatisé MySQL avec script `db/backup.sh` :

- **mysqldump** avec `--single-transaction`, `--routines`, `--triggers`
- Compression **gzip**
- Rétention **7 jours** (suppression automatique des anciens backups)
- **Cron** : tous les jours à 3h UTC

```bash
# Cron configuré sur le VPS
0 3 * * * /home/ubuntu/docker/starvis/db/backup.sh >> /home/ubuntu/docker/starvis/backups/backup.log 2>&1

# Backup manuel
bash /home/ubuntu/docker/starvis/db/backup.sh

# Restauration
gunzip < /home/ubuntu/docker/starvis/backups/starvis_YYYY-MM-DD_HHMM.sql.gz | \
  docker exec -i starvis-mysql mysql -u root -p"$MYSQL_ROOT_PASSWORD" starvis
```

---

## Examples

### Lister les chasseurs Aegis

```bash
curl 'https://starvis-api.ampynjord.bzh/api/v1/ships?manufacturer=AEGS&role=combat' | jq '.data[] | {name, mass, scm_speed}'
```

### Voir le loadout du Gladius

```bash
curl 'https://starvis-api.ampynjord.bzh/api/v1/ships/AEGS_Gladius/loadout' | jq
```

### Lister les armes S3+ par DPS

```bash
curl 'https://starvis-api.ampynjord.bzh/api/v1/components?type=WeaponGun&size=3&sort=weapon_dps&order=desc' | jq
```

### Comparer deux vaisseaux

```bash
curl 'https://starvis-api.ampynjord.bzh/api/v1/ships/AEGS_Gladius/compare/AEGS_Sabre' | jq '.data.comparison'
```

### Exporter les composants en CSV

```bash
curl 'https://starvis-api.ampynjord.bzh/api/v1/components?type=WeaponGun&format=csv' -o weapons.csv
```

### Admin

```bash
# Sync Ship Matrix
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" https://starvis-api.ampynjord.bzh/admin/sync-ship-matrix | jq

# Re-extraire les données (sur PC local avec Star Citizen)
cd extractor && npx tsx extract.ts --p4k "/path/to/Data.p4k"
```

---

## Development

```bash
# Dev mode avec hot-reload (API)
cd api && npm run dev

# Dev mode (IHM)
cd ihm && npm run dev

# Logs Docker en temps réel
docker compose logs -f api

# Rebuild complet (reset DB)
docker compose down -v && docker compose up --build -d
```

---

## Data Sources

| Source | Description | Tables |
|--------|-------------|--------|
| [RSI Ship Matrix API](https://robertsspaceindustries.com/ship-matrix/index) | Liste officielle des vaisseaux (marketing) | `ship_matrix` |
| P4K / DataForge (Game2.dcb) | Données réelles du jeu | `ships`, `components`, `ships_loadouts`, `manufacturers`, `ship_modules`, `ship_paints` |

---

## Troubleshooting

### MySQL health check fails en CI/CD

**Symptôme** : Container `starvis-mysql` unhealthy, déploiement échoue avec "dependency failed to start"

**Cause** : Health check `mysqladmin ping -h localhost` échoue quand MySQL requiert l'authentification par mot de passe

**Solution** : Health check authentifié dans `docker-compose.yml` :
```yaml
healthcheck:
  test: ["CMD-SHELL", "mysqladmin ping -h localhost -u root -p$$MYSQL_ROOT_PASSWORD || exit 1"]
```
Note : `$$MYSQL_ROOT_PASSWORD` avec double `$$` (Compose l'escape en simple `$`)

### L'extractor ne peut pas se connecter au MySQL de production

**Symptôme** : `Access denied for user 'starvis_user'@'172.18.0.1' (using password: YES)`

**Cause** : Docker MySQL crée l'utilisateur avec le host `localhost` uniquement. Les connexions externes viennent d'une IP différente.

**Solution** : `db/init.sh` crée l'utilisateur avec `'%'` (tous les hosts) :
```bash
CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}';
GRANT ALL PRIVILEGES ON ${MYSQL_DATABASE}.* TO '${MYSQL_USER}'@'%';
```

### docker-compose.prod.yml vide après SCP

**Symptôme** : API/IHM renvoient 404, containers sans labels Traefik

**Cause** : Transfert de fichier corrompu ou git ne pull pas le fichier override

**Fix** :
```bash
# Vérifier le contenu sur le VPS
cat /home/ubuntu/docker/starvis/docker-compose.prod.yml
# Doit contenir ~42 lignes avec labels Traefik

# Si vide, restaurer depuis git
cd /home/ubuntu/docker/starvis && git reset --hard HEAD && git pull origin main
```

### CD deploy échoue : "cannot fast-forward"

**Symptôme** : `git pull --ff-only` échoue car des fichiers locaux ont été modifiés sur le VPS

**Cause** : Des opérations manuelles (chmod, éditions) ont modifié des fichiers trackés

**Solution** : Le script de deploy fait `git reset --hard HEAD` avant le pull. Si le problème persiste :
```bash
cd /home/ubuntu/docker/starvis
git reset --hard HEAD
git pull origin main
```

### Rate limiting trop strict / trop laxiste

Le rate limiting est configurable à plusieurs niveaux :

| Couche | Paramètre | Défaut | Fichier |
|--------|-----------|--------|---------|
| Burst | 30 req/min | `server.ts` | API |
| SlowDown | Délai après 100 req, +500ms/req | `server.ts` | API |
| Hard limit | `RATE_LIMIT_MAX` env var | 200 req/15min | API |
| Admin | 20 req/15min | `server.ts` | API |
| Nginx API | 10 req/s, burst 20 | `nginx.conf` | IHM |
| Nginx static | 30 req/s, burst 50 | `nginx.conf` | IHM |
| Nginx connexions | 20 simultanées/IP | `nginx.conf` | IHM |

---

## License

MIT © [ampynjord](https://github.com/ampynjord)