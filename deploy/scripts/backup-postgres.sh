#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/class-hub/app}"
ENV_FILE="${ENV_FILE:-/opt/class-hub/.env.trial}"
BACKUP_DIR="${BACKUP_DIR:-/opt/class-hub/backups/postgres}"
STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/classhub_trial_${STAMP}.dump"

mkdir -p "$BACKUP_DIR"
cd "$COMPOSE_DIR"

docker compose --env-file "$ENV_FILE" -f deploy/compose.trial.yaml exec -T postgres \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' \
  > "$FILE"

sha256sum "$FILE" > "$FILE.sha256"
chmod 600 "$FILE" "$FILE.sha256"
echo "Backup created: $FILE"