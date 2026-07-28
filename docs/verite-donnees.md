# Vérité des données — état mesuré

> Étape 1 de [refonte-v2.md](refonte-v2.md). Ce document consigne ce que
> l'audit `quality/data-truth-audit.mjs` mesure réellement sur le patch 4.9.0,
> et les défauts qu'il a mis au jour. Les corrections relèvent des étapes
> suivantes : ici on établit la vérité, on ne la répare pas encore.

## 1. Pourquoi un second audit

`quality:audit:data` vérifie que les endpoints répondent et que leur premier
élément a la bonne forme. C'est un contrôle de surface : il passerait tout aussi
bien sur une base à moitié vide.

`quality:audit:truth` porte sur le fond, sur la **population entière** :

- **complétude** — les champs qui font l'intérêt de l'entité sont-ils remplis ?
- **vraisemblance** — les valeurs tiennent-elles dans des bornes physiques ?
- **lisibilité** — les libellés sont-ils humains, ou des identifiants d'atelier ?
- **rattachement** — le croisement P4K ↔ Ship Matrix tient-il ?

Il tourne après déploiement, contre la production, et échoue sous les planchers.

## 2. Le principe des planchers

Les seuils sont **dérivés d'une mesure**, pas choisis à vue, et posés juste sous
l'état constaté. Un seuil arbitraire ne dit rien : trop haut il échoue en
permanence et on l'ignore, trop bas il ne détecte jamais rien.

Posés ainsi, ils attrapent une régression dès la prochaine extraction. Les
relever au fil des corrections est le but — un plancher qui ne bouge jamais est
un plancher qu'on a cessé de lire.

## 3. Ce que la mesure a corrigé dans l'audit lui-même

Trois fois, un « défaut » signalé venait de la méthode et non de la donnée. Ils
sont notés parce que chacun aurait produit un seuil faux :

| Faux signal | Cause | Correction |
|---|---|---|
| 26 vitesses SCM aberrantes | `Number(null)` vaut 0 | l'absence relève de la complétude, pas de la vraisemblance |
| 7 % de vaisseaux sans carrière | les concepts n'ont pas de donnée de vol | seuils de vol appliqués aux seuls pilotables |
| 54 % de soutes « manquantes » | un chasseur n'emporte rien | zéro est légitime pour une soute, jamais pour une vitesse |

D'où la fonction `isPresent(value, zeroIsMissing)`, partagée par la complétude et
la vraisemblance : un champ ne peut plus être compté « présent » ici et
« aberrant » là.

## 4. Deux populations de vaisseaux

Sur 258 vaisseaux : **236 pilotables** et **22 concepts**.

Un concept n'existe qu'au Ship Matrix RSI — annoncé, vendu, jamais construit. Il
n'a par nature ni vitesse, ni structure, ni loadout, et il porte déjà sa marque
(`is_concept_only: true`, `uuid: "concept-71"`). Le confondre avec un pilotable
revenait à mesurer le nombre de concepts au lieu de la qualité de l'extraction.

Mesuré sur les pilotables : carrière 97,0 %, vitesse SCM 97,0 %, structure
97,0 %, équipage 100 %.

## 5. Défauts réels mis au jour

### D1 — La famille ARGO ATLS est classée « vaisseau »

Les sept pilotables sans vitesse SCM sont tous des ATLS :

```
ARGO_ATLS, ARGO_ATLS_GEO, ARGO_ATLS_GEO_Collector_Grad01,
ARGO_ATLS_GEO_Collector_Grad02, ARGO_ATLS_GEO_Collector_Grad03,
ARGO_ATLS_IKTI, ARGO_ATLS_IKTI_ARGOS
```

L'ATLS est un **exosquelette de manutention** : il ne vole pas, d'où l'absence de
vitesse — ce n'est pas une donnée manquante. Mais il porte
`vehicle_category: 'ship'`, ce qui le fait apparaître dans la liste des
vaisseaux avec une vitesse nulle. Le défaut est la classification, pas la mesure.

**À corriger étape 2** : une catégorie propre pour les engins non volants.

### D2 — Les libellés manquants sont maquillés, pas absents

C'est le défaut le plus important, et celui qui se cachait le mieux.

Quand la localisation du jeu ne fournit pas de nom, l'extraction retombe sur le
`class_name` dé-souligné et capitalisé : `cbd_hat_03_01_cfp_var2` devient « CBD
HAT 03 01 CFP Var2 ». Le résultat n'a plus d'underscore — il franchit donc sans
bruit tout contrôle qui cherche des underscores, et arrive tel quel dans l'IHM.

Mon premier relevé concluait « 0 libellé technique partout ». C'était faux : je
mesurais l'efficacité du maquillage, pas la présence des libellés. En comparant
`name` et `class_name` réduits à leurs alphanumériques, le trou apparaît :

| Entité | Libellés fabriqués depuis l'identifiant |
|---|---|
| Vaisseaux pilotables | 0 |
| Vaisseaux concepts | 22 sur 22 — **légitime** (voir ci-dessous) |
| Composants | 119 sur 3 271 (3,6 %) → **32 (1,0 %)** après correction |
| Objets | 548 sur 5 551 (9,9 %) |
| **Marchandises** | **135 sur 135 (100 %)** |

Les concepts sont un faux positif assumé : leur `class_name` **est** le slug RSI
du nom (`crucible` ↔ « Crucible »), aucune localisation ne manque. Le contrôle ne
porte donc que sur les pilotables.

Les marchandises, elles, n'ont **aucun** libellé propre. Le procédé passe
inaperçu quand l'identifiant était déjà un mot (« Agricium »), mais il produit
aussi « Agriculturalsupplies » et « Agricium ORE ». C'est ce qui explique un
faux signal que j'avais écarté trop vite au premier relevé : sept marchandises
dont le nom égalait le `class_name` — les mots étaient justes, mais la cause
sous-jacente, elle, était bien réelle.

Restent trois libellés franchement techniques que le maquillage n'a pas sauvés
(« ATLS GEO Collector Grad01 », « …Grad02 », « …Grad03 ») et un objet
(« CBD HAT 03 01 CFP Var2 »), attrapés par le motif `TECHNICAL_NAME`.

La cause est repérée : le repli n'est pas centralisé, il est **réécrit à huit
endroits**, chacun effaçant silencieusement un libellé manquant.

| Fichier | Ligne |
|---|---|
| `extractor/src/services/localization-service.ts` | 311 |
| `extractor/src/dataforge/dataforge-utils.ts` | 161, 176 |
| `extractor/src/dataforge/dataforge-service.ts` | 979 |
| `extractor/src/extractors/item-extractor.ts` | 246 |
| `extractor/src/extractors/crafting-extractor.ts` | 92 (`humanizeIdentifier`) |
| `extractor/src/extractors/mission-extractor.ts` | 111 |
| `extractor/src/extractors/shop-paint-extractor.ts` | 39 |
| `extractor/src/extractors/game-insight-extractor.ts` | 70 |

**Corrigé (étape 2).** Les clés ne sont plus jetées : `classifyNameValue` nomme
les trois cas, et la résolution suit un ordre explicite — clé portée par
l'enregistrement, puis recherche par `class_name`, puis mise en forme
typographique qui n'invente rien.

Mesuré après réextraction du 4.9.0 :

| Entité | Avant | Après |
|---|---|---|
| Objets | 548 (9,9 %) | **30 (0,5 %)** |
| Marchandises | 135 (100 %) | 103 (76,3 %) |

Les 103 marchandises restantes ne sont plus un défaut : leur libellé **résolu**
coïncide avec l'identifiant, « Agricium » restant « Agricium ». La mesure ne sait
pas séparer les deux cas — c'est sa limite, énoncée plutôt que masquée. Ce que le
plafond garde d'utile, c'est l'alerte si la part remontait vers 100 %, signe que
la résolution aurait cessé de fonctionner.

Les 30 objets résiduels sont des variantes de teinte, des éditions boutique et
des assets d'éditeur (`customizer_pants`, `Mannequin_NoDraw_PMA_Shirt`,
`behr_rifle_ballistic_01_sf01`). Le jeu ne les nomme pas, et certains n'ont
probablement rien à faire dans un wiki : **à arbitrer à l'étape 2 bis**, sous
l'angle « importer ce qui sert » plutôt que celui du libellé.

> **Appliqué en production le 27/07/2026** par une extraction ciblée
> (`--modules items,commodities`), via tunnel SSH sur le port 5433. Les plafonds
> de l'audit ont été resserrés dans la foulée, une fois le code et les données
> alignés — les descendre avant aurait fait échouer la CI sur un décalage qui ne
> dit rien de la qualité.
>
> ```bash
> npm run extract --workspace=@starvis/extractor -- --modules items,commodities --env live --prod-db
> ```

### D3 — Les loadouts, deux problèmes en un

Sur 30 vaisseaux pris à pas régulier, 2 305 nœuds de loadout :

| Nature du port | Nombre | Résolus |
|---|---|---|
| Équipement (arme, bouclier, radar, propulseur…) | 1 154 | 962 (83,4 %) |
| Structurel (siège, écran, volant, mobilier) | 1 151 | non applicable |

La moitié des ports non résolus n'a **jamais eu** de composant à porter : ce sont
des emplacements de mobilier d'habitacle (`DRAK_Mule_Seat_Driver`,
`Vehicle_Screen_MFD`, `Controller_Wheel_DRAK_Mule`). Les exposer comme du matériel
manquant était une erreur de lecture de ma part au premier relevé.

Reste un manque véritable : **192 ports d'équipement non rattachés**, dont sur la
population complète 571 tourelles, 512 radars, 282 boucliers et 279 refroidisseurs.
Ceux-là désignent des composants réels qui ne sont pas extraits.

Le choix de l'échantillon n'est pas neutre : les 30 premiers vaisseaux par ordre
alphabétique donnaient 77,4 %, contre 83,4 % à pas régulier. Prendre la tête de
liste ne voit que les constructeurs du début d'alphabet — d'où le pas, qui reste
déterministe pour que deux exécutions restent comparables.

**Corrigé (étape 3), et le diagnostic ci-dessus était faux.** Les ports
« d'équipement non résolus » n'en étaient presque pas. `classifyPort` classait par
mots-clés dans le **nom du port**, ce qui confondait l'équipement avec ce qui le
commande ou l'affiche :

| Classé comme | Ce que c'était | Ports |
|---|---|---|
| Refroidisseur | la **commande** du refroidisseur | 273 |
| Radar | un **écran** d'affichage | 182 |
| Lance-missiles | la **commande** de tir | 180 |
| Tourelle | un **siège** de tourelle | 18 |
| Refroidisseur | une **porte** (`…_Cooler_Left`) | 3 |

Le test porte désormais sur la **classe du composant**, qui nomme ce qui est
monté, plutôt que sur le nom du port, qui nomme l'endroit. Vérifié avant
application : aucun des 14 453 ports correctement résolus ne portait ces
préfixes, la règle ne pouvait donc dégrader aucun rattachement.

Mesuré sur extraction réelle : **15 232 → 13 507 ports d'équipement**, résolution
**82,7 % → 93,3 %**.

`Controller_Flight_*` est une exception assumée : le contrôleur de vol est un
vrai système du vaisseau, simplement non extrait comme composant. Le ranger en
aménagement masquerait un manque au lieu de le signaler.

**Ce qui reste est enfin réel** — de vrais composants absents du catalogue :

| Composant | Ports |
|---|---|
| `MISL_S02_CS_FSKI_Tempest` (un missile) | 160 |
| `ARGO_ATLS_GEO_Thruster_Small` | 50 |
| `APAR_BallisticGatling_S4_CapitalShip` | 12 |

### D8 — Nos identifiants ne sont pas ceux du reste de l'écosystème

Trouvé en confrontant les libellés aux sources externes, comme demandé.

Le Dragonfly Star Kitten est référencé `d868dfb9-5bcd-4f7b-a40a-3aa5bbf7d705` par
[star-citizen.wiki](https://api.star-citizen.wiki) et
[finder.cstone.space](https://finder.cstone.space). Starvis l'expose sous
`5bcd4f7b-dfb9-d868-05d7-f7bba53a0aa4`.

**Les mêmes octets, dans un autre ordre.** La forme standard est celle qu'emploient
UEX, le wiki communautaire et les outils tiers ; la nôtre est le GUID réordonné
de DataForge. Conséquence directe : **aucun tiers ne peut joindre les données
Starvis à celles des autres projets par identifiant** — ce qui contredit
l'objectif affiché de ne pas limiter les développeurs.

Le projet connaissait la conversion : `scUuidToDataForgeUuid` existe dans
l'extracteur. Deux défauts s'y cachaient :

- **l'inverse n'existait pas** — impossible de revenir à la forme publique ;
- **la documentation affirmait que la fonction était sa propre inverse.** Elle ne
  l'est pas. Qui s'y serait fié aurait obtenu un identifiant faux, bien formé et
  donc silencieux.

`dataForgeUuidToScUuid` est ajoutée et vérifiée : exacte sur le cas réel,
aller-retour sur 256 identifiants.

**À arbitrer étape 4** (surface d'API) : exposer la forme standard à côté de la
nôtre — un ajout, donc sans rupture de contrat. C'est probablement le geste le
plus rentable pour l'interopérabilité, Stelliverse compris.

### D7 — Le wiki listait 1 579 composants inachevés

Second effet du correctif de libellés, et lui non plus n'était pas prévisible.

L'API masque les composants dont le nom contient « temp », « template » ou
« placeholder ». Ce filtre était **aveugle** tant que les noms étaient fabriqués
depuis l'identifiant : `MASTER_PowerPlant` devenait « MASTER Power Plant », qui
ne déclenche rien.

Une fois les vrais noms résolus, 1 579 composants se révèlent porter le libellé
`<= PLACEHOLDER =>` — le marqueur de CIG pour du contenu non fini. Le catalogue
public passe donc de 3 271 à 1 692 entrées.

Ce n'est pas une perte : la base conserve ses 3 271 lignes, et les 1 579 masqués
sont **tous** exactement `<= PLACEHOLDER =>`, sans un seul faux positif. Ce que
le wiki présentait auparavant, c'étaient des objets de jeu inachevés sous des
noms inventés — « QIG Prototype », « MASTER PowerPlant », « Ammo Crate 01 Port ».

Près de la moitié du catalogue de composants était du contenu fantôme.

### D6 — Chaque vaisseau affichait deux fois son équipement

Le défaut le plus grave trouvé jusqu'ici, et il n'a été révélé que par le
correctif précédent.

Un composant a pour clé `(uuid, env)` : le même existe en LIVE et en PTU. Les
deux jointures de `loadout-service` portaient sur le seul `uuid`, ramenaient donc
les deux lignes, et doublaient chaque port.

Statistiques du Gladius servies par la production, contre la réalité :

| | affiché | réel |
|---|---|---|
| points d'emport | 33 | 17 |
| armes | 6 | 3 |
| boucliers | 4 | 2 |
| centrales | 2 | 1 |
| missiles | 12 | 6 |

`getLoadoutRows` alimente `aggregateLoadoutStats`, qui **somme** : toutes les
statistiques agrégées d'un vaisseau étaient gonflées. La jointure pouvait en
outre servir la valeur PTU sur le site LIVE.

**Pourquoi personne ne l'avait vu** : les deux environnements portaient les mêmes
libellés, donc la ligne en trop était indiscernable de la bonne. Il a fallu que
la résolution des noms fasse diverger « AEGS Gladius » (PTU) de « Internal Tank »
(LIVE) sur un même réservoir pour que le nom affiché trahisse la ligne jointe.

C'est l'argument le plus net en faveur de l'ordre choisi pour cette refonte :
corriger la donnée d'abord fait apparaître les défauts que l'affichage masquait.

**Corrigé** — `AND c.env = sl.env` sur les deux jointures, avec une garde qui
porte sur la requête et non sur les valeurs agrégées : un test sur les totaux
n'aurait rien vu, puisqu'ils étaient cohérents entre eux, simplement comptés deux
fois.

### D5 — 24 vaisseaux affichent un nom d'atelier

`resolveShipName()` ne teste que la forme de clé `vehicle_Name_<Classe>`, alors
que `global.ini` utilise ici `vehicle_Name<Classe>`, sans séparateur : **elle
résout 0 vaisseau sur 273**. Les noms en base viennent d'un autre chemin de
nettoyage.

> **Correction d'un relevé précédent.** J'avais d'abord conclu que Starvis
> affichait « Scout » au lieu de « Khartu-al » et « Hornet F7CM » au lieu de
> « F7C-M Super Hornet Mk I », en comparant les noms **en base** aux noms du jeu.
> C'était faux : l'API sert `COALESCE(sm.name, s.name)` et substitue donc le nom
> commercial RSI dès qu'un vaisseau est rattaché au Ship Matrix. `XIAN_Scout`
> s'affiche bien « Khartu-Al ». Le défaut est nettement plus étroit que je ne
> l'avais écrit.

Portée réelle, mesurée sur la production : 273 vaisseaux, dont **220 rattachés**
au Ship Matrix — qui affichent le nom RSI, correct — et **53 non rattachés**, qui
retombent sur le nom interne. Parmi ces derniers, **24 portent un nom d'atelier** :

| Affiché | Nom du jeu |
|---|---|
| Prospector Collector Indust | Prospector Wikelo Work Special |
| RAFT Collector Indust | RAFT Wikelo Work Special |
| Dragonfly Pink | Dragonfly Star Kitten |
| Meteor Collector Military | Meteor PYAM Exec |
| Mauler | Mauler Destroyer |
| ATLS IKTI | Argo ATLS IKTI |

« Collector Indust », « Collector Military », « Collector Stealth » sont la
nomenclature interne des variantes de récompense Wikelo — exactement le genre de
nom qui n'a rien à faire dans un wiki.

Le défaut recoupe donc [D4](#d4--un-pilotable-sur-cinq-sans-ship-matrix) : ce
sont les vaisseaux que le croisement n'a pas rattachés qui exposent leur nom
interne. Réparer le croisement corrige les deux d'un coup.

**Reporté à l'étape 3.** Un renommage global reste par ailleurs risqué : simulé
contre la base, il fait **perdre 9 rattachements**, et un vaisseau sans lien peut
être élagué — ce qui avait fait disparaître deux vaisseaux du 4.9.0 en juillet.
`SM_TO_P4K_ALIASES` compte 81 correspondances écrites à la main qui existent pour
compenser ces noms ; les deux doivent être défaits ensemble.

### D4 — Un pilotable sur cinq sans Ship Matrix : ce n'était pas un défaut

> **Correction.** J'avais présenté les 49 pilotables non rattachés comme un
> manque de croisement à combler. Après examen, c'en est l'inverse : le taux est
> juste.

Les 53 vaisseaux sans `ship_matrix_id` sont presque tous des **variantes de
récompense** que RSI ne vend pas et ne référence donc nulle part : 33 `wikelo`,
12 `pyam_exec`, 2 `collector`, 1 `standalone`. L'extracteur les classait déjà
correctement par `variant_type`.

Il n'y a donc rien à rattacher. Le seul vrai problème était leur **nom** : sans
entrée RSI, ils retombaient sur la nomenclature interne.

**Corrigé (étape 3).** `nameShipsMissingFromShipMatrix` leur applique le nom du
jeu, et à eux seuls. La restriction n'est pas de la prudence de principe, elle est
mesurée : renommer tous les vaisseaux fait tomber le rattachement de 213 à 204,
renommer les seuls non rattachés le laisse à 213 — ils n'ont aucun lien à perdre.
Vérifié sur une extraction réelle : 23 renommés, 220 rattachements avant comme
après.

Reste 25 vaisseaux que **le jeu lui-même ne nomme pas** (`global.ini` n'a aucune
entrée) : les ATLS GEO, les PYAM Exec, quelques Wikelo récents. Le wiki
communautaire, lui, les nomme — voir ci-dessous.

### D4 bis — Le wiki communautaire est indexé sur nos identifiants

En cherchant ces 25 noms, découverte utile :
`api.star-citizen.wiki/api/v3/vehicles/mrai-guardian-qi-collector-indust`
répond avec

```json
{ "class_name": "MRAI_Guardian_QI_Collector_Indust",
  "name": "Guardian QI Wikelo Special",
  "game_name": "Mirai Guardian QI Wikelo Special" }
```

Trois choses en découlent :

- il est **indexé sur notre `class_name`**, donc joignable sans correspondance de
  noms — exactement ce que la couche de croisement cherche à obtenir ;
- sa convention de libellé est **la nôtre** : constructeur retiré dans `name`,
  conservé dans `game_name`. Cela valide indépendamment le choix de coupe ;
- il nomme les vaisseaux que `global.ini` laisse anonymes.

**Fait (étape 3)** — `nameShipsFromCommunityWiki`, deuxième règle nommée de la
couche. Elle interroge le wiki pour les seuls vaisseaux que ni RSI ni `global.ini`
ne nomment, et n'écrase jamais une source primaire : une source tierce, si utile
soit-elle, ne fait pas autorité contre le jeu — elle ne parle que là où il se
tait.

Trois garanties, parce qu'une dépendance réseau dans une extraction est un risque :

- la réponse est **rejetée si son `class_name` diffère** de celui demandé — le
  slug aurait mené ailleurs, et accepter renommerait un vaisseau avec le nom
  d'un autre, silencieusement et durablement ;
- après **trois échecs d'affilée**, la règle abandonne : un wiki hors ligne
  coûterait sinon un délai d'attente par vaisseau ;
- un échec ne modifie rien et n'interrompt pas l'extraction. Le pire cas est
  l'état d'avant.

Le décompte final distingue « nommés » et « inconnus ou injoignables » : sans
cela, un wiki hors service produirait la même trace qu'un wiki qui ne connaît
aucun de ces vaisseaux.

Exemple de ce qu'elle comble : `ARGO_ATLS_GEO_Collector_Grad01`, que le jeu ne
nomme pas, devient « ATLS Snowland Color ».

187 pilotables sur 236 sont rattachés (79,2 %). Les 49 restants sont surtout des
variantes et des véhicules de sol, que RSI ne référence pas individuellement.
C'est en partie légitime — mais c'est aussi ce qui avait fait supprimer en
silence deux vaisseaux du 4.9.0 avant le correctif « standalone ».

### D9 — Les boutiques affichent leur nom de fichier

Le libellé d'une boutique est fabriqué en titre-casant le nom de fichier entier,
segments techniques compris :

| Fichier | Libellé servi |
|---|---|
| `inventory_shipweap_hdshowcase_lorville` | Ship Weapon HDShowcase Lorville |
| `inventory_admin_truckstop_base_d` | Admin Admin Truckstop Base D |
| `inventory_casabaoutlet_food_area18` | Casaba Outlet Food Area18 |

Sur 136 boutiques, 69 portent au moins un segment intermédiaire dans leur nom de
fichier — codes constructeurs (`aegs`, `drak`), marqueurs de version (`small`,
`full`, `base`), numéros de journée de développement (`day06`). 24 produisent un
libellé visiblement technique, mesuré par l'audit.

**Le segment n'est pas fiable comme catégorie non plus.** Quatre boutiques
nommées « … Food … » vendent exclusivement du vêtement, et leur `shop_type` dit
`clothing` : c'est le type qui a raison, le nom qui ment. Deux autres —
« Cubby Blast Food Area18 », « Live Fire Weapons Food Port Olisar » — sont
typées `weapons` et vendent 96 articles de vêtement chacune : là, c'est le type
qui se trompe.

Le mot ne peut pas être retiré au jugé : `inventory_skuttersfood_grimhex` porte
« Food » dans le nom même de la franchise, et `inventory_market_bar_food_levski`
doit garder son « Bar ». La correction passe par la table des franchises du P4K,
qui donne le nom commercial — comme `vehicle_Name…` l'a donné pour les vaisseaux
en [D5](#d5--24-vaisseaux-affichent-un-nom-datelier). Elle demande donc une
extraction, pas une réécriture de chaîne.

En attendant, l'audit mesure la proportion de libellés techniques et la plafonne
à 20 % — elle est de 17,6 % aujourd'hui. Le défaut ne peut plus s'aggraver sans
être vu.

**Ce que la table du jeu donne, et ce qu'elle ne donne pas.** `ShopFranchise`
existe dans le DataForge : 37 enregistrements, 36 résolus en nom commercial
(« Cordry's », « Trade & Development Division », « Dumper's Depot »). Le code qui
la lisait cherchait un champ `name` là où le jeu écrit `localizedName` — la carte
se construisait, journalisait ses 37 entrées, et n'en portait aucune clé. Corrigé
depuis ; sept boutiques issues des prefabs ont retrouvé leur nom.

**Elle ne couvre pas le reste.** Sur 136 boutiques, 31 seulement ont une
franchise connue du jeu. Les 105 autres viennent des fichiers d'inventaire, dont
le segment de franchise n'a pas d'équivalent exact dans `ShopFranchise` — souvent
à une lettre près :

| Nom de fichier | Franchise du jeu |
|---|---|
| `livefirewepons` | `livefireweapons` |
| `vantagerentals` | `vantage` |
| `regalluxuryrentals` | `regal` |
| `shubininterstellar` | `shubin` |
| `teachsshipshop` | `teachs` |

Les rapprocher demande un appariement approximatif, donc un arbitrage : le
rapprochement le plus proche pour « Aparelli New Babbage » est « Casaba Outlet »,
et rien ne dit si c'est une enseigne du même groupe ou une fausse piste.

**Et le nom seul ne suffirait pas.** Quatre boutiques « Cubby Blast » coexistent
à des lieux différents ; remplacer le libellé par le seul nom de franchise les
rendrait indiscernables dans une liste. Le lieu est déjà une colonne à part, mais
la page qui liste les boutiques d'un lieu, elle, n'a plus rien pour les
distinguer — deux « Tammany and Sons » y figurent, séparées aujourd'hui par le
seul segment `food` du nom de fichier.

La suite tient donc en deux décisions, pas en un correctif : quel appariement
approximatif on accepte, et ce qui distingue deux boutiques d'une même enseigne
au même endroit.

### D10 — Près d'une boutique sur deux n'est pas un endroit où l'on va

Le P4K reste la source principale : c'est lui qui dit ce que le jeu contient. Il
ne dit pas, en revanche, ce que le jeu *utilise* — il conserve ce qui a été
retiré, les gabarits et le contenu d'événement au même rang que le reste.

Sur les 136 boutiques servies, **74 sont rattachées à un lieu et 62 ne le sont
pas** :

| Famille | Nombre | Ce que c'est |
|---|---|---|
| Gabarits d'inventaire | 20 | « Admin Small Base A », « Landing Services Rs Full 0001 », « Cry Astro Dummy » — ce qu'on trouve dans n'importe quel avant-poste, pas une boutique précise |
| Ventes anniversaire 2018-2019 | 19 | Les stands de l'IAE, présents une semaine par an |
| Port Olisar | 13 | Un lieu réel, retiré de l'univers après la 3.20 |
| Génériques de rest stop | 10 | L'inventaire partagé par tous les rest stops |

**La séparation se lit sur une colonne, sans heuristique** : `location_uuid` est
nul pour exactement ces 62. Aucune expression régulière sur les noms n'est
nécessaire, et le critère ne peut donc pas dériver quand les libellés changent.

#### Ce que chaque source sait dire

Le croisement n'est pas un arbitrage entre concurrents : chacune répond à une
question que les autres ne posent pas.

- **P4K** — ce que le jeu contient. Exhaustif, et c'est justement pourquoi il
  contient aussi ce qui ne sert plus.
- **RSI** — ce que l'éditeur publie : Ship Matrix, carte stellaire, Galactapedia,
  comm-links, images, CTM. Du complément et du contexte, pas un état du monde.
  Sa carte ne compte que 967 entrées dont 30 pour Stanton, liste des systèmes non
  implémentés (Sol, Terra), **contient Port Olisar** et ignore Levski comme
  GrimHEX. Ce n'est pas un oracle de vivacité, c'est une carte de lore.
- **UEX** — ce que les joueurs atteignent. Ses terminaux sont relevés en jeu :
  leur présence est un indice de vivacité qu'aucune des deux autres ne fournit.

Sur les 587 terminaux distincts d'UEX :

| Lieu | Terminaux UEX | Lecture |
|---|---|---|
| Levski | 17 | fréquenté |
| Grim HEX | 6 | fréquenté |
| Lorville | 5 | fréquenté |
| Port Olisar | 0 | plus atteint |

UEX n'arbitre pas contre le P4K : il complète. Une absence chez lui n'efface pas
une donnée, elle la qualifie.

Le cas de Levski montre pourquoi ce croisement vaut mieux qu'une liste tenue à la
main : elle a été **retirée en 3.12.1 puis rendue en 4.4** avec le système Nyx.
Une liste de lieux morts écrite de mémoire l'aurait condamnée à tort, et il
aurait fallu penser à la corriger. Un indice qui suit le jeu s'adapte tout seul à
la mise à jour suivante.

#### Ce qui n'est pas fait

Rien n'est supprimé. Ces définitions viennent du P4K, donc de la source
principale, et les gabarits portent une information réelle — ce qu'on trouve dans
un avant-poste quelconque. Ce qu'il faut trancher n'est pas technique : faut-il
servir « ce que vend un rest stop » comme une boutique parmi les autres, ou comme
un autre genre d'objet ?

En attendant, l'audit mesure la part non rattachée — 45,6 % — et la plafonne à
55 %. Le champ `location_uuid` documente ce que son absence veut dire, pour qu'un
consommateur tiers puisse filtrer en connaissance de cause.

## 6. Ce que l'audit ne fait pas encore

Honnêtement listé, pour ne pas confondre couverture et confiance :

- **Aucune comparaison de valeurs entre sources.** Le rattachement est mesuré,
  pas l'accord : une vitesse SCM qui diffèrerait du Ship Matrix passe inaperçue.
  Le plan le prévoit ; il demande d'abord de savoir laquelle fait foi.
- **Pas de traçabilité.** Une valeur ne dit pas encore d'où elle vient ni quand
  elle a été extraite. C'est la condition pour arbitrer une divergence.
- **Entités non couvertes** : lieux, Galactapedia, comm-links. Les boutiques ne
  le sont que par leurs libellés ([D9](#d9--les-boutiques-affichent-leur-nom-de-fichier)),
  pas par leurs prix ni leurs stocks.
- **Les erreurs réseau sont retentées trois fois**, 5xx compris. C'est
  volontaire : un audit qui rougit pour une coupure passagère plutôt que pour la
  qualité des données finit par être ignoré. Le premier essai contre la
  production avait précisément échoué ainsi.
- **Loadouts échantillonnés** sur 30 vaisseaux pris à pas régulier dans la
  population — représentatif et déterministe, mais pas exhaustif.

## 7. Où il tourne

```bash
npm run quality:audit:truth        # API locale
npm run quality:audit:truth:prod   # production
```

En CI, il s'exécute dans le job `Production Data Audit`, **après** déploiement :
il interroge la production et dure environ deux minutes, ce qui n'a pas sa place
sur chaque poussée. C'est l'étagement par risque prévu au chantier C6.

Un échec ne bloque donc pas la mise en ligne — il la signale. C'est délibéré à ce
stade : l'audit vient d'être posé, et le premier réflexe utile est de regarder ce
qu'il dit, pas d'empêcher un déploiement par ailleurs sain.
