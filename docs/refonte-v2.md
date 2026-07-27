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

## 4. Les six chantiers

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

| # | Étape | Pourquoi à ce rang |
|---|---|---|
| 1 | Audit de vérité des données (C1) | On ne construit pas sur du faux |
| 2 | Contrat d'entité + libellés à l'extraction (C2) | Débloque l'IHM et l'API |
| 3 | Croisement des sources tracé (C2) + noms de vaisseaux depuis le jeu | Les deux sont liés : voir [D5](verite-donnees.md) |
| 4 | Surface d'API arrêtée, puis sortie du SQL brut (C4) | L'inverse serait à refaire |
| 5 | IHM par intention, fiche par fiche (C5) | S'appuie sur 2 et 4 |
| 6 | CLI modulaire (C3) | Indépendant, à intercaler librement |
| 7 | CI étagée et retour arrière (C6) | Accompagne, ne bloque pas |
| 8 | Cache versionné, god files (phases 5 et 6) | Dette résiduelle |

## 6. Suggestions ajoutées

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

## 7. Ce qu'on ne fait pas

- Pas de changement de pile : Next, Express, Prisma, PostgreSQL restent.
- Pas de « big bang » : aucune étape ne demande de geler la production.
- Pas de retour sur le recentrage wiki : le social et le temps réel restent chez
  Stelliverse.
- Pas de rupture du contrat `/api/v1` sans version : les évolutions se font par
  ajout, ou derrière une v2 explicite.
