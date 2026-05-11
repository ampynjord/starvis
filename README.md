# STARVIS

[![CI/CD](https://github.com/ampynjord/starvis/actions/workflows/ci.yml/badge.svg)](https://github.com/ampynjord/starvis/actions/workflows/ci.yml)
[![Node v22](https://img.shields.io/badge/node-v22-green)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Plateforme de données Star Citizen

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
| **P4K / DataForge** | Données in-game réelles (~350 vaisseaux, ~3 000 composants sur 22 types, ~10 000 items FPS…) | Via CLI `extractor/` |
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

## Rôles utilisateur

| Rôle | Accès |
|---|---|
| `user` | Toutes les données publiques |
| `beta_tester` | Accès anticipé aux outils en développement actif |
| `admin` | Accès complet + gestion des utilisateurs |

Les outils **beta** (accessibles uniquement aux `beta_tester` et `admin`) :
- Loadout Manager (`/loadout-manager`)
- FPS Calculator (`/fps-calculator`)
- Mining Calculator (`/mining-calculator`)
- Trade Calculator (`/trade-calculator`)
- Crafting Calculator (`/crafting-calculator`)

Les rôles sont attribués par un admin via `PUT /admin/users/:id/role`.

---

## API — Endpoints principaux

Tous les endpoints de données acceptent `?env=live` (défaut) ou `?env=ptu`.

| Ressource | Endpoints clés |
|---|---|
| Vaisseaux | `GET /ships`, `/ships/:id`, `/ships/:id/loadout`, `/ships/:id/compare/:otherId`, `/ships/ranking` |
| Composants | `GET /components`, `/components/:id`, `/components/filters`, `/components/types`, `/components/compatible` |
| Items FPS | `GET /items`, `/items/:id`, `/items/filters` |
| Commodités | `GET /commodities`, `/commodities/:id/prices` |
| Commerce | `GET /trade/prices`, `/trade/location/:key`, `/trade/routes`, `/trade/systems` |
| Mining | `GET /mining/elements`, `/mining/compositions`, `/mining/lasers` |
| Missions | `GET /missions`, `/missions/:id` |
| Crafting | `GET /crafting/recipes`, `/crafting/recipes/:id` |
| Locations | `GET /locations`, `/locations/:id` |
| Ship Matrix | `GET /ship-matrix`, `/ship-matrix/:id` |
| Recherche | `GET /search` |
| Calculs | `GET /calculate/fps-damage`, `/calculate/mining-yield` |
| Changelog | `GET /changelog`, `/changelog/summary` — filtré par env |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PUT /auth/me`, `POST /auth/api-token` |
| Admin | `GET /admin/users`, `PUT /admin/users/:id/role`, `POST /admin/sync-ship-matrix`, `GET /admin/extraction-log` |
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

---

## Mentions légales & Conformité

### Projet communautaire non lucratif

STARVIS est un projet **indépendant, communautaire et non lucratif**. Il n'est pas affilié à, soutenu par,
ni officiellement connecté à **Cloud Imperium Games Corporation** ou **Roberts Space Industries Corp.**

### Crédits — Propriété intellectuelle

**Star Citizen®** ainsi que l'ensemble des données du jeu (noms de vaisseaux, composants, items, lore, etc.)
sont la propriété de **Cloud Imperium Games Corporation** et/ou **Roberts Space Industries Corp.**

> © 2012–2025 Cloud Imperium Rights LLC. All rights reserved.

Les données affichées (extraites du P4K via DataForge, de la RSI Ship Matrix et du site RSI) sont utilisées
dans un cadre strictement non commercial, à des fins communautaires, conformément à la politique de licence
communautaire de CIG. STARVIS ne revendique aucun droit de propriété sur ces contenus.

### Licence du code source

Le code est distribué sous **licence MIT** (voir [LICENSE](LICENSE)).
La licence MIT couvre le code uniquement — elle ne s'applique pas aux données ou contenus appartenant à CIG.

### RGPD / Protection des données

Données collectées lors de l'inscription : e-mail, nom d'utilisateur, hash de mot de passe, rôle, avatar.
Aucune donnée de paiement, aucun cookie publicitaire, aucune transmission à des tiers à des fins commerciales.

Contact RGPD : gwenvaelcaouissin@gmail.com  
Politique complète disponible sur [/legal](https://starvis.ampynjord.bzh/legal).
