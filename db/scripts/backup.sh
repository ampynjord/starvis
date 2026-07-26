#!/bin/bash
# ==============================================================
# PostgreSQL backup script.
#
# Intended for the VPS, for example:
#   0 3 * * * /home/debian/starvis/db/scripts/backup.sh
#
# Defaults match docker-compose.prod.yml and .env.prod.
# ==============================================================

set -euo pipefail

APP_DIR="${APP_DIR:-/home/debian/starvis}"
ENV_FILE="${ENV_FILE:-${APP_DIR}/.env.prod}"
# Deliberately outside APP_DIR: the deploy runs `git clean -fd`, which deletes any
# untracked directory inside the repo. A backup directory there is wiped at the
# next deploy — which is exactly what happened to the first backup ever taken.
BACKUP_DIR="${BACKUP_DIR:-/home/debian/starvis-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Env file not found: ${ENV_FILE}" >&2
  exit 1
fi

# Read one key from the env file without sourcing it. `source` would execute any
# value containing spaces — LEGAL_PUBLISHER_STATUS alone was enough to kill this
# script before it reached pg_dump, which is why no backup had ever been produced.
# docker compose parses the same file without issue, so the fix belongs here.
read_env() {
  sed -n "s/^${1}=//p" "$ENV_FILE" | tail -1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

DB_NAME="${DB_NAME:-$(read_env DB_NAME)}"
DB_NAME="${DB_NAME:-starvis}"
DB_USER="${DB_USER:-$(read_env DB_USER)}"
DB_USER="${DB_USER:-starvis_user}"
DB_PASSWORD="${DB_PASSWORD:-$(read_env DB_PASSWORD)}"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(read_env COMPOSE_PROJECT_NAME)}"
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

set +e
docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" --no-password \
  | gzip > "$BACKUP_FILE"
DUMP_STATUS="${PIPESTATUS[0]}"
set -e

if [ "$DUMP_STATUS" -ne 0 ]; then
  echo "[$(date)] Backup failed: pg_dump exited ${DUMP_STATUS}" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

# A dump that cannot be decompressed is not a backup: verify before trusting it.
if ! gzip -t "$BACKUP_FILE" 2>/dev/null; then
  echo "[$(date)] Backup failed: corrupt archive" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

DUMP_SIZE="$(stat -c%s "$BACKUP_FILE" 2>/dev/null || echo 0)"
if [ "$DUMP_SIZE" -lt 1000000 ]; then
  echo "[$(date)] Backup failed: suspicious size (${DUMP_SIZE} bytes)" >&2
  rm -f "$BACKUP_FILE"
  exit 1
fi

echo "[$(date)] Backup complete: $(basename "$BACKUP_FILE") ($(du -h "$BACKUP_FILE" | cut -f1))"

find "$BACKUP_DIR" -name "starvis_*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[$(date)] Removed backups older than ${RETENTION_DAYS} days"
