#!/bin/bash
# ==============================================================
# DB init script - first PostgreSQL start only.
# Mounted by docker-compose.dev.yml into /docker-entrypoint-initdb.d/.
#
# Creates the PostgreSQL schemas used by Prisma:
#   - game: extracted game data
#   - rsi : RSI website / Ship Matrix data
#   - meta: extraction metadata, changelog, users
#
# Tables are managed by Prisma with:
#   npm run push --workspace=@starvis/db
# ==============================================================

set -euo pipefail

echo "Creating schemas in database '${POSTGRES_DB}'..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE SCHEMA IF NOT EXISTS game;
  CREATE SCHEMA IF NOT EXISTS rsi;
  CREATE SCHEMA IF NOT EXISTS meta;
  GRANT ALL ON SCHEMA game TO "$POSTGRES_USER";
  GRANT ALL ON SCHEMA rsi TO "$POSTGRES_USER";
  GRANT ALL ON SCHEMA meta TO "$POSTGRES_USER";
EOSQL

echo "Schemas game / rsi / meta created"
