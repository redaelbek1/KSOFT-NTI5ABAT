#!/bin/bash
# Oracle Cloud Shell → SSH vers la VM kasoft-demo puis déploiement /mobile
#
# 1) Menu Cloud Shell (⋮) → Upload → ta clé SSH (.key)
# 2) bash deploy/oracle-update-mobile.sh
#
# Ou: KASOFT_SSH_KEY=~/ma-cle.key bash deploy/oracle-update-mobile.sh
set -euo pipefail

VM="${KASOFT_VM:-ubuntu@51.170.128.73}"
KEY="${KASOFT_SSH_KEY:-$HOME/kasoft-vm.key}"
REPO="${KASOFT_REPO:-$HOME/KSOFT-NTI5ABAT}"

if [ ! -f "$KEY" ]; then
  echo "ERREUR: clé SSH introuvable: $KEY"
  echo ""
  echo "Dans Cloud Shell:"
  echo "  1. Clique ⋮ (menu) → Upload"
  echo "  2. Envoie ton fichier .key (ex. ssh-key-2026-07-08.key)"
  echo "  3. Puis: mv ~/ssh-key-2026-07-08.key ~/kasoft-vm.key"
  echo "  4. Relance ce script"
  exit 1
fi

chmod 600 "$KEY"

if [ ! -d "$REPO/.git" ]; then
  git clone https://github.com/redaelbek1/KSOFT-NTI5ABAT.git "$REPO"
fi
cd "$REPO"
git pull --ff-only origin master

echo "==> Connexion SSH vers $VM"
scp -i "$KEY" -o StrictHostKeyChecking=accept-new \
  deploy/oracle-update-mobile-vm.sh \
  "$VM:~/oracle-update-mobile-vm.sh"

ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$VM" \
  "chmod +x ~/oracle-update-mobile-vm.sh && bash ~/oracle-update-mobile-vm.sh"

echo ""
echo "Terminé. Teste: http://51.170.128.73/mobile"
