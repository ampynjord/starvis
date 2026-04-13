# Starvis — Architecture DB

Single PostgreSQL database (`starvis`) with three schemas: `game`, `meta`, `rsi`.

---

## `game` schema — données jeu

> Peuplé par l'extractor depuis `Data.p4k`  
> Schema : `db/prisma/game.prisma`  
> Toutes les tables ont une colonne `env` (`live` | `ptu`) qui remplace les anciennes bases séparées.

```
Manufacturer
Ship ──────────────── ShipLoadout (ports de composants)
│                  ├── ShipModule
│                  └── ShipPaint
├── Component
├── Item
├── Commodity ──────── CommodityPrice (prix par shop)
├── Shop ──────────── ShopInventory
├── MiningElement
├── MiningComposition ── MiningCompositionPart → MiningElement
├── Mission ─────────── MissionBlueprintReward → CraftingRecipe
├── CraftingRecipe ───── CraftingIngredient
│                    └── CraftingSlotModifier
└── Location
```

---

## `meta` schema — méta Starvis

> Peuplé par l'extractor  
> Schema : `db/prisma/starvis.prisma`

```
Manufacturer    ← données constructeurs (code, nom)
ExtractionLog   ← historique des extractions (hash, version SC, compteurs)
Changelog       ← diff entre deux extractions (ships/components ajoutés/modifiés)
```

---

## `rsi` schema — données RSI

> Peuplé par l'extractor depuis les APIs publiques RSI  
> Schema : `db/prisma/rsi.prisma`

```
ShipMatrix       ← fiche officielle RSI (dimensions, prix, lore)
                   ↑ liée à Ship.ship_matrix_id
Galactapedia     ← articles lore RSI
CommLink         ← communications officielles CIG
StarmapLocation  ← systèmes stellaires
```

---

## Commandes utiles

```bash
# Regénérer les clients Prisma (après modif d'un schema)
npm run generate --workspace=@starvis/db

# Appliquer les schemas en DB (dev)
npm run push --workspace=@starvis/db

# Ouvrir Prisma Studio
npm run studio:game --workspace=@starvis/db
npm run studio:starvis --workspace=@starvis/db
npm run studio:rsi --workspace=@starvis/db
```

---

## Backup

Script cron quotidien à 3h : `db/backup.sh`  
Conserve les 7 derniers jours dans `/home/debian/starvis/backups/`.

```bash
# Restaurer un backup
gunzip -c starvis_2026-04-13_0300.sql.gz | docker exec -i starvis-postgres psql -U starvis_user -d starvis
```
