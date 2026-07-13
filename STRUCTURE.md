# Structure du projet KASOFT (Phase 3)

```
nti5abat/
├── app.py                 # Entrée Flask (python app.py)
├── asgi.py                # Entrée FastAPI+Flask (uvicorn / gunicorn)
├── kasoft/                # Code Python
│   ├── paths.py           # Racine projet, data/, static/
│   ├── core/              # auth, db, merge, pdf, txt, seed, verify, archive
│   ├── api/               # FastAPI Phase 2 + WebSocket
│   ├── export_ma/         # Export elections.ma
│   └── web/               # Flask (routes UI) — /verify, /archive
├── static/                # JS, CSS, fonts, icons
├── templates/             # Pages HTML (+ verify, archive)
├── tests/
├── deploy/                # ngrok, Oracle, Cloudflare
├── data/                  # SQLite / JSON / cache géo / archive/
├── docker-compose.yml
└── requirements.txt
```

## Lancer

```powershell
python app.py
python -m unittest discover -s tests -v
```

## Phase 3

- `/verify` — validation publique du QR / code HMAC
- `/archive` — archive ministérielle (admin)
- PV PDF signé (HMAC) + archivage auto à l’export
