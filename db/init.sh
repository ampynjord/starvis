#!/bin/bash
# ==============================================================
# DB Init Script — First MySQL start only
# Mounted into /docker-entrypoint-initdb.d/
# Schema is managed by Prisma (prisma db push at API startup).
# This script only sets up the DB user with remote access.
# ==============================================================

echo "👤 Configuring user permissions..."
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
    CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}';
    GRANT ALL PRIVILEGES ON ${MYSQL_DATABASE}.* TO '${MYSQL_USER}'@'%';
    FLUSH PRIVILEGES;
EOSQL

echo "✅ Database user configured"
