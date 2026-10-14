# 部署手册

## 前置条件

- 一台 2 核 4G 及以上的 Linux 服务器（Ubuntu 24.04 建议），已装 Docker 与 Compose v2；
- 一个已解析到该服务器的域名（大陆服务器需先完成 ICP 备案）；安全组放行 **80 / 443**；
- 本机可选：Node 24（用于构建前端）与 PowerShell 7（Windows 上跑一键脚本）。

## 单机正式版（Caddy 自动 HTTPS + API + PostgreSQL 容器）

```bash
# 1) 服务器初始化（安装 Docker/UFW/Fail2ban、建目录、加 2G Swap）
sudo bash deploy/scripts/bootstrap-server.sh

# 2) 构建前端并上传（本机执行）
npm ci && npm run build
tar -czf work/release.tar.gz dist server shared deploy
scp work/release.tar.gz <你的SSH别名>:/tmp/

# 3) 服务器上解包并首次部署（会自动生成随机密钥与数据库密码）
sudo rm -rf /opt/class-hub/release && sudo mkdir -p /opt/class-hub/release
sudo tar -xzf /tmp/release.tar.gz -C /opt/class-hub/release
cd /opt/class-hub/release
sudo APP_DOMAIN=your-domain.example ACME_EMAIL=you@example.com \
  bash deploy/scripts/deploy-prod-single.sh
```

Windows 上可以一条命令完成"打包 → 上传 → 部署 → 自检"：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/deploy-prod-from-windows.ps1 `
  -Domain your-domain.example -AcmeEmail you@example.com
```

脚本会在 `/opt/class-hub/.env` 生成并保存 `AUTH_SECRET` / `STUDENT_ID_HMAC_KEY` / `CLASS_ACTIVATION_CODE` / 数据库密码，**幂等**：重复执行不会重新生成密钥，也不会覆盖数据。

## 从旧版本迁移（保持现有部署不变）

实例标识已全部参数化。如果你是升级既有部署，**先把下面三个变量写进服务器的 `.env`**，再部署 —— 否则 Compose 项目名变化会新建一个空数据卷：

```dotenv
COMPOSE_PROJECT_NAME=<你原来的项目名>
DEPLOY_ROOT=<你原来的部署目录>
SESSION_COOKIE_NAME=<你原来的 Cookie 名>
```

部署前确认项目名与卷名没变：

```bash
docker compose --env-file /opt/class-hub/.env -f deploy/compose.prod-single.yaml config | grep -E '^name:|postgres_data'
```

## 日常运维

```bash
# 备份（建议加进 cron，默认保留最近 14 份）
sudo bash deploy/scripts/backup-prod.sh
# 30 3 * * * /bin/bash /opt/class-hub/release/deploy/scripts/backup-prod.sh >> /opt/class-hub/backups/backup.log 2>&1

# 端到端自检（走 Caddy → API → PostgreSQL，约 30 项断言）
sudo bash deploy/scripts/smoke-formal.sh

# 回滚到上一版前端（脚本会在部署时打印命令）
ls -1dt /opt/class-hub/web/current* | head
```

## 常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 改了代码但页面还是旧的 | 早期版本注册过 Service Worker。`index.html` 与 `src/main.jsx` 会在启动时注销并清理缓存；仍不行就强刷或改用 `http://localhost:5173` 访问本地开发服务器 |
| `cd /opt/... Permission denied` | 该目录属于当初执行 bootstrap 的用户；用 `sudo bash -c 'cd <目录> && docker compose …'` |
| SSH 突然连不上 | 多为 fail2ban 封禁。用云厂商控制台的 VNC/浏览器终端登录后执行 `fail2ban-client status sshd` 与 `unbanip` |
| 管理员点了操作却提示需要 PIN | 会话里的验证已过期（默认 15 分钟）。重新验证即可；系统兜底管理员免验证 |
| HTTPS 申请失败 | 域名未解析到本机、或 80/443 未放行（证书校验必须能通过 80 端口访问） |