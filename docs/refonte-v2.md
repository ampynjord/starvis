# Refonte Starvis v2 — plan

> Plan de la refonte demandée le 27/07/2026 : repenser l'interface, l'API, la
> base, l'extracteur, la CLI et la CI. Il fait suite à
> [architecture-cible.md](architecture-cible.md), dont il reprend les principes
> (incréments déployables, aucune interruption de service) en élargissant la
> portée.

## 1. Le principe directeur

Le défaut de fond n'est pas esthétique : **chaque couche compense les manques de
la précédente**. L'IHM analyse des identifiants techniques parce que l'API ne
livre pas de libellé ; l'API multiplie les routes parce que la base n'expose pas
les bons agrégats ; l'extracteur importe large parce que personne ne sait
précisément ce qui est utile.

La refonte consiste à faire porter chaque responsabilité au bon endroit, en
partant de la donnée. On ne redessine pas l'interface d'abord : on décide
**quelles entités existent et ce qu'elles disent d'elles-mêmes**, puis tout le
reste en découle.

## 2. Ce qui est mesuré aujourd'hui

Constats vérifiés sur le code et l'API en fonctionnement, pas supposés.

| Constat | Mesure |
|---|---|
| Le loadout ne fournit aucun nom lisible | `component_name: null`, `component_class_name: "Controller_Cooler"` |
| L'IHM devine les libellés côté client | `extractMfr()`, `parseJumpDriveName()` dans `ShipLoadout.tsx` |
| Données de vaisseaux incomplètes | sur 200 : 25 sans vitesse SCM, 7 sans rôle ni carrière |
| SQL brut sur la donnée publique | 195 appels `$queryRawUnsafe` dans 19 services sur 28 |
| Contrat écrit à la main | 15 302 lignes, 12 routes dérivaient (corrigé phase 1) |
| Cache Redis | un seul consommateur, aucune invalidation |
| Colonnes JSON fourre-tout | 35 dans le schéma `game`, dont 24 `raw_json` |
| Tables sans route API | 6, dont `game_insights` et les tables de butin |
| God files | StarmapGalaxy 2 246 l., dataforge-service 2 048 l., chat-service 1 139 l. |

## 3. Le modèle de données comme socle

**Décision fondatrice : toute entité exposée porte son identité lisible.**

Un contrat d'entité minimal, garanti à l'extraction et vérifié en CI :

| Champ | Rôle |
|---|---|
| `uuid` | identité stable |
| `name` | libellé humain, **jamais nul** |
| `class_name` | identifiant technique, réservé aux développeurs et aux jointures |
| `slug` | URL lisible et stable |
| `kind` | famille d'entité, uniforme dans toute la plateforme |

Corollaires :

- **Aucun `class_name` ne remonte à l'affichage.** Si un libellé manque, c'est
  un défaut d'extraction à corriger à la source — pas à contourner dans l'IHM.
- Les champs réellement filtrés ou triés **sortent des colonnes JSON** vers des
  colonnes indexées. `Ship.game_data` sert aujourd'hui au tri, ce qui interdit
  tout index B-tree.
- Les 6 tables sans route sont arbitrées : exposées si elles ont une valeur
  wiki, supprimées sinon. Pas de troisième voie.

## 4. Les chantiers

### C1 — Vérité des données (préalable à tout) — *fait*

Rien ne sert de redessiner au-dessus de données fausses.

> Réalisé le 27/07/2026 : `quality/data-truth-audit.mjs`, branché en CI après
> déploiement. Les mesures et les quatre défauts qu'il a mis au jour sont
> consignés dans [verite-donnees.md](verite-donnees.md) — dont le principal :
> les libellés manquants ne sont pas absents mais **fabriqués depuis le
> `class_name`**, ce qui les rendait invisibles à tout contrôle naïf.

- **Un audit par entité** : complétude (champs obligatoires présents), cohérence
  (unités, ordres de grandeur), et **confrontation aux sources** — un vaisseau
  dont la vitesse SCM diffère du Ship Matrix RSI est signalé, pas masqué.
- L'audit tourne en CI sur la base de production et **échoue** sous un seuil.
  L'audit actuel (`quality:audit:data`, 32 contrôles) en est l'embryon.
- Chaque valeur affichée devient traçable : d'où elle vient (P4K, RSI, UEX) et
  quand elle a été extraite. C'est ce qui permet d'arbitrer une divergence au
  lieu de la subir.

### C2 — Extracteur et croisement des sources

- **Importer ce qui sert**, décidé par le contrat d'entité, pas par ce que le
  P4K contient.
- **Résolution des libellés à l'extraction** : la localisation (`global.ini`)
  est déjà chargée ; l'appliquer aux composants de loadout supprime d'un coup le
  besoin d'analyser les identifiants côté IHM.
- **Croisement explicite et traçable.** Aujourd'hui le rattachement P4K ↔ Ship
  Matrix ↔ Starmap ↔ UEX repose sur des correspondances de noms dispersées. Il
  devient une couche dédiée : règles nommées, score de confiance, et une table
  d'arbitrage pour les cas manuels. Le correctif « standalone » de juillet a
  montré le coût de l'implicite — deux vaisseaux du patch 4.9.0 supprimés en
  silence faute d'entrée au Ship Matrix.

### C3 — CLI modulaire

- Un module par domaine, avec **contrat commun** : `plan` (ce qui serait fait),
  `run`, `verify`. Le mode `plan` seul supprime la peur de lancer une extraction.
- Composition libre (`--only`, `--since`, `--dry-run` déjà présent) pour ne plus
  tout rejouer quand une seule source a bougé.
- Le warning `pg` actuel (« client.query() while already executing », erreur
  dure en `pg@9`) est corrigé à cette occasion.

### C4 — API alignée sur les usages

- **Une ressource par entité**, verbes uniformes, filtres déclarés une fois.
  Les allowlists de tri dupliquées par service disparaissent au profit d'un
  registre unique.
- **Pas de route inutile, pas de développeur bloqué** : la surface se juge sur
  les besoins réels (les nôtres et ceux de Stelliverse), avec un principe — tout
  ce que l'IHM affiche doit être atteignable par un tiers.
- Sortie du SQL brut par service, **une fois la surface arrêtée** — le faire
  avant reviendrait à le refaire.
- Contrat entièrement dérivé de zod, en étendant le registre posé en phase 1.
- Types publiés, pour que l'intégration tierce soit un import et non une lecture.

### C5 — IHM repensée

- **Entrer par l'intention, pas par la table.** Aujourd'hui l'utilisateur
  choisit une bibliothèque puis filtre. Demain il pose une question — « quel
  vaisseau pour du minage solo », « où vendre ce minerai » — et le wiki répond
  avec les données et le calcul.
- **Le calcul dans la fiche**, pas à côté. Un minerai affiche son rendement, un
  vaisseau son coût d'assurance : les calculateurs deviennent des blocs
  contextuels plutôt que des pages séparées.
- **L'IA comme lecture alternative de la même donnée**, sur la couche typée —
  jamais un chemin parallèle qui pourrait diverger.
- **Rendu serveur généralisé** (entamé en phase 2) : le contenu doit exister
  sans JavaScript, pour les moteurs comme pour la vitesse.
- **Espace développeur** : Swagger lisible, exemples exécutables, quotas
  visibles, page de statut.
- **Admin** : supervision de l'extraction, qualité des données, usage de l'API.

### C6 — CI/CD

- **Étager par risque** : contrôles rapides sur chaque poussée, suite complète
  avant déploiement. La CI actuelle rejoue tout à chaque fois.
- **Vérifier la prod après déploiement**, pas seulement avant : les smoke tests
  existent, les étendre aux parcours réels.
- **Rendre le retour arrière trivial** — aujourd'hui il faut repousser un commit.
- Les sauvegardes sont désormais en place ; y ajouter une **restauration
  testée**, car une sauvegarde jamais restaurée n'est pas prouvée.

## 5. Ordre d'exécution

Chaque étape est déployable et laisse la production fonctionnelle.

| # | Étape | État | Pourquoi à ce rang |
|---|---|---|---|
| 1 | Audit de vérité des données (C1) | **fait** | On ne construit pas sur du faux |
| 2 | Contrat d'entité + libellés à l'extraction (C2) | **fait**, sauf [D9](verite-donnees.md) | Débloque l'IHM et l'API |
| 3 | Croisement des sources tracé (C2) + noms de vaisseaux depuis le jeu | **fait** | Les deux sont liés : voir [D5](verite-donnees.md) |
| 4 | Surface d'API arrêtée, puis sortie du SQL brut (C4) | **fait** pour les 10 entités publiques ; `rsi-website` et `game-data` restent en SQL brut | L'inverse serait à refaire |
| 5 | IHM par intention, fiche par fiche (C5) | première itération faite | S'appuie sur 2 et 4 |
| 6 | CLI modulaire (C3) | `plan` / `verify` faits, warning `pg` corrigé | Indépendant, à intercaler librement |
| 7 | CI étagée et retour arrière (C6) | retour arrière et restauration éprouvée faits ; l'étagement existait déjà | Accompagne, ne bloque pas |
| 8 | Cache versionné, god files (phases 5 et 6) | cache versionné fait ; god files intacts | Dette résiduelle |

Ce qui reste, par ordre de valeur décroissante :

1. **Libellés de boutiques** ([D9](verite-donnees.md)) — 24 libellés sur 136
   affichent un nom de fichier. La correction demande la table des franchises du
   P4K, donc une extraction.
2. **`rsi-website-service` et `game-data-service`** — 40 requêtes brutes sans
   contrat déclaré. Ce sont les deux derniers services à ne pas dire ce qu'ils
   servent.
3. **God files** — `StarmapGalaxy` 2 246 l., `dataforge-service` 2 048 l.,
   `chat-service` 1 139 l. Aucun défaut connu ne s'y rattache : c'est du confort
   de lecture, pas une correction.
4. **`idle_in_transaction_session_timeout`** sur le serveur de production. Une
   extraction interrompue y laisse une transaction ouverte qui bloque la
   suivante ; le gestionnaire de signal ne couvre pas la terminaison forcée.
   C'est un réglage de production, il vous revient.

## 6. La cible : tout le jeu, croisé

Demandé le 29 juillet 2026. Ce qui précède corrigeait ce qui était faux ; ce qui
suit vise ce qui manque.

**L'objectif.** Recenser tout ce que le jeu contient — ce qu'une boutique vend et
en quelle quantité, l'économie, les objets et leurs statistiques et où les
acheter, les vaisseaux, les composants et modules et leurs statistiques, tous les
lieux, astres, systèmes et stations — croisé entre domaines, pour que l'API soit
la référence du jeu et que le wiki qui s'appuie dessus réponde à des questions
plutôt qu'à des tables.

### 6.1 Ce que chaque source sait dire

Le croisement n'est pas un arbitrage entre concurrents. Chacune répond à une
question que les autres ne posent pas, et c'est ce qui permet de suivre les mises
à jour du jeu sans liste tenue à la main.

| Source | Ce qu'elle sait | Ce qu'elle ne sait pas |
|---|---|---|
| **P4K** | Ce que le jeu contient. Source principale, exhaustive. | Ce que le jeu *utilise* : il garde les gabarits, les événements, les lieux retirés |
| **UEX** | Ce que les joueurs atteignent et à quel prix. Ce qui n'est pas dans le P4K. | Rien des données non marchandes |
| **RSI** | Ce que l'éditeur publie : Ship Matrix, carte, Galactapedia, comm-links, images, CTM. | L'état réel de l'univers — sa carte contient Port Olisar et ignore Levski |

### 6.2 Ce qui est mesuré aujourd'hui

48 tables, 213 389 lignes. Mesuré le 29 juillet 2026 sur la base de
développement.

| Constat | Mesure |
|---|---|
| Tables jamais lues par l'API | 10, dont `game_insights` (6 032 lignes) et les tables de butin (976) |
| Croisement inter-domaines | `canonical_entities` et `canonical_entity_links` : **0 ligne**, la table existe et n'a jamais servi |
| `game.components` | **124 colonnes, 19 renseignées** — 30 toujours nulles, 67 nulles pour plus de 90 % des lignes |
| Colonnes JSON | 37 réparties sur 27 tables |
| Lieux avec coordonnées | **0 sur 1 120** |
| Lieux rattachés à la carte RSI | 58 sur 1 120 |
| Où acheter un objet | 2 187 objets sur 5 551 ont un prix quelque part (P4K ou UEX) |
| Où acheter un composant | **6 sur 3 275** — l'endpoint UEX `components` répond 404 depuis un moment, l'erreur était avalée |
| Prix UEX orphelins | 883 noms distincts sans entité, dont **424 correspondent exactement à un composant** |
| Boutiques non visitables | 62 sur 136 — voir [D10](verite-donnees.md) |

### 6.3 Le schéma cible

Le désordre n'est pas partout : `game.ships` a 54 de ses 56 colonnes
renseignées. Ce qui suit ne touche que ce qui est mesurément cassé.

**C7 — Les composants sortent du fourre-tout.** Une table de base porte
l'identité et les 19 champs partagés ; chaque famille — bouclier, arme, centrale,
refroidisseur, propulsion quantique, propulseur — porte ses propres statistiques
dans sa table. Un bouclier cesse de traîner 105 colonnes vides, et une famille
peut gagner un champ sans que les autres le subissent.

**C8 — Un seul endroit pour « où l'acheter ».** `shop_inventory`,
`commodity_prices`, `uex_market_prices`, `uex_vehicle_prices` répondent
aujourd'hui séparément à la même question. Une table d'offres unique — entité,
point de vente, prix d'achat, prix de vente, stock, source, date d'observation —
y répond en une requête pour un objet, un composant, une marchandise ou un
vaisseau. Les tables d'origine restent le détail par source ; l'offre est la
vue croisée.

**C9 — Les lieux deviennent une hiérarchie complète.** Système, astre, orbite,
station, avant-poste, avec coordonnées — aucune n'est renseignée aujourd'hui — et
le rattachement à la carte RSI porté de 58 à ce que le croisement permet.

**C10 — Le croisement devient une table, pas une jointure de circonstance.**
`canonical_entities` existe et n'a jamais servi. Elle doit porter l'identité
d'une entité à travers les trois sources, pour qu'un vaisseau, un composant ou un
lieu s'adresse d'un seul identifiant quelle que soit la source qui en parle.

**C11 — Chaque valeur dit d'où elle vient.** Sans provenance ni date
d'observation, une divergence entre sources ne s'arbitre pas, et une mise à jour
du jeu ne se distingue pas d'une régression d'extraction.

*Le second besoin est traité, le premier ne l'est pas.* Chaque extraction relève
le taux de remplissage des 260 colonnes nullables de neuf tables et le compare au
relevé précédent ; une chute de plus d'un quart est signalée. C'est ce qui aurait
attrapé les deux défauts du 29 juillet — `name` lu à la place de
`localizedName`, et un champ `position` cherché là où le jeu n'en met pas : dans
les deux cas l'extraction réussissait, le compte de lignes était juste, et la
colonne était vide.

La provenance **par valeur** reste à faire. Le changelog garde déjà l'historique
au champ près (`entity_uuid`, `field_name`, ancienne et nouvelle valeur, par
extraction) ; ce qui manque est de dire *quelle source* a produit une valeur
donnée, ce qui n'a d'intérêt que pour les champs qu'au moins deux sources
renseignent.

**C12 — Ce qui est extrait est exposé.** `game_insights`, tables de butin,
réputation, munitions : 7 008 lignes extraites que rien ne sert.

**C13 — L'API se réaligne sur le schéma, sous une nouvelle version.** Les
ressources suivent les entités du nouveau modèle plutôt que les tables
d'aujourd'hui. `/api/v2` porte la nouvelle surface ; **`/api/v1` reste servi**
tant que les tiers n'ont pas migré — c'est l'engagement pris envers eux, et
Stelliverse en dépend. La v1 devient une couche de compatibilité au-dessus du
nouveau modèle, pas un second chemin vers la donnée.

**C14 — L'IHM est refaite.** Elle entre par l'intention et non par la table : on
pose une question — où vendre ce minerai, quel vaisseau pour du minage solo, où
acheter ce composant — et la fiche répond avec la donnée et le calcul. Les
calculateurs deviennent des blocs contextuels dans les fiches plutôt que des
pages séparées. Le rendu serveur est la règle : le contenu doit exister sans
JavaScript. L'IA lit la même couche typée que les pages, jamais un chemin
parallèle.

### 6.4 Ordre

Chaque étape reste déployable, et la production fonctionnelle.

| # | Étape | Pourquoi à ce rang |
|---|---|---|
| 9 | Rattacher les prix UEX aux composants (C8, préalable) | Défaut mesuré, correction contenue, 424 composants gagnés |
| 10 | Table d'offres unique (C8) | Répond à « où l'acheter » pour tous les domaines |
| 11 | Éclatement des composants par famille (C7) | Le plus gros gain de lisibilité, mais il casse le contrat : à faire par ajout |
| 12 | Hiérarchie et coordonnées des lieux (C9) | Socle du wiki spatial |
| 13 | Identité canonique (C10) + provenance (C11) | Ce qui rend le croisement durable |
| 14 | Exposer l'extrait non servi (C12) | Sans valeur tant que 9-13 ne sont pas faits |
| 15 | Surface `/api/v2` alignée sur le schéma (C13) | Ne peut pas précéder le schéma qu'elle expose |
| 16 | IHM refaite par l'intention (C14) | S'appuie sur 15 |

**Contrainte tenue tout du long** : `/api/v1` continue de répondre. La
restructuration se fait sous `/api/v2` ; la v1 devient une couche de
compatibilité au-dessus du nouveau modèle, jamais un second chemin vers la
donnée. Les tiers migrent quand ils le décident, pas quand nous déployons.

## 7. Suggestions ajoutées

Non demandées, proposées parce que le coût est faible et l'effet durable.

- **Sauvegarde hors-site et restauration testée.** Les sauvegardes vivent sur le
  même disque que la base. Une restauration jamais éprouvée n'est pas une
  garantie.
- **Alerte en cas d'échec** (extraction, sauvegarde, déploiement) vers Discord.
  Le silence est ce qui a laissé les sauvegardes absentes pendant des mois.
- **Versionner la donnée, pas seulement le code.** Chaque extraction produit une
  version ; l'API peut l'exposer et le cache s'y adosser (phase 5).
- **Page de statut publique.** Les tiers surveillent déjà Starvis avec leurs
  propres moyens — autant leur donner la source.
- **Sortir la pile `starvis-dev-*` du VPS de production.** Cinq conteneurs de
  développement y tournent à côté de la production.
- **Budget de performance mesuré en CI** plutôt que constaté après coup.

## 8. Ce qu'on ne fait pas

- Pas de changement de pile : Next, Express, Prisma, PostgreSQL restent.
- Pas de « big bang » : aucune étape ne demande de geler la production.
- Pas de retour sur le recentrage wiki : le social et le temps réel restent chez
  Stelliverse.
- Pas de rupture du contrat `/api/v1` sans version : les évolutions se font par
  ajout, ou derrière une v2 explicite.
