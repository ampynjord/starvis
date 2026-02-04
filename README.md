# 🚀 STARAPI

**API REST pour les données de vaisseaux Star Citizen**

Agrégation des données **RSI Ship Matrix** + **P4K DataForge** avec UUIDs réels, pagination, filtres et rate limiting.

---

## ✨ Fonctionnalités

- 🛸 **246 vaisseaux** avec UUIDs DataForge authentiques
- 🔍 **Filtres avancés** : manufacturer, size, role, status, type
- 📄 **Pagination** complète avec métadonnées
- 🔐 **Rate Limiting** (100 req/min public, 30 req/min admin)
- 📦 **P4K Integration** : extraction directe des fichiers de jeu
- 📊 **Statistiques** par manufacturer, rôle, taille

---

## 🚀 Démarrage rapide

### Prérequis

- Docker & Docker Compose
- (Optionnel) Star Citizen installé pour l'enrichissement P4K

### Installation

```bash
# Clone
git clone https://github.com/ampynjord/starapi
cd starapi

# Configuration
cp .env.example .env
# Éditer .env si nécessaire

# Démarrer
docker compose up -d

# Vérifier
curl http://localhost:3000/health
```

### Variables d'environnement

```env
# Base de données
DB_HOST=mysql
DB_PORT=3306
DB_USER=starapi_user
DB_PASSWORD=starapi_pass
DB_NAME=starapi
MYSQL_ROOT_PASSWORD=rootpassword

# API
PORT=3000
NODE_ENV=production
ADMIN_API_KEY=your_secret_key

# P4K (optionnel)
P4K_PATH=/game/Data.p4k
P4K_VOLUME=/mnt/c/Program Files/Roberts Space Industries/StarCitizen/LIVE:/game:ro
```

---

## 📚 API Endpoints

### Ships

```bash
# Liste paginée avec filtres
GET /api/v1/ships
GET /api/v1/ships?page=1&limit=10&manufacturer=aegis&status=flight-ready&size=medium

# Détails d'un vaisseau
GET /api/v1/ships/:uuid

# Comparaison de vaisseaux
GET /api/v1/ships/compare?uuids=uuid1,uuid2,uuid3

# Recherche par nom
GET /api/v1/ships/search?q=hornet
```

#### Paramètres de filtre

| Paramètre | Description | Exemple |
|-----------|-------------|---------|
| `page` | Numéro de page | `1` |
| `limit` | Résultats par page (max 100) | `20` |
| `manufacturer` | Code fabricant | `aegis`, `anvl`, `rsi` |
| `status` | Statut de production | `flight-ready`, `in-concept` |
| `size` | Taille du vaisseau | `small`, `medium`, `large`, `capital` |
| `role` | Rôle principal | `combat`, `transport`, `exploration` |
| `type` | Type de véhicule | `spaceship`, `ground_vehicle`, `snub` |
| `sort` | Champ de tri | `name`, `manufacturer`, `size` |
| `order` | Ordre de tri | `asc`, `desc` |

### Manufacturers

```bash
# Liste des fabricants avec stats
GET /api/v1/manufacturers

# Détails d'un fabricant
GET /api/v1/manufacturers/:code

# Vaisseaux d'un fabricant
GET /api/v1/manufacturers/AEGS/ships
```

### Statistics

```bash
# Statistiques globales
GET /api/v1/stats
```

### Admin (nécessite X-API-Key)

```bash
# Synchronisation complète (RSI + P4K)
POST /admin/sync

# Sync RSI Ship Matrix uniquement
POST /admin/sync/rsi

# Enrichissement P4K uniquement
POST /admin/sync/p4k

# Health check détaillé
GET /admin/health
```

---

## 🗄️ Base de données

### Schéma

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  manufacturers  │     │      ships      │     │   ship_specs    │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ code (PK)       │◄────│ manufacturer_   │     │ ship_uuid (PK)  │
│ name            │     │   code (FK)     │────►│ length          │
│ description     │     │ uuid (PK)       │     │ beam            │
│ country         │     │ name            │     │ height          │
└─────────────────┘     │ class_name      │     │ mass            │
                        │ role            │     │ cargo_scu       │
                        │ size            │     │ min_crew        │
                        │ vehicle_type    │     │ max_crew        │
                        │ production_     │     │ scm_speed       │
                        │   status        │     │ max_speed       │
                        │ is_flight_ready │     │ pitch/yaw/roll  │
                        │ thumbnail_url   │     │ accelerations   │
                        │ p4k_base_path   │     │ hull_hp         │
                        │ enriched_at     │     │ shield_hp       │
                        └─────────────────┘     └─────────────────┘
```

### Fabricants supportés (22)

| Code | Nom | Origine |
|------|-----|---------|
| AEGS | Aegis Dynamics | UEE |
| ANVL | Anvil Aerospace | UEE |
| AOPOA | Aopoa | Xi'an Empire |
| ARGO | Argo Astronautics | UEE |
| BANU | Banu | Banu Protectorate |
| CNOU | Consolidated Outland | UEE |
| CRUS | Crusader Industries | UEE |
| DRAK | Drake Interplanetary | UEE |
| ESPR | Esperia | UEE |
| GAMA | Gatac Manufacture | Tevarin |
| GREY | Grey's Market | Underground |
| GRIN | Greycat Industrial | UEE |
| KRIG | Kruger Intergalactic | UEE |
| MIRA | Mirai | UEE |
| MISC | MISC | UEE |
| ORIG | Origin Jumpworks | UEE |
| RSI | Roberts Space Industries | UEE |
| TMBL | Tumbril Land Systems | UEE |
| VNCL | Vanduul Clans | Vanduul |

---

## 🏗️ Architecture

```
starapi/
├── server.ts              # Point d'entrée Express
├── src/
│   ├── routes.ts          # Définition des endpoints
│   ├── services.ts        # Logique métier & sync
│   ├── p4k-aliases.ts     # Mappings RSI ↔ P4K
│   ├── middleware/        # Auth, rate-limit, logging
│   ├── providers/
│   │   ├── p4k-provider.ts       # Lecture fichiers P4K
│   │   ├── dataforge-parser.ts   # Parser XML DataForge
│   │   ├── cryengine-decrypt.ts  # Déchiffrement CryEngine
│   │   └── rsi-providers.ts      # Scraping RSI
│   ├── services/
│   │   ├── p4k-service.ts        # Service P4K
│   │   ├── p4k-enrichment-service.ts
│   │   └── ship-service.ts
│   └── utils/
├── db/
│   └── schema.sql         # Schéma MySQL
├── docker-compose.yml
├── Dockerfile
└── .env
```

### Stack technique

- **Runtime** : Node.js 20+ avec TypeScript
- **Framework** : Express.js
- **Base de données** : MySQL 8.0
- **Conteneurisation** : Docker & Docker Compose
- **Logging** : Winston

---

## 📖 Exemples

### Lister les chasseurs Aegis

```bash
curl 'http://localhost:3000/api/v1/ships?manufacturer=aegs&role=combat&limit=5' | jq
```

### Obtenir les stats globales

```bash
curl http://localhost:3000/api/v1/stats | jq '.data.global'
```

```json
{
  "total_ships": 246,
  "flight_ready_count": 214,
  "in_concept_count": 32,
  "manufacturer_count": 19
}
```

### Comparer des vaisseaux

```bash
curl 'http://localhost:3000/api/v1/ships/compare?uuids=uuid1,uuid2' | jq
```

### Synchroniser (admin)

```bash
curl -X POST \
  -H "X-API-Key: your_admin_key" \
  http://localhost:3000/admin/sync
```

---

## 🔧 Développement

```bash
# Mode développement avec hot-reload
npm run dev

# Compilation TypeScript
npx tsc

# Logs en temps réel
docker compose logs -f api
```

---

## 📝 Sources de données

| Source | Description | Fréquence |
|--------|-------------|-----------|
| [RSI Ship Matrix](https://robertsspaceindustries.com/ship-matrix) | Liste officielle des vaisseaux | À la demande |
| P4K DataForge | Fichiers de jeu (UUIDs, specs) | Enrichissement |

---

## 📄 License

MIT © [ampynjord](https://github.com/ampynjord)

---

<p align="center">
  <i>Made with ☕ for the Star Citizen community</i>
</p>
