param(
  [string]$ServerIp = "<your-server-ip>",
  [string]$HostAlias = "class-hub"
)

$ErrorActionPreference = "Continue"
function Say($text, $color = "Gray") { Write-Host $text -ForegroundColor $color }
function Head($text) { Write-Host ""; Write-Host "=== $text ===" -ForegroundColor Cyan }

Head "1. SSH 配置与私钥"
$sshDir = Join-Path $env:USERPROFILE ".ssh"
if (-not (Test-Path $sshDir)) {
  Say "  [!] 目录 $sshDir 不存在" "Yellow"
} else {
  $config = Join-Path $sshDir "config"
  if (Test-Path $config) {
    $cfg = Get-Content $config -Raw -ErrorAction SilentlyContinue
    if ($cfg -match "(?m)^\s*Host\s+$([regex]::Escape($HostAlias))\s*$") {
      Say "  [OK] ~/.ssh/config 里有 Host $HostAlias"
      $block = ($cfg -split "(?m)^\s*Host\s+") | Where-Object { $_ -match "^$([regex]::Escape($HostAlias))\b" } | Select-Object -First 1
      if ($block -match "HostName\s+(\S+)") { Say ("        HostName = " + $Matches[1]) }
      if ($block -match "User\s+(\S+)")     { Say ("        User     = " + $Matches[1]) }
      if ($block -match "IdentityFile\s+(\S+)") {
        $idf = $Matches[1] -replace "~", $env:USERPROFILE
        Say ("        Key      = " + $idf)
        if (Test-Path $idf) {
          Say "  [OK] 私钥文件存在"
          $acl = (& icacls $idf) 2>&1 | Out-String
          if ($acl -match "Everyone|Users:") {
            Say "  [!] 私钥可能对 Everyone/Users 开放，Windows OpenSSH 会因此拒绝加载（Permission denied）" "Yellow"
          } else {
            Say "  [OK] 私钥 ACL 看起来是收紧的"
          }
        } else {
          Say "  [XX] 私钥文件不存在，这就是连不上的原因" "Red"
        }
      }
      if ($block -notmatch "ServerAliveInterval") {
        Say "  [!] 未配置 ServerAliveInterval，长时间空闲容易被断开（见 ssh-config-snippet.txt）" "Yellow"
      }
    } else {
      Say "  [XX] ~/.ssh/config 里没有 Host $HostAlias" "Red"
    }
  } else {
    Say "  [XX] 没有 ~/.ssh/config" "Red"
  }
}

Head "2. 网络可达性（TCP）"
foreach ($p in 22, 80) {
  $ok = Test-NetConnection -ComputerName $ServerIp -Port $p -InformationLevel Quiet -WarningAction SilentlyContinue
  if ($ok) { Say "  [OK] ${ServerIp}:$p 可连接" "Green" } else { Say "  [XX] ${ServerIp}:$p 连不上" "Red" }
}

Head "3. SSH 实际登录（非交互）"
$sshTest = (& ssh -o BatchMode=yes -o ConnectTimeout=10 $HostAlias "echo SSH_OK; uptime -p") 2>&1 | Out-String
Say $sshTest.Trim()
if ($sshTest -match "SSH_OK") {
  Say "  [OK] SSH 登录成功" "Green"
} elseif ($sshTest -match "Permission denied") {
  Say "  [XX] 公钥被拒：私钥不匹配 / ACL 过宽 / 服务器 authorized_keys 里没有这把公钥" "Red"
} elseif ($sshTest -match "timed out|Timeout|连接超时|Could not resolve") {
  Say "  [XX] 连不上：可能是网络拦截、安全组未放行，或被服务器 fail2ban 封了你的 IP" "Red"
} else {
  Say "  [!] 需要按上面输出判断" "Yellow"
}

Head "4. 网站可用性"
try {
  $r = Invoke-WebRequest -Uri "http://$ServerIp/api/health" -TimeoutSec 10 -UseBasicParsing
  Say ("  [OK] /api/health HTTP " + $r.StatusCode + "  " + $r.Content) "Green"
} catch {
  Say ("  [XX] 站点访问失败：" + $_.Exception.Message) "Red"
}

Head "结论与常见修法"
Say "  A. 只有 22 不通、80 通  -> SSH 被封、安全组没放行，或 fail2ban 封了你的 IP" "Yellow"
Say "     用腾讯云控制台「登录」(VNC/OrcaTerm，不走 SSH) 进去执行："
Say "       sudo fail2ban-client status sshd"
Say "       sudo fail2ban-client set sshd unbanip <你的公网IP>"
Say "       sudo ufw status"
Say "     并在控制台安全组确认 22 已放行。"
Say ""
Say "  B. 22 和 80 都不通       -> 本地网络/运营商拦截，或实例异常" "Yellow"
Say "     换手机热点试；控制台看实例是否「运行中」，再用 VNC 登录看服务是否在跑。"
Say ""
Say "  C. publickey 被拒        -> 修私钥 ACL：" "Yellow"
Say '       icacls "$env:USERPROFILE\.ssh\classhub_owner.pem" /inheritance:r'
Say '       icacls "$env:USERPROFILE\.ssh\classhub_owner.pem" /grant:r "$($env:USERNAME):R"'
Say "     仍不行就重新生成密钥对并在控制台重新绑定。"
Say ""
Say "  D. 空闲后断开            -> 按 deploy/scripts/ssh-config-snippet.txt 加保活；" "Yellow"
Say "     跑部署时用 tmux：ssh <你的别名> -t ""tmux new -As deploy"""