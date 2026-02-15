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

# Dump all tables (password passed via temp config to avoid exposure in ps aux)
docker exec "$CONTAINER" sh -c "
  echo '[client]' > /tmp/.backup_cnf && echo \"password=\$1\" >> /tmp/.backup_cnf && chmod 600 /tmp/.backup_cnf
  mysqldump --defaults-extra-file=/tmp/.backup_cnf -u root --single-transaction --routines --triggers \"\$2\"
  rm -f /tmp/.backup_cnf
" -- "${MYSQL_ROOT_PASSWORD}" "${DB_NAME}" | gzip > "${BACKUP_DIR}/starvis_${DATE}.sql.gz"

# Check dump succeeded (set +e temporarily to handle the check manually)
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
