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
| `ASSET_VERSION` | Version cache JS/CSS | `23` |
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
