#!/bin/bash
# À exécuter SUR la VM kasoft-demo (ubuntu@51.170.128.73), pas dans Cloud Shell.
set -euo pipefail

REPO="${KASOFT_REPO:-$HOME/KSOFT-NTI5ABAT}"
if [ ! -d "$REPO/.git" ]; then
  git clone https://github.com/redaelbek1/KSOFT-NTI5ABAT.git "$REPO"
fi
cd "$REPO"
git pull --ff-only origin master

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  else
    sudo docker "$@"
  fi
}

docker_cmd cp templates/comptage_mobile.html kasoft:/app/templates/comptage_mobile.html
docker_cmd cp templates/comptage.html kasoft:/app/templates/comptage.html
docker_cmd cp templates/base.html kasoft:/app/templates/base.html
docker_cmd cp templates/index.html kasoft:/app/templates/index.html
docker_cmd cp static/comptage-mobile.js kasoft:/app/static/comptage-mobile.js
docker_cmd cp static/comptage-mobile.css kasoft:/app/static/comptage-mobile.css
docker_cmd cp static/manifest.json kasoft:/app/static/manifest.json
docker_cmd cp static/app.js kasoft:/app/static/app.js
docker_cmd cp static/i18n.js kasoft:/app/static/i18n.js
docker_cmd cp kasoft/web/app.py kasoft:/app/kasoft/web/app.py
docker_cmd cp kasoft/export_ma/api_client.py kasoft:/app/kasoft/export_ma/api_client.py
docker_cmd cp kasoft/export_ma/csv_export.py kasoft:/app/kasoft/export_ma/csv_export.py
docker_cmd cp kasoft/export_ma/geo_service.py kasoft:/app/kasoft/export_ma/geo_service.py

docker_cmd restart kasoft
sleep 5
curl -sS -o /dev/null -w "HTTP /mobile: %{http_code}\n" http://127.0.0.1:10000/mobile
echo "OK — http://51.170.128.73/mobile"
