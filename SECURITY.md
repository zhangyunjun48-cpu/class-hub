# 安全策略

## 报告漏洞

请**不要**开公开 issue。通过 GitHub 的「Security → Report a vulnerability」私下报告，或直接联系仓库作者。

请在报告里说明：影响版本、复现步骤、影响范围（能否越权读写他人数据）。

## 部署者须知

- 生产环境必须使用 HTTPS，并把 `COOKIE_SECURE` 设为 `true`（默认已开启）。
- `AUTH_SECRET`、`STUDENT_ID_HMAC_KEY`、`CLASS_ACTIVATION_CODE` 必须是随机强值；缺失时 Compose 会拒绝启动。
- **`STUDENT_ID_HMAC_KEY` 一旦导入真实名单就不能再改**，否则全部学号 HMAC 失配、所有人都无法登录。
- 数据库不要暴露公网；只允许应用所在内网访问。
- 请配置每日备份（`deploy/scripts/backup-prod.sh` 已内置保留策略）。

## 已知的边界

- 本项目是班级内部工具，未实现多租户、学校统一身份认证、双因素认证。
- 管理员使用共享 PIN + 会话有效期（默认 15 分钟）而非独立账号体系；请只把 PIN 交给班委。
- 导入的名单属于个人信息，请仅在获得同学知晓与同意的前提下使用，并遵守当地法规（如 PIPL）。