#!/usr/bin/env bash
set -euo pipefail

TAG="${1:?Usage: deploy.sh <git-tag>}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/class-hub}"
REPO_DIR="${REPO_DIR:-$DEPLOY_ROOT/app}"
ENV_FILE="${ENV_FILE:-$DEPLOY_ROOT/.env}"
WEB_ROOT="${WEB_ROOT:-$DEPLOY_ROOT/web}"
export ENV_FILE
STATE_DIR="${STATE_DIR:-$DEPLOY_ROOT/state}"
COMPOSE_FILE="$REPO_ROOT/deploy/compose.yaml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing environment file: $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

export WEB_ROOT
export DEPLOY_VERSION="$TAG"
export BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "Cloning repository into $REPO_DIR"
  git clone "${REPO_URL:?REPO_URL is required for first deployment}" "$REPO_DIR"
fi

cd "$REPO_DIR"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Deployment repository has local changes. Refusing to deploy."
  exit 1
fi

PREVIOUS_TAG="$(cat "$STATE_DIR/last-successful-tag" 2>/dev/null || true)"
git fetch --tags --prune origin
git checkout "$TAG"

npm ci --no-audit --no-fund
npm run build
npm --prefix server ci --no-audit --no-fund
npm --prefix server run build

RELEASE_DIR="$WEB_ROOT/releases/$TAG"
case "$RELEASE_DIR" in
  "$WEB_ROOT"/releases/*) ;;
  *) echo "Unsafe release path: $RELEASE_DIR"; exit 1 ;;
esac
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
cp -a dist/. "$RELEASE_DIR/"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api-prod api-staging
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm api-prod node dist/server/src/db/migrate.js
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm api-staging node dist/server/src/db/migrate.js
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

ln -sfn "$RELEASE_DIR" "$WEB_ROOT/current.new"
mv -Tf "$WEB_ROOT/current.new" "$WEB_ROOT/current"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" restart caddy

for attempt in $(seq 1 30); do
  if curl -fsS "https://$APP_DOMAIN/api/health" >/dev/null && curl -fsS "https://$STAGING_DOMAIN/api/health" >/dev/null; then
    printf '%s\n' "$TAG" > "$STATE_DIR/last-successful-tag"
    printf '%s\n' "$PREVIOUS_TAG" > "$STATE_DIR/previous-tag"
    echo "Deployment $TAG is healthy."
    exit 0
  fi
  sleep 2
done

echo "Deployment health check failed. Run rollback.sh to restore the previous tag."
exit 1
