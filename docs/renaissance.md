# Renaissance — redonner une vie à Starvis

> Plan demandé le 17/10/2026. Il remplace l'ordre de marche de
> [refonte-v2.md](refonte-v2.md) sans en renier les acquis : ce qui y est
> mesuré et fait reste vrai, ce qui y est prévu est trié ici.
> Rien n'est supprimé avant que ce plan soit validé.

## 1. Le constat

Le projet ne manque pas de qualité, il manque de **forme**. Chaque chantier a
été mené proprement, mais ils se sont empilés sans que rien ne parte :

| Constat | Mesure (17/10/2026) |
|---|---|
| Briques à maintenir | 5 workspaces, 3 services en prod + Postgres, Redis, Traefik |
| Surface d'API | 178 routes documentées, 71 sans consommateur interne, deux versions servies |
| Pages de l'IHM | 59, dont 13 d'auth/compte/admin pour un wiki en lecture |
| Rendu | 0 page pré-générée, 16 routes `force-dynamic`, 30 vues sur 31 en `'use client'` |
| SQL brut | 190 `$queryRawUnsafe`, y compris dans les services déclarés « faits » |
| God files | StarmapGalaxy 2 246 l., dataforge-service 2 048 l., chat-service 1 141 l. |
| Documentation de refonte | 4 documents, 1 400 lignes, dont aucun ne dit ce qu'on arrête |
| Installation propre | `npm ci` échouait — le lockfile figeait `@types/node` en 25.x sous 3 workspaces qui déclarent `^22` (corrigé avec ce plan) |

Et le site n'est plus fréquenté. Une nuance compte : **l'API, elle, l'est
encore** — trois intégrations tierces l'appellent avec un jeton nommé
(5 199 requêtes mesurées, voir le commit `f4343ce`). La renaissance ne doit pas
les casser en chemin.

## 2. Le cap

Starvis redevient **trois choses, et seulement trois** :

1. **Un wiki** — la référence lisible des données du jeu, mise à jour le jour du
   patch, trouvable par les moteurs de recherche.
2. **Une API publique** — la même donnée, pour les outils des autres.
3. **Des outils** — les calculateurs posés à côté de la donnée qu'ils utilisent.

Le bot Discord et l'assistant IA restent, mais comme **deux façons d'accéder au
même socle**, pas comme des produits à part. L'assistant passe de Mistral à
Claude.

La règle qui en découle : **toute fonctionnalité qui ne sert ni à lire, ni à
interroger, ni à calculer la donnée du jeu doit justifier sa place ou partir.**

## 3. Ce qui reste, ce qui change, ce qui part

| Brique | Verdict | Détail |
|---|---|---|
| `extractor/` | **reste** | C'est la valeur unique du projet. On ne touche qu'au découpage de `dataforge-service`. |
| `db/` | **reste, allégé** | Le schéma `meta` perd ce qui part avec les comptes (voir § 5, décision D1). |
| `api/` | **reste, resserré** | Une seule version publique à terme (la v2), lecture seule, sans session utilisateur. |
| `ihm/` | **refait par l'intérieur** | Mêmes pages de contenu, mais rendues côté serveur et pré-générées par patch. Les pages compte/admin disparaissent ou se réduisent. |
| `bot/` | **reste** | Il ne parle qu'à l'API publique ; il en suit les changements. |
| Assistant IA | **reste, sur Claude** | Mêmes outils de données, nouveau fournisseur (§ 4, phase 5). |
| `quality/` | **reste** | L'audit de vérité est ce qui empêche de publier du faux. |
| `notebooks/` | **part** | Exploration ponctuelle, sans consommateur. À archiver hors du dépôt. |
| Comptes, 2FA, vérification d'email, reset de mot de passe | **part** (D1) | Un wiki en lecture n'a pas besoin de comptes. |
| Rôle `developer`, demandes d'accès API | **part** (D2) | Remplacé par des clés API délivrées à la main ou sans clé (D2). |
| Signalement de bugs intégré | **part** | Un lien vers les issues GitHub ou le Discord fait le même travail. |
| Monitoring d'admin (972 l.) | **part** | Les métriques Prometheus restent ; l'écran maison disparaît. |
| Redis | **en question** (D3) | Un seul consommateur. La pré-génération des pages rend la plupart des lectures gratuites. |
| `/api/v1` | **part à échéance** | Figée dès maintenant, coupée quand les trois tiers ont migré (règle déjà actée). |

## 4. Les phases

Chaque phase se déploie seule et laisse la production fonctionnelle. L'ordre va
de ce qui débloque vers ce qui se voit.

### Phase 0 — Remettre le projet d'aplomb (quelques heures)

Rien de nouveau, seulement pouvoir travailler à nouveau sans surprise.

- ~~Réparer le lockfile à la cause~~ — **fait** avec ce plan : les copies 25.x
  de `@types/node` imbriquées sous `api/`, `ihm/` et `extractor/`, que npm jugeait
  invalides face à `^22`, sont retirées ; il n'en reste qu'une, à la racine.
  Elles faisaient échouer `npm ci` à chaque nouveau patch de `@types/node` 22.
- ~~Vulnérabilité critique~~ — **fait** avec ce plan : `proxy-addr` 2.0.8
  (usurpation d'IP derrière un proxy de confiance, donc contournement possible
  de la limite de débit). Restent 15 vulnérabilités *high* en production,
  toutes corrigeables par `npm audit fix` sans saut de version majeure, dont
  Next.js (empoisonnement du cache SSG/ISR, qui touche directement la phase 3),
  `undici`, `nodemailer` et Prisma. À passer en un lot vérifié, pas en vrac.
- Vérifier l'état réel de la production (services up, dernière extraction,
  patch servi) et le consigner ici.
- Nettoyer `.agents/AGENTS.md` : le chemin Windows absolu, et la mention d'un
  accès SSH à la production, qui n'a pas sa place dans un fichier lu par des
  agents.
- Retirer la référence à `extensions/rsi-hangar-sync` du cache CI.
- Ranger `docs/` : ce document devient l'entrée, les quatre autres passent dans
  `docs/historique/` avec un lien vers lui.

**Fini quand :** `npm ci`, lint, typecheck et tests passent sur une machine
neuve, et la CI est verte.

### Phase 1 — Élaguer (1 à 2 sessions)

On supprime d'abord, parce que tout ce qui part n'a plus besoin d'être migré,
réécrit ni testé ensuite.

- Retirer les pages et routes de comptes, de 2FA, de profil, de signalements,
  de demandes d'accès et de monitoring d'admin, avec leurs services et leurs
  tests (selon D1 et D2).
- Migration Prisma qui supprime les tables correspondantes, **après une
  sauvegarde vérifiée** (`db/scripts/backup.sh`, restauration éprouvée).
- Retirer `notebooks/` et les dépendances devenues orphelines
  (`bcryptjs`, `otplib`, `qrcode`, `nodemailer`, `jsonwebtoken` selon D2).
- Supprimer les routes v1 sans consommateur **et** sans appel dans les journaux
  depuis 90 jours — la mesure existe déjà, il reste à l'appliquer.

**Fini quand :** chaque page et route restante sert le wiki, l'API, les outils,
le bot ou l'IA. Mesure attendue : moins de 40 pages, moins de 120 routes.

### Phase 2 — Une seule API (1 à 2 sessions)

- Étendre `/api/v2` à toutes les ressources que la v1 sert encore et qui ont un
  consommateur. Une enveloppe, une pagination, la version de la donnée dans
  chaque réponse.
- Contacter les trois intégrations tierces avec une date de coupure de la v1
  (proposition : 3 mois après la v2 complète). Ajouter un en-tête `Deprecation`
  et `Sunset` sur toutes les réponses v1.
- Sortir le SQL brut au fil de la migration : chaque route v2 réécrite passe par
  Prisma typé ou `Prisma.sql`, plus jamais par `toPostgres`, qui casse sur un
  `?` littéral ou un opérateur JSON.

**Fini quand :** le bot, l'IHM et l'IA ne parlent plus qu'à la v2.

### Phase 3 — Un wiki qui se lit (2 à 3 sessions)

C'est la phase qui ramène des visiteurs : aujourd'hui Google ne voit pas le
contenu des fiches.

- Fiches de contenu (vaisseaux, composants, objets, lieux, missions,
  marchandises, Galactapedia) en composants serveur, pré-générées à la
  publication d'une extraction (`generateStaticParams` + revalidation
  déclenchée par l'extracteur).
- Les vues `'use client'` ne gardent que l'interactif : filtres, comparateur,
  carte 3D, calculateurs.
- Supprimer le contournement `SeoEntitySnapshot` une fois le vrai contenu servi.
- Une abstraction de liste unique (requête, filtres, pagination, table) au lieu
  des quinze réimplémentations.
- Découper `StarmapGalaxy` et `ShipLoadout` au passage, puisqu'on les ouvre.

**Fini quand :** une fiche vaisseau s'affiche sans JavaScript, et le sitemap
couvre toutes les fiches.

### Phase 4 — Des outils fiables (1 à 2 sessions)

- Faire l'inventaire honnête des calculateurs (combat, FPS, minage, crafting,
  commerce, comparateur, classement) : lesquels donnent un résultat juste
  aujourd'hui, avec quelles données manquantes.
- Ceux qui reposent sur une donnée absente (les routes commerciales attendent
  des prix qui ne sont pas toujours extraits) sont marqués comme tels dans
  l'interface, ou retirés.
- Chaque calculateur garde un test sur des valeurs du jeu connues.

**Fini quand :** chaque outil affiché donne un résultat juste ou dit pourquoi il
ne peut pas.

### Phase 5 — L'assistant sur Claude, le bot à jour (1 session)

- Remplacer le client OpenAI pointé sur Mistral par le SDK officiel
  `@anthropic-ai/sdk`, avec le *tool runner* (`betaZodTool` +
  `client.beta.messages.toolRunner`) : la boucle d'appels d'outils écrite à la
  main dans `chat-service.ts` disparaît.
- **Un seul modèle**, `claude-opus-5-5`, au lieu du couple
  `CHAT_TOOL_MODEL` / `CHAT_RESPONSE_MODEL` : l'effort (`output_config.effort`)
  se règle par usage, `low` pour une question simple. Un second modèle moins
  cher ne se justifie qu'après mesure.
- Ce qui change dans le comportement de l'API :
  - le choix d'outil forcé (`tool_choice` `any`/`tool`) n'existe pas sur ce
    modèle : on passe en `auto` avec `strict: true` sur les outils ;
  - activer les *fallbacks* en cas de refus, et lire `stop_reason` avant le
    contenu ;
  - mettre en cache la liste des outils et le prompt système (ils sont stables
    et longs), et vérifier `cache_read_input_tokens`.
- Garder `sql-guard.ts` tel quel : la garde de l'outil `query_database` ne
  dépend pas du fournisseur.
- Faire passer les outils de l'assistant par l'API v2 plutôt que par les
  services en direct, pour qu'il voie exactement ce que voient les tiers.
- Bot : suivre la v2, et ne garder que les commandes utilisées (le journal des
  interactions Discord le dit).

**Fini quand :** les tests de `chat-service` passent sur Claude, et une
question type (« quel vaisseau pour du minage en solo ? ») répond en citant des
données de la base.

### Phase 6 — Relancer (en continu)

- Une extraction le jour de chaque patch, avec l'audit de vérité en garde-fou.
- Une page « Nouveautés du patch » générée par le changelog qui existe déjà :
  c'est le contenu que les joueurs viennent chercher.
- Annonce sur le Discord et auprès des intégrations existantes.
- Mesurer : visiteurs du wiki, appels API par jeton, questions à l'IA. Un chiffre
  par surface, relu à chaque patch.

## 5. Les décisions qui te reviennent

| # | Question | Recommandation |
|---|---|---|
| D1 | Supprimer les comptes utilisateurs ? | **Oui.** Rien dans le wiki, l'API ni les outils n'en a besoin. Les favoris ou loadouts sauvegardés peuvent vivre dans le navigateur. |
| D2 | Comment ouvrir l'API publique ? | **Lecture anonyme avec limite de débit, plus des clés pour les gros consommateurs**, délivrées par une commande d'admin. Les trois tiers actuels gardent leur jeton. |
| D3 | Garder Redis ? | **Non, à terme.** Avec les pages pré-générées et un cache HTTP sur l'API, il n'a plus de rôle. À retirer après la phase 3, mesure à l'appui. |
| D4 | Garder la carte stellaire 3D ? | **Oui, mais en dernier.** C'est la page la plus coûteuse (2 246 lignes) ; on la découpe, on ne la refait pas. |
| D5 | Combien de temps maintenir la v1 ? | **3 mois après la v2 complète**, date annoncée aux trois intégrations. |

## 6. Ce qu'on ne fait pas

- Pas de réécriture depuis zéro : l'extracteur et le modèle de données sont la
  partie qui a demandé le plus de travail et qui est juste.
- Pas de changement de pile : Next, Express, Prisma, PostgreSQL restent.
- Pas de nouvelle fonctionnalité avant la fin de la phase 3 : on ne relance pas
  un projet en lui ajoutant de la surface.
- Pas de retour sur le recentrage wiki : le social et l'outillage d'organisation
  restent hors du projet.
