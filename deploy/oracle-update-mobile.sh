#!/bin/bash
# Mise à jour /mobile sur Oracle Cloud Shell (navigateur)
# Usage: bash deploy/oracle-update-mobile.sh
set -euo pipefail

REPO="${KASOFT_REPO:-$HOME/KSOFT-NTI5ABAT}"
if [ ! -d "$REPO/.git" ]; then
  git clone https://github.com/redaelbek1/KSOFT-NTI5ABAT.git "$REPO"
fi
cd "$REPO"
git pull --ff-only origin master

sudo docker cp templates/comptage_mobile.html kasoft:/app/templates/comptage_mobile.html
sudo docker cp templates/comptage.html kasoft:/app/templates/comptage.html
sudo docker cp templates/base.html kasoft:/app/templates/base.html
sudo docker cp templates/index.html kasoft:/app/templates/index.html
sudo docker cp static/comptage-mobile.js kasoft:/app/static/comptage-mobile.js
sudo docker cp static/comptage-mobile.css kasoft:/app/static/comptage-mobile.css
sudo docker cp static/manifest.json kasoft:/app/static/manifest.json
sudo docker cp static/app.js kasoft:/app/static/app.js
sudo docker cp static/i18n.js kasoft:/app/static/i18n.js
sudo docker cp kasoft/web/app.py kasoft:/app/kasoft/web/app.py
sudo docker cp kasoft/export_ma/api_client.py kasoft:/app/kasoft/export_ma/api_client.py
sudo docker cp kasoft/export_ma/csv_export.py kasoft:/app/kasoft/export_ma/csv_export.py
sudo docker cp kasoft/export_ma/geo_service.py kasoft:/app/kasoft/export_ma/geo_service.py

sudo docker restart kasoft
sleep 5
curl -sS -o /dev/null -w "HTTP /mobile: %{http_code}\n" http://127.0.0.1:10000/mobile
echo "OK — http://51.170.128.73/mobile"
