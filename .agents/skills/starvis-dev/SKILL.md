---
name: starvis-dev
description: Guides development, DB operations, migrations, testing, and audits in the STARVIS monorepo.
---

# STARVIS Dev Integration Skill

This skill helps you manage, run, and audit the STARVIS development environment.

## Docker Compose Services

We run a PostgreSQL database and a Redis server locally inside docker containers.

- **Check Dev Compose Configuration**:
  ```bash
  docker compose -f docker-compose.dev.yml --env-file .env.dev.example config --quiet
  ```
- **Start the Stack**:
  ```bash
  docker compose -f docker-compose.dev.yml --env-file .env.dev up -d
  ```
- **Stop the Stack**:
  ```bash
  docker compose -f docker-compose.dev.yml --env-file .env.dev down
  ```

---

## Database Management

The database workspace uses Prisma with multi-schema configurations (`game`, `rsi`, `meta`).

- **Generate Prisma Client**:
  ```bash
  npm run db:generate
  ```
- **Sync/Push Schema in Dev (Non-Destructive)**:
  ```bash
  npm run db:push
  ```
  *Note: To avoid data loss and accept the current database data schema drift, use `npm run db:push -- --accept-data-loss` if necessary, but avoid dropping local databases unless required.*
- **Create a Database Migration**:
  ```bash
  npm run migrate --workspace=@starvis/db
  ```
- **Deploy Database Migrations**:
  ```bash
  npm run migrate:deploy --workspace=@starvis/db
  ```
- **Run Prisma Studio**:
  ```bash
  npm run db:studio
  ```

---

## Data Extraction & Synchronisation

STARVIS aggregates and parses game data from local files and public APIs.

- **Load Game Data (Local extraction)**:
  ```bash
  npx tsx extractor/extract.ts --env live
  ```
- **Force specific game version label**:
  ```bash
  npx tsx extractor/extract.ts --env live --game-version 4.7.2
  ```
- **Network-backed RSI Sync (no local game files needed)**:
  ```bash
  npm run sync
  ```
- **Location Completeness Audit**:
  ```bash
  npm run audit:locations --workspace=@starvis/extractor -- --env live
  ```

---

## Verification & Auditing

Always run tests and audits before committing changes:

- **Lint and Style Formatting (Biome)**:
  ```bash
  npm run lint:ci
  ```
- **Type Checking (All Workspaces)**:
  ```bash
  npm run typecheck
  ```
- **Monorepo Tests (Vitest)**:
  - Run all: `npm run test`
  - API only: `npm run test --workspace=@starvis/api`
  - Extractor only: `npm run test --workspace=@starvis/extractor`
  - IHM only: `npm run test --workspace=starvis-ihm`
- **End-to-End Tests (Playwright)**:
  ```bash
  npm run test:e2e --workspace=starvis-ihm
  ```
- **Intelligent Quality Audits**:
  - Run all: `npm run quality:audit`
  - API Contracts: `npm run quality:audit:contracts`
  - Development Data Integrity: `npm run quality:audit:data`
  - Production Data Integrity: `npm run quality:audit:data:prod`
  - Critical UI flows: `npm run quality:audit:ui`
