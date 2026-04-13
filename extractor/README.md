# Starvis Extractor

Outil CLI local qui lit `Data.p4k` (le fichier de jeu Star Citizen) et pousse les données extraites dans la base PostgreSQL.

## Sources de données

| Source | Modules |
|---|---|
| `Data.p4k` (fichier jeu local) | ships, components, items, commodities, mining, missions, crafting, paints, shops, locations |
| RSI website (HTTP) | ship-matrix, galactapedia, comm-links, starmap, ctm |

## Utilisation

```bash
# Extraction complète vers la prod (tunnel SSH requis sur le port 5433)
npx tsx extract.ts --prod-db --env live

# Extraction sans CTM (rapide ~1.5 min vs ~1h avec CTM)
npx tsx extract.ts --env live --modules ships,components,items,commodities,paints,mining,missions,crafting,locations,shops

# Modules spécifiques seulement
npx tsx extract.ts --modules ship-matrix,ships

# Dev local (nécessite .env.dev)
npx tsx extract.ts --env live
```

## Configuration

Copier `.env.example` → `.env.dev` ou `.env.prod` et renseigner les variables DB.

Pour la prod, ouvrir un tunnel SSH avant de lancer :

```bash
ssh -f -N -L 5433:localhost:5432 -o ServerAliveInterval=30 debian@ampynjord.bzh
```

## Ordre d'exécution

```
1. Ship-matrix pre-sync  →  rsi schema (PostgreSQL)
   (doit précéder la transaction P4K — utilisé pour le cross-reference)

2. Transaction atomique (par env : live ou ptu)
   ├── Snapshot des données existantes (pour le changelog)
   ├── Nettoyage des anciennes données
   ├── Manufacturers  →  meta schema
   ├── Components, Items, Commodities
   ├── Ships + loadout ports  (~1.5 min)
   ├── Mining, Missions, Crafting, Locations, Shops
   ├── Cross-reference ship_matrix  (lie chaque ship à son entrée RSI)
   ├── Tag + prune des variants exclus  (bis, event, npc, special…)
   ├── CTM scraping  (~1h, modèles 3D depuis RSI) [optionnel]
   ├── Génération du changelog
   └── COMMIT  (rollback automatique si erreur)

3. Galactapedia, Comm-links, Starmap  →  rsi schema (hors transaction)
```

> La transaction atomique protège la prod : en cas d'erreur les anciennes données restent intactes.
