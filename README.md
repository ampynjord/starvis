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

## API — Endpoints

Base : `/api/v1/`. Tous les endpoints de données acceptent `?env=live` (défaut) ou `?env=ptu`.
Listes : `page`, `limit`, `search`, `sort`, `order`, `format=csv`. Spec complète sur `/api-docs`.

### Vaisseaux & véhicules

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/ships` | Liste des vaisseaux (paginée, filtrable) |
| `GET` | `/ships/ranking` | Classement par stat (`sort_by`) |
| `GET` | `/ships/search` | Autocomplete ≥ 2 caractères |
| `GET` | `/ships/random` | Vaisseau aléatoire |
| `GET` | `/ships/manufacturers` | Fabricants ayant des vaisseaux |
| `GET` | `/ships/filters` | Valeurs de filtres disponibles |
| `GET` | `/ships/:uuid` | Détail (inclut `manufacturer`, `paints`, `similar` via `?include=`) |
| `GET` | `/ships/:uuid/loadout` | Arbre des ports récursif (turret → gimbal → weapon) |
| `GET` | `/ships/:uuid/modules` | Modules optionnels (Retaliator, Apollo…) |
| `GET` | `/ships/:uuid/paints` | Peintures du vaisseau |
| `GET` | `/ships/:uuid/stats` | Récapitulatif : armes, boucliers, QD, refroidisseurs… |
| `GET` | `/ships/:uuid/hardpoints` | Liste plate des hardpoints |
| `GET` | `/ships/:uuid/similar` | Vaisseaux similaires (même career/role) |
| `GET` | `/ships/:uuid/variants` | Variantes du même châssis |
| `GET` | `/ships/:uuid/compare/:uuid2` | Comparaison côte à côte avec deltas |
| `GET` | `/ships/:uuid/model` | Métadonnées du modèle 3D (.ctm) |
| `GET` | `/ships/:uuid/model/file` | Binaire .ctm (proxy RSI avec cache disque) |
| `GET` | `/ground-vehicles` | Véhicules terrestres (Cyclone, Ursa…) |
| `GET` | `/ground-vehicles/filters` | Filtres véhicules terrestres |
| `GET` | `/gravlev` | Véhicules à antigrav (Nox, Dragonfly…) |
| `GET` | `/gravlev/filters` | Filtres grav-lev |
| `GET` | `/ship-modules` | Modules de vaisseau (filtrable par ship_uuid) |

### Composants

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/components` | Liste paginée (`type`, `size`, `grade`, `manufacturer`…) |
| `GET` | `/components/filters` | Valeurs de filtres |
| `GET` | `/components/types` | Types disponibles |
| `GET` | `/components/compatible` | Composants compatibles par type & taille |
| `GET` | `/components/:uuid` | Détail complet (toutes les stats par type) |
| `GET` | `/components/:uuid/buy-locations` | Où acheter ce composant |
| `GET` | `/components/:uuid/ships` | Vaisseaux qui l'équipent par défaut |

### Items FPS

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/items` | Liste paginée (armes, armures, gadgets, vêtements…) |
| `GET` | `/items/filters` | Valeurs de filtres |
| `GET` | `/items/types` | Types d'items |
| `GET` | `/items/sub-types` | Sous-types pour un type donné |
| `GET` | `/items/manufacturers` | Fabricants pour un type donné |
| `GET` | `/items/categories` | Catégories sémantiques avec nombre d'items |
| `GET` | `/items/category/:slug` | Items d'une catégorie (weapons, helmet, core, arms, legs, backpack, undersuit, tools-medics, magazines, attachments, clothing, throwable, other) |
| `GET` | `/items/:uuid` | Détail item |
| `GET` | `/items/:uuid/buy-locations` | Où acheter cet item |

### Commodités & Commerce

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/commodities` | Liste paginée |
| `GET` | `/commodities/filters` | Filtres |
| `GET` | `/commodities/types` | Types de commodités |
| `GET` | `/commodities/:uuid` | Détail commodité |
| `GET` | `/trade/locations` | Shops ayant des données de prix |
| `GET` | `/trade/systems` | Systèmes avec données de commerce |
| `GET` | `/trade/prices/:commodityUuid` | Prix d'une commodité dans tous les shops |
| `GET` | `/trade/location/:shopId/prices` | Tous les prix d'un shop |
| `GET` | `/trade/routes` | Meilleures routes (param `scu` obligatoire) |
| `POST` | `/trade/prices` | Soumettre un relevé de prix |
| `GET` | `/shops` | Liste des shops |
| `GET` | `/shops/filters` | Filtres shops |
| `GET` | `/shops/:id/inventory` | Inventaire d'un shop |

### Mining & Crafting

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/mining/elements` | Éléments minéraux |
| `GET` | `/mining/elements/:uuid` | Détail élément + roches contenant |
| `GET` | `/mining/compositions` | Compositions de roches |
| `GET` | `/mining/compositions/:uuid` | Détail composition |
| `GET` | `/mining/solver` | Meilleures cibles pour un élément ou composition |
| `GET` | `/mining/stats` | Statistiques globales mining |
| `GET` | `/mining/lasers` | Lasers et gadgets de mining |
| `GET` | `/crafting/recipes` | Recettes paginées |
| `GET` | `/crafting/recipes/:uuid` | Détail recette avec ingrédients |
| `GET` | `/crafting/categories` | Catégories de crafting |
| `GET` | `/crafting/station-types` | Types de stations |
| `GET` | `/crafting/resources` | Ressources utilisées comme ingrédients |
| `GET` | `/crafting/resources/:itemName/recipes` | Recettes utilisant une ressource |

### Calculateurs

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/calculate/fps-damage` | Calcul dégâts arme FPS (armure, hitbox, mode de tir) |
| `POST` | `/calculate/mining-yield` | Calcul rendement mining (composition, laser, gadgets) |
| `POST` | `/loadout/calculate` | Calcul de loadout avec swaps de composants |

### Missions & Locations _(bêta_tester+)_

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/missions` | Liste paginée (filtres : type, faction, système…) |
| `GET` | `/missions/filters` | Filtres missions |
| `GET` | `/missions/types` | Types de missions |
| `GET` | `/missions/factions` | Factions |
| `GET` | `/missions/systems` | Systèmes |
| `GET` | `/missions/categories` | Catégories |
| `GET` | `/missions/:uuid` | Détail mission |
| `GET` | `/locations` | Liste paginée (**nécessite** `beta_tester` ou `admin`) |
| `GET` | `/locations/filters` | Filtres |
| `GET` | `/locations/types` | Types de lieux |
| `GET` | `/locations/systems` | Systèmes avec des lieux |
| `GET` | `/locations/all` | Liste complète non paginée (pour arborescences) |
| `GET` | `/locations/:uuid` | Détail lieu |
| `GET` | `/locations/:uuid/children` | Lieux enfants |

### Fabricants & Peintures

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/manufacturers` | Liste des fabricants avec données |
| `GET` | `/manufacturers/:code` | Détail fabricant |
| `GET` | `/manufacturers/:code/ships` | Vaisseaux du fabricant |
| `GET` | `/manufacturers/:code/components` | Composants du fabricant |
| `GET` | `/manufacturers/:code/items` | Items FPS du fabricant |
| `GET` | `/paints` | Liste des peintures |
| `GET` | `/paints/filters` | Filtres peintures |

### Ship Matrix & RSI Website

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/ship-matrix` | Données RSI Ship Matrix (246 vaisseaux) |
| `GET` | `/ship-matrix/stats` | Statistiques agrégées |
| `GET` | `/ship-matrix/:id` | Entrée par ID ou nom |
| `GET` | `/galactapedia` | Entrées Galactapedia (paginées) |
| `GET` | `/galactapedia/:id` | Article complet |
| `GET` | `/comm-links` | Comm-links (paginés, triés par date) |
| `GET` | `/comm-links/categories` | Catégories de comm-links |
| `GET` | `/comm-links/:id` | Article complet |
| `GET` | `/starmap/systems` | Systèmes stellaires RSI |
| `GET` | `/starmap/systems/:code` | Système avec corps célestes |

### Système

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/search` | Recherche unifiée : vaisseaux, composants, items, commodités, missions, recettes |
| `GET` | `/version` | Version du jeu de l'extraction courante |
| `GET` | `/game-versions` | Historique des extractions |
| `GET` | `/game-versions/default` | Dernière extraction LIVE |
| `GET` | `/stats/overview` | Comptages : ships, composants, items… |
| `GET` | `/changelog` | Changelog des données (ajouts/suppressions/modifs) |
| `GET` | `/changelog/summary` | Résumé groupé du changelog |

### Chat IA _(beta_tester+, nécessite MISTRAL_API_KEY)_

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/chat` | SSE streaming — assistant IA Star Citizen |
| `POST` | `/chat/ask` | Réponse JSON synchrone (Discord bot / externe) |

### Authentification

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/register` | Créer un compte (envoie un email de vérification) |
| `POST` | `/auth/login` | Se connecter → JWT 24h (ou `requires2FA: true`) |
| `POST` | `/auth/verify-email` | Vérifier l'email avec le token reçu |
| `POST` | `/auth/forgot-password` | Demander un lien de réinitialisation |
| `POST` | `/auth/reset-password` | Réinitialiser le mot de passe (token valide 1h) |
| `GET` | `/auth/me` | Profil de l'utilisateur connecté |
| `PUT` | `/auth/me` | Modifier son profil (username, avatarUrl) |
| `DELETE` | `/auth/me` | Supprimer son compte |
| `POST` | `/auth/api-token` | Générer un token longue durée (1 an) — `beta_tester+` |
| `POST` | `/auth/2fa/setup` | Configurer le 2FA TOTP (génère secret + QR) |
| `POST` | `/auth/2fa/enable` | Activer le 2FA avec un code TOTP |
| `POST` | `/auth/2fa/disable` | Désactiver le 2FA |
| `POST` | `/auth/2fa/verify` | Compléter la connexion 2FA (pendingToken + code) |

### Bug Reports

| Méthode | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/bug-reports` | Soumettre un signalement (utilisateur connecté) |
| `GET` | `/api/v1/bug-reports` | Lister ses propres signalements |

### Admin _(admin uniquement)_

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/admin/stats` | Statistiques Ship Matrix + données du jeu |
| `GET` | `/admin/extraction-log` | Log des extractions |
| `GET` | `/admin/users` | Liste des utilisateurs |
| `POST` | `/admin/users` | Créer un utilisateur |
| `PUT` | `/admin/users/:id` | Modifier un utilisateur |
| `PUT` | `/admin/users/:id/role` | Changer le rôle |
| `POST` | `/admin/users/:id/reset-password` | Réinitialiser le mot de passe |
| `DELETE` | `/admin/users/:id` | Supprimer un utilisateur |
| `GET` | `/admin/bug-reports` | Lister tous les signalements |
| `GET` | `/admin/bug-reports/:id` | Détail d'un signalement |
| `PATCH` | `/admin/bug-reports/:id` | Mettre à jour le statut |

### Santé

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Vérification connexion DB + état gameData |
| `GET` | `/health/live` | Liveness probe (Docker/K8s) |
| `GET` | `/health/ready` | Readiness probe (vérifie DB + Redis) |
| `GET` | `/health/metrics` | Métriques Prometheus |
| `GET` | `/health/cache/stats` | Statistiques Redis |

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
