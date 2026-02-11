#!/bin/bash
# ==============================================================
# DB Init Script — Auto-creates schema on first MySQL start
# Mounted into /docker-entrypoint-initdb.d/
# ==============================================================
echo "🗄️  Initializing Starvis database schema..."
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" "${MYSQL_DATABASE}" < /docker-entrypoint-initdb.d/schema.sql
echo "✅ Schema initialized"
