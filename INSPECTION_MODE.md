# Mode Inspection (Académique)

## Purpose

Le **Mode Inspection** permet de désactiver l'authentification sur la plateforme Starvis pour permettre aux professeurs d'inspecter/évaluer le projet sans avoir besoin de credentials de connexion.

## Activation

Pour activer le mode inspection en production:

### 1. Définir la variable d'environnement

Dans `.env.prod` ou via le docker-compose:

```bash
INSPECTION_MODE=true
```

Ou dans `docker-compose.prod.yml`:

```yaml
services:
  api:
    environment:
      - INSPECTION_MODE=true
  ihm:
    environment:
      - NEXT_PUBLIC_INSPECTION_MODE=true
```

### 2. Redémarrer les services

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod down
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

## What Gets Disabled

Lorsque `INSPECTION_MODE=true`:

- ✅ **Frontend (IHM)**: Accès direct sans redirection login
  - Le middleware Next.js accepte toutes les pages sans cookie `starvis_token`
  
- ✅ **API Routes protégées**: Accès sans JWT
  - `/api/v1/chat` — Chat (normalement requireJwt)
  - `/auth/me` — User profile (normalement requireJwt)
  - `/auth/api-token` — Token generation (normalement requireJwt)
  - `/admin/*` — Admin endpoints (normalement requireJwtAdmin)

- ✅ **API Publiques**: Fonctionnent normalement
  - `/api/v1/ships` — Navires
  - `/api/v1/components` — Composants
  - `/api/v1/items` — Items
  - etc.

## What Stays Protected (In Production)

- ⚠️ **Création de compte**: Toujours fonctionnel
- ⚠️ **Login**: Toujours fonctionnel (optionnel en mode inspection)
- ⚠️ **Données sensibles**: Aucune, Starvis ne gère que du data de jeu public

## Désactiver

Pour revenir au mode normal (avec authentification):

```bash
INSPECTION_MODE=false
```

Et redémarrer les services.

## Notes

- Cette variable s'ajoute aux fichiers `.env.prod.example` et `.env.dev.example`
- Par défaut: `INSPECTION_MODE=false` (authentification active)
- À utiliser uniquement pour l'évaluation académique
