#!/bin/bash
# ==============================================================
# MySQL Backup Script — Daily automated backup
# Cron: 0 3 * * * /home/ubuntu/docker/starvis/db/backup.sh
# Keeps last 7 days of backups
# ==============================================================
set -euo pipefail

BACKUP_DIR="/home/ubuntu/docker/starvis/backups"
CONTAINER="starvis-mysql"
RETENTION_DAYS=7
DATE=$(date +%Y-%m-%d_%H%M)

# Load env
source /home/ubuntu/docker/starvis/.env

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting MySQL backup..."

# Dump all tables
docker exec "$CONTAINER" mysqldump \
  -u root -p"${MYSQL_ROOT_PASSWORD}" \
  --single-transaction \
  --routines \
  --triggers \
  "${DB_NAME}" | gzip > "${BACKUP_DIR}/starvis_${DATE}.sql.gz"

# Check dump succeeded
if [ $? -eq 0 ] && [ -s "${BACKUP_DIR}/starvis_${DATE}.sql.gz" ]; then
  SIZE=$(du -h "${BACKUP_DIR}/starvis_${DATE}.sql.gz" | cut -f1)
  echo "[$(date)] ✅ Backup complete: starvis_${DATE}.sql.gz (${SIZE})"
else
  echo "[$(date)] ❌ Backup failed!"
  exit 1
fi

# Remove old backups
find "$BACKUP_DIR" -name "starvis_*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] 🧹 Cleaned backups older than ${RETENTION_DAYS} days"
