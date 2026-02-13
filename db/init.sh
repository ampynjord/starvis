#!/bin/bash
# ==============================================================
# DB Init Script — Auto-creates schema on first MySQL start
# Mounted into /docker-entrypoint-initdb.d/
# ==============================================================
echo "🗄️  Initializing Starvis database schema..."

# Load schema
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < /docker-entrypoint-initdb.d/schema.sql

# Create user with proper permissions for external connections
# Docker creates MYSQL_USER but only with localhost access
# We need % (all hosts) for extractor connections via exposed port or tunnel
echo "👤 Configuring user permissions..."
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" <<-EOSQL
    CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'%' IDENTIFIED BY '${MYSQL_PASSWORD}';
    GRANT ALL PRIVILEGES ON ${MYSQL_DATABASE}.* TO '${MYSQL_USER}'@'%';
    FLUSH PRIVILEGES;
EOSQL

echo "✅ Database initialized with schema and user permissions"
