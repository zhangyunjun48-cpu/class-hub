# 贡献指南

## 本地开发

```bash
npm ci
npm run dev:demo        # 离线演示版，全部功能可点（推荐先用它熟悉产品）
```

需要连后端时：

```bash
npm --prefix server ci
Copy-Item server/.env.example server/.env   # 填 DATABASE_URL 等
npm --prefix server run db:migrate
npm --prefix server run dev                 # http://127.0.0.1:3000
# 另一个终端：
$env:VITE_DATA_MODE="remote"; $env:VITE_API_TARGET="http://127.0.0.1:3000"; npm run dev
```

## 提交前必须通过

```bash
npm run test:demo        # 前端数据层单测
npm run build            # 前端构建
npm --prefix server test # 后端构建 + 单测（43 项，不需要数据库）
npm run audit:public     # 敏感信息门禁
```

CI 会跑同样四条，PR 必须全绿。

## 约定

- 不改动已应用的迁移文件（`server/migrations/0001`–`0005`）：迁移器会校验 checksum，改动会让已部署实例启动失败；需要变更就新增一个迁移文件。
- 前后端共用类型放 `shared/`。
- 所有日期在数据库里用 UTC 存，界面统一按 `Asia/Shanghai` 显示。
- 登录态、限流、权限判断一律在服务端做，前端只做展示。
- 不要提交任何真实姓名、学号、邮箱、服务器地址或密钥；`audit:public` 会拦。