#!/bin/bash
# Met à jour l'application KASOFT sur la VM Oracle.
#
# À exécuter SUR la VM kasoft-demo (ubuntu@51.170.128.73), pas dans Cloud Shell :
#   ssh ubuntu@51.170.128.73
#   bash <(curl -sSL https://raw.githubusercontent.com/redaelbek1/KSOFT-NTI5ABAT/master/deploy/oracle-update-mobile-vm.sh)
#
# Copie les dossiers entiers (templates/, static/, kasoft/) au lieu d'une liste
# de fichiers : tout nouveau fichier est déployé sans modifier ce script.
set -euo pipefail

REPO="${KASOFT_REPO:-$HOME/KSOFT-NTI5ABAT}"
if [ ! -d "$REPO/.git" ]; then
  git clone https://github.com/redaelbek1/KSOFT-NTI5ABAT.git "$REPO"
fi
cd "$REPO"
git fetch origin master
git reset --hard origin/master

docker_cmd() {
  if docker info >/dev/null 2>&1; then
    docker "$@"
  else
    sudo docker "$@"
  fi
}

echo "→ copie des fichiers dans le conteneur kasoft…"
docker_cmd cp templates/. kasoft:/app/templates/
docker_cmd cp static/. kasoft:/app/static/
docker_cmd cp kasoft/. kasoft:/app/kasoft/
docker_cmd cp app.py kasoft:/app/app.py

echo "→ redémarrage…"
docker_cmd restart kasoft
sleep 6

for path in /login /comptage /configuration; do
  curl -sS -o /dev/null -w "HTTP ${path}: %{http_code}\n" "http://127.0.0.1:10000${path}" || true
done
echo "OK — http://51.170.128.73/login"
