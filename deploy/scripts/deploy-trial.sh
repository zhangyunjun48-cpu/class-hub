#!/usr/bin/env bash
set -euo pipefail

COMPOSE_DIR="${COMPOSE_DIR:-/opt/class-hub/app}"
ENV_FILE="${ENV_FILE:-/opt/class-hub/.env.trial}"
COMPOSE_FILE="deploy/compose.trial.yaml"

cd "$COMPOSE_DIR"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

"${COMPOSE[@]}" build api
"${COMPOSE[@]}" up -d postgres
"${COMPOSE[@]}" run --rm api node dist/server/src/db/migrate.js
"${COMPOSE[@]}" up -d
"${COMPOSE[@]}" ps

for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/api/health >/dev/null; then
    echo "Trial deployment is healthy."
    exit 0
  fi
  sleep 2
done

echo "Trial deployment health check failed."
exit 1