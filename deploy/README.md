# 腾讯云部署说明

本目录负责第一阶段上线链路：Caddy + 两个独立 API 服务 + 腾讯云托管 PostgreSQL。前端在本机开发，正式构建由服务器部署脚本执行。

## 目录用途

```text
deploy/
  compose.yaml        Caddy、api-prod、api-staging
  caddy/Caddyfile     域名、HTTPS、SPA 和 API 反向代理
  Dockerfile.api      Node API 多阶段镜像
  .env.example        服务器环境变量示例
  scripts/
    bootstrap-server.sh
    deploy.sh
    rollback.sh
```

## 1. 腾讯云准备

- Ubuntu 24.04，2 核 4G，系统盘至少 60 GB
- 安全组开放 22、80、443
- 托管 PostgreSQL 16，创建 `classhub_prod` 和 `classhub_staging`
- 数据库只允许服务器 VPC 内网访问
- 两个域名都完成 ICP 备案并解析到服务器
- 建议先在服务器添加 2 GB Swap

## 2. 初始化服务器

```bash
chmod +x deploy/scripts/*.sh
sudo deploy/scripts/bootstrap-server.sh
```

脚本会安装 Docker、UFW、Fail2ban、rsync、jq，创建 `/opt/class-hub`，并配置 2 GB Swap。

退出 SSH 后重新登录，使 docker 用户组生效。

## 3. 创建环境文件

```bash
sudo cp deploy/.env.example /opt/class-hub/.env
sudo chmod 600 /opt/class-hub/.env
sudo editor /opt/class-hub/.env
```

必须替换：

- `APP_DOMAIN`
- `STAGING_DOMAIN`
- `ACME_EMAIL`
- `PROD_DATABASE_URL`
- `STAGING_DATABASE_URL`
- `AUTH_SECRET`（`openssl rand -base64 48`）
- `STUDENT_ID_HMAC_KEY`（另一条随机值，泄露后必须重新导入名单）
- `CLASS_ACTIVATION_CODE`（班级共用激活码，只发给本班同学）

数据库密码不能包含未转义的特殊字符。推荐使用 URL 编码后的强密码。

`AUTH_SECRET` / `STUDENT_ID_HMAC_KEY` / `CLASS_ACTIVATION_CODE` 缺失时 `docker compose` 会直接拒绝启动，避免用默认值上线。

首次部署后，用班里一个真实身份（或虚构测试身份）登录，在「其它 → 管理」里设置管理员 PIN，然后导入白名单 CSV：

```text
student_id,name,group,initial_role,active
2021001,张三,一组,member,true
2021002,李四,班委,admin,true
```

学号只用于生成 HMAC 与末四位掩码，服务端不保存明文，原始 CSV 不落盘。`initial_role=owner` 的主 Owner 可以授予管理员；系统兜底 Owner 需要在 `.env` 里配置 `FALLBACK_OWNER_*` 后由服务器初始化。

## 4. 配置私有 Gitee 仓库

本机还没有关联 Gitee 仓库。创建空仓库后执行：

```powershell
git init -b main
git add .
git commit -m "chore: bootstrap phase 1 deployment"
git remote add origin git@gitee.com:your-account/class-hub.git
git push -u origin main
git tag v0.1.0
git push origin v0.1.0
```

如果 Git 提示缺少身份信息，先配置：

```powershell
git config user.name "你的姓名"
git config user.email "你的邮箱"
```

首次部署前，服务器需要只读权限拉取仓库。

```bash
export REPO_URL=git@gitee.com:your-account/class-hub.git
```

建议在服务器生成只读部署密钥，并把公钥添加到 Gitee 仓库的部署公钥：

```bash
ssh-keygen -t ed25519 -C "classhub-deploy" -f ~/.ssh/classhub_deploy
cat ~/.ssh/classhub_deploy.pub
```

在服务器的 `~/.ssh/config` 中添加：

```sshconfig
Host git-deploy
    HostName gitee.com
    User git
    IdentityFile ~/.ssh/classhub_deploy
    IdentitiesOnly yes
```

然后使用：

```bash
export REPO_URL=git-deploy:your-account/class-hub.git
```

## 5. 发布版本

本地推送标签：

```bash
git tag v0.1.0
git push origin v0.1.0
```

服务器首次克隆并部署：

```bash
REPO_URL=git-deploy:your-account/class-hub.git \
  deploy/scripts/deploy.sh v0.1.0
```

后续部署：

```bash
deploy/scripts/deploy.sh v0.2.0
```

脚本执行：

1. 检查仓库干净
2. 拉取标签
3. 构建前端和 API
4. 创建不可变前端 Release 目录
5. 构建 API 镜像
6. 分别执行 Staging 和 Production 数据库迁移
7. 启动服务并切换 `current` 软链接
8. 检查两个域名 `/api/health`

## 6. 健康检查

```bash
curl -fsS https://class11.example.cn/api/health | jq
curl -fsS https://staging.class11.example.cn/api/health | jq
curl -fsS https://class11.example.cn/api/version | jq
```

正常情况下 `ok` 为 `true`，数据库状态为 `up`。

## 7. 回滚

回滚到上一次成功标签：

```bash
deploy/scripts/rollback.sh
```

回滚到指定标签：

```bash
deploy/scripts/rollback.sh v0.1.0
```

第一阶段没有正式业务数据，因此回滚只涉及镜像和前端文件；后续加入数据库后，回滚前必须先备份数据库。

## 8. 本机开发连接 Staging

本机 `.env.local`：

```dotenv
VITE_DATA_MODE=remote
VITE_API_TARGET=https://staging.<your-domain>
```

只想离线看界面（不需要后端）时改用：

```powershell
npm run dev:demo
```

浏览器只访问：

```text
http://127.0.0.1:5173/api/health
```

Vite 会代理到 Staging API，不把数据库密码或 Staging 域名写入前端包。

## 9. 安全检查

```bash
sudo ufw status
docker compose --env-file /opt/class-hub/.env -f deploy/compose.yaml ps
sudo ss -lntp | grep -E ':80|:443|:3000|:5432'
```

预期：

- 80 和 443 可以监听
- 3000 只在 Docker 内部网络
- 5432 不在轻量服务器监听
- `.env` 权限为 600
- 前端构建产物中不存在 `DATABASE_URL` 或数据库密码


## 10. 2核4G 单机试运行模式

第一月没有域名和托管 PostgreSQL 时，可使用单 API、PostgreSQL 容器和 HTTP Caddy：

```text
deploy/compose.trial.yaml
deploy/caddy/Caddyfile.trial
deploy/scripts/deploy-trial.sh
deploy/scripts/backup-postgres.sh
```

服务器目录：

```text
/opt/class-hub/app
/opt/class-hub/web/current
/opt/class-hub/backups/postgres
/opt/class-hub/.env.trial
```

部署：

```bash
COMPOSE_DIR=/opt/class-hub/app \
ENV_FILE=/opt/class-hub/.env.trial \
/opt/class-hub/app/deploy/scripts/deploy-trial.sh
```

备份：

```bash
/opt/class-hub/backup-postgres.sh
```

试运行模式只开放 HTTP 80，不会申请 HTTPS。只能用于界面、API 健康检查和低敏感度测试，不能录入真实敏感数据。备案域名和托管 PostgreSQL 准备完成后，切换到正式 Compose。

试运行的默认值只够跑通链路。只要开始录入任何成员，就必须在 `/opt/class-hub/.env.trial` 里设置：

```dotenv
AUTH_SECRET=<openssl rand -base64 48>
STUDENT_ID_HMAC_KEY=<openssl rand -base64 48>
CLASS_ACTIVATION_CODE=<只发给本班同学>
```

`docker compose --env-file /opt/class-hub/.env.trial -f deploy/compose.trial.yaml up -d` 会在改动后重建 API 容器。
