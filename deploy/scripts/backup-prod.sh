#!/usr/bin/env bash
#
# 正式版数据库备份（供 cron 调用）
#
#   sudo bash deploy/scripts/backup-prod.sh
#
# cron 示例（每天 03:30）：
#   30 3 * * * /bin/bash /opt/class-hub/release/deploy/scripts/backup-prod.sh >> /opt/class-hub/backups/backup.log 2>&1
#
# 默认保留最近 14 个备份，其余自动删除。

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/class-hub/.env}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/class-hub/release/deploy/compose.prod-single.yaml}"
COMPOSE_DIR="${COMPOSE_DIR:-/opt/class-hub/release}"
BACKUP_DIR="${BACKUP_DIR:-/opt/class-hub/backups/postgres}"
KEEP="${KEEP:-14}"

mkdir -p "$BACKUP_DIR"
cd "$COMPOSE_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/classhub_prod_${STAMP}.dump"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$FILE"

if [[ ! -s "$FILE" ]]; then
  echo "备份文件为空，删除：$FILE" >&2
  rm -f "$FILE"
  exit 1
fi

sha256sum "$FILE" > "$FILE.sha256"
chmod 600 "$FILE" "$FILE.sha256"
echo "备份完成：$FILE（$(du -h "$FILE" | cut -f1)）"

# 只保留最近 N 个
ls -1t "$BACKUP_DIR"/classhub_prod_*.dump 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  rm -f "$old" "$old.sha256"
  echo "已删除旧备份：$old"
done