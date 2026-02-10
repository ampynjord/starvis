# STARAPI v1.0

**API REST pour les données de vaisseaux Star Citizen**

Deux sources de données complémentaires :
- **RSI Ship Matrix** — données officielles marketing (246 vaisseaux)
- **P4K DataForge** — données de jeu réelles (474 vaisseaux, 1352 composants, ~38 600 ports de loadout)

---

## Fonctionnalités

- **Ship Matrix** : 246 vaisseaux depuis l'API RSI (données marketing, specs officielles)
- **Game Data** : 474 vaisseaux extraits du P4K/DataForge avec stats réelles
- **Components** : 1352 composants (armes, boucliers, quantum drives, coolers, missiles…)
- **Manufacturers** : ~50 fabricants
- **Loadouts** : ~38 600 ports d'équipement par défaut avec hiérarchie parent/enfant
- **Cross-référence** automatique ships ↔ ship_matrix (~200 liés via alias + fuzzy matching)
- **Filtres & tri** sur ships, components, manufacturers

---

## Démarrage rapide

### Prérequis

- Docker & Docker Compose
- Star Citizen installé (pour les données P4K)

### Installation

```bash
git clone https://github.com/ampynjord/starapi
cd starapi
cp .env.example .env    # puis éditer les mots de passe
docker compose up -d
curl http://localhost:3003/health
```

> Le premier démarrage prend ~6 min (extraction de 474 vaisseaux depuis le P4K).

### Variables d'environnement

Toute la configuration est dans `.env` (voir `.env.example`).

| Variable | Description |
|----------|-------------|
| `PORT` | Port exposé sur l'hôte (défaut: 3003) |
| `NODE_ENV` | Environnement (production/development) |
| `LOG_LEVEL` | Niveau de log (debug/info/warn/error) |
| `ADMIN_API_KEY` | Clé d'accès admin (**obligatoire**, pas de défaut) |
| `CORS_ORIGIN` | Origine CORS (défaut: *) |
| `DB_HOST` | Hôte MySQL (défaut: mysql) |
| `DB_PORT` | Port MySQL interne (3306) |
| `DB_EXTERNAL_PORT` | Port MySQL exposé (défaut: 3306) |
| `DB_USER` | Utilisateur MySQL |
| `DB_PASSWORD` | Mot de passe MySQL |
| `DB_NAME` | Nom de la base (starapi) |
| `MYSQL_ROOT_PASSWORD` | Mot de passe root MySQL |
| `P4K_PATH` | Chemin vers Data.p4k dans le conteneur |
| `P4K_VOLUME` | Chemin hôte vers le dossier LIVE de Star Citizen |

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

474 vaisseaux extraits du P4K/DataForge avec toutes les données de jeu réelles.

```bash
# Liste avec filtres
GET /api/v1/ships
GET /api/v1/ships?manufacturer=AEGS&role=combat&sort=mass&order=desc

# Détails (par UUID ou class_name)
GET /api/v1/ships/:uuid
GET /api/v1/ships/AEGS_Gladius

# Loadout par défaut (hiérarchique)
GET /api/v1/ships/:uuid/loadout
GET /api/v1/ships/AEGS_Gladius/loadout
```

#### Filtres ships

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `manufacturer` | Code fabricant | `AEGS`, `ANVL`, `RSI` |
| `role` | Rôle | `combat`, `transport` |
| `search` | Recherche nom/className | `Gladius` |
| `sort` | Tri | `name`, `mass`, `scm_speed`, `total_hp` |
| `order` | Ordre | `asc`, `desc` |

### Components (Game Data)

1352 composants SCItem extraits du DataForge.

```bash
# Liste avec filtres
GET /api/v1/components
GET /api/v1/components?type=WeaponGun&size=3&manufacturer=BEHR

# Détails
GET /api/v1/components/:uuid
```

#### Filtres components

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `type` | Type de composant | `WeaponGun`, `Shield`, `PowerPlant`, `QuantumDrive`, `Cooler`, `Missile` |
| `size` | Taille (0-9) | `3` |
| `manufacturer` | Code fabricant | `BEHR` |
| `search` | Recherche nom/className | `Gatling` |
| `sort` | Tri | `name`, `weapon_dps`, `shield_hp`, `qd_speed` |

### Manufacturers

~50 fabricants (véhicules + composants).

```bash
GET /api/v1/manufacturers
```

### Admin (nécessite X-API-Key)

```bash
# Sync RSI Ship Matrix
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/sync-ship-matrix

# Extraction complète P4K/DataForge
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/extract-game-data

# Statistiques BDD
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:3003/admin/stats
```

### Health

```bash
GET /health
```

---

## Base de données

### Schéma (5 tables)

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
│ role, career       │     └────────────────────┘
│ mass, speeds, HP   │
│ fuel, shield       │
│ insurance          │
│ game_data (JSON)   │
└────────┬───────────┘
         │ ship_uuid (FK)
┌────────────────────────────┐     ┌────────────────────┐
│     ships_loadouts         │     │    components       │
├────────────────────────────┤     ├────────────────────┤
│ id (PK)                    │     │ uuid (PK)          │
│ ship_uuid (FK)             │     │ class_name         │
│ port_name                  │     │ name, type, size   │
│ port_type                  │     │ weapon stats       │
│ component_class_name       │     │ shield stats       │
│ component_uuid (FK) ───────┼────►│ QD stats           │
│ parent_id (self-ref)       │     │ missile stats      │
└────────────────────────────┘     │ power, thermal     │
                                   └────────────────────┘
```

### Données actuelles

| Table | Entrées |
|-------|---------|
| `ship_matrix` | 246 |
| `ships` | 474 |
| `components` | 1 352 |
| `manufacturers` | ~50 |
| `ships_loadouts` | ~38 600 ports |
| Ships liés à Ship Matrix | ~200 |

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
├── db/
│   └── schema.sql                 # Schéma MySQL (5 tables)
├── src/
│   ├── routes.ts                  # Endpoints API v1.0
│   ├── middleware/
│   │   └── auth.ts                # Auth X-API-Key
│   ├── providers/
│   │   └── p4k-provider.ts        # Lecture fichiers P4K (ZIP+AES)
│   ├── services/
│   │   ├── schema.ts              # Init schéma BDD + migrations
│   │   ├── ship-matrix-service.ts # RSI API → ship_matrix
│   │   ├── dataforge-service.ts   # P4K/DCB parser (~2000 lignes)
│   │   └── game-data-service.ts   # DataForge → ships/components/loadouts
│   └── utils/
│       ├── config.ts              # Configuration centralisée
│       ├── cryxml-parser.ts       # Parser CryXML binaire
│       └── logger.ts              # Winston logger
├── tests/
│   └── test-all.mjs               # Tests API complets
├── docker-compose.yml
├── Dockerfile
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
     ├── saveComponents()            → 1352 components
     ├── saveShips() + loadouts      → 474 ships + ~38600 loadout ports
     └── crossReferenceShipMatrix()  → ~200 ships liés (multi-pass + aliases)
```

Tous les endpoints GET lisent la base MySQL (pas d'accès direct aux sources P4K/RSI).
L'écriture en BDD se fait uniquement au démarrage ou via les endpoints admin POST.

### Stack technique

- **Runtime** : Node.js 20+ avec TypeScript (tsx)
- **Framework** : Express.js
- **Base de données** : MySQL 8.0
- **Conteneurisation** : Docker & Docker Compose
- **Logging** : Winston (module tags, durées, filtrage)

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
