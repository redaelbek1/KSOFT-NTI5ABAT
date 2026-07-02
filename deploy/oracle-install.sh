#!/bin/bash
# Installation sur Oracle Cloud Always Free (Ubuntu 22.04 ARM)
# Usage : bash oracle-install.sh [PIN]
set -euo pipefail

REPO_URL="https://github.com/redaelbek1/KSOFT-NTI5ABAT.git"
APP_DIR="$HOME/KSOFT-NTI5ABAT"
PIN="${1:-2026}"
PORT="${PORT:-10000}"

echo "==> Paquets Docker"
sudo apt-get update -qq
sudo apt-get install -y docker.io git openssl
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" || true

echo "==> Code depuis GitHub"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git pull --ff-only
else
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

SECRET_KEY="$(openssl rand -hex 32)"
cat > .env <<EOF
SECRET_KEY=${SECRET_KEY}
KASOFT_PIN=${PIN}
ASSET_VERSION=25
FLASK_DEBUG=0
PORT=${PORT}
EOF

echo "==> Build image Docker"
sudo docker build -t kasoft-nti5abat .

echo "==> Lancement conteneur"
sudo docker rm -f kasoft 2>/dev/null || true
sudo docker run -d \
  --name kasoft \
  --restart unless-stopped \
  -p 80:${PORT} \
  --env-file .env \
  kasoft-nti5abat

IP="$(curl -s ifconfig.me || hostname -I | awk '{print $1}')"
echo ""
echo "OK — site disponible sur : http://${IP}/export"
echo "Login KASOFT : http://${IP}/login  (PIN: ${PIN})"
echo "Mise à jour future : cd ${APP_DIR} && git pull && sudo docker build -t kasoft-nti5abat . && sudo docker rm -f kasoft && sudo docker run -d --name kasoft --restart unless-stopped -p 80:${PORT} --env-file .env kasoft-nti5abat"
