from backend.main import create_api_app
from app import app as flask_app
from starlette.middleware.wsgi import WSGIMiddleware

app = create_api_app()
app.mount("/", WSGIMiddleware(flask_app))
