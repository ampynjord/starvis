# Surface d'API — état mesuré et décision

> Étape 4 de [refonte-v2.md](refonte-v2.md). La sortie du SQL brut vient **après**
> cette décision : réécrire 195 requêtes pour en supprimer ensuite la moitié
> serait du travail perdu.

## 1. Ce qui existe

Mesuré le 28/07/2026 en croisant `api/openapi.json` avec les chemins appelés
depuis `ihm/src`.

| | Routes |
|---|---|
| Documentées | 178 |
| Appelées par l'IHM | 107 |
| Sans consommateur interne | 71 |

> La mesure a demandé deux corrections avant d'être crédible. La première version
> annonçait 100 orphelines, dont `/ships/{uuid}/loadout` — que j'avais appelée
> moi-même une heure plus tôt. En cause : ma normalisation remplaçait `{uuid}`
> avant `${uuid}`, laissant un `$` orphelin qui ne correspondait plus à rien.
> Un chiffre invraisemblable vaut mieux qu'un chiffre plausible et faux : le
> premier se vérifie.

## 2. « Sans consommateur interne » ne veut pas dire morte

C'est le piège de cette mesure, et la raison pour laquelle elle ne suffit pas à
décider seule. Trois cas très différents s'y confondent :

**a. Utile aux tiers, pas à nous.** `/game-versions`, `/ship-matrix`,
`/comm-link-images`, `/correlations` : l'IHM ne s'en sert pas, mais ce sont
exactement les données qu'un développeur externe vient chercher. Les retirer
reviendrait à limiter précisément ceux qu'on veut servir.

**b. Fonctionnalité prévue, jamais branchée.** `/starmap/jump-points`,
`/mining/solver` : la donnée existe, la route répond, rien ne l'affiche. À
arbitrer côté IHM plutôt que côté API — la question est « veut-on cette page »,
pas « garde-t-on cette route ».

**c. Hors `/api/v1`.** Les 26 routes d'authentification, d'administration et de
santé sont consommées par l'IHM à travers le proxy Next, sous d'autres chemins.
Elles apparaissent orphelines par artefact de mesure, pas par désuétude.

## 3. La décision

**Aucune suppression au motif du non-usage interne.** L'engagement pris envers
les consommateurs tiers vaut plus que la satisfaction de retirer des lignes, et
`/api/v1` est déjà consommé de l'extérieur.

Ce qui est arrêté à la place :

1. **Une ressource par entité, verbes uniformes.** Les variantes accumulées
   (`/ships/manufacturers` à côté de `/manufacturers`) se rejoignent par
   redirection permanente plutôt que par suppression.
2. **Les filtres déclarés une fois**, dans le registre zod déjà posé à la
   phase 1, au lieu des allowlists de tri dupliquées par service.
3. **Rien de nouveau sans consommateur identifié** — interne ou tiers nommé.
   C'est ce qui a produit les 71.
4. **La surface se juge à l'usage réel**, pas à l'intention : les journaux
   d'accès par route diront lesquelles des 71 sont vraiment appelées de
   l'extérieur. C'est la mesure qui manque aujourd'hui pour trancher le cas (a)
   autrement qu'au jugé.

## 4. Ce que cela débloque

La sortie du SQL brut peut commencer, service par service, sur une surface
stable. 195 appels `$queryRawUnsafe` dans 19 services sur 28, avec
`Row = Record<string, any>` pour type de retour — aucune garantie exploitable
aujourd'hui.

## 5. Deux obstacles à lever d'abord

Reconnaissance faite sur `commodity-query-service`, choisi comme cobaye pour sa
taille : 3 requêtes brutes, 128 lignes, une entité réelle du wiki. Ce n'est pas
le refactor mécanique qu'on imagine.

### Le type partagé interdit l'accès typé

`PrismaLike`, dont dépendent tous les services, n'expose que trois méthodes :

```ts
export interface PrismaLike {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
  $disconnect(): Promise<void>;
}
```

Aucun accès aux modèles. L'objet réellement passé **est** un `PrismaClient`
complet — seul le typage le restreint. Sortir du SQL brut suppose donc d'abord
d'élargir ce type, ce qui touche toute la couche service d'un coup. C'est un
préalable transversal, pas un détail de mise en œuvre.

### Le format de sortie est en snake_case, Prisma parle camelCase

L'API publique sert `class_name`, `sub_type`, `occupancy_scu`. Prisma rendrait
`className`, `subType`, `occupancyScu` — le modèle est déclaré en camelCase avec
`@map` vers les colonnes.

**Une migration naïve romprait donc le contrat pour tous les consommateurs.**
C'est exactement le genre de rupture qui ne se voit pas en test unitaire et se
découvre chez les tiers.

Il faut une sérialisation explicite vers le contrat public. Deux points de
vigilance relevés sur les données actuelles :

- `occupancy_scu` est un `Decimal?`. Aucune marchandise n'en porte aujourd'hui,
  donc le risque est théorique — mais un `Decimal` Prisma ne se sérialise pas
  comme un numérique brut, et ce sera un piège dès qu'une valeur apparaîtra.
- `data_json` et les dates se comportent identiquement des deux côtés : objet
  analysé et `Date`. Rien à faire pour eux.

### Comment le vérifier

La méthode qui a servi pour l'écriture par lots vaut ici : capturer la sortie
complète de l'API avant migration — liste triée, filtrée par type, par
catégorie, recherche, fiche, types, filtres — puis comparer octet à octet après.
Une égalité stricte est la seule preuve acceptable qu'un changement interne n'a
pas fui jusqu'au contrat.
