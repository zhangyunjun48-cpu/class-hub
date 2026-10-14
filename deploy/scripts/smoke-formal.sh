#!/usr/bin/env bash
#
# 正式版接口端到端自检：浏览器 → Caddy(:80) → Fastify → PostgreSQL
#
# 用法（在发布目录里执行）：
#   sudo bash deploy/scripts/smoke-formal.sh
#
# 会临时创建 2 个虚构成员（group=自检）和 2 条「自检-」日程，结束后自动清理。
# 全程只用虚构数据，不会写入真实学号或姓名。

set -uo pipefail

BASE="${BASE:-http://127.0.0.1}"
ENV_FILE="${ENV_FILE:-/opt/class-hub/.env.trial}"
COMPOSE_FILE="${COMPOSE_FILE:-deploy/compose.trial.yaml}"

TMP="$(mktemp -d)"
JAR="$TMP/owner.txt"
MEMBER_JAR="$TMP/member.txt"
BODY_FILE="$TMP/body.json"
DATA_FILE="$TMP/request.json"
PASS=0
FAIL=0

trap 'rm -rf "$TMP"' EXIT

env_get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- | tr -d '\r' ; }
have()    { command -v "$1" >/dev/null 2>&1; }

if ! have jq; then
  echo "[XX] 需要 jq：sudo apt-get install -y jq"
  exit 1
fi

OWNER_ID="$(env_get FALLBACK_OWNER_ID)"
OWNER_NAME="$(env_get FALLBACK_OWNER_NAME)"
OWNER_KEY="$(env_get FALLBACK_OWNER_KEY)"
MEMBER_CODE="$(env_get CLASS_ACTIVATION_CODE)"

if [[ -z "$OWNER_ID" || -z "$OWNER_NAME" || -z "$OWNER_KEY" || -z "$MEMBER_CODE" ]]; then
  echo "[XX] $ENV_FILE 缺少 FALLBACK_OWNER_* 或 CLASS_ACTIVATION_CODE，请先运行 deploy-formal-trial.sh"
  exit 1
fi

HTTP_CODE=""
BODY=""

req() {
  if [[ $# -gt 4 ]]; then
    printf '[XX] req 参数过多：%s %s（最多 4 个参数：METHOD PATH DATA JAR）\n' "$1" "$2" >&2
    exit 1
  fi
  local method="$1" path="$2" data="${3:-}" jar="${4:-$JAR}"
  local args=(-sS -o "$BODY_FILE" -w '%{http_code}' -X "$method" -b "$jar" -c "$jar")
  # 请求体写入临时文件后再用 --data-binary @file：
  # 避免非 ASCII（中日韩姓名）经过命令行参数时被重新编码，也避免引号转义问题。
  if [[ -n "$data" ]]; then
    printf '%s' "$data" > "$DATA_FILE"
    args+=(-H 'Content-Type: application/json' --data-binary "@$DATA_FILE")
  fi
  args+=("$BASE$path")
  HTTP_CODE="$(curl "${args[@]}")"
  BODY="$(cat "$BODY_FILE")"
}

check() {
  local name="$1" expected="$2"
  if [[ "$HTTP_CODE" == "$expected" ]]; then
    PASS=$((PASS + 1))
    printf '   [PASS] %s (HTTP %s)\n' "$name" "$HTTP_CODE"
  else
    FAIL=$((FAIL + 1))
    printf '   [FAIL] %s 期望 HTTP %s，实际 %s\n          %s\n' "$name" "$expected" "$HTTP_CODE" "${BODY:0:240}"
  fi
}

check_contains() {
  local name="$1" needle="$2"
  if printf '%s' "$BODY" | grep -qF -- "$needle"; then
    PASS=$((PASS + 1))
    printf '   [PASS] %s\n' "$name"
  else
    FAIL=$((FAIL + 1))
    printf '   [FAIL] %s 未包含「%s」\n          %s\n' "$name" "$needle" "${BODY:0:240}"
  fi
}

section() { printf '\n\033[36m-- %s\033[0m\n' "$*"; }

section "0. 游客边界"
req GET /api/public/resources; check "游客可读公共资料" 200
req GET /api/public/tutorial;  check "游客可读图文教程" 200
req GET /api/schedules;        check "游客不能读日程" 401
req GET /api/sync;             check "游客不能读同步数据" 401
req GET /api/me;               check "游客没有会话" 401

section "1. 系统兜底 Owner 登录"
req POST /api/auth/login "{\"studentId\":\"$OWNER_ID\",\"name\":\"$OWNER_NAME\"}"
check "白名单匹配（学号 + 姓名）" 200
CHALLENGE="$(printf '%s' "$BODY" | jq -r '.challengeToken // empty')"
if [[ -z "$CHALLENGE" ]]; then
  echo "[XX] 未取得 challengeToken，终止自检"
  exit 1
fi
req POST /api/auth/activate "{\"challengeToken\":\"$CHALLENGE\",\"activationCode\":\"$OWNER_KEY\"}"
check "恢复密钥激活成功" 200
req GET /api/me
check "会话可用" 200
check_contains "身份为系统兜底 Owner" '"isSystemOwner":true'

section "2. 管理员 PIN 重验（恢复密钥）"
req POST /api/auth/admin-reauth "{\"recoveryKey\":\"$OWNER_KEY\"}"
check "敏感操作重验" 200

section "3. 名单导入（虚构数据）"
req POST /api/admin/roster/preview '{"csv":"student_id,name,group,initial_role,active\n2021001,测试同学,自检,member,true\n2021002,测试班委,自检,admin,true\n2021001,重复行,自检,member,true"}'
check "名单预览" 200
check_contains "重复学号被识别" "学号重复"
req POST /api/admin/roster/commit '{"rows":[{"studentId":"2021001","name":"测试同学","group":"自检","initialRole":"member","active":true},{"studentId":"2021002","name":"测试班委","group":"自检","initialRole":"admin","active":true}]}'
check "名单入库" 200
req GET /api/admin/members
check "成员列表" 200

section "4. 日程写入与并发冲突"
req POST /api/schedules '{"title":"自检-重要日程","category":"exam","importance":"important","dueAt":"2026-12-01T10:00:00.000Z","location":"自检"}'
check "管理员创建重要日程" 200
IMPORTANT_ID="$(printf '%s' "$BODY" | jq -r '.id // empty')"

req POST /api/schedules '{"title":"自检-普通日程","category":"task","importance":"normal","dueAt":"2026-12-02T10:00:00.000Z"}'
check "创建普通日程" 200
NORMAL_ID="$(printf '%s' "$BODY" | jq -r '.id // empty')"
NORMAL_VERSION="$(printf '%s' "$BODY" | jq -r '.version // 1')"

req PATCH "/api/schedules/$NORMAL_ID" "{\"title\":\"自检-普通日程（已改）\",\"category\":\"task\",\"importance\":\"normal\",\"dueAt\":\"2026-12-02T10:00:00.000Z\",\"version\":$NORMAL_VERSION}"
check "按版本号正常修改" 200

req PATCH "/api/schedules/$NORMAL_ID" "{\"title\":\"自检-过期覆盖\",\"category\":\"task\",\"importance\":\"normal\",\"dueAt\":\"2026-12-02T10:00:00.000Z\",\"version\":$NORMAL_VERSION}"
check "过期版本被拒绝（不静默覆盖）" 409
check_contains "冲突响应带最新数据" '"version":2'

req GET /api/sync
check "同步接口" 200
check_contains "同步包含重要日程" "自检-重要日程"

section "5. 普通成员权限"
req POST /api/auth/login '{"studentId":"2021001","name":"测试同学"}' "$MEMBER_JAR"
check "成员白名单匹配" 200
MEMBER_CHALLENGE="$(printf '%s' "$BODY" | jq -r '.challengeToken // empty')"
req POST /api/auth/activate "{\"challengeToken\":\"$MEMBER_CHALLENGE\",\"activationCode\":\"$MEMBER_CODE\"}" "$MEMBER_JAR"
check "班级激活码激活" 200
req GET /api/me "" "$MEMBER_JAR"
check "成员会话" 200
check_contains "身份为普通成员" '"role":"member"'
req POST /api/schedules '{"title":"自检-越权重要","category":"task","importance":"important","dueAt":"2026-12-03T10:00:00.000Z"}' "$MEMBER_JAR"
check "成员不能创建重要日程" 403
req PATCH "/api/schedules/$IMPORTANT_ID" '{"title":"自检-越权修改","category":"exam","importance":"important","dueAt":"2026-12-01T10:00:00.000Z","version":1}' "$MEMBER_JAR"
check "成员不能修改重要日程" 403
req DELETE "/api/schedules/$NORMAL_ID" '{"version":2}' "$MEMBER_JAR"
check "成员不能删除日程" 403

section "6. 反馈（成员只看自己的）"
req POST /api/feedback '{"category":"功能建议","content":"自检：确认反馈链路可用"}' "$MEMBER_JAR"
check "成员提交反馈" 200
req GET /api/feedback/mine "" "$MEMBER_JAR"
check "成员可读自己的反馈" 200
req GET /api/feedback "" "$MEMBER_JAR"
check "成员不能读全部反馈" 403
req GET /api/feedback
check "管理员可读全部反馈" 200

section "7. 清理自检数据"
cat > "$TMP/cleanup.sql" <<'SQL'
DELETE FROM schedule_completions WHERE schedule_id IN (SELECT id FROM schedules WHERE title LIKE '自检-%');
DELETE FROM revisions WHERE entity_id IN (SELECT id FROM schedules WHERE title LIKE '自检-%');
DELETE FROM schedules WHERE title LIKE '自检-%';
DELETE FROM feedback WHERE member_id IN (SELECT id FROM members WHERE group_name = '自检');
DELETE FROM members WHERE group_name = '自检';
SQL
if docker ps --format '{{.Names}}' | grep -qE '(^|-)postgres-1$'; then
  if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
       sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q' < "$TMP/cleanup.sql"; then
    printf '   自检数据已清理（虚构成员 group=自检 已删除）\n'
  else
    printf '   [!] 清理失败，可手动执行：docker compose --env-file %s -f %s exec -T postgres psql -U %s -d %s\n' "$ENV_FILE" "$COMPOSE_FILE" "$(env_get POSTGRES_USER)" "$(env_get POSTGRES_DB)"
  fi
else
  printf '   [!] 未找到 postgres 容器，跳过清理\n'
fi

printf '\n\033[36m==> 自检结果：通过 %s 项，失败 %s 项\033[0m\n' "$PASS" "$FAIL"
if [[ "$FAIL" -ne 0 ]]; then
  exit 1
fi