#!/bin/bash
# ==============================================================
# PostgreSQL backup script.
#
# Intended for the VPS, for example:
#   0 3 * * * /home/debian/starvis/db/backup.sh
#
# Defaults match docker-compose.prod.yml and .env.prod.
# ==============================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/home/debian/starvis}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env.prod}"
BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: ${ENV_FILE}" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

DB_NAME="${DB_NAME:-starvis}"
DB_USER="${DB_USER:-starvis_user}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-starvis}"
CONTAINER="${POSTGRES_CONTAINER:-${COMPOSE_PROJECT_NAME}-postgres}"

if [ -z "${DB_PASSWORD:-}" ]; then
  echo "DB_PASSWORD is required in ${ENV_FILE}" >&2
  exit 1
fi

DATE="$(date +%Y-%m-%d_%H%M)"
BACKUP_FILE="${BACKUP_DIR}/starvis_${DATE}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[$(date)] Starting PostgreSQL backup from ${CONTAINER}/${DB_NAME}..."

docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-password \
  | gzip > "$BACKUP_FILE"

DUMP_SIZE="$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)"

if [ "$DUMP_SIZE" -gt 0 ]; then
  SIZE="$(du -h "$BACKUP_FILE" | cut -f1)"
  echo "[$(date)] Backup complete: $(basename "$BACKUP_FILE") (${SIZE})"
else
  echo "[$(date)] Backup failed: empty dump" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

find "$BACKUP_DIR" -name "starvis_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[$(date)] Removed backups older than ${RETENTION_DAYS} days"
