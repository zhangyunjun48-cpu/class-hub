<#
  一条命令完成「正式版（域名 + 自动 HTTPS）」上线/更新：
    本机打包（含备案号）→ 上传 → 服务器解压 → 部署 → 端到端自检

  用法：
    powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/deploy-prod-from-windows.ps1

  首次上线必须带域名和证书邮箱（只用于生成 /opt/class-hub/.env，之后可省略）：
    powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/deploy-prod-from-windows.ps1 -Domain <your-domain> -AcmeEmail your-mail@example.com

  常见用途：备案号变了以后，只改 .env.production 再跑这一条命令即可更新线上页脚。
#>
param(
  [string]$HostAlias = "class-hub",
  [string]$DeployRoot = "/opt/class-hub",
  [string]$Domain = "",
  [string]$AcmeEmail = "",
  [switch]$SkipPack,
  [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

# 本机覆盖：deploy/deploy.local.ps1 里可以重新定义 $HostAlias / $DeployRoot / $EnvFile
$localConfig = Join-Path $repoRoot "deploy\deploy.local.ps1"
if (Test-Path $localConfig) { . $localConfig }

if (-not $SkipPack) {
  Write-Host "== 1/4 打包（读取 .env.production 里的备案号）==" -ForegroundColor Cyan
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "pack-formal-release.ps1")
  if ($LASTEXITCODE -ne 0) { throw "打包失败" }
} else {
  Write-Host "== 1/4 跳过打包 ==" -ForegroundColor DarkGray
}

$tar = Join-Path $repoRoot "work\class-hub-release.tar.gz"
if (-not (Test-Path $tar)) { throw "找不到发布包 $tar（去掉 -SkipPack 重新打包）" }

Write-Host "== 2/4 上传 ==" -ForegroundColor Cyan
& scp $tar "${HostAlias}:/tmp/class-hub-release.tar.gz"
if ($LASTEXITCODE -ne 0) {
  throw "scp 失败。先运行：powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/diagnose-server.ps1"
}

Write-Host "== 3/4 服务器端部署（域名 + 自动 HTTPS）==" -ForegroundColor Cyan
$extraEnv = @()
if ($Domain) { $extraEnv += "APP_DOMAIN=$Domain" }
if ($AcmeEmail) { $extraEnv += "ACME_EMAIL=$AcmeEmail" }
if ($SkipSmoke) { $extraEnv += "SKIP_SMOKE=1" }
$envPrefix = if ($extraEnv.Count -gt 0) { "env " + ($extraEnv -join " ") + " " } else { "" }
$remote = "DR='$DeployRoot'; rm -rf `$DR/release && mkdir -p `$DR/release && tar -xzf /tmp/class-hub-release.tar.gz -C `$DR/release && cd `$DR/release && sudo ${envPrefix}bash deploy/scripts/deploy-prod-single.sh"
& ssh -t $HostAlias $remote
$exit = $LASTEXITCODE

Write-Host "== 4/4 结果 ==" -ForegroundColor Cyan
if ($exit -eq 0) {
  $site = if ($Domain) { "https://$Domain/" } else { "线上域名" }
  Write-Host "完成。浏览器打开 $site 验收页脚备案号。" -ForegroundColor Green
} else {
  Write-Host "部署脚本返回非 0（$exit）。把上面的输出贴回给 Codex。" -ForegroundColor Yellow
}
exit $exit