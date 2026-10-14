#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="${STATE_DIR:-/opt/class-hub/state}"
TAG="${1:-$(cat "$STATE_DIR/previous-tag" 2>/dev/null || true)}"

if [[ -z "$TAG" ]]; then
  echo "No previous tag is available."
  exit 1
fi

echo "Rolling back to $TAG"
exec "$SCRIPT_DIR/deploy.sh" "$TAG"