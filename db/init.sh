#!/bin/bash
# ==============================================================
# DB Init Script â€” First MySQL start only
# Mounted into /docker-entrypoint-initdb.d/
# Creates 3 databases in a single MySQL instance:
#   - starvis : shared/meta data (manufacturers, ship_matrix, changelogâ€¦)
#   - live    : game data extracted from LIVE build
#   - ptu     : game data extracted from PTU build
# Schema is managed by Prisma (prisma db push at API startup).
# ==============================================================

echo "ðŸ“¦ Creating databases..."
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
    CREATE DATABASE IF NOT EXISTS starvis CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE DATABASE IF NOT EXISTS live    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE DATABASE IF NOT EXISTS ptu     CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EOSQL

echo "ðŸ‘¤ Configuring user permissions..."
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
    CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}';
    GRANT ALL PRIVILEGES ON starvis.* TO '${MYSQL_USER}'@'%';
    GRANT ALL PRIVILEGES ON live.*    TO '${MYSQL_USER}'@'%';
    GRANT ALL PRIVILEGES ON ptu.*     TO '${MYSQL_USER}'@'%';
    FLUSH PRIVILEGES;
EOSQL

echo "âœ… Databases and user configured"
