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
| `KASOFT_ADMIN_PIN` | Code admin | `2026` |
| `KASOFT_MOURAKIB_PIN` | Code mourakib global | `3030` |
| `DATABASE_URL` | PostgreSQL (Phase 2) | SQLite local |
| `KASOFT_PHASE2` | FastAPI + WebSocket (`1`/`0`) | `1` |
| `SECRET_KEY` | Clé de session | clé de dev |
| `ASSET_VERSION` | Version cache JS/CSS | `39` |
| `FLASK_DEBUG` | Mode debug (`1` / `0`) | `0` |

### PostgreSQL (Phase 2 — production)

**Local avec Docker :**

```powershell
docker compose up -d --build
```

→ App sur **http://127.0.0.1:5000** — base PostgreSQL persistante (`kasoft` / `kasoft_dev`).

**Render :** le `render.yaml` inclut une base PostgreSQL Free + `DATABASE_URL` automatique.

**Sans Docker :** laisser `DATABASE_URL` vide → SQLite (`data/kasoft.db`).

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

### KASOFT électoral (Phase 1 + 2)
- Comptage par bureau, parti et représentant
- **Auth par bureau** : PIN dérivé du code (`RB-001` → `0001`)
- **FastAPI** : `/bureaux`, `/votes`, `/export/{id}`, `/rapport/general`
- **Sync temps réel** : WebSocket `/ws/sync`
- PV **PDF** et **TXT** alignés (QR PDF ; code `KASOFT|…` en TXT)
- Rapport régional PDF/CSV/TXT
- Export CSV, ZIP, sauvegarde JSON

#### Contenu des fichiers TXT (révisé)

| Fichier | Contenu |
|---------|---------|
| **محضر المكتب** | En-tête officiel, PV n°, bureau, participation, voix par parti/mourakib, déclaration, **3 lignes de signature**, **رمز التحقق** |
| **التقرير الإقليمي** | KPI (ouverts/fermés, blancs, nuls), tableau par bureau, totaux par parti, signatures, code vérification |
| **سجل العمليات** | PV n°, code bureau, journal filtré par bureau (50 max) |

API TXT (auth Bearer) : `GET /export/{id}/txt`, `GET /rapport/general/txt`, `GET /journal/{id}/txt`

## Structure utile

```
app.py              Routes Flask (UI)
asgi.py             FastAPI + Flask (Phase 2)
backend/            API Phase 2 + WebSocket
kasoft_db.py        État SQLite / PostgreSQL
kasoft_txt.py       Exports TXT (alignés PDF)
kasoft_pdf.py       Génération PDF
docker-compose.yml  App + PostgreSQL local
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

### Déploiement Render (recommandé — simple, lié à GitHub)

Plan **Free** : 0 € si vous choisissez **Free** à la création. Le site s’endort après ~15 min sans visite (~1 min pour se réveiller).

#### 1. Compte Render

1. Ouvrez [dashboard.render.com](https://dashboard.render.com)
2. **Sign Up with GitHub** → autorisez le repo `KSOFT-NTI5ABAT`

#### 2. Blueprint (déploiement automatique)

1. **New +** → **Blueprint**
2. Sélectionnez le repo **KSOFT-NTI5ABAT**
3. Render lit `render.yaml` → service `nti5abat-elections` → **Apply**

#### 3. Variable obligatoire : PIN

Render demande `KASOFT_PIN` (non synchronisé) :

| Variable | Valeur |
|----------|--------|
| `KASOFT_PIN` | Code client, ex. `2026` |

`SECRET_KEY` est générée automatiquement.

#### 4. Attendre le build

- Premier build Docker + Playwright : **10 à 20 minutes**
- Statut **Live** (vert) → copiez l’URL, ex. `https://nti5abat-elections.onrender.com`

#### 5. URLs pour le client

| Page | URL |
|------|------|
| Export (public) | `https://VOTRE-URL.onrender.com/export` |
| Connexion | `https://VOTRE-URL.onrender.com/login` |
| Dashboard | `https://VOTRE-URL.onrender.com/dashboard` |

#### 6. Première démo

1. Login avec le PIN
2. **Configuration** → **données démo**
3. Test export elections.ma (1er chargement géo : 30–60 s)

#### Mises à jour

Chaque `git push` sur `master` redéploie automatiquement.

#### Limites plan Free Render

| Sujet | Détail |
|-------|--------|
| Mise en veille | ~15 min sans visite → 1re ouverture lente |
| RAM 512 Mo | KASOFT OK ; export géo peut être lent au 1er chargement |
| Données | SQLite peut se réinitialiser au redéploiement → sauvegarde JSON |
| Carte bancaire | Parfois demandée pour vérification (pas de débit si plan Free) |

#### Dépannage Render

| Problème | Solution |
|----------|----------|
| Build échoue | Voir *Logs* → souvent timeout ; relancer **Manual Deploy** |
| Page blanche 1 min | Service en veille — attendre et recharger |
| Login ne tient pas | Vérifier `KASOFT_PIN` et `SECRET_KEY` dans *Environment* |
| 502 / crash | RAM insuffisante — réessayer ou passer au plan Starter ($7/mo) |

### Option B — Oracle Cloud (0 € / mois, sans mise en veille)

Pas de frais mensuels. Vous clonez le repo GitHub sur une petite machine cloud.

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

## Archive

`archive/homepage-elections-ma.html` — copie de référence de l’ancienne page elections.ma (non utilisée par l’app).

---

كاسوفت للمعلومية والاستشارات — usage interne / démo
