# API 服务

Node.js 24 + Fastify + Drizzle ORM + PostgreSQL。

## 环境

```powershell
Copy-Item server/.env.example server/.env
```

最少需要填写：

```dotenv
DATABASE_URL=postgresql://...
APP_ORIGIN=http://127.0.0.1:5173
AUTH_SECRET=<openssl rand -base64 48>
STUDENT_ID_HMAC_KEY=<openssl rand -base64 48>
CLASS_ACTIVATION_CODE=<只发给本班同学>
COOKIE_SECURE=false            # 生产 HTTPS 必须为 true
```

`NODE_ENV=production` 时会强制要求 `AUTH_SECRET`、`STUDENT_ID_HMAC_KEY`、`CLASS_ACTIVATION_CODE`。

可选：`FALLBACK_OWNER_ID` / `FALLBACK_OWNER_NAME` / `FALLBACK_OWNER_KEY` 用来初始化系统兜底 Owner（第一个管理员）。

## 开发

```powershell
npm --prefix server install
npm --prefix server run dev
```

## 迁移

```powershell
npm --prefix server run build
npm --prefix server run db:migrate
```

`server/migrations/0002_formal_v1.sql` 创建正式版全部业务表，并写入 4 条官方资料外链。

## 测试

```powershell
npm --prefix server test
```

覆盖：学号 HMAC / 末四位掩码、激活挑战签名、Cookie 序列化、管理员 PIN scrypt、名单 CSV 解析（含重复学号）、日程权限策略（普通 vs 重要、版本冲突）、健康检查与版本接口脱敏。

## 接口

公开（无需登录）：

```text
GET  /api/public/resources
GET  /api/public/tutorial
GET  /api/health
GET  /api/version
```

身份：

```text
POST /api/auth/login           学号 + 姓名 → 激活挑战
POST /api/auth/activate        激活码 → 会话 Cookie
POST /api/auth/logout
GET  /api/me
POST /api/me/onboarding-seen
POST /api/auth/admin-reauth    管理员 PIN / 新 PIN / 恢复密钥
```

日程与内容（需登录）：

```text
GET    /api/sync?since=<ISO>   增量同步（日程、公告、变更、本人完成、统计）
GET    /api/schedules
POST   /api/schedules
PATCH  /api/schedules/:id      乐观锁，版本不一致返回 409 + 最新数据
DELETE /api/schedules/:id      仅管理员，软删除
POST   /api/schedules/:id/restore
GET    /api/schedules/trash    仅管理员
PUT    /api/schedules/:id/completion
GET    /api/resources
POST   /api/feedback
GET    /api/feedback/mine
```

管理（需管理员 + 最近验证过 PIN）：

```text
POST   /api/admin/roster/preview
POST   /api/admin/roster/commit
GET    /api/admin/members
PATCH  /api/admin/members/:id
POST   /api/announcements
DELETE /api/announcements/:id
POST   /api/resources  PATCH /api/resources/:id  DELETE /api/resources/:id
GET    /api/feedback   PATCH /api/feedback/:id
GET    /api/audit
POST   /api/audit/:id/revert
```

## 课表接口

登录成员：

```text
GET /api/timetable?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>   已按周次展开的课程实例
```

管理员（需最近验证过 PIN）：

```text
POST   /api/admin/timetable/preview        解析课表 CSV，返回课程行、警告与「今天第几周」自检
POST   /api/admin/timetable/commit         事务性替换学期与课程模板
PATCH  /api/admin/timetable/semester       改学期名称 / 起始日 / 节次时间
POST   /api/admin/timetable/exceptions     登记停课(cancel) / 调课(move) / 补课(add)
PATCH  /api/admin/timetable/exceptions/:id
DELETE /api/admin/timetable/exceptions/:id
GET    /api/admin/timetable/templates      查看当前学期全部模板与例外
```

`/api/sync` 会带上 `timetable` 片段：`{version, semester:{name,startDate,currentWeek}, today, next, upcoming, changes}`。
课表相关写入会记进 `revisions`（`entity_type='timetable'`），但 `/api/sync` 的变更列表会排除它们。

课程实例**不落库**，由 `server/src/lib/timetable.ts` 按 `weeks` + `period` + 学期起始日实时推导；`server/src/lib/timetable-csv.ts` 负责解析教务导出的网格 CSV（支持一格多课、整天课、无周次兜底）。
## 安全要点

- 所有响应带 `X-Robots-Tag: noindex, nofollow`
- 写请求校验 `Origin`（与 `APP_ORIGIN` / `ALLOWED_ORIGINS` 匹配）
- 登录失败按 IP（20 次 / 15 分钟）与学号（10 次 / 15 分钟）双维度限流，激活码错误同样计入
- 管理员 PIN 连续 5 次失败锁定 15 分钟
- 日志只记录 `requestId` 与通用错误名，不写学号、激活码、PIN、Cookie 或请求体
- 数据库连接失败时 `/api/health` 返回脱敏的 503

## 本机连接 Staging

推荐只连 API，不直连数据库：

```dotenv
VITE_DATA_MODE=remote
VITE_API_TARGET=https://staging.<your-domain>
```

如果临时开放数据库公网白名单，调试完成后立即移除。