# كاسوفت — nti5abat

Application web pour **KASOFT** (comptage électoral, PV PDF, tableau de bord) et **l’export des résultats** depuis [elections.ma](https://www.elections.ma).

## Prérequis

- Python 3.10+
- Chromium (Playwright) pour le cache géographique

## Installation

```powershell
cd nti5abat
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python -m playwright install chromium
```

Copier `.env.example` vers `.env` et ajuster si besoin :

```powershell
copy .env.example .env
```

| Variable | Description | Défaut |
|----------|-------------|--------|
| `KASOFT_PIN` | Code d’accès KASOFT | `2026` |
| `SECRET_KEY` | Clé de session Flask | clé de dev |
| `ASSET_VERSION` | Version cache JS/CSS | `25` |
| `FLASK_DEBUG` | Mode debug (`1` / `0`) | `0` |

## Lancement

```powershell
python app.py
```

Ouvrir **http://127.0.0.1:5000**

| URL | Accès | Description |
|-----|-------|-------------|
| `/export` | Public | Filtres elections.ma → aperçu + CSV |
| `/login` | Public | Connexion KASOFT (PIN) |
| `/dashboard` | Authentifié | Tableau de bord |
| `/comptage` | Authentifié | Comptage des voix |
| `/configuration` | Authentifié | Bureaux, partis, sauvegardes |

## Modules

### Export elections.ma
Même logique de filtres que le site officiel (législatives / communales). Les données sont lues via l’API publique `elections.ma`.

### KASOFT électoral
- Comptage par bureau, parti et représentant (API `/api/kasoft/votes` + repli hors-ligne)
- Verrouillage des bureaux fermés
- PV PDF en arabe (fpdf2 + polices dans `static/fonts/`)
- Rapport régional PDF avec signatures
- Export CSV, ZIP, sauvegarde JSON
- **Sync multi-appareils** : fusion intelligente côté client et serveur
- Rate-limit login (5 tentatives / 5 min)
- Nettoyage auto des exports > 7 jours (`output/`)

## Structure utile

```
app.py              Routes Flask
kasoft_db.py        État SQLite + JSON
kasoft_pdf.py       Génération PDF
kasoft_merge.py     Fusion d’états (sync)
static/store.js     État client + merge
csv_export.py       Export CSV elections.ma
geo_service.py      Provinces / communes / circonscriptions
templates/          Pages HTML
archive/            Fichiers de référence (non servis)
```

## Données

- État KASOFT : `data/kasoft.db` + `data/kasoft_state.json`
- Cache géo : `data/geo_disk/`
- Exports CSV : `output/`

## Tests

```powershell
python -m unittest discover -s tests -v
```

L’app peut être installée sur mobile (manifest + service worker). Icônes : `static/icons/`.

## Déploiement client

### GitHub ≠ site en ligne

| Ce que fait GitHub | Ce que GitHub **ne fait pas** |
|--------------------|-------------------------------|
| Stocke le code ([KSOFT-NTI5ABAT](https://github.com/redaelbek1/KSOFT-NTI5ABAT)) | Faire tourner Flask, SQLite, PDF, Playwright |
| **GitHub Pages** = pages HTML statiques seulement | Héberger votre app Python complète |

Votre app a besoin d’un **serveur Python toujours allumé**. Le code reste sur GitHub ; il faut un hébergeur gratuit qui **tire le code depuis GitHub**.

### Option recommandée — Oracle Cloud (0 € / mois, toujours gratuit)

Pas de frais mensuels (contrairement à beaucoup de PaaS). Vous clonez le repo GitHub sur une petite machine cloud.

1. Créez un compte sur [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) (carte demandée pour vérification, pas de débit si vous restez dans le gratuit).
2. Créez une VM **Ubuntu 22.04 ARM** (Always Free).
3. Ouvrez le port **80** dans le pare-feu Oracle (Security List → Ingress → TCP 80).
4. Connectez-vous en SSH, puis :

```bash
curl -fsSL https://raw.githubusercontent.com/redaelbek1/KSOFT-NTI5ABAT/master/deploy/oracle-install.sh -o install.sh
bash install.sh 2026
```

(`2026` = PIN pour le client — changez-le si besoin.)

5. URL pour le client : `http://IP-PUBLIQUE-VM/export` et `http://IP-PUBLIQUE-VM/login`

**Mise à jour après un `git push` :**

```bash
cd ~/KSOFT-NTI5ABAT && git pull && sudo docker build -t kasoft-nti5abat . && sudo docker rm -f kasoft && sudo docker run -d --name kasoft --restart unless-stopped -p 80:10000 --env-file .env kasoft-nti5abat
```

### Option B — Render (gratuit avec mise en veille)

Le plan **Free** existe (pas de facture si vous choisissez *Free* à la création). Le site s’endort après ~15 min sans visite.

Voir `render.yaml` et [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → repo GitHub.

### Option C — ngrok (test rapide seulement)

Utile pour tester, pas pour un client : le site tombe quand votre PC s’éteint.

### Première démo sur le cloud

1. Connectez-vous avec le PIN.
2. **Configuration** → données démo.
3. Export elections.ma : 10–30 s au premier chargement géo.

## Dépannage

| Problème | Solution |
|----------|----------|
| PDF carrés / arabe cassé | Vérifier `static/fonts/Tahoma.ttf` |
| Filtres géo vides au 1er lancement | Attendre le chargement Playwright ou utiliser le cache `data/geo_disk/` |
| Session expirée | Reconnectez-vous via `/login` |
| Changements JS non visibles | Ctrl+Shift+R ou augmenter `ASSET_VERSION` |
| Oracle VM : port fermé | Ouvrir TCP 80 dans Security List Oracle |
| Oracle VM : site inaccessible | Vérifier `sudo docker ps` et le pare-feu `sudo ufw allow 80` |

## Archive

`archive/homepage-elections-ma.html` — copie de référence de l’ancienne page elections.ma (non utilisée par l’app).

---

كاسوفت للمعلومية والاستشارات — usage interne / démo
