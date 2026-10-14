param(
  [string]$HostAlias = "class-hub",
  [string]$DeployRoot = "/opt/class-hub",
  [string]$EnvFile = "/opt/class-hub/.env.trial",
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
  Write-Host "== 1/4 打包 ==" -ForegroundColor Cyan
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "pack-formal-release.ps1")
  if ($LASTEXITCODE -ne 0) { throw "打包失败" }
} else {
  Write-Host "== 1/4 跳过打包 ==" -ForegroundColor DarkGray
}

$tar = Join-Path $repoRoot "work\class-hub-release.tar.gz"
if (-not (Test-Path $tar)) { throw "找不到发布包 $tar（去掉 -SkipPack 重新打包）" }

Write-Host "== 2/4 上传到服务器 ==" -ForegroundColor Cyan
& scp $tar "${HostAlias}:/tmp/class-hub-release.tar.gz"
if ($LASTEXITCODE -ne 0) {
  throw "scp 失败。先运行：powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/diagnose-server.ps1"
}

Write-Host "== 3/4 服务器端部署 ==" -ForegroundColor Cyan
$smokePrefix = if ($SkipSmoke) { "SKIP_SMOKE=1 " } else { "" }
$envArgs = "env ENV_FILE=$EnvFile"; if ($smokePrefix) { $envArgs = "$envArgs SKIP_SMOKE=1" }
$remote = "DR='$DeployRoot'; rm -rf `$DR/release && mkdir -p `$DR/release && tar -xzf /tmp/class-hub-release.tar.gz -C `$DR/release && cd `$DR/release && sudo $envArgs bash deploy/scripts/deploy-formal-trial.sh"
& ssh -t $HostAlias $remote
$deployExit = $LASTEXITCODE

Write-Host "== 4/4 结果 ==" -ForegroundColor Cyan
if ($deployExit -eq 0) {
  Write-Host "部署成功。浏览器打开 https://你的域名/ 验收。" -ForegroundColor Green
} else {
  Write-Host "部署脚本返回非 0（$deployExit）。若只是自检有 FAIL，把上面输出贴给 Codex。" -ForegroundColor Yellow
}
exit $deployExit