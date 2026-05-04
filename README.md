# STARVIS

[![CI/CD](https://github.com/ampynjord/starvis/actions/workflows/ci.yml/badge.svg)](https://github.com/ampynjord/starvis/actions/workflows/ci.yml)
[![Node v22](https://img.shields.io/badge/node-v22-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Base de données Star Citizen — vaisseaux, composants, objets FPS, commerce, crafting, mining.

- **Production** : [starvis.ampynjord.bzh](https://starvis.ampynjord.bzh)
- **API Docs** : [starvis.ampynjord.bzh/api-docs](https://starvis.ampynjord.bzh/api-docs)

---

## Structure du monorepo

| Répertoire | Rôle |
|---|---|
| `api/` | API REST Express.js + Prisma (déployée sur VPS) |
| `ihm/` | Interface web Next.js + Tailwind CSS |
| `bot/` | Bot Discord avec slash commands |
| `extractor/` | CLI d'extraction P4K → PostgreSQL (exécution locale) |
| `db/` | Schémas Prisma, init PostgreSQL, script de backup |

---

## Démarrage rapide

### Prérequis

- Node.js 22+
- Docker & Docker Compose

### Développement

```bash
cp .env.dev.example .env.dev
# Remplir .env.dev : DB_PASSWORD, JWT_SECRET, ADMIN_API_KEY
# Discord optionnel : DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID

docker compose -f docker-compose.dev.yml --env-file .env.dev up
```

Services lancés :

| Service | Port par défaut |
|---|---|
| API (hot reload) | 3000 |
| IHM (Next.js HMR) | 5173 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| Bot Discord | — |

Les variables d'environnement disponibles avec leurs valeurs par défaut sont documentées dans `.env.dev.example` et `.env.prod.example`.

---

## Sources de données

L'application combine deux sources complémentaires :

| Source | Contenu | Mise à jour |
|---|---|---|
| **P4K / DataForge** | Données in-game réelles (~320 vaisseaux, ~3 200 composants, ~10 000 items FPS…) | Via CLI `extractor/` |
| **RSI Ship Matrix** | Données marketing officielles (~246 vaisseaux) | Synchronisation automatique au démarrage de l'API |
| **RSI Website** | Galactapedia, Comm-links, Starmap, CTM | Via CLI `extractor/` |

L'extraction P4K se fait en local — voir [`extractor/README.md`](extractor/README.md).

---

## Environnements LIVE / PTU

Les données LIVE et PTU coexistent dans la même base PostgreSQL, séparées par une colonne `env` (`'live'` ou `'ptu'`) sur chaque table du schéma `game`.

| Env | Version actuelle | Description |
|---|---|---|
| `live` | 4.7.2 | Serveurs de production Star Citizen |
| `ptu` | 4.8.0 | Public Test Universe |

Tous les endpoints API acceptent un paramètre `?env=live` (défaut) ou `?env=ptu`. L'interface bascule entre les deux via un sélecteur persisté en `localStorage`.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  Local (développeur)                                  │
│                                                      │
│  Star Citizen → P4K → extractor CLI → PostgreSQL VPS │
│  (LIVE & PTU, données séparées par colonne env)      │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  VPS (Docker Compose)                                 │
│                                                      │
│  Traefik (HTTPS) → IHM (Next.js)                     │
│                  → API (Express)  → PostgreSQL        │
│                                   → Redis (cache)    │
│  Bot Discord      → API                              │
└──────────────────────────────────────────────────────┘
```

### Bases de données (PostgreSQL 16)

| Schéma | Contenu |
|---|---|
| `game` | Vaisseaux, composants, items, commodités, missions, crafting — colonnes `env = 'live'` ou `'ptu'` |
| `rsi` | Ship Matrix, Galactapedia, Comm-links, Starmap |
| `meta` | Logs d'extraction (`extraction_log`), changelog automatique avec filtrage par env |

---

## API — Endpoints principaux

Tous les endpoints de données acceptent `?env=live` (défaut) ou `?env=ptu`.

| Ressource | Endpoints clés |
|---|---|
| Vaisseaux | `GET /ships`, `/ships/:id`, `/ships/:id/loadout`, `/ships/:id/compare/:otherId`, `/ships/ranking` |
| Composants | `GET /components`, `/components/:id`, `/components/filters` |
| Items FPS | `GET /items`, `/items/:id`, `/items/filters` |
| Commodités | `GET /commodities`, `/commodities/:id/prices` |
| Commerce | `GET /trade/prices`, `/trade/location/:key` |
| Mining | `GET /mining/elements`, `/mining/compositions`, `/mining/lasers` |
| Missions | `GET /missions`, `/missions/:id` |
| Crafting | `GET /crafting/recipes`, `/crafting/recipes/:id` |
| Locations | `GET /locations`, `/locations/:id` |
| Ship Matrix | `GET /ship-matrix`, `/ship-matrix/:id` |
| Recherche | `GET /search` |
| Calculs | `GET /calculate/fps-damage`, `/calculate/mining-yield` |
| Changelog | `GET /changelog`, `/changelog/summary` — filtré par env |
| Admin | `POST /admin/sync-ship-matrix`, `GET /admin/extraction-log` |
| Santé | `GET /health`, `/health/live`, `/health/ready`, `/metrics` |

Toutes les listes supportent `page`, `limit`, `search`, `sort`, `order` et `format=csv`.
Spec OpenAPI complète disponible sur `/api-docs`.

---

## CI/CD

Pipeline GitHub Actions sur chaque push vers `main` :

1. **Quality** — Lint (Biome), tests (Vitest), type-check (tsc)
2. **Build** — Images Docker API + IHM + Bot → GHCR
3. **Deploy** — SSH vers VPS → `docker compose up`

---

## Production

Le déploiement utilise `.env.prod` sur le VPS. Pour modifier la configuration sans rebuild :

```bash
ssh -i ~/.ssh/starvis_vps debian@ampynjord.bzh
# Éditer /home/debian/starvis/.env.prod
# Puis relancer le service concerné :
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --no-deps --force-recreate <service>
```

---

## Tests

```bash
npm run test                                           # Tous les workspaces
npm run test --workspace=api                           # API uniquement
npm run typecheck --workspace=api                      # Type-check API
npx tsc --noEmit --project extractor/tsconfig.json    # Type-check extractor
npm run lint                                           # Lint Biome (tous les workspaces)
```
