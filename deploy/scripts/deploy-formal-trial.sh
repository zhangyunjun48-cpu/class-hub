#!/usr/bin/env bash
#
# 把“正式版”部署到腾讯云试运行环境（单机 compose.trial.yaml）。
#
# 用法（在解压后的发布目录里执行）：
#   cd /opt/class-hub/release && sudo bash deploy/scripts/deploy-formal-trial.sh
#
# 做四件事：
#   1. 备份现有 PostgreSQL
#   2. 补齐 AUTH_SECRET / STUDENT_ID_HMAC_KEY / CLASS_ACTIVATION_CODE 等正式版变量
#   3. 重建 API 镜像、执行迁移、发布前端静态文件、重启服务
#   4. 健康检查 + 可选的端到端自检
#
# 幂等：重复执行不会重复生成密钥（已有值保持不变），前端每次生成新 release 目录。

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/class-hub/.env.trial}"
WEB_ROOT_DEFAULT="/opt/class-hub/web"
BACKUP_DIR="${BACKUP_DIR:-/opt/class-hub/backups/postgres}"
COMPOSE_FILE="deploy/compose.trial.yaml"
RELEASE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

log()  { printf '\033[36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m    %s\033[0m\n' "$*"; }
warn() { printf '\033[33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[31m[XX] %s\033[0m\n' "$*" >&2; exit 1; }

env_get() { grep -E "^$1=" "$ENV_FILE" | head -n1 | cut -d= -f2- | tr -d '\r' ; }
rand_secret() { openssl rand -base64 48 | tr -d '\n=' ; }

set_env_var() {
  local key="$1" value="$2" current
  if grep -qE "^${key}=" "$ENV_FILE"; then
    current="$(env_get "$key")"
    if [[ -n "$current" ]]; then
      ok "$key 已存在，保持不变"
      return 0
    fi
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    ok "$key 已补写"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    ok "$key 已新增"
  fi
}

log "1/8 预检"
command -v docker >/dev/null 2>&1 || die "未安装 docker"
docker compose version >/dev/null 2>&1 || die "docker compose v2 不可用（当前用户需要在 docker 组里）"
[[ -f "$ENV_FILE" ]] || die "缺少环境文件 $ENV_FILE"
cd "$RELEASE_ROOT"
[[ -f "$COMPOSE_FILE" ]] || die "缺少 $COMPOSE_FILE"
[[ -f dist/index.html ]] || die "缺少 dist/index.html（前端未构建）"
[[ -f server/package-lock.json ]] || die "缺少 server/package-lock.json"
[[ -f server/migrations/0002_formal_v1.sql ]] || die "缺少 0002_formal_v1.sql"
WEB_ROOT="$(env_get WEB_ROOT || true)"; WEB_ROOT="${WEB_ROOT:-$WEB_ROOT_DEFAULT}"
ok "发布目录 $RELEASE_ROOT"
ok "环境文件 $ENV_FILE"
ok "静态目录 $WEB_ROOT"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

log "2/8 备份数据库"
if docker ps --format '{{.Names}}' | grep -qE 'class-hub-trial-postgres'; then
  install -d -m 0700 "$BACKUP_DIR"
  BACKUP_FILE="$BACKUP_DIR/classhub_trial_${STAMP}.dump"
  "${COMPOSE[@]}" exec -T postgres sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$BACKUP_FILE"
  sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
  chmod 600 "$BACKUP_FILE" "$BACKUP_FILE.sha256"
  ok "备份 $BACKUP_FILE"
else
  warn "postgres 容器未运行，跳过备份（首次部署正常）"
fi

log "3/8 补齐正式版环境变量"
set_env_var AUTH_SECRET "$(rand_secret)"
set_env_var STUDENT_ID_HMAC_KEY "$(rand_secret)"
set_env_var CLASS_ACTIVATION_CODE "$(rand_secret | cut -c1-16)"
set_env_var FALLBACK_OWNER_ID "2021999"
set_env_var FALLBACK_OWNER_NAME "测试兜底管理员"
set_env_var FALLBACK_OWNER_KEY "$(rand_secret | cut -c1-32)"
set_env_var COOKIE_SECURE "false"
# 允许本机 Vite(5173) 通过代理调用云端 API；生产 HTTPS 后应只保留正式域名。
set_env_var ALLOWED_ORIGINS "http://127.0.0.1:5173,http://localhost:5173"
set_env_var WEB_ROOT "$WEB_ROOT"
chmod 600 "$ENV_FILE"

log "4/8 构建 API 镜像"
"${COMPOSE[@]}" build api

log "5/8 启动数据库并执行迁移"
"${COMPOSE[@]}" up -d postgres
PG_USER="$(env_get POSTGRES_USER)"; PG_DB="$(env_get POSTGRES_DB)"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T postgres pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
    ok "PostgreSQL 就绪"
    break
  fi
  sleep 2
done
"${COMPOSE[@]}" run --rm api node dist/server/src/db/migrate.js
ok "迁移完成"

log "6/8 发布前端静态文件"
# 早期部署里 $WEB_ROOT/current 是真实目录而不是软链接，所以这里不假设它是软链接：
# 统一用「先把旧的改名备份，再把新目录改名上来」，只依赖 mv/cp，行为可预测，
# 也不会出现 mv: cannot overwrite directory 这类错误。
install -d -m 0755 "$WEB_ROOT"
NEW_DIR="$WEB_ROOT/current.new"
rm -rf "$NEW_DIR"
mkdir -p "$NEW_DIR"
cp -a dist/. "$NEW_DIR/"
PREVIOUS_TARGET=""
if [[ -e "$WEB_ROOT/current" || -L "$WEB_ROOT/current" ]]; then
  PREVIOUS_TARGET="$WEB_ROOT/current.legacy-$STAMP"
  rm -rf "$PREVIOUS_TARGET"
  mv "$WEB_ROOT/current" "$PREVIOUS_TARGET"
fi
mv "$NEW_DIR" "$WEB_ROOT/current"
ok "新版本已发布到 $WEB_ROOT/current"
if [[ -n "$PREVIOUS_TARGET" ]]; then ok "上一版本备份 $PREVIOUS_TARGET"; fi

log "7/8 重启服务"
"${COMPOSE[@]}" up -d
"${COMPOSE[@]}" restart caddy >/dev/null 2>&1 || warn "caddy 重启失败，请手动执行 docker compose restart caddy"
ok "容器状态："
"${COMPOSE[@]}" ps

log "8/8 健康检查"
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1/api/health >/dev/null 2>&1; then break; fi
  sleep 2
done
echo "GET /api/health      -> $(curl -sS -o /tmp/h.json -w '%{http_code}' http://127.0.0.1/api/health) $(cat /tmp/h.json)"
echo "GET /api/version     -> $(curl -sS -o /tmp/v.json -w '%{http_code}' http://127.0.0.1/api/version) $(cat /tmp/v.json)"
echo "GET /api/public/...  -> $(curl -sS -o /tmp/r.json -w '%{http_code}' http://127.0.0.1/api/public/resources) $(head -c 160 /tmp/r.json)"
echo "GET /api/me (未登录) -> $(curl -sS -o /tmp/m.json -w '%{http_code}' http://127.0.0.1/api/me) $(cat /tmp/m.json)"
echo "GET / (前端)         -> $(curl -sS -o /tmp/i.html -w '%{http_code}' http://127.0.0.1/) $(grep -o '<title>[^<]*' /tmp/i.html || true)"

echo
echo "=================================================================="
echo "  测试用管理员账号（备案通过前只能用于虚构名单）"
echo "  学号：$(env_get FALLBACK_OWNER_ID)"
echo "  姓名：$(env_get FALLBACK_OWNER_NAME)"
echo "  激活码/恢复密钥：$(env_get FALLBACK_OWNER_KEY)"
echo "  普通成员激活码：$(env_get CLASS_ACTIVATION_CODE)"
echo "=================================================================="
echo

if [[ -f deploy/scripts/smoke-formal.sh && "${SKIP_SMOKE:-0}" != "1" ]]; then
  log "附加：接口端到端自检"
  if bash deploy/scripts/smoke-formal.sh; then
    ok "端到端自检通过"
  else
    warn "端到端自检有失败项，请把上面的输出发给 Codex"
  fi
fi

echo
echo "回滚前端（只回滚静态文件）："
echo "  rm -rf '$WEB_ROOT/current.broken-$STAMP' && mv '$WEB_ROOT/current' '$WEB_ROOT/current.broken-$STAMP' && mv '$PREVIOUS_TARGET' '$WEB_ROOT/current' && docker compose --env-file '$ENV_FILE' -f $COMPOSE_FILE restart caddy"
echo "回滚数据库（谨慎）："
echo "  docker compose --env-file '$ENV_FILE' -f $COMPOSE_FILE exec -T postgres sh -c 'PGPASSWORD=\$POSTGRES_PASSWORD pg_restore -U \$POSTGRES_USER -d \$POSTGRES_DB --clean --if-exists' < '$BACKUP_DIR/classhub_trial_${STAMP}.dump'"