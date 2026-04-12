#!/bin/bash
# ==============================================================
# DB Init Script — First PostgreSQL start only
# Mounted into /docker-entrypoint-initdb.d/
# Creates the 3 schemas in the single 'starvis' database:
#   - game : ships, components, items, etc.  (env column: live | ptu)
#   - rsi  : ship_matrix, galactapedia, comm_links, starmap_locations
#   - meta : manufacturers, extraction_log, changelog
# Schema tables are managed by Prisma (prisma db push at API startup).
# ==============================================================

set -e

echo "📦 Creating schemas in database '${POSTGRES_DB}'..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE SCHEMA IF NOT EXISTS game;
    CREATE SCHEMA IF NOT EXISTS rsi;
    CREATE SCHEMA IF NOT EXISTS meta;
    GRANT ALL ON SCHEMA game TO "$POSTGRES_USER";
    GRANT ALL ON SCHEMA rsi  TO "$POSTGRES_USER";
    GRANT ALL ON SCHEMA meta TO "$POSTGRES_USER";
EOSQL

echo "✅ Schemas game / rsi / meta created"
