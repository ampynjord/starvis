# 🚀 Starapi

**Auteur** : ampynjord pour la Dawnstar

API REST pour les vaisseaux Star Citizen — données synchronisées depuis l'API officielle RSI.

## 🎯 Fonctionnalités

- **245 vaisseaux** synchronisés automatiquement depuis RSI
- **Aucun scraping** : utilise l'API Ship-Matrix (sans authentification)
- **Base MySQL** pour stockage persistant
- **Données complètes** : specs, composants, images, dimensions
- **Swagger UI** pour documentation interactive

## 🚀 Démarrage rapide

```bash
git clone https://github.com/ampynjord/starapi.git
cd starapi
docker-compose up -d
```

**Accès** : http://localhost:3000 | **Swagger** : http://localhost:3000/api-docs

## 🔧 Endpoints

| Méthode | Endpoint                     | Description                           |
| ------- | ---------------------------- | ------------------------------------- |
| GET     | `/api/ships`                 | Liste tous les vaisseaux              |
| GET     | `/api/ships?size=large`      | Filtre par taille/manufacturer/status |
| GET     | `/api/ships/search?q=aurora` | Recherche textuelle                   |
| GET     | `/api/ships/stats`           | Statistiques                          |
| GET     | `/api/ships/:id`             | Détail d'un vaisseau                  |
| POST    | `/admin/sync`                | Re-synchroniser depuis RSI            |

## 📊 Données disponibles

**Par vaisseau :**

- Infos : nom, fabricant, slug, description, focus, statut
- Dimensions : longueur, largeur, hauteur, masse
- Performance : vitesse SCM, afterburner, accélération
- Équipage : min/max crew
- Cargo : capacité SCU
- **17 catégories de composants** : armes, boucliers, réacteurs, propulseurs...
- **49 formats d'images** via `mediaGallery` (voir ci-dessous)

**Galerie d'images disponible :**

Chaque vaisseau expose une `mediaGallery` avec **49 tailles d'images** générées dynamiquement :

| Format                | Dimensions | Usage                |
| --------------------- | ---------- | -------------------- |
| `source`              | Original   | Image haute qualité  |
| `wallpaper_3840x2160` | 3840×2160  | Fond d'écran 4K      |
| `wallpaper_1920x1080` | 1920×1080  | Fond d'écran Full HD |
| `store_hub_large`     | 1200×420   | Bannière store       |
| `store_small`         | 351×210    | Thumbnail store      |
| `slideshow_wide`      | 1200×800   | Diaporama            |
| `icon`                | 45×45      | Icône                |
| ...                   | ...        | 42 autres formats    |

```json
// Exemple de réponse
"mediaGallery": [{
  "sourceName": "StarCitizen_RSI_Aurora_ES_01",
  "sourceUrl": "https://media.robertsspaceindustries.com/e1i4i2ixe6ouo/source.jpg",
  "images": {
    "source": "https://media.robertsspaceindustries.com/e1i4i2ixe6ouo/source.jpg",
    "wallpaper_3840x2160": "https://media.robertsspaceindustries.com/e1i4i2ixe6ouo/wallpaper_3840x2160.jpg",
    "wallpaper_1920x1080": "https://media.robertsspaceindustries.com/e1i4i2ixe6ouo/wallpaper_1920x1080.jpg",
    // ... 46 autres URLs
  }
}]
```

**Statistiques globales :**

```
245 vaisseaux | 19 fabricants | 3629 composants
```

## 📁 Structure

```
starapi/
├── server.ts              # Serveur Express + API
├── src/providers/
│   └── rsi-providers.ts   # Ship-Matrix & GraphQL providers
├── docker-compose.yml
├── Dockerfile
└── package.json
```

## 🛠️ Développement

```bash
npm install

# MySQL local
docker run -d --name mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=starapi \
  -e MYSQL_USER=starapi \
  -e MYSQL_PASSWORD=starapi \
  mysql:8.0

# Lancer le serveur
npx tsx server.ts
```

---

## 📖 API RSI — Documentation technique

### Ship-Matrix API (source principale)

```
GET https://robertsspaceindustries.com/ship-matrix/index
```

**Aucune authentification requise** — Retourne tous les 245 vaisseaux avec specs complètes.

```bash
curl -s "https://robertsspaceindustries.com/ship-matrix/index" | jq '.data | length'
# 245
```

### GraphQL API (source secondaire)

```
POST https://robertsspaceindustries.com/graphql
```

**Requiert authentification** : tokens `x-csrf-token` et `Rsi-Token` (cookie).

**Opérations disponibles :**

- `GetShipList` : liste des vaisseaux en vente (~30)
- `GetShip` : détail avec CTM (modèle 3D) et prix
- `GetManufacturers` : liste des fabricants
- `GetShipSkus` : SKUs et variantes

**Filtres GraphQL :**

| Filtre         | Valeurs                                                                         |
| -------------- | ------------------------------------------------------------------------------- |
| classification | combat, transport, exploration, industrial, support, competition, ground, multi |
| status         | flight-ready, in-concept                                                        |
| size           | small, medium, large, capital, snub, vehicle                                    |
| sale           | true (en vente), false                                                          |

### Comparaison des sources

|                 | Ship-Matrix  | GraphQL          |
| --------------- | ------------ | ---------------- |
| Auth            | ❌ Non       | ✅ Tokens requis |
| Vaisseaux       | 245 (tous)   | ~30 (en vente)   |
| Specs           | ✅ Complet   | ✅ Complet       |
| Composants      | ✅ Détaillés | ❌ Non           |
| Images          | ✅ Multiples | ✅ Limitées      |
| Modèle 3D (CTM) | ❌ Non       | ⚠️ Instable      |
| Prix            | ❌ Non       | ✅ Oui           |

> **Note sur les CTM** : L'API GraphQL RSI retourne fréquemment des erreurs internes pour les requêtes de modèles 3D. Les URLs CTM ne sont pas exposées publiquement de manière fiable.

**Recommandation** : Ship-Matrix comme source principale, GraphQL pour enrichir (prix) quand disponible.

---

## 📄 License

MIT
