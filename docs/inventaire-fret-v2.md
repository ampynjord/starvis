# Inventaire & fret — modèle unifié

> Proposition demandée le 26/10/2026 (feuille de route, chantier C). Elle
> s'inscrit dans [le plan de refonte](refonte-v2.md) — schéma d'abord, surface
> sans version ensuite, `/api/v1` intacte — et n'est **pas encore implémentée** :
> elle attend un arbitrage sur le périmètre (§ 1) avant la première migration.

## 1. Périmètre — une décision à prendre d'abord

« Unifier l'inventaire et le fret » recouvre deux choses de nature différente :

| | Exemple | Où ça vit |
|---|---|---|
| **Ce que le jeu définit** | la soute d'un Caterpillar, le sac à minerai d'un Prospector, le stockage tampon d'un Vulture, la capacité d'un sac à dos | P4K → Starvis |
| **Ce que le joueur possède** | « mon Cutlass a 12 SCU de laranite », « mon casier à Area18 » | compte joueur |

La refonte a tranché le second : *« le social et le temps réel restent chez
Stelliverse »* (§ 8 du [plan de refonte](refonte-v2.md)). Un inventaire personnel
persistant ferait de Starvis un service à comptes utilisateurs et à données
privées, ce qu'il n'est plus.

**Proposé : ne modéliser que ce que le jeu définit**, mais assez finement pour
qu'un outil tiers (Stelliverse, un « Freight Manager ») calcule n'importe quel
inventaire joueur par-dessus. Si l'inventaire personnel doit malgré tout vivre
ici, c'est une révision du recentrage wiki, à décider explicitement — le modèle
ci-dessous l'accueillerait par ajout (§ 6).

## 2. Ce qui est mesuré aujourd'hui

Base de développement, 26/10/2026.

| Constat | Mesure |
|---|---|
| Conteneurs extraits | `game.inventory_containers` : 585 lignes, **toutes ≤ 1 SCU** (caisses de butin, lits, casiers) |
| Colonnes jamais remplies | `inventory_type` nul sur **585/585**, `size_x/y/z` nuls sur **585/585** — alors que `raw_json` porte `inventoryType.__type` et `interiorDimensions` |
| Grilles de soute | **absentes** de la table : `DRAK_Caterpillar_CargoGrid_Module` n'a aucune ligne |
| Capacité d'un vaisseau | un seul nombre, `ships.cargo_capacity` (113 vaisseaux sur 280 > 0), sommé à l'extraction puis perdu dans son détail |
| Ports de grille | 296 ports `cargogrid` sur 71 vaisseaux, sans capacité rattachée |
| Modules | la capacité ne suit pas le module : Retaliator `cargo_capacity = 0` quel que soit le module avant/arrière |
| Minage / recyclage | Prospector `cargo_capacity = 0` (ses sacs à minerai ne sont comptés nulle part) ; aucune capacité de stockage tampon pour Vulture / Reclaimer |
| Caisses standard | 0 objet `CargoBox` dans `game.items` — les tailles de caisse (1 à 32 SCU) ne sont pas extraites |
| Visualisation | `CargoGrid.tsx` affiche un total et délègue la grille à un iframe `sc-cargo.space` |

Le défaut de fond est le même que celui décrit au § 1 de la refonte : la
donnée existe au P4K, l'extraction la résume en un total, et l'IHM compense
en déléguant à un site tiers.

## 3. Le modèle cible

Deux tables et une vue. Tout est **additif** : rien n'est renommé ni retiré
pendant la transition.

### 3.1 `storage_containers` — ce qu'est un contenant

Évolution de `inventory_containers` (même clé `(uuid, env)`), étendue aux
grilles de soute, sacs à minerai et stockages tampon.

```prisma
enum StorageKind {
  cargo_grid        // soute : caisses de marchandises
  ore_bag           // sac à minerai (Prospector, MOLE, Golem)
  salvage_buffer    // stockage tampon RMC / CM (Vulture, Reclaimer)
  personal          // sac à dos, armure, coffre de vaisseau
  locker            // casier, râtelier d'armes
  loot              // caisses lootables
  other

  @@schema("game")
}

model StorageContainer {
  uuid             String      @db.Char(36)
  env              String      @default("live") @db.VarChar(10)
  className        String      @map("class_name") @db.VarChar(300)
  name             String      @db.VarChar(500)
  kind             StorageKind
  isOpen           Boolean     @map("is_open")             // InventoryOpenContainerType
  capacityMicroScu BigInt      @map("capacity_micro_scu")  // entier : 1 SCU = 1 000 000 µSCU
  interiorX        Decimal?    @map("interior_x") @db.Decimal(8, 3)  // mètres
  interiorY        Decimal?    @map("interior_y") @db.Decimal(8, 3)
  interiorZ        Decimal?    @map("interior_z") @db.Decimal(8, 3)
  /// Grille en cellules de 1,25 m (= 1 SCU) — calculée à l'extraction, pour les seuls contenants ouverts
  gridX            Int?        @map("grid_x")
  gridY            Int?        @map("grid_y")
  gridZ            Int?        @map("grid_z")
  maxBoxScu        Int?        @map("max_box_scu")        // plus grande caisse acceptée
  excludedSubtypes String[]    @map("excluded_subtypes")  // remplace la colonne JSON
  extractedAt      DateTime    @default(now()) @map("extracted_at")

  mounts StorageMount[]

  @@id([uuid, env])
  @@unique([className, env])
  @@index([kind, env])
  @@map("storage_containers")
  @@schema("game")
}
```

Choix motivés :

- **`capacity_micro_scu` en entier** : la capacité est un compte (1 SCU =
  1 000 000 µSCU au DataForge). Les deux `Decimal` actuels (`capacity_micro_scu`
  *et* `capacity_scu`) disent la même chose deux fois ; l'API dérive le SCU.
- **`kind` en enum indexé** plutôt que `inventory_type` libre — et jamais nul,
  contrairement à aujourd'hui. Il est déduit du port porteur et du nom de classe
  à l'extraction, avec un audit qui échoue sur `other` au-delà d'un seuil.
- **La grille est calculée une fois**, à l'extraction (`floor(dim / 1.25)`,
  la règle déjà appliquée dans `dataforge-service.ts`), au lieu d'être recalculée
  par chaque consommateur.
- **`excluded_subtypes text[]`** sort de la colonne JSON : c'est un filtre réel
  (« ce contenant n'accepte pas d'armes »), il doit être interrogeable.

### 3.2 `storage_mounts` — où il est monté

Le lien manquant aujourd'hui : quel contenant, sur quel port, de quel hôte, et
**selon quel module**.

```prisma
enum StorageHostKind {
  ship
  item       // sac à dos, armure : capacité portée par un objet
  location   // ascenseur de fret, entrepôt — si le P4K le décrit (à vérifier, § 5)

  @@schema("game")
}

model StorageMount {
  id              Int             @id @default(autoincrement())
  env             String          @default("live") @db.VarChar(10)
  hostKind        StorageHostKind @map("host_kind")
  hostUuid        String          @map("host_uuid") @db.Char(36)
  portName        String          @map("port_name") @db.VarChar(100)
  /// Port de module dont dépend ce contenant (null = toujours présent)
  moduleSlot      String?         @map("module_slot") @db.VarChar(100)
  moduleClassName String?         @map("module_class_name") @db.VarChar(255)
  containerUuid   String          @map("container_uuid") @db.Char(36)
  count           Int             @default(1)
  isDefault       Boolean         @default(true) @map("is_default")

  container StorageContainer @relation(fields: [containerUuid, env], references: [uuid, env])

  @@index([hostKind, hostUuid, env])
  @@index([containerUuid, env])
  @@map("storage_mounts")
  @@schema("game")
}
```

Pas de clé étrangère vers `ships` : l'hôte est polymorphe (`ship`, `item`,
`location`), comme `canonical_entities` le prévoit (C10). L'intégrité est tenue
par l'audit d'extraction, pas par la base.

`module_slot` / `module_class_name` font le lien avec `ship_modules`, livré avec
la prise en charge des vaisseaux modulaires : la soute d'un Retaliator avec deux
modules Cargo devient une somme de lignes filtrées par la sélection de modules,
exactement comme l'arbre de loadout (`/ships/:uuid/loadout?modules=…`).

### 3.3 `ship_storage_summary` — la vue de compatibilité

```sql
CREATE VIEW game.ship_storage_summary AS
SELECT m.host_uuid AS ship_uuid, m.env,
       SUM(c.capacity_micro_scu * m.count) FILTER (WHERE c.kind = 'cargo_grid')     / 1e6 AS cargo_scu,
       SUM(c.capacity_micro_scu * m.count) FILTER (WHERE c.kind = 'ore_bag')        / 1e6 AS ore_scu,
       SUM(c.capacity_micro_scu * m.count) FILTER (WHERE c.kind = 'salvage_buffer') / 1e6 AS salvage_buffer_scu,
       SUM(c.capacity_micro_scu * m.count) FILTER (WHERE c.kind = 'personal')       / 1e6 AS personal_scu
FROM game.storage_mounts m
JOIN game.storage_containers c ON c.uuid = m.container_uuid AND c.env = m.env
WHERE m.host_kind = 'ship' AND m.is_default
GROUP BY m.host_uuid, m.env;
```

`ships.cargo_capacity` reste en place pour `/api/v1` : l'extraction l'écrit
depuis `cargo_scu`, et l'audit compare les deux tant que l'ancien calcul existe.
Un écart est un signal (grille manquée ou comptée deux fois), pas un bruit.

## 4. La surface sans version

Chaque route a un consommateur nommé, conformément à
[surface-api.md](surface-api.md) § 3.

| Route | Réponse | Consommateur |
|---|---|---|
| `GET /api/ships/:uuid/storage?modules=slot:Classe` | contenants par port (grille, capacité, caisse max), totaux par `kind`, selon les modules choisis | fiche vaisseau (remplace l'iframe `sc-cargo.space`), comparateur |
| `GET /api/storage/containers?kind=&min_scu=&host_kind=` | catalogue filtrable | bibliothèque d'objets, tiers |
| `GET /api/storage/containers/:uuid` | un contenant et **où il est monté** | fiche objet (sac à dos, armure) |
| `GET /api/items/:uuid/storage` | capacité portée par un objet | fiche objet, Stelliverse (inventaire joueur) |
| `POST /api/storage/fit` | `{ ship, modules?, cargo: [{ commodity, scu }] }` → caisses par grille, reste, taux de remplissage | page commerce (route rentable *qui tient dans la soute*) |

Le dernier point est ce que fait SC Trade Tools : il n'a de sens qu'une fois les
grilles et les tailles de caisse extraites (§ 5, étape 4). Avant, il mentirait.

`/api/v1` ne change pas : `cargo_capacity` reste servi, et les routes
`/ships/:uuid` et `/items/:uuid` existantes ne bougent pas.

## 5. Ordre

Chaque étape est déployable seule, production fonctionnelle.

| # | Étape | Pourquoi à ce rang |
|---|---|---|
| 1 | Remplir `inventory_type` et `size_x/y/z` depuis `raw_json` (correctif d'extraction, aucune migration) | Défaut mesuré : 585/585 colonnes vides, la donnée est déjà en base |
| 2 | Créer `storage_containers` + `storage_mounts`, alimentées **en plus** de `inventory_containers` ; extraire les grilles de soute (`SCItemCargoGridParams`, conteneurs ouverts des ports `cargo*`) | Le socle ; additif, rien ne casse |
| 3 | Rattacher sacs à minerai, stockages tampon et modules (`module_slot`) | Prospector / Retaliator cessent d'afficher 0 SCU |
| 4 | Extraire les tailles de caisse (entités `*CargoBox*` du P4K — **à localiser** : 0 objet aujourd'hui) | Préalable au calcul d'empotage |
| 5 | Vue `ship_storage_summary`, `cargo_capacity` dérivé, audit d'écart | Compatibilité `/api/v1` prouvée avant de s'y fier |
| 6 | `GET /api/ships/:uuid/storage` + grille native dans la fiche vaisseau | Premier consommateur ; retire l'iframe tiers |
| 7 | `storage/containers`, `items/:uuid/storage` | Bibliothèque, tiers |
| 8 | `POST /api/storage/fit` + page commerce | S'appuie sur 4 et 6 |
| 9 | Retrait de `inventory_containers` | Quand plus aucune route `/api/v1` ne la lit |

À vérifier avant l'étape 2, sans le supposer : que les ascenseurs de fret et
entrepôts de station soient décrits au DataForge avec une capacité. Si non,
`host_kind = 'location'` attendra une source (UEX) et ne sera pas créé à vide.

## 6. Ce qu'on ne fait pas

- **Pas d'inventaire joueur persistant** (§ 1) sans décision explicite. S'il
  est décidé, il s'ajoute par une table `meta.user_storage_items`
  (`user_id`, `mount_id` ou `container_uuid`, `entity_uuid`, `quantity_micro_scu`)
  au-dessus de ce modèle, sans le modifier.
- **Pas de simulation physique** de l'empotage (orientation, gravité) : l'API
  répond en cellules de 1,25 m, comme le jeu compte.
- **Pas de Galaxy ni d'Endeavor** : ce sont des concepts (`concept-244`,
  `concept-97`), absents du P4K. Leurs modules arriveront avec leur sortie,
  par la même configuration que le Retaliator.
- **Pas de rupture de `/api/v1`**, conformément à la règle de la refonte.
