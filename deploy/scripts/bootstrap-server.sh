#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

DEPLOY_ROOT="${DEPLOY_ROOT:-/opt/class-hub}"
ADMIN_USER="${SUDO_USER:-ubuntu}"

apt-get update
apt-get install -y curl git ca-certificates ufw fail2ban rsync jq

if ! command -v docker >/dev/null 2>&1; then
  if ! curl -fsSL https://get.docker.com | sh; then
    echo "Docker convenience script failed; using Ubuntu packages."
    apt-get install -y docker.io docker-compose-v2
  fi
fi

usermod -aG docker "$ADMIN_USER"

if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

systemctl enable --now docker fail2ban

install -d -m 0750 -o "$ADMIN_USER" -g "$ADMIN_USER" \
  "$DEPLOY_ROOT" \
  "$DEPLOY_ROOT/app" \
  "$DEPLOY_ROOT/state" \
  "$DEPLOY_ROOT/backups" \
  "$DEPLOY_ROOT/web" \
  "$DEPLOY_ROOT/web/releases"

echo "Bootstrap complete."
echo "Log out and back in so the docker group membership applies."
echo "Next: create $DEPLOY_ROOT/.env from deploy/.env.example."
