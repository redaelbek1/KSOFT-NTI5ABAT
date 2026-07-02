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

## Déploiement client (Render)

GitHub **ne fait pas tourner** le site — il héberge le code. Pour une URL stable (sans ngrok ni PC allumé), déployez sur [Render](https://render.com) (gratuit pour démo).

### Étapes

1. **Compte Render** — inscrivez-vous avec le compte GitHub `redaelbek1`.
2. **New → Blueprint** — choisissez le repo [KSOFT-NTI5ABAT](https://github.com/redaelbek1/KSOFT-NTI5ABAT).
3. Render lit `render.yaml` et propose le service `nti5abat-elections` → **Apply**.
4. **Variable obligatoire** — dans l’onglet *Environment* du service, définissez :
   - `KASOFT_PIN` = code donné au client (ex. `2026`)
   - `SECRET_KEY` est générée automatiquement
5. Attendez le build Docker (5–15 min la première fois).
6. URL finale : `https://nti5abat-elections.onrender.com` (ou le nom affiché par Render).

### URLs à envoyer au client

| Page | URL |
|------|-----|
| Export elections.ma (public) | `https://VOTRE-URL.onrender.com/export` |
| Connexion KASOFT | `https://VOTRE-URL.onrender.com/login` |
| Tableau de bord | `https://VOTRE-URL.onrender.com/dashboard` |

### Première utilisation sur le cloud

1. Connectez-vous avec le PIN.
2. **Configuration** → « تحميل بيانات تجريبية » / données démo pour préremplir bureaux et partis.
3. Les filtres géo (export) peuvent prendre **10–30 s** au premier chargement d’une province.

### Limites plan gratuit Render

| Sujet | Comportement |
|-------|----------------|
| Mise en veille | Après ~15 min sans visite ; 1re ouverture = **30–60 s** |
| Données KASOFT | SQLite sur disque éphémère — peut se réinitialiser au redéploiement ; utilisez sauvegarde JSON |
| ngrok | Plus nécessaire une fois Render actif |

### Mises à jour

Chaque `git push` sur `master` redéploie automatiquement (`autoDeploy: true` dans `render.yaml`).

## Dépannage

| Problème | Solution |
|----------|----------|
| PDF carrés / arabe cassé | Vérifier `static/fonts/Tahoma.ttf` |
| Filtres géo vides au 1er lancement | Attendre le chargement Playwright ou utiliser le cache `data/geo_disk/` |
| Session expirée | Reconnectez-vous via `/login` |
| Changements JS non visibles | Ctrl+Shift+R ou augmenter `ASSET_VERSION` |
| Render : page blanche longtemps | Plan gratuit en veille — attendre ~1 min puis recharger |
| Render : login ne tient pas | Vérifier `SECRET_KEY` et `KASOFT_PIN` dans Environment |

## Archive

`archive/homepage-elections-ma.html` — copie de référence de l’ancienne page elections.ma (non utilisée par l’app).

---

كاسوفت للمعلومية والاستشارات — usage interne / démo
