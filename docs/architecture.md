# 架构说明

## 分层

```text
浏览器 ──同源 /api──▶ Caddy ──▶ Fastify ──▶ PostgreSQL
   │                    │
   └── 静态文件（SPA）───┘
```

- **前端**：单页应用（React + Vite），两种数据模式：
  - `VITE_DATA_MODE=mock`：内置演示仓库，数据在 `localStorage`，靠 `BroadcastChannel` 在多个标签间同步，**不需要后端**；
  - `VITE_DATA_MODE=remote`：通过同源 `/api` 访问后端，15 秒增量轮询（页面隐藏时暂停，失败指数退避并保留最后一次成功的数据）。
- **后端**：Fastify 路由分四组——身份（`/api/auth/*`、`/api/me`）、日程与同步（`/api/schedules*`、`/api/sync`）、内容（公告/资料/反馈/教程）、管理（`/api/admin/*`、`/api/audit`）。
- **数据库**：PostgreSQL，迁移文件放 `server/migrations/`，启动前由迁移器按文件名顺序执行并记录 checksum（**已应用的迁移不可修改**）。

## 身份与权限

| 能力 | 游客 | 成员 | 管理员 | 系统兜底管理员 |
| --- | --- | --- | --- | --- |
| 登录说明 / 公共资料 / 图文教程 | ✅ | ✅ | ✅ | ✅ |
| 查看日程、公告、成员 | ❌ | ✅ | ✅ | ✅ |
| 新增/修改**普通**日程、标记自己完成、提反馈 | ❌ | ✅ | ✅ | ✅ |
| 修改**重要**日程、发公告、删除/恢复、成员管理、导入名单、看审计 | ❌ | ❌ | 需最近验证 PIN | ✅（免 PIN） |

- 登录：学号 + 姓名（对照白名单）→ 班级激活码 → 会话 Cookie（HttpOnly / SameSite=Lax，30 天滑动）。
- 学号只保存 `HMAC-SHA256` 与末四位掩码；`STUDENT_ID_HMAC_KEY` 决定学号的匹配值，**导入真实名单后不可更换**。
- 管理员另有独立 PIN（scrypt 加盐），敏感操作要求最近 15 分钟（可配）内验证过；连续错 5 次锁定 15 分钟。
- 系统兜底管理员由服务器环境变量初始化，不可删除、禁用或降级，用于管理员 PIN 丢失时救急。

## 数据模型

| 表 | 用途 |
| --- | --- |
| `members` / `sessions` / `admin_credentials` | 白名单成员、会话、管理员 PIN |
| `schedules` / `schedule_completions` | 日程（含 `importance`、`version`、软删除）与个人完成标记 |
| `semesters` / `course_templates` / `course_exceptions` | 学期、课程模板、停课/调课/补课；课程实例按周次实时推导，不落库 |
| `announcements` / `resources` / `feedback` | 公告、资料外链、反馈 |
| `revisions` / `roster_imports` / `auth_attempts` | 变更审计、导入记录、登录限流 |

## 关键约定

- 时间：数据库统一 UTC；界面统一按 `Asia/Shanghai` 显示；"上课时间"的节次表可由管理员在学期设置里调整。
- 冲突：所有日程编辑带 `version`，不一致返回 `409` 并附最新数据，前端提示"载入最新内容"。
- 脱敏：错误响应只返回 `code` + `requestId`，原因只写服务端日志；日志不记录请求体、Cookie、学号、激活码、PIN。
- 搜索引擎：全站 `noindex, nofollow`。