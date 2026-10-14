# 复制为 deploy/deploy.local.ps1（已被 gitignore），把实例相关的默认值放在这里。
# 部署脚本会自动读取它，因此你可以继续用自己习惯的别名与路径。
$HostAlias = "class-hub"
$DeployRoot = "/opt/class-hub"
$EnvFile = "/opt/class-hub/.env"