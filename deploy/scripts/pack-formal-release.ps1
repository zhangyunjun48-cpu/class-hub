# 打包"正式版发布物"：前端构建产物 + API 源码 + 部署文件（试运行与正式版都支持）
#
# 用法（仓库根目录）：
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/pack-formal-release.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File deploy/scripts/pack-formal-release.ps1 `
#     -Icp "鲁ICP备2026XXXXXX号-1" -Police "鲁公网安备3701XXXXXXXX号" -PoliceCode "3701XXXXXXXX"
#
# 备案号也可以直接写在 .env.production 里（推荐，填一次永久生效）；
# 命令行参数优先级更高，用于临时覆盖。
#
# 产物：work/class-hub-release.tar.gz

param(
  [string]$Icp = "",
  [string]$Police = "",
  [string]$PoliceCode = ""
)

$ErrorActionPreference = "Stop"

if ($Icp) { $env:VITE_ICP_LICENSE = $Icp }
if ($Police) { $env:VITE_PUBLIC_SECURITY_LICENSE = $Police }
if ($PoliceCode) { $env:VITE_PUBLIC_SECURITY_CODE = $PoliceCode }

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $repoRoot

Write-Host "== 1/4 构建前端（production / remote）==" -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) { throw "前端构建失败" }

$stage = Join-Path $repoRoot "work\release\formal"
Write-Host "== 2/4 准备发布目录 ==" -ForegroundColor Cyan
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Copy-Item -Recurse (Join-Path $repoRoot "dist") (Join-Path $stage "dist")

Copy-Item -Recurse (Join-Path $repoRoot "server") (Join-Path $stage "server")
Remove-Item -Recurse -Force (Join-Path $stage "server\node_modules"), (Join-Path $stage "server\dist") -ErrorAction SilentlyContinue
Copy-Item -Recurse (Join-Path $repoRoot "shared") (Join-Path $stage "shared")

$deployDir = Join-Path $stage "deploy"
New-Item -ItemType Directory -Force -Path $deployDir | Out-Null
Copy-Item (Join-Path $repoRoot "deploy\Dockerfile.api") $deployDir
Copy-Item (Join-Path $repoRoot "deploy\compose.trial.yaml") $deployDir
Copy-Item (Join-Path $repoRoot "deploy\compose.prod-single.yaml") $deployDir
Copy-Item -Recurse (Join-Path $repoRoot "deploy\caddy") $deployDir
New-Item -ItemType Directory -Force -Path (Join-Path $deployDir "scripts") | Out-Null
foreach ($s in "deploy-formal-trial.sh", "smoke-formal.sh", "deploy-prod-single.sh", "backup-prod.sh") {
  Copy-Item (Join-Path $repoRoot "deploy\scripts\$s") (Join-Path $deployDir "scripts")
}

if (-not (Test-Path (Join-Path $stage "dist\index.html"))) { throw "dist/index.html 不存在" }
if (-not (Test-Path (Join-Path $stage "server\migrations\0002_formal_v1.sql"))) { throw "缺少 0002_formal_v1.sql 迁移" }
if (-not (Test-Path (Join-Path $stage "deploy\caddy\Caddyfile.prod"))) { throw "缺少 Caddyfile.prod" }

$bundle = Get-ChildItem (Join-Path $stage "dist\assets") -Filter *.js | Select-Object -First 1
$text = Get-Content -Raw $bundle.FullName
foreach ($needle in "DATABASE_URL", "AUTH_SECRET", "STUDENT_ID_HMAC_KEY", "CLASS_ACTIVATION_CODE") {
  if ($text -match $needle) { throw "前端产物疑似包含服务端变量：$needle" }
}

$icpInBundle = $text -match "ICP备"
if (-not $icpInBundle) {
  Write-Host "[!] 构建产物里没有 ICP 备案号——正式上线前必须在 .env.production 或 -Icp 里填好，否则页脚不会显示备案信息。" -ForegroundColor Yellow
} else {
  Write-Host "[OK] 备案信息已写入前端产物。" -ForegroundColor Green
}

Write-Host "== 3/4 打包 ==" -ForegroundColor Cyan
$tarPath = Join-Path $repoRoot "work\class-hub-release.tar.gz"
if (Test-Path $tarPath) { Remove-Item -Force $tarPath }
Push-Location $stage
tar -czf $tarPath .
$tarExit = $LASTEXITCODE
Pop-Location
if ($tarExit -ne 0) { throw "tar 打包失败" }

$size = [math]::Round((Get-Item $tarPath).Length / 1MB, 2)
Write-Host "== 4/4 完成 ==" -ForegroundColor Green
Write-Host "发布包：$tarPath（$size MB）"
Write-Host ""
Write-Host "下一步：" -ForegroundColor Yellow
Write-Host "  试运行环境： powershell -File deploy/scripts/deploy-from-windows.ps1"
Write-Host "  正式版上线： scp work/class-hub-release.tar.gz <你的SSH别名>:/tmp/ 然后见 deploy/README.md 的「正式上线」一节"