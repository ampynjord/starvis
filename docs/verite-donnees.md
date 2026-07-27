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
| Composants | 119 sur 3 271 (3,6 %) |
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

**À corriger étape 2/3** : distinguer le port structurel du port d'équipement à
l'extraction, puis combler le croisement sur les seconds.

### D5 — Les noms de vaisseaux ne viennent pas du jeu

Découvert en corrigeant D2, et distinct de lui : `resolveShipName()` ne teste que
la forme de clé `vehicle_Name_<Classe>`, alors que `global.ini` utilise ici
`vehicle_Name<Classe>`, sans séparateur. Résultat : **elle résout 0 vaisseau sur
273**. Les noms affichés viennent d'un autre chemin de nettoyage.

Ce que le jeu nomme réellement, et que Starvis affiche autrement :

| Affiché aujourd'hui | Nom du jeu |
|---|---|
| Scout | Khartu-al |
| Reliant | Reliant Kore |
| Gladius PIR | Gladius Pirate |
| Hornet F7CM | F7C-M Super Hornet Mk I |
| Dragonfly Pink | Dragonfly Star Kitten |
| Prospector Collector Indust | Prospector Wikelo Work Special |
| L21 Wolf | L-21 Wolf |
| m50 | M50 Interceptor |

En retirant le préfixe constructeur — qu'une colonne dédiée porte déjà —
**75 libellés changeraient**, presque tous pour le mieux.

**Mais ce renommage ne peut pas être fait seul.** Simulé contre la base :
il ferait **perdre 9 rattachements au Ship Matrix**, parce que le croisement se
fait par nom normalisé. Un vaisseau qui perd son lien peut être élagué — c'est
exactement ce qui avait fait disparaître deux vaisseaux du 4.9.0 en juillet.

La cause est visible dans `SM_TO_P4K_ALIASES` : **81 correspondances écrites à la
main**, du type `'Khartu-Al' → 'Scout'` ou `'L-21 Wolf' → 'L21 Wolf'`. Cette
table existe précisément parce que les noms n'ont jamais été résolus depuis le
jeu. Corriger les noms rendrait la plupart de ces entrées inutiles — mais il faut
défaire les deux ensemble.

**Reporté à l'étape 3**, où le croisement devient explicite et tracé. Le faire
avant reviendrait à réparer une moitié en cassant l'autre.

### D4 — Un pilotable sur cinq sans Ship Matrix

187 pilotables sur 236 sont rattachés (79,2 %). Les 49 restants sont surtout des
variantes et des véhicules de sol, que RSI ne référence pas individuellement.
C'est en partie légitime — mais c'est aussi ce qui avait fait supprimer en
silence deux vaisseaux du 4.9.0 avant le correctif « standalone ».

## 6. Ce que l'audit ne fait pas encore

Honnêtement listé, pour ne pas confondre couverture et confiance :

- **Aucune comparaison de valeurs entre sources.** Le rattachement est mesuré,
  pas l'accord : une vitesse SCM qui diffèrerait du Ship Matrix passe inaperçue.
  Le plan le prévoit ; il demande d'abord de savoir laquelle fait foi.
- **Pas de traçabilité.** Une valeur ne dit pas encore d'où elle vient ni quand
  elle a été extraite. C'est la condition pour arbitrer une divergence.
- **Entités non couvertes** : lieux, missions, Galactapedia, comm-links.
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
