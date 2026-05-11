# starvis-extractor

CLI local qui lit `Data.p4k` (fichier du jeu Star Citizen) et pousse les données extraites dans la base PostgreSQL.

> **Prérequis** : Star Citizen installé sur Windows ou WSL. L'extractor tourne en dehors de Docker.

Supporte les formats DataForge v6 (SC ≤ 4.7.x) et v8 (SC 4.8+).

---

## Installation

```bash
# Depuis la racine du monorepo
npm install

cp extractor/.env.example extractor/.env.dev
# Remplir : DB_PASSWORD
```

---

## Configuration

| Variable | Description |
|---|---|
| `DB_HOST` | Hôte PostgreSQL (défaut : `127.0.0.1`) |
| `DB_PORT` | Port PostgreSQL (défaut : `5432`) |
| `DB_USER` | Utilisateur (défaut : `starvis_user`) |
| `DB_PASSWORD` | Mot de passe **à renseigner** |
| `DB_NAME` | Nom de la base (défaut : `starvis`) |
| `DATABASE_URL` | URL complète — remplace les variables DB_* si définie |
| `P4K_LIVE_PATH` | Chemin vers `Data.p4k` du canal LIVE |
| `P4K_PTU_PATH` | Chemin vers `Data.p4k` du canal PTU |
| `P4K_PATH` | Chemin générique (fallback si les deux ci-dessus sont vides) |
| `CTM_CACHE_DIR` | Répertoire de cache des modèles CTM (défaut : `./ctm-cache`) |
| `LOG_LEVEL` | Niveau de log : `debug` \| `info` \| `warn` \| `error` |

**Chemins P4K typiques (Windows) :**
```
C:\Program Files\Roberts Space Industries\StarCitizen\LIVE\Data.p4k
C:\Program Files\Roberts Space Industries\StarCitizen\PTU\Data.p4k
```

**Chemins P4K typiques (WSL) :**
```
/mnt/c/Program Files/Roberts Space Industries/StarCitizen/LIVE/Data.p4k
```

---

## Utilisation

```bash
# Depuis la racine du monorepo
npx tsx extractor/extract.ts [options]
```

### Options CLI

| Option | Description | Défaut |
|---|---|---|
| `-e, --env <env>` | Environnement : `live` \| `ptu` \| `custom` | `live` |
| `-m, --modules <list>` | Modules à extraire, séparés par virgule | `all` |
| `-p, --p4k <path>` | Chemin vers `Data.p4k` (prioritaire sur les variables d'env) | — |
| `--game-version <ver>` | Version du jeu à enregistrer en base (ex: `4.7.2`) | auto-détectée |
| `--dry-run` | Parse le P4K et affiche les stats sans écrire en base | — |
| `--prod-db` | Utilise `.env.prod` (base de prod, port 5433 via tunnel SSH) | — |

> **Note** : CIG ne stocke pas toujours la version publique dans les fichiers du jeu (ex: LIVE 4.7.2 indique `sc-alpha-4.7.0` dans `build_manifest.id`). Utiliser `--game-version 4.7.2` pour forcer la bonne valeur en base.

### Modules disponibles

**Données P4K (nécessitent le fichier Data.p4k) :**

| Module | Contenu |
|---|---|
| `ships` | Vaisseaux et véhicules avec attributs et ports de chargement |
| `components` | Composants vaisseaux : armes, boucliers, moteurs QD, thrusters, radars, EMP, QIG, mining lasers (stats de minage), tractor beams (force/portée), salvage heads (vitesse/portée), missiles, tourelles… |
| `items` | Objets FPS (15 types : armes, armures, gadgets, consommables…) |
| `commodities` | Commodités échangeables (métaux, gaz, nourriture…) |
| `mining` | Éléments minéraux, compositions de dépôts, lasers |
| `missions` | Contrats disponibles (type, faction, récompenses, légalité) |
| `crafting` | Recettes de fabrication avec ingrédients |
| `paints` | Livrées et peintures de vaisseaux |
| `shops` | Boutiques in-game avec inventaire et prix |
| `locations` | Systèmes, planètes, lunes, stations |

**Modules réseau (ne nécessitent pas le P4K) :**

| Module | Contenu |
|---|---|
| `ship-matrix` | Données marketing officielles depuis l'API RSI |
| `galactapedia` | Articles encyclopédiques RSI |
| `comm-links` | Articles de lore RSI |
| `starmap` | Carte stellaire officielle |
| `ctm` | Modèles 3D CTM depuis le site RSI (~1h) |

---

## Exemples

```bash
# Extraction complète LIVE (dev local, version auto-détectée)
npx tsx extractor/extract.ts --env live

# Extraction LIVE avec version forcée (recommandé pour les builds hotfix)
npx tsx extractor/extract.ts --env live --game-version 4.7.2

# Extraction PTU (dev local)
npx tsx extractor/extract.ts --env ptu

# Extraction LIVE vers la prod (tunnel SSH requis, voir ci-dessous)
npx tsx extractor/extract.ts --env live --prod-db --game-version 4.7.2

# Extraction PTU vers la prod
npx tsx extractor/extract.ts --env ptu --prod-db

# Extraction rapide sans CTM (~1.5 min)
npx tsx extractor/extract.ts --env live --modules ships,components,items,commodities,paints,mining,missions,crafting,locations,shops

# PTU — vaisseaux et missions uniquement
npx tsx extractor/extract.ts --env ptu --modules ships,missions

# Modules réseau seuls (pas de P4K nécessaire)
npx tsx extractor/extract.ts --modules ship-matrix,galactapedia,starmap

# Test sans écriture en base
npx tsx extractor/extract.ts --dry-run --env ptu
```

---

## Extraction vers la production

La base de prod n'est pas exposée publiquement. Ouvrir un tunnel SSH avant de lancer.
La base de prod écoute sur le port **5433** (mappé en local via le tunnel).

```bash
# Ouvrir le tunnel vers la prod (port 5433)
ssh -f -N -L 5433:localhost:5432 -i ~/.ssh/starvis_vps -o IdentitiesOnly=yes debian@ampynjord.bzh

# Extraction LIVE vers la prod
npx tsx extractor/extract.ts --env live --prod-db --game-version 4.7.2

# Extraction PTU vers la prod
npx tsx extractor/extract.ts --env ptu --prod-db

# Fermer le tunnel après
pkill -f "ssh.*5433:localhost:5432"
```

Les deux environnements (LIVE et PTU) utilisent la même base prod — les données sont séparées par la colonne `env` dans chaque table.

---

## Ordre d'exécution interne

L'extraction complète suit cet ordre (transaction atomique par environnement) :

```
1. Ship-matrix pre-sync  →  schéma rsi
   (utilisé comme référence pour le cross-reference)

2. Transaction atomique (live ou ptu)
   ├── Snapshot des données existantes  →  base du changelog
   ├── Nettoyage des anciennes données (env courant uniquement)
   ├── Manufacturers
   ├── Components, Items, Commodities
   ├── Ships + ports de chargement  (~1.5 min)
   ├── Mining, Missions, Crafting, Locations, Shops
   ├── Cross-reference ship_matrix  (lie chaque ship à son entrée RSI)
   ├── Tag + suppression des variants exclus  (npc, event, special…)
   ├── CTM scraping  [optionnel, ~1h]
   ├── Génération du changelog  (filtré par env dans l'API)
   └── COMMIT  (rollback automatique si sanity check échoue)

3. Galactapedia, Comm-links, Starmap  →  schéma rsi  (hors transaction)
```

> En cas d'erreur ou de régression détectée (ex: nombre de vaisseaux chute de >20 %), la transaction est annulée automatiquement et les données existantes restent intactes.

---

## Scripts utilitaires

```bash
# Diagnostic DataForge 4.8+ — liste les structs/records disponibles
npx tsx extractor/scripts/diagnose-48.ts

# Audit qualité des données extraites
npx tsx extractor/scripts/audit-quality.ts

# Audit des locations manquantes
npx tsx extractor/scripts/audit-locations.ts

# Test du scraper CTM sans écriture
npx tsx extractor/scripts/test-ctm-scraper.ts

# Dry-run des adapters de sources
npx tsx extractor/scripts/dry-run-adapters.ts
```
