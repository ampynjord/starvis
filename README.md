# STARAPI v1.0

**API REST pour les données de vaisseaux Star Citizen**

Deux sources de données complémentaires :
- **RSI Ship Matrix** — données officielles marketing (246 vaisseaux)
- **P4K DataForge** — données de jeu réelles (~353 vaisseaux, ~1200+ composants, ~35 000 ports de loadout)

---

## Fonctionnalités

- **Ship Matrix** : 246 vaisseaux depuis l'API RSI (données marketing, specs officielles)
- **Game Data** : ~353 vaisseaux jouables extraits du P4K/DataForge (filtrés, sans doublons/tests)
- **Components** : ~2700+ composants en 12 types (armes, boucliers, power plants, coolers, quantum drives, missiles, thrusters, radars, countermeasures, fuel tanks, fuel intakes, life support)
- **Weapon Damage Breakdown** : dégâts détaillés par type (physical, energy, distortion, thermal, biochemical, stun)
- **Burst / Sustained DPS** : DPS instantané, en rafale (jusqu'à surchauffe), et soutenu (avec cycles de refroidissement)
- **Missile Damage Breakdown** : dégâts missiles détaillés par type (physical, energy, distortion)
- **Shops & Prix** : magasins in-game avec inventaire et prix d'achat/location
- **Loadout Simulator** : calcul des stats agrégées (DPS total, boucliers, puissance, thermique) avec remplacement de composants
- **Manufacturers** : ~55 fabricants (véhicules + composants)
- **Loadouts** : ~35 000 ports d'équipement par défaut avec hiérarchie parent/enfant
- **Cross-référence** automatique ships ↔ ship_matrix (~206 liés via alias + fuzzy matching)
- **Pagination** sur tous les endpoints de liste (page, limit, total, pages)
- **Filtres & tri** avancés sur ships, components, manufacturers, shops
- **Export CSV** sur tous les endpoints de liste (`?format=csv`)
- **ETag / Cache** HTTP avec `Cache-Control` et `If-None-Match` (304)
- **Rate limiting** configurable (200 req / 15 min par IP par défaut)
- **Comparaison** de vaisseaux côte à côte avec deltas numériques
- **Swagger / OpenAPI** docs interactives sur `/api-docs`
- **Versioning d'extraction** avec journal d'extraction en base
- **CI/CD** GitHub Actions (lint, tests, build Docker, push ghcr.io)

---

## Démarrage rapide

### Prérequis

- Docker & Docker Compose
- Star Citizen installé (pour les données P4K)

### Installation

```bash
git clone https://github.com/ampynjord/starapi
cd starapi
cp .env.example .env    # puis éditer les mots de passe et chemins
docker compose up -d
curl http://localhost:3003/health
```

> Le premier démarrage prend ~6 min (extraction de ~353 vaisseaux depuis le P4K).

### Variables d'environnement

Toute la configuration est dans `.env` (voir `.env.example`).

| Variable | Description | Défaut |
|----------|-------------|--------|
| `API_PORT` | Port exposé sur l'hôte | `3003` |
| `API_INTERNAL_PORT` | Port interne du container | `3000` |
| `NODE_ENV` | Environnement (production/development) | `production` |
| `LOG_LEVEL` | Niveau de log (debug/info/warn/error) | `info` |
| `ADMIN_API_KEY` | Clé d'accès admin (**obligatoire**) | — |
| `CORS_ORIGIN` | Origine CORS | `*` |
| `RATE_LIMIT_MAX` | Max requêtes / 15 min | `200` |
| `DB_HOST` | Hôte MySQL | `mysql` |
| `DB_PORT` | Port MySQL interne (réseau docker) | `3306` |
| `DB_EXTERNAL_PORT` | Port MySQL exposé sur l'hôte | `3306` |
| `DB_USER` | Utilisateur MySQL | — |
| `DB_PASSWORD` | Mot de passe MySQL | — |
| `DB_NAME` | Nom de la base | `starapi` |
| `MYSQL_ROOT_PASSWORD` | Mot de passe root MySQL | — |
| `P4K_PATH` | Chemin vers Data.p4k dans le conteneur | `/game/Data.p4k` |
| `P4K_VOLUME` | Chemin hôte vers le dossier LIVE de Star Citizen | — |

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

~353 vaisseaux jouables extraits du P4K/DataForge avec toutes les données de jeu réelles.
Réponses paginées par défaut (50 items/page, max 200).

```bash
# Liste avec filtres + pagination
GET /api/v1/ships
GET /api/v1/ships?manufacturer=AEGS&role=combat&sort=mass&order=desc
GET /api/v1/ships?page=2&limit=20
GET /api/v1/ships?format=csv

# Détails (par UUID ou class_name)
GET /api/v1/ships/:uuid
GET /api/v1/ships/AEGS_Gladius

# Loadout par défaut (hiérarchique)
GET /api/v1/ships/:uuid/loadout
GET /api/v1/ships/AEGS_Gladius/loadout

# Comparaison côte à côte
GET /api/v1/ships/AEGS_Gladius/compare/AEGS_Sabre
```

#### Champs ships

| Champ | Description |
|-------|-------------|
| `uuid`, `class_name`, `name` | Identifiants |
| `manufacturer_code`, `career`, `role` | Classification |
| `mass`, `total_hp` | Masse (kg), HP totaux (somme des parts) |
| `scm_speed`, `max_speed` | Vitesse SCM et max (m/s) |
| `boost_speed_forward/backward/left/right/up/down` | Vitesses boost directionnelles |
| `pitch_max`, `yaw_max`, `roll_max` | Rotation max (°/s) |
| `hydrogen_fuel`, `quantum_fuel` | Capacités carburant |
| `cargo_capacity` | Capacité cargo (SCU) |
| `armor_physical/energy/distortion` | Résistance blindage |
| `armor_thermal/biochemical/stun` | Résistance blindage (suite) |
| `armor_signal_ir/em/cs` | Signatures blindage |
| `cross_section_x/y/z` | Section transversale |
| `short_name`, `description` | Nom court et description |
| `ship_grade` | Grade du vaisseau |
| `shield_hp` | HP bouclier cumulés |
| `missile_damage_total` | Dégâts missiles totaux (loadout par défaut) |
| `ship_matrix_id` | ID Ship Matrix RSI (si lié) |

#### Filtres ships

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `manufacturer` | Code fabricant | `AEGS`, `ANVL`, `RSI` |
| `role` | Rôle | `combat`, `transport` |
| `search` | Recherche nom/className | `Gladius` |
| `sort` | Tri | `name`, `mass`, `scm_speed`, `total_hp`, `boost_speed_forward`, `cargo_capacity`, `armor_physical`, `cross_section_x` |
| `order` | Ordre | `asc`, `desc` |
| `page` | Page (1-based) | `1`, `2`, `3` |
| `limit` | Items par page (max 200) | `10`, `50`, `200` |
| `format` | Format de sortie | `json` (défaut), `csv` |

### Components (Game Data)

~1200+ composants interchangeables extraits du DataForge, répartis en 12 types.
Réponses paginées par défaut.

```bash
# Liste avec filtres + pagination
GET /api/v1/components
GET /api/v1/components?type=WeaponGun&size=3&manufacturer=BEHR
GET /api/v1/components?page=2&limit=20
GET /api/v1/components?format=csv

# Détails
GET /api/v1/components/:uuid
```

#### Types de composants

| Type | Description | Exemples |
|------|-------------|----------|
| `WeaponGun` | Armes (canons, gatlings, lasers, scatterguns) | Attrition, Mantis, Revenant |
| `Shield` | Boucliers | Castra, Sukoran, Fortifier |
| `PowerPlant` | Centrales électriques | Genoa, Fierell |
| `Cooler` | Refroidisseurs | Bracer, NDB-28 |
| `QuantumDrive` | Drives quantiques | Beacon, Atlas |
| `Missile` | Missiles | Dominator, Arrester, Rattler |
| `Thruster` | Propulseurs (main + maneuvering) | — |
| `Radar` | Radars | — |
| `Countermeasure` | Contre-mesures (flares, chaff) | — |
| `FuelTank` | Réservoirs (hydrogène + quantum) | — |
| `FuelIntake` | Prises de carburant (scooping) | — |
| `LifeSupport` | Support de vie | — |

#### Filtres components

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `type` | Type de composant | `WeaponGun`, `Shield`, `PowerPlant`, `QuantumDrive`, `Cooler`, `Missile` |
| `size` | Taille (0-9) | `3` |
| `manufacturer` | Code fabricant | `BEHR` |
| `search` | Recherche nom/className | `Gatling` |
| `sort` | Tri | `name`, `weapon_dps`, `weapon_burst_dps`, `weapon_sustained_dps`, `shield_hp`, `qd_speed`, `thruster_max_thrust`, `radar_range`, `fuel_capacity` |
| `page` | Page (1-based) | `1`, `2` |
| `limit` | Items par page (max 200) | `10`, `50` |
| `format` | Format de sortie | `json`, `csv` |

### Manufacturers

~55 fabricants (véhicules + composants).

```bash
GET /api/v1/manufacturers
```

### Shops & Prix

Magasins in-game avec localisation, inventaire et prix.

```bash
# Liste des shops (paginated)
GET /api/v1/shops
GET /api/v1/shops?location=lorville&type=Weapons

# Inventaire d'un shop
GET /api/v1/shops/:id/inventory

# Où acheter un composant (prix + shops)
GET /api/v1/components/:uuid/buy-locations
```

### Loadout Simulator

Calculateur de stats agrégées pour un loadout personnalisé.

```bash
# Stats par défaut (sans swap)
curl -X POST http://localhost:3003/api/v1/loadout/calculate \
  -H "Content-Type: application/json" \
  -d '{"shipUuid": "...", "swaps": []}'

# Avec remplacement de composants
curl -X POST http://localhost:3003/api/v1/loadout/calculate \
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
# Dernière extraction game data
GET /api/v1/version
```

### Swagger / OpenAPI

```bash
# Documentation interactive
GET /api-docs
```

### Admin (nécessite X-API-Key)

```bash
# Sync RSI Ship Matrix
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/sync-ship-matrix

# Extraction complète P4K/DataForge
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/extract-game-data

# Statistiques BDD
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/stats

# Journal d'extractions
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/extraction-log
```

### Health

```bash
GET /health
```

---

## Base de données

### Schéma (7 tables)

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

### Données actuelles

| Table | Entrées |
|-------|---------|
| `ship_matrix` | 246 |
| `ships` | ~353 (vaisseaux jouables, filtrés) |
| `components` | ~2700+ (12 types, 62 colonnes dont damage breakdown) |
| `manufacturers` | ~55 |
| `ships_loadouts` | ~35 000 ports |
| `shops` | Variable (selon extraction) |
| `shop_inventory` | Variable (prix d'achat/location) |
| Ships liés à Ship Matrix | ~206 |

### Manufacturers principaux

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

```
starapi/
├── server.ts                      # Point d'entrée Express
├── .github/
│   └── workflows/
│       └── ci.yml                 # CI/CD GitHub Actions (4 jobs)
├── db/
│   └── schema.sql                 # Schéma MySQL (5 tables + FK)
├── src/
│   ├── routes.ts                  # Endpoints API v1.0 (pagination, ETag, CSV, compare)
│   ├── middleware/
│   │   └── auth.ts                # Auth X-API-Key
│   ├── providers/
│   │   └── p4k-provider.ts        # Lecture fichiers P4K (ZIP+AES)
│   ├── services/
│   │   ├── schema.ts              # Init schéma BDD + migrations
│   │   ├── ship-matrix-service.ts # RSI API → ship_matrix
│   │   ├── dataforge-service.ts   # P4K/DCB parser (~2300 lignes)
│   │   └── game-data-service.ts   # DataForge → ships/components/loadouts
│   └── utils/
│       ├── config.ts              # Configuration centralisée
│       ├── cryxml-parser.ts       # Parser CryXML binaire
│       └── logger.ts              # Winston logger
├── tests/
│   └── test-all.mjs               # 50+ tests API (endpoints + data quality)
├── docker-compose.yml
├── Dockerfile                     # Multi-stage (4 stages)
└── package.json
```

### Pipeline de données

```
Au démarrage :
  1. Init DB + schéma (5 tables) + migrations
  2. ShipMatrixService.sync()        → 246 ships dans ship_matrix
  3. DataForgeService.init()         → Ouverture P4K (284 MB, Game2.dcb)
  4. GameDataService.extractAll()    → En background :
     ├── saveManufacturersFromData() → ~50 manufacturers
     ├── saveComponents()            → ~1200+ components (12 types)
     ├── saveShips() + loadouts      → ~353 ships + ~35000 loadout ports
     ├── crossReferenceShipMatrix()  → ~205 ships liés (multi-pass + aliases)
     └── INSERT extraction_log       → Hash SHA-256 + stats + durée
```

Tous les endpoints GET lisent la base MySQL (pas d'accès direct aux sources P4K/RSI).
L'écriture en BDD se fait uniquement au démarrage ou via les endpoints admin POST.

### Stack technique

- **Runtime** : Node.js 20+ avec TypeScript (tsx)
- **Framework** : Express.js + express-rate-limit
- **Documentation** : Swagger / OpenAPI 3.0 (swagger-jsdoc + swagger-ui-express)
- **Base de données** : MySQL 8.0
- **Conteneurisation** : Docker multi-stage & Docker Compose
- **CI/CD** : GitHub Actions (lint → tests → build → deploy)
- **Registry** : ghcr.io (GitHub Container Registry)
- **Logging** : Winston (module tags, durées, filtrage)

---

## CI/CD

Pipeline GitHub Actions (`.github/workflows/ci.yml`) en 4 étapes :

| Job | Description | Déclencheur |
|-----|-------------|-------------|
| **Lint** | TypeScript type-check (`tsc --noEmit`) | push/PR sur `main` |
| **Test** | Tests API avec MySQL (50+ tests) | après Lint |
| **Build** | Build Docker + push ghcr.io | push sur `main` uniquement |
| **Deploy** | Notification (placeholder pour déploiement) | après Test + Build |

Les tests s'exécutent **sans P4K** en CI : les tests game-data sont automatiquement ignorés (SKIP) quand aucune extraction n'est disponible.

---

## Docker

### Architecture multi-stage

```
Stage 1: base         → node:20-alpine, WORKDIR /app
Stage 2: deps         → npm ci (toutes deps)
Stage 3: build        → TypeScript type-check (tsc --noEmit)
Stage 4: production   → npm ci --omit=dev + tsx, non-root user, healthcheck
```

Les ports sont configurables via `.env` (`API_PORT` pour l'hôte, `API_INTERNAL_PORT` pour le container).

---

## Tests

```bash
# Lancer les tests (nécessite l'API en cours d'exécution)
node tests/test-all.mjs

# Ou avec une URL custom
node tests/test-all.mjs http://localhost:3003
```

---

## Exemples

### Lister les chasseurs Aegis

```bash
curl 'http://localhost:3003/api/v1/ships?manufacturer=AEGS&role=combat' | jq '.data[] | {name, mass, scm_speed}'
```

### Voir le loadout du Gladius

```bash
curl 'http://localhost:3003/api/v1/ships/AEGS_Gladius/loadout' | jq
```

### Lister les armes S3+ par DPS

```bash
curl 'http://localhost:3003/api/v1/components?type=WeaponGun&size=3&sort=weapon_dps&order=desc' | jq
```

### Comparer deux vaisseaux

```bash
curl 'http://localhost:3003/api/v1/ships/AEGS_Gladius/compare/AEGS_Sabre' | jq '.data.comparison'
```

### Exporter les composants en CSV

```bash
curl 'http://localhost:3003/api/v1/components?type=WeaponGun&format=csv' -o weapons.csv
```

### Resync admin

```bash
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/sync-ship-matrix | jq
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/extract-game-data | jq
```

---

## Développement

```bash
# Mode dev avec hot-reload
npm run dev

# Logs Docker en temps réel
docker compose logs -f api

# Rebuild complet (reset BDD)
docker compose down -v && docker compose up --build -d
```

---

## Sources de données

| Source | Description | Tables |
|--------|-------------|--------|
| [RSI Ship Matrix API](https://robertsspaceindustries.com/ship-matrix/index) | Liste officielle des vaisseaux (marketing) | `ship_matrix` |
| P4K / DataForge (Game2.dcb) | Données de jeu réelles | `ships`, `components`, `ships_loadouts`, `manufacturers` |

---

## License

MIT © [ampynjord](https://github.com/ampynjord)
