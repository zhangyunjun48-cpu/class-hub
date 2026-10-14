#!/usr/bin/env bash
#
# 单机正式版上线：Caddy（域名 + 自动 HTTPS）+ API + PostgreSQL 容器。
#
# 用法（在解压后的发布目录里执行）：
#   首次：sudo APP_DOMAIN=<your-domain> ACME_EMAIL=you@qq.com bash deploy/scripts/deploy-prod-single.sh
#   之后：sudo bash deploy/scripts/deploy-prod-single.sh
#
# 前置条件：
#   1. 域名 A 记录已指向本机公网 IP
#   2. 腾讯云安全组已放行 80 和 443
#   3. 前端已在本机用 pack-formal-release.ps1 构建（含备案号）
#
# 幂等：已存在的环境文件不会被覆盖；密钥不会重新生成；前端每次生成新目录并备份旧目录。

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/class-hub/.env}"
WEB_ROOT_DEFAULT="/opt/class-hub/web"
BACKUP_DIR="${BACKUP_DIR:-/opt/class-hub/backups/postgres}"
COMPOSE_FILE="deploy/compose.prod-single.yaml"
TRIAL_COMPOSE_FILE="deploy/compose.trial.yaml"
TRIAL_ENV_FILE="${TRIAL_ENV_FILE:-/opt/class-hub/.env.trial}"
RELEASE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

log()  { printf '\033[36m==> %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m    %s\033[0m\n' "$*"; }
warn() { printf '\033[33m[!] %s\033[0m\n' "$*"; }
die()  { printf '\033[31m[XX] %s\033[0m\n' "$*" >&2; exit 1; }

env_get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r' ; }
rand_secret() { openssl rand -base64 48 | tr -d '\n=' ; }

set_env_var() {
  local key="$1" value="$2" current
  if grep -qE "^${key}=" "$ENV_FILE"; then
    current="$(env_get "$key")"
    if [[ -n "$current" ]]; then ok "$key 已存在，保持不变"; return 0; fi
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    ok "$key 已补写"
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    ok "$key 已新增"
  fi
}

log "1/8 预检"
command -v docker >/dev/null 2>&1 || die "未安装 docker"
docker compose version >/dev/null 2>&1 || die "docker compose v2 不可用（当前用户需要 sudo 或在 docker 组里）"
cd "$RELEASE_ROOT"
[[ -f "$COMPOSE_FILE" ]] || die "缺少 $COMPOSE_FILE"
[[ -f deploy/caddy/Caddyfile.prod ]] || die "缺少 deploy/caddy/Caddyfile.prod"
[[ -f dist/index.html ]] || die "缺少 dist/index.html（请先在本机 pack-formal-release.ps1 构建并上传）"
[[ -f server/package-lock.json ]] || die "缺少 server/package-lock.json"
[[ -f server/migrations/0002_formal_v1.sql ]] || die "缺少 0002_formal_v1.sql"

log "2/8 准备环境文件 $ENV_FILE"
if [[ ! -f "$ENV_FILE" ]]; then
  DOMAIN="${APP_DOMAIN:-}"
  MAIL="${ACME_EMAIL:-}"
  [[ -n "$DOMAIN" ]] || die "首次部署请指定域名： sudo APP_DOMAIN=<your-domain> ACME_EMAIL=you@qq.com bash $0"
  [[ -n "$MAIL" ]] || die "首次部署请指定证书邮箱： sudo APP_DOMAIN=<your-domain> ACME_EMAIL=you@qq.com bash $0"
  DB_PASS="$(openssl rand -hex 24)"
  umask 077
  cat > "$ENV_FILE" <<EOF
APP_DOMAIN=${DOMAIN}
ACME_EMAIL=${MAIL}
WEB_ROOT=${WEB_ROOT_DEFAULT}
LOG_LEVEL=info
DEPLOY_VERSION=prod-${STAMP}
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
POSTGRES_USER=classhub
POSTGRES_PASSWORD=${DB_PASS}
POSTGRES_DB=classhub_prod
DATABASE_URL=postgresql://classhub:${DB_PASS}@postgres:5432/classhub_prod
AUTH_SECRET=$(rand_secret)
STUDENT_ID_HMAC_KEY=$(rand_secret)
CLASS_ACTIVATION_CODE=$(rand_secret | cut -c1-16)
FALLBACK_OWNER_ID=2021999
FALLBACK_OWNER_NAME=测试兜底管理员
FALLBACK_OWNER_KEY=$(rand_secret | cut -c1-32)
SESSION_DAYS=30
ADMIN_REAUTH_MINUTES=15
EOF
  chmod 600 "$ENV_FILE"
  ok "已生成 $ENV_FILE（含随机数据库密码与密钥）"
else
  ok "已存在，保持不变"
  set_env_var WEB_ROOT "$WEB_ROOT_DEFAULT"
  sed -i "s|^DEPLOY_VERSION=.*|DEPLOY_VERSION=prod-${STAMP}|" "$ENV_FILE" 2>/dev/null || true
fi

DOMAIN="$(env_get APP_DOMAIN)"
MAIL="$(env_get ACME_EMAIL)"
[[ -n "$DOMAIN" ]] || die "$ENV_FILE 里没有 APP_DOMAIN"
[[ -n "$MAIL" ]] || die "$ENV_FILE 里没有 ACME_EMAIL"

# Let's Encrypt / ZeroSSL 只接受 ASCII 邮箱，中文占位符会被直接拒收（invalidContact）。
if ! printf '%s' "$MAIL" | grep -qE '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'; then
  die "ACME_EMAIL 不是有效的 ASCII 邮箱：$MAIL
    证书颁发机构会拒绝非 ASCII 邮箱（例如「你的邮箱@qq.com」这种中文占位符）。
    修复步骤：
      1) sudo sed -i 's|^ACME_EMAIL=.*|ACME_EMAIL=你的真实邮箱|' $ENV_FILE
      2) cd $RELEASE_ROOT && sudo docker compose --env-file $ENV_FILE -f $COMPOSE_FILE up -d --force-recreate caddy
      3) sudo docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs --tail=40 caddy"
fi
WEB_ROOT="$(env_get WEB_ROOT)"; WEB_ROOT="${WEB_ROOT:-$WEB_ROOT_DEFAULT}"

log "3/8 检查域名解析"
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -n1 || true)"
PUBLIC_IP="$(curl -fsS --max-time 8 https://api.ipify.org 2>/dev/null || true)"
if [[ -n "$RESOLVED" ]]; then
  ok "$DOMAIN -> $RESOLVED"
else
  warn "$DOMAIN 还解析不出地址：请先在 DNSPod 添加 A 记录指向本机公网 IP"
fi
if [[ -n "$PUBLIC_IP" ]]; then ok "本机公网出口 $PUBLIC_IP"; fi
warn "请确认腾讯云安全组已放行 80 和 443（Caddy 申请证书必须能通过 80 端口验证）"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

log "4/8 退役试运行栈（腾出 80 端口）"
if docker ps -a --format '{{.Names}}' | grep -qE '^class-hub-trial-'; then
  install -d -m 0700 "$BACKUP_DIR"
  if [[ -f "$TRIAL_ENV_FILE" && -f "$TRIAL_COMPOSE_FILE" ]] && docker ps --format '{{.Names}}' | grep -qE '^class-hub-trial-postgres'; then
    TRIAL_DUMP="$BACKUP_DIR/trial-before-prod-${STAMP}.dump"
    if docker compose --env-file "$TRIAL_ENV_FILE" -f "$TRIAL_COMPOSE_FILE" exec -T postgres \
         sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > "$TRIAL_DUMP" 2>/dev/null; then
      sha256sum "$TRIAL_DUMP" > "$TRIAL_DUMP.sha256"
      ok "试运行数据库已备份：$TRIAL_DUMP"
    else
      rm -f "$TRIAL_DUMP"
      warn "试运行数据库备份失败，已跳过（数据卷仍保留）"
    fi
  fi
  docker rm -f $(docker ps -aq --filter 'name=^class-hub-trial-') >/dev/null
  ok "试运行容器已移除（数据卷 class-hub-trial_postgres_data 保留，可随时回退）"
else
  ok "没有正在运行的试运行栈"
fi

log "5/8 构建 API 镜像"
"${COMPOSE[@]}" build api

log "6/8 启动数据库并执行迁移"
"${COMPOSE[@]}" up -d postgres
PG_USER="$(env_get POSTGRES_USER)"; PG_DB="$(env_get POSTGRES_DB)"
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T postgres pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then ok "PostgreSQL 就绪"; break; fi
  sleep 2
done
"${COMPOSE[@]}" run --rm api node dist/server/src/db/migrate.js
ok "迁移完成（正式库是空的，不会带入任何试运行数据）"

log "7/8 发布前端静态文件"
install -d -m 0755 "$WEB_ROOT"
NEW_DIR="$WEB_ROOT/current.new"
rm -rf "$NEW_DIR"; mkdir -p "$NEW_DIR"; cp -a dist/. "$NEW_DIR/"
PREVIOUS_TARGET=""
if [[ -e "$WEB_ROOT/current" || -L "$WEB_ROOT/current" ]]; then
  PREVIOUS_TARGET="$WEB_ROOT/current.legacy-$STAMP"
  rm -rf "$PREVIOUS_TARGET"; mv "$WEB_ROOT/current" "$PREVIOUS_TARGET"
fi
mv "$NEW_DIR" "$WEB_ROOT/current"
ok "前端已发布到 $WEB_ROOT/current"
if [[ -n "$PREVIOUS_TARGET" ]]; then ok "上一版本备份 $PREVIOUS_TARGET"; fi

log "8/8 启动服务并申请证书"
"${COMPOSE[@]}" up -d
"${COMPOSE[@]}" restart caddy >/dev/null 2>&1 || true

for _ in $(seq 1 60); do
  if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then break; fi
  sleep 3
done

echo
echo "http  -> $(curl -sS -o /dev/null -w '%{http_code}' "http://$DOMAIN/api/health" 2>/dev/null)"
echo "https -> $(curl -sS -o /tmp/h.json -w '%{http_code}' "https://$DOMAIN/api/health" 2>/dev/null) $(cat /tmp/h.json 2>/dev/null)"
echo "首页  -> $(curl -sS -o /tmp/i.html -w '%{http_code}' "https://$DOMAIN/" 2>/dev/null)"
echo

if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then
  ok "HTTPS 正常"
else
  warn "HTTPS 还没通。常见原因："
  warn "  1) DNS 尚未生效（用 dig $DOMAIN 检查是否指向本机公网 IP）"
  warn "  2) 安全组没放行 80/443（申请证书必须能通过 80 验证）"
  warn "  3) 别的进程占用 80： sudo ss -lntp | grep :80"
  warn "Caddy 最近一次证书相关日志："
  "${COMPOSE[@]}" logs --tail=200 caddy 2>/dev/null | grep -E '"logger":"tls|acme|certificate' | tail -n 4 | sed 's/^/    /' || true
  warn "查看完整日志： sudo docker compose --env-file $ENV_FILE -f $COMPOSE_FILE logs --tail=60 caddy"
fi

echo
echo "=================================================================="
echo "  测试用管理员账号"
echo "  学号：$(env_get FALLBACK_OWNER_ID)"
echo "  姓名：$(env_get FALLBACK_OWNER_NAME)"
echo "  激活码/恢复密钥：$(env_get FALLBACK_OWNER_KEY)"
echo "  普通成员激活码：$(env_get CLASS_ACTIVATION_CODE)"
echo "  网址：https://$DOMAIN/"
echo "=================================================================="
echo

if [[ -f deploy/scripts/smoke-formal.sh && "${SKIP_SMOKE:-0}" != "1" ]]; then
  log "附加：端到端自检（走 https 域名）"
  if BASE="https://$DOMAIN" ENV_FILE="$ENV_FILE" COMPOSE_FILE="$COMPOSE_FILE" bash deploy/scripts/smoke-formal.sh; then
    ok "端到端自检通过"
  else
    warn "端到端自检有失败项，请把输出发给 Codex"
  fi
fi

echo
echo "备份（建议加入 cron 每日执行）："
echo "  sudo docker compose --env-file $ENV_FILE -f $COMPOSE_FILE exec -T postgres sh -c 'PGPASSWORD=\$POSTGRES_PASSWORD pg_dump -U \$POSTGRES_USER -d \$POSTGRES_DB --format=custom' > /opt/class-hub/backups/postgres/classhub_prod_\$(date +%F).dump"
echo "回退前端："
echo "  rm -rf '$WEB_ROOT/current.broken' && mv '$WEB_ROOT/current' '$WEB_ROOT/current.broken' && mv '$PREVIOUS_TARGET' '$WEB_ROOT/current' && docker compose --env-file '$ENV_FILE' -f $COMPOSE_FILE restart caddy"