# Structure du projet KASOFT (Phase 2)

```
nti5abat/
├── app.py                 # Entrée Flask (python app.py)
├── asgi.py                # Entrée FastAPI+Flask (uvicorn / gunicorn)
├── kasoft/                # Code Python
│   ├── paths.py           # Racine projet, data/, static/
│   ├── core/              # Électoral : auth, db, merge, pdf, txt, seed
│   ├── api/               # FastAPI Phase 2 + WebSocket
│   ├── export_ma/         # Export elections.ma
│   └── web/               # Flask (routes UI)
├── static/                # JS, CSS, fonts, icons
├── templates/             # Pages HTML
├── tests/
├── deploy/                # ngrok, Oracle, Cloudflare
├── data/                  # SQLite / JSON / cache géo
├── docker-compose.yml
└── requirements.txt
```

## Lancer

```powershell
python app.py
python -m unittest discover -s tests -v
```
