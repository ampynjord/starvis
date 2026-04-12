#!/bin/bash
# ==============================================================
# PostgreSQL Backup Script — Daily automated backup
# Cron: 0 3 * * * /home/debian/starvis/db/backup.sh
# Keeps last 7 days of backups
# ==============================================================
set -euo pipefail

BACKUP_DIR="/home/debian/starvis/backups"
CONTAINER="starvis-postgres"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H%M)

# Load env
source /home/debian/starvis/.env

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting PostgreSQL backup..."

PGPASSWORD="$DB_PASSWORD" docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-password \
  | gzip > "${BACKUP_DIR}/starvis_${DATE}.sql.gz"

# Check dump succeeded
set +e
DUMP_SIZE=$(stat -c%s "${BACKUP_DIR}/starvis_${DATE}.sql.gz" 2>/dev/null)
set -e

if [ -n "$DUMP_SIZE" ] && [ "$DUMP_SIZE" -gt 0 ]; then
  SIZE=$(du -h "${BACKUP_DIR}/starvis_${DATE}.sql.gz" | cut -f1)
  echo "[$(date)] ✅ Backup complete: starvis_${DATE}.sql.gz (${SIZE})"
else
  echo "[$(date)] ❌ Backup failed!"
  rm -f "${BACKUP_DIR}/starvis_${DATE}.sql.gz"
  exit 1
fi

# Remove old backups
find "$BACKUP_DIR" -name "starvis_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] 🧹 Cleaned backups older than ${RETENTION_DAYS} days"
