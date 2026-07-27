# Architecture cible — Starvis, wiki de données Star Citizen

> Document de référence du chantier de refonte ouvert le 26/07/2026.
> Il décrit **où on va** et **dans quel ordre**. Chaque phase est déployable
> seule : il n'y a jamais d'état intermédiaire cassé en production.

## 1. Le cap

Starvis est **un site de contenu** (le wiki) adossé à **un socle de données typé**
(l'API), avec une IA qui parle la même langue que les deux.

Ce n'est plus une application à fonctionnalités : depuis le recentrage du
24/07/2026 (voir `pre-refocus-outillage`), l'outillage social/corpo appartient à
Stelliverse, qui consomme l'API Starvis. Ce que Starvis fait et que personne
d'autre ne fait : **extraire la vérité du jeu et la publier**, le jour du patch.

Trois couches, une responsabilité chacune :

| Couche | Rôle | Où |
|---|---|---|
| Données | La vérité extraite du jeu | `extractor/`, `db/` |
| Domaine | L'accès typé + le contrat public | `api/` |
| Rendu | L'expérience de lecture | `ihm/` |

## 2. Les constats qui motivent la refonte

Mesurés sur le code au 26/07/2026, après le recentrage.

### Ce qui fait le plus mal : le wiki n'est pas lisible par les moteurs

- **0 `generateStaticParams`, 0 SSG, 0 ISR** sur les pages de contenu.
- **10 routes en `force-dynamic`** (ships, components, commodities, comm-links,
  galactapedia, locations, starmap…).
- Les **30 vues de `ihm/src/views/` sont toutes `'use client'`** (~11 250 lignes).
- L'indexabilité repose sur un contournement : `components/seo/SeoEntitySnapshot.tsx`
  injecte des liens `sr-only` + `<noscript>` sur 14 routes.

Conséquence : Google voit un index de liens et du JSON-LD, **jamais le contenu
des fiches**. Pour un wiki, c'est existentiel — et c'est aussi ce qui rend le
premier affichage lent.

### Le reste, par couche

**Rendu (`ihm/`)**
- 13 pages portent leur logique directement dans `app/` (admin/monitoring 972 l.,
  admin 814 l., developer 647 l.) au lieu du pattern « page serveur mince → vue ».
- **Aucune abstraction de liste** : chaque page réimplémente fetch → filtre → grille.
  `useListQueryState` n'est utilisé que par 6 pages de listing sur ~15 ; les
  constantes de pagination divergent (24 / 30 / 40) ; 5 tables HTML indépendantes ;
  helpers de formatage réécrits dans 4 fichiers.
- Vue morte : `views/PaintsPage.tsx` (la route redirige vers `/ships`).
- `services/api.ts` : un objet monolithique de 690 lignes importé par 32 fichiers.

**Domaine (`api/`)**
- **195 appels `$queryRawUnsafe` dans 19 services sur 28.** Seuls 3 services
  utilisent Prisma typé, et uniquement sur le schéma `meta` (auth/tokens).
  Autrement dit : **toute la donnée de jeu publique passe par du SQL brut**, avec
  `Row = Record<string, any>` pour type de retour — aucune garantie exploitable.
- Le SQL est écrit en placeholders MySQL `?` puis converti par regex (`toPostgres`),
  ce qui casse si un `?` apparaît dans un littéral.
- **Zod dans 10 fichiers de routes sur 27** (19 `.parse()`). Les schémas sont en
  `.passthrough()` et `qInt`/`qEnv` utilisent `.catch()` : une entrée invalide est
  **silencieusement remplacée** au lieu d'être rejetée.
- **Trois formats de réponse** coexistent : JSend (2 fichiers), `{success:true}`
  (24), `res.json` brut (12).
- Logique dupliquée mot pour mot entre services de requête (blocs `type IN (…)`,
  prédicats de recherche, allowlists de tri, pagination réimplémentée à côté du
  `paginate()` partagé).
- **`openapi.json` : 15 302 lignes maintenues à la main** pour 178 routes.

**Cache**
- Redis a **un seul consommateur** (`ship-matrix-service`) ; 8 des 10 TTL déclarés
  sont morts ; `cacheInvalidatePattern` n'est **appelé nulle part** → aucune
  stratégie d'invalidation, uniquement l'expiration. Après une extraction, le
  ship-matrix reste périmé jusqu'à 2 h.
- Le vrai cache est HTTP (`sendWithETag`, 106 usages) mais le payload est
  **recalculé en base à chaque revalidation**.

**Données (`db/`)**
- 51 modèles. 3 tables corpo mortes depuis le recentrage (`Corporation`,
  `CorporationMembership`, `CorporationFleetItem` + 3 enums, 8 index).
- **35 colonnes JSON** dans le schéma `game`, dont 24 `raw_json`. `Ship.game_data`
  sert au **tri** via `jsonSortMap`, ce qui interdit tout index B-tree.
- 6 tables sans aucune route API (`game_insights`, `loot_table_entries`,
  `loot_archetypes`, `canonical_entities`, `canonical_entity_links`,
  `starmap_location_aliases`) — dont certaines ont une vraie valeur wiki.

## 3. Les décisions

### D1 — Le contenu est rendu par le serveur

Les pages de fiches et de listing deviennent des Server Components qui rendent le
**contenu réel**, avec ISR calé sur le rythme des patchs. Les parties réellement
interactives (filtres, calculateurs, vues 3D) deviennent des **îlots clients**
dans une page serveur.

`generateStaticParams` pré-génère les fiches les plus consultées. Une fois le vrai
contenu rendu, `SeoEntitySnapshot` disparaît : le contournement n'a plus d'objet.

*Règle celà d'un coup : indexation, premier affichage, et une bonne part des
~97 `useQuery`.*

### D2 — Un seul socle de listing

Un ensemble `DataTable` / `FilterBar` / `Pagination` piloté par un **descripteur
d'entité** déclaratif (colonnes, filtres, tris, limite). Toutes les pages de
listing en dérivent : une seule pagination, un seul état d'URL, un seul
comportement de filtre, une seule table.

### D3 — La donnée de jeu passe par une couche typée

Sortie progressive du SQL brut. Prisma typé quand la requête est simple ; un query
builder typé (Kysely) là où le SQL se justifie vraiment. Fin de la conversion regex
`?` → `$n`. Un **registre de tri/filtre par entité** partagé remplace les
allowlists dupliquées.

### D4 — Le contrat public est généré, pas écrit

Les schémas zod **stricts** (fin de `.passthrough()` et des `.catch()` silencieux)
deviennent la source unique. `openapi.json` en est généré. Les types sont publiés
pour l'IHM **et** pour les consommateurs tiers — Stelliverse intègre des types,
plus une documentation à recopier.

Un seul format de réponse sur toute la surface. Migrer une convention vers
l'autre romprait le contrat : `/api/v1` est consommé par des tiers, et la
pagination vit en racine côté `{ success }` là où JSend la placerait sous `meta`.
La transition passe donc par un **surensemble** — chaque réponse porte les deux
discriminants (`status` et `success`), sans rien déplacer — et `success` sera
retiré en v2, une fois les consommateurs migrés.

### D5 — Le cache suit la donnée, pas l'horloge

L'extraction publie une **version de données** ; les clés de cache et les ETag en
dérivent. Une extraction invalide instantanément ce qu'il faut, au lieu d'attendre
un TTL. Redis sert enfin les routes de listing.

### D6 — Le schéma se resserre

Suppression des tables corpo mortes. Sortie de `Ship.game_data` des champs
réellement triés/filtrés vers des colonnes indexées. Arbitrage explicite sur les
6 tables sans route : exposer (valeur wiki) ou retirer.

### D7 — L'IA est un citoyen du wiki

L'assistant consomme la **même couche typée** que les pages, pas un chemin SQL
parallèle. Chaque fiche peut exposer son contexte structuré. `chat-service.ts`
(1 139 l.) se découpe par responsabilité.

## 4. Le séquencement

Chaque phase est **déployable seule** et laisse la production fonctionnelle.
L'ordre privilégie : d'abord ce qui ne casse rien et prépare le terrain, ensuite
ce qui change l'expérience, enfin le nettoyage.

| # | Phase | Contenu | Visible ? |
|---|---|---|---|
| 0 | Fondations | Format de réponse unifié, zod strict, registre tri/filtre partagé, suppression tables mortes, consolidation des proxys Next | Non |
| 1 | Contrat | OpenAPI généré depuis zod, types publiés | Non (mais débloque Stelliverse) |
| 2 | Rendu | Migration fiche par fiche vers Server Components + ISR ; `views/` → `app/` au passage | **Oui** — indexation + vitesse |
| 3 | Listing | Socle `DataTable`/`FilterBar` commun, page par page | **Oui** — cohérence UX |
| 4 | Données | Sortie du SQL brut, service par service | Non |
| 5 | Cache | Invalidation versionnée par extraction | **Oui** — fraîcheur |
| 6 | Nettoyage | Découpage des god files, dette résiduelle | Non |

Les phases 2 et 3 se font **entité par entité** (ships, puis components, puis
items…), pas d'un bloc : à tout moment, une partie du site est migrée et le reste
fonctionne à l'ancienne.

`views/` → `app/` n'est pas un chantier séparé : c'est le sous-produit naturel de
la phase 2, puisqu'une page rendue serveur n'a plus de raison d'exister comme vue
cliente importée.

## 5. Ce qu'on ne fait pas

- Pas de réécriture d'un bloc : aucune phase ne demande de geler la production.
- Pas de changement de stack (Next, Express, Prisma, PostgreSQL restent).
- Pas de retour sur le recentrage : les fonctionnalités sociales/corpo restent chez
  Stelliverse (voir `starvis-archive/` et le tag `pre-refocus-outillage`).
- Pas de rupture du contrat `/api/v1` : les évolutions se font par ajout. C'est
  l'engagement pris envers les consommateurs tiers.

## 6. Notes de terrain

- **Lockfile** : ne jamais régénérer `package-lock.json` sous Windows avec
  `node_modules` présent (npm y perd les binaires Linux et casse la CI). Utiliser
  `--package-lock-only` avec `node_modules` renommé.
- **Erreur d'hydratation** : présente en CI **avant** le recentrage (vérifié sur le
  dernier run vert antérieur). Non bloquante, à traiter en phase 2 — le passage au
  rendu serveur en supprimera probablement la cause.
- **Warning `pg`** : les persisters de l'extracteur déclenchent
  « client.query() while already executing », qui deviendra une erreur dure en
  `pg@9`. À corriger avant la montée de version.
- **TypeScript 7** : bloqué par un crash du build worker de Next 16
  (`The "id" argument must be of type string`). Monorepo figé sur 6.0.3, règle
  `ignore` posée dans la configuration des dépendances.
