# 🚀 Star Citizen Ships API

API REST pour récupérer les données des vaisseaux Star Citizen depuis robertsspaceindustries.com avec stockage MySQL et documentation Swagger.

## 🎯 Fonctionnalités

- ✅ Scraping des vaisseaux depuis robertsspaceindustries.com
- ✅ Stockage persistant dans MySQL 8.0
- ✅ Cache 3-niveaux (mémoire → MySQL → scraping)
- ✅ API REST complète avec 6 endpoints
- ✅ Documentation interactive Swagger UI
- ✅ Déploiement Docker Compose
- ✅ Extraction automatique : spécifications techniques, images haute qualité
- ⚠️ Modèles 3D : extraction limitée (chargement dynamique côté client)

## 📦 Installation et Démarrage

### Avec Docker (recommandé)

```bash
# Démarrer l''API + MySQL
docker-compose up -d

# Scraper un vaisseau
docker-compose exec api npx tsx server.ts scrape

# Voir les logs
docker-compose logs -f

# Arrêter
docker-compose down
```

### Sans Docker

```bash
npm install

# Configurer MySQL
mysql -u root -p
CREATE DATABASE starapi;
CREATE USER ''starapi_user''@''localhost'' IDENTIFIED BY ''starapi_pass'';
GRANT ALL PRIVILEGES ON starapi.* TO ''starapi_user''@''localhost'';

# Créer .env
cp .env.example .env
# Éditer .env avec vos identifiants MySQL

npm run dev
```

## � Documentation Swagger

Interface interactive disponible sur :
**http://localhost:3000/api-docs**

Testez tous les endpoints directement depuis votre navigateur !

Spécification OpenAPI 3.0 : http://localhost:3000/api-docs.json

## 🔧 API Endpoints

### `GET /`

Page d'accueil de l'API avec liste des endpoints.

### `GET /health`

Health check de l'API.

### `GET /api/ships`

Liste tous les vaisseaux stockés en base de données.

**Réponse :**

```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "id": "...",
      "name": "Avenger Stalker",
      "manufacturer": "Aegis Dynamics",
      "size": "Small",
      "...": "..."
    }
  ]
}
```

### `GET /api/ships/:manufacturer/:slug`

Récupère un vaisseau spécifique avec toutes ses spécifications et images.

**Exemple :**

```bash
curl http://localhost:3000/api/ships/anvil/arrow
```

**Réponse :**

```json
{
  "success": true,
  "data": {
    "name": "Arrow",
    "manufacturer": "Anvil Aerospace",
    "specifications": [...],
    "images": [...],
    "model3d": {...}
  }
}
```

### `POST /api/ships/scrape`

Scrape un nouveau vaisseau depuis une URL.

**Exemple :**

```bash
curl -X POST http://localhost:3000/api/ships/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://robertsspaceindustries.com/pledge/ships/anvil-arrow/Arrow"}'
```

### `DELETE /api/ships/cache`

Vide le cache mémoire des vaisseaux.

## 🐳 Commandes Docker

```bash
# Démarrer
docker-compose up -d

# Logs
docker-compose logs -f api
docker-compose logs -f mysql

# Scraping
docker-compose exec api npx tsx server.ts scrape [URL]

# MySQL
docker-compose exec mysql mysql -u starapi_user -pstarapi_pass starapi
```

## ⚙️ Configuration

`.env` :

```env
PORT=3000
DB_HOST=localhost
DB_USER=starapi_user
DB_PASSWORD=starapi_pass
DB_NAME=starapi
```

## 📊 Base de Données

Tables MySQL auto-créées au démarrage :

### `ships`

Colonnes principales : id, name, manufacturer, slug, url, description, price_amount, price_currency, focus, production_status, size, crew_min, crew_max, model3d_viewer_url, model3d_model_url, scraped_at, created_at, updated_at

### `ship_specifications`

Relation 1-N avec ships : id, ship_id (FK), name, value

### `ship_images`

Relation 1-N avec ships : id, ship_id (FK), url, type, alt

## 🔄 Cache 3-Niveaux

1. **Mémoire** : Cache Map avec TTL 1h (performance maximale)
2. **MySQL** : Base de données persistante
3. **Scraping** : Extraction depuis robertsspaceindustries.com si absent

## 🛠️ Stack Technique

- **Runtime** : Node.js 20+ avec tsx
- **API** : Express.js + CORS
- **Base de données** : MySQL 8.0 (driver mysql2)
- **Scraping** : Puppeteer (navigateur headless) + Cheerio (parsing HTML)
- **Documentation** : Swagger UI (swagger-ui-express + swagger-jsdoc)
- **Déploiement** : Docker + docker-compose
- **Container** : Alpine Linux + Chromium

## 🚀 Utilisation CLI

```bash
# Scraper un vaisseau spécifique
npm run scrape https://robertsspaceindustries.com/pledge/ships/anvil/arrow

# Scraper plusieurs vaisseaux (avec Docker)
docker-compose exec api npx tsx server.ts scrape https://url1
docker-compose exec api npx tsx server.ts scrape https://url2

# Mode développement
npm run dev

# Mode production
npm start
```

## 📝 Format des Données

Chaque vaisseau contient :

- **Informations générales** : nom, manufacturier, description, prix, focus
- **Spécifications techniques** : ~35 specs (dimensions, masse, vitesse, armement, etc.)
- **Images** : gallery, screenshots, blueprints (formats webp/jpg)
  - Filtrage intelligent : exclusion des trackers, pixels analytics, logos
  - Types : `gallery`, `screenshot`, `blueprint`, `thumbnail`, `store`
  - En moyenne 4-6 images de qualité par vaisseau
- **Modèle 3D** : ⚠️ Extraction limitée
  - Le site utilise un chargement asynchrone via JavaScript
  - Le holoviewer n'est pas toujours présent sur toutes les pages
  - Code d'extraction mis en place (interception réseau, parsing de scripts, etc.)
  - Fonctionne sur certains vaisseaux si le holoviewer est chargé
