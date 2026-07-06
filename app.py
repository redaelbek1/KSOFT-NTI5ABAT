"""Point d'entrée Flask (python app.py)."""
import os
from pathlib import Path

from kasoft.web.app import app  # noqa: F401

if __name__ == "__main__":
    from kasoft.paths import PROJECT_ROOT

    Path(PROJECT_ROOT / "output").mkdir(exist_ok=True)
    Path(PROJECT_ROOT / "data" / "geo_disk").mkdir(parents=True, exist_ok=True)
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "0") == "1"
    if os.environ.get("KASOFT_PHASE2", "1") == "1":
        import uvicorn

        uvicorn.run("asgi:app", host="0.0.0.0", port=port, reload=debug)
    else:
        app.run(host="0.0.0.0", port=port, debug=debug, threaded=True)
